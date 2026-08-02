import {Readable, Writable} from 'node:stream';
import {render} from 'ink';
import {describe, expect, it, vi} from 'vitest';
import {createEnhancementFlowState} from '../../src/domain/enhancement-flow.js';
import {createEditorState} from '../../src/editor/buffer.js';
import type {
  PythonSyntaxChecker,
  PythonSyntaxDiagnostic,
} from '../../src/runtime/python-syntax.js';
import {App} from '../../src/ui/App.js';

const ANSI_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'g',
);

class TestInput extends Readable {
  readonly isTTY = true;
  isRaw = false;

  setEncoding(): this {
    return this;
  }

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }

  resume(): this {
    return this;
  }

  pause(): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  write(data: string): void {
    this.push(data);
  }

  override _read(): void {
    // Test input is driven explicitly through write().
  }
}

class TestOutput extends Writable {
  readonly isTTY = true;
  readonly columns = 140;
  readonly rows = 40;
  readonly chunks: string[] = [];

  text(): string {
    return this.chunks.join('').replace(ANSI_SEQUENCE, '').replaceAll('\r', '');
  }

  latest(): string {
    return (this.chunks.at(-1) ?? '')
      .replace(ANSI_SEQUENCE, '')
      .replaceAll('\r', '');
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    void encoding;
    this.chunks.push(String(chunk));
    callback();
  }
}

function mountApp(
  stars: number,
  source: string,
  syntaxChecker: PythonSyntaxChecker,
) {
  const stdin = new TestInput();
  const stdout = new TestOutput();
  const instance = render(
    <App
      initialState={createEnhancementFlowState(createEditorState(source), stars)}
      syntaxChecker={syntaxChecker}
    />,
    {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: new TestOutput() as unknown as NodeJS.WriteStream,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );

  return {stdin, stdout, instance};
}

async function flushRender(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

describe('Python syntax diagnostics in the TUI', () => {
  it('shows only the pending unlock before 17 stars and does not inspect', async () => {
    const syntaxChecker = vi.fn<PythonSyntaxChecker>();
    const mounted = mountApp(16, 'name =\n', syntaxChecker);

    try {
      await flushRender();

      expect(syntaxChecker).not.toHaveBeenCalled();
      expect(mounted.stdout.text()).toContain(
        '[잠금] 17성 Python 구문 오류 표시',
      );
      expect(mounted.stdout.text()).not.toContain('Python 구문 검사:');
      expect(mounted.stdout.text()).not.toContain('▲ 구문 오류');
    } finally {
      mounted.instance.unmount();
    }
  });

  it('shows the diagnostic location and message in both editor and HUD from 17 stars', async () => {
    const diagnostic: PythonSyntaxDiagnostic = {
      line: 1,
      column: 7,
      message: 'invalid syntax',
    };
    const syntaxChecker = vi
      .fn<PythonSyntaxChecker>()
      .mockResolvedValue(diagnostic);
    const mounted = mountApp(17, 'name =\n', syntaxChecker);

    try {
      await flushRender();

      expect(syntaxChecker).toHaveBeenCalledOnce();
      expect(syntaxChecker).toHaveBeenCalledWith('name =\n');
      expect(mounted.stdout.latest()).toContain(
        '▲ 구문 오류 · 1행 7열 · invalid syntax',
      );
      expect(mounted.stdout.latest()).toContain(
        'Python 구문 오류: 1행 7열 · invalid syntax',
      );
    } finally {
      mounted.instance.unmount();
    }
  });

  it('removes an existing diagnostic when the latest buffer is valid', async () => {
    const syntaxChecker = vi.fn<PythonSyntaxChecker>(async (source) =>
      source.startsWith('x')
        ? null
        : {line: 1, column: 1, message: 'invalid syntax'},
    );
    const mounted = mountApp(17, '= 1\n', syntaxChecker);

    try {
      await flushRender();
      expect(mounted.stdout.latest()).toContain('Python 구문 오류:');

      mounted.stdin.write('x');
      await flushRender();

      expect(syntaxChecker).toHaveBeenLastCalledWith('x= 1\n');
      expect(mounted.stdout.latest()).toContain('Python 구문 검사: 오류 없음');
      expect(mounted.stdout.latest()).not.toContain('▲ 구문 오류');
      expect(mounted.stdout.latest()).not.toContain('Python 구문 오류:');
    } finally {
      mounted.instance.unmount();
    }
  });

  it('does not let an older inspection overwrite the latest buffer result', async () => {
    const older = deferred<PythonSyntaxDiagnostic | null>();
    const latest = deferred<PythonSyntaxDiagnostic | null>();
    const syntaxChecker = vi
      .fn<PythonSyntaxChecker>()
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => latest.promise);
    const mounted = mountApp(17, 'value =\n', syntaxChecker);

    try {
      await flushRender();
      mounted.stdin.write('x');
      await flushRender();
      expect(syntaxChecker).toHaveBeenCalledTimes(2);

      latest.resolve({line: 1, column: 2, message: 'latest diagnostic'});
      await flushRender();
      expect(mounted.stdout.latest()).toContain('latest diagnostic');

      older.resolve({line: 1, column: 8, message: 'stale diagnostic'});
      await flushRender();
      expect(mounted.stdout.latest()).toContain('latest diagnostic');
      expect(mounted.stdout.latest()).not.toContain('stale diagnostic');
    } finally {
      mounted.instance.unmount();
    }
  });
});
