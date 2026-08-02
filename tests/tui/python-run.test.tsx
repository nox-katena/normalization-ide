import {Readable, Writable} from 'node:stream';
import {render} from 'ink';
import {describe, expect, it, vi} from 'vitest';
import {createEnhancementFlowState} from '../../src/domain/enhancement-flow.js';
import {createEditorState} from '../../src/editor/buffer.js';
import type {
  PythonRunner,
  PythonRunResult,
} from '../../src/runtime/python-runner.js';
import {App} from '../../src/ui/App.js';

const ANSI_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'g',
);
const SOURCE = 'print("current buffer")\n';

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

function mountApp(stars: number, pythonRunner: PythonRunner) {
  const stdin = new TestInput();
  const stdout = new TestOutput();
  const instance = render(
    <App
      initialState={createEnhancementFlowState(createEditorState(SOURCE), stars)}
      pythonRunner={pythonRunner}
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
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

describe('Python execution in the TUI', () => {
  it('blocks Ctrl+R before 12 stars without calling the runner', async () => {
    const pythonRunner = vi.fn<PythonRunner>();
    const mounted = mountApp(11, pythonRunner);

    try {
      mounted.stdin.write('\u0012');
      await flushRender();

      expect(pythonRunner).not.toHaveBeenCalled();
      expect(mounted.stdout.text()).toContain(
        'HUD: Python 실행은 12성에서 해금됩니다.',
      );
    } finally {
      mounted.instance.unmount();
    }
  });

  it.each([
    {
      scenario: 'success',
      result: {stdout: 'current buffer\n', stderr: '', exitCode: 0},
      fields: ['표준 출력: current buffer', '표준 오류: (없음)', '종료 코드: 0'],
    },
    {
      scenario: 'syntax error',
      result: {stdout: '', stderr: 'SyntaxError: invalid syntax', exitCode: 1},
      fields: [
        '표준 출력: (없음)',
        '표준 오류: SyntaxError: invalid syntax',
        '종료 코드: 1',
      ],
    },
    {
      scenario: 'runtime error',
      result: {stdout: '', stderr: 'RuntimeError: boom', exitCode: 1},
      fields: [
        '표준 출력: (없음)',
        '표준 오류: RuntimeError: boom',
        '종료 코드: 1',
      ],
    },
    {
      scenario: 'abnormal termination',
      result: {stdout: '', stderr: '', exitCode: null},
      fields: [
        '표준 출력: (없음)',
        '표준 오류: (없음)',
        '종료 코드: 없음 (비정상 종료)',
      ],
    },
  ] satisfies ReadonlyArray<
    {
      readonly scenario: string;
      readonly result: PythonRunResult;
      readonly fields: readonly string[];
    }
  >)('renders separate output fields for $scenario', async ({result, fields}) => {
    const pythonRunner = vi.fn<PythonRunner>().mockResolvedValue(result);
    const mounted = mountApp(12, pythonRunner);

    try {
      mounted.stdin.write('\u0012');
      await flushRender();

      expect(pythonRunner).toHaveBeenCalledOnce();
      expect(pythonRunner).toHaveBeenCalledWith(SOURCE);
      for (const field of fields) {
        expect(mounted.stdout.text()).toContain(field);
      }
    } finally {
      mounted.instance.unmount();
    }
  });

  it('shows a rejected process start as an abnormal execution error', async () => {
    const pythonRunner = vi
      .fn<PythonRunner>()
      .mockRejectedValue(new Error('python3 not found'));
    const mounted = mountApp(12, pythonRunner);

    try {
      mounted.stdin.write('\u0012');
      await flushRender();

      const screen = mounted.stdout.text();
      expect(screen).toContain('HUD: Python 실행 오류');
      expect(screen).toContain('표준 출력: (없음)');
      expect(screen).toContain('표준 오류: python3 not found');
      expect(screen).toContain('종료 코드: 없음 (비정상 종료)');
    } finally {
      mounted.instance.unmount();
    }
  });
});
