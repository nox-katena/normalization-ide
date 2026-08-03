import {Readable, Writable} from 'node:stream';
import {render} from 'ink';
import {describe, expect, it, vi} from 'vitest';
import {run} from '../../src/app.js';
import {
  createEnhancementFlowState,
  getEnhancementStatus,
} from '../../src/domain/enhancement-flow.js';
import {createEditorState, getText, insertDirectInput} from '../../src/editor/buffer.js';
import {
  App,
  createAppModel,
  handleAppInput,
} from '../../src/ui/App.js';

const ANSI_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'g',
);
const NOW = new Date('2026-08-02T03:04:05.000Z');

class TestInput extends Readable {
  readonly isTTY = true;
  readonly rawModes: boolean[] = [];
  isRaw = false;

  setEncoding(): this {
    return this;
  }

  setRawMode(mode: boolean): this {
    this.rawModes.push(mode);
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
  columns: number;
  rows: number;
  chunks: string[] = [];

  constructor(columns = 140, rows = 40) {
    super();
    this.columns = columns;
    this.rows = rows;
  }

  reset(): void {
    this.chunks = [];
  }

  resize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
    this.emit('resize');
  }

  text(): string {
    return this.chunks.join('').replace(ANSI_SEQUENCE, '').replaceAll('\r', '');
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(String(chunk));
    callback();
  }
}

function mountApp(
  initialState = createEnhancementFlowState(),
  random = () => 0,
) {
  const stdin = new TestInput();
  const stdout = new TestOutput();
  const stderr = new TestOutput();
  const instance = render(
    <App
      initialState={initialState}
      random={random}
      clock={() => NOW}
      animationWait={async () => undefined}
    />,
    {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
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

describe('editor and Starforce HUD', () => {
  it('renders code, cursor, every core metric, probabilities, and 17-to-25-star locks', () => {
    const editor = insertDirectInput(createEditorState(), '1234567890');
    const mounted = mountApp(createEnhancementFlowState(editor, 16));

    try {
      const screen = mounted.stdout.text();

      expect(screen).toContain('Starforce TUI Editor');
      expect(screen).toContain('▶ EDITOR (focused)');
      expect(screen).toContain('1234567890▌');
      expect(screen).toContain('현재/다음 별: 16성 → 17성');
      expect(screen).toContain('강화권: 1장');
      expect(screen).toContain('성공 30% · 실패 67.9% · 파괴 2.1%');
      expect(screen).toContain('다음 해금: 17성 Python 구문 오류 표시');
      expect(screen).toContain('직접 입력: 10타 · 현재 문자: 10자');
      expect(screen).toContain('소실: 실패 0자 · 파괴 0자');
      expect(screen).toContain('생산성: 100%');
      expect(screen).toContain('[잠금] 17성 Python 구문 오류 표시');
      expect(screen).toContain('[잠금] 20성 Syntax highlighting');
      expect(screen).toContain('[잠금] 22성 Git commit');
      expect(screen).toContain('[잠금] 25성 Vim 편집 기능');
      expect(screen).toContain('최근 결과: 없음');
    } finally {
      mounted.instance.unmount();
    }

    expect(mounted.stdin.rawModes).toEqual([true, false]);
  });

  it('switches focus with Tab and enhances with Space in the updated frame', async () => {
    const editor = insertDirectInput(createEditorState(), 'abcdefghij');
    const mounted = mountApp(createEnhancementFlowState(editor), () => 0);

    try {
      mounted.stdin.write('\t');
      await flushRender();
      expect(mounted.stdout.text()).toContain('✦ 장비 강화 ✦');
      expect(mounted.stdout.text()).toContain('[ SPACE ] 강화하기');

      mounted.stdout.reset();
      mounted.stdin.write(' ');
      await flushRender();
      const screen = mounted.stdout.text();

      expect(screen).toContain('현재/다음 별: 1성 → 2성');
      expect(screen).toContain('강화권: 0장');
      expect(screen).toContain('abcdefghij▌');
      expect(screen).toContain('최근 결과: 성공 (0성 → 1성)');
      expect(screen).toContain('HUD: 강화 성공: 0성 → 1성');
    } finally {
      mounted.instance.unmount();
    }
  });

  it('keeps state unchanged and explains unavailable enhancements and shortcuts', async () => {
    const random = vi.fn(() => 0);
    const mounted = mountApp(createEnhancementFlowState(createEditorState('safe')), random);

    try {
      mounted.stdin.write('\t');
      await flushRender();
      mounted.stdout.reset();
      mounted.stdin.write(' ');
      await flushRender();

      expect(mounted.stdout.text()).toContain(
        '강화권이 없습니다. 직접 입력 10타마다 1장을 얻습니다.',
      );
      expect(mounted.stdout.text()).toContain('현재/다음 별: 0성 → 1성');
      expect(mounted.stdout.text()).toContain('safe');
      expect(random).not.toHaveBeenCalled();

      mounted.stdin.write('\t');
      await flushRender();
      mounted.stdout.reset();
      mounted.stdin.write('\u0012');
      await flushRender();

      expect(mounted.stdout.text()).toContain(
        'HUD: Python 실행은 12성에서 해금됩니다.',
      );
      expect(mounted.stdout.text()).toContain('safe');
    } finally {
      mounted.instance.unmount();
    }
  });

  it('handles empty, long, multiline, and Unicode editor input in a small resized TUI', async () => {
    let model = createAppModel(createEnhancementFlowState(createEditorState(), 7));

    model = handleAppInput(model, '한', {});
    model = handleAppInput(model, '🙂', {});
    model = handleAppInput(model, 'e\u0301', {});
    model = handleAppInput(model, '', {return: true});
    model = handleAppInput(model, '붙여넣기' + 'x'.repeat(200), {});
    model = handleAppInput(model, ' ', {});

    expect(getText(model.flow.editor)).toBe(
      '한🙂e\u0301\n붙여넣기' + 'x'.repeat(200) + ' ',
    );
    expect(getEnhancementStatus(model.flow)).toMatchObject({
      totalDirectInputs: 5,
      currentGraphemes: 209,
      enhancementTickets: 0,
      productivityPercent: 100,
    });

    const flowBeforeButtonSpace = model.flow;
    model = handleAppInput(model, '', {tab: true});
    model = handleAppInput(model, ' ', {}, () => 0, () => NOW);
    expect(model.flow).toBe(flowBeforeButtonSpace);
    expect(model.message).toContain('강화권이 없습니다');

    const stdin = new TestInput();
    const stdout = new TestOutput(12, 6);
    const instance = render(<App initialState={flowBeforeButtonSpace} />, {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: new TestOutput() as unknown as NodeJS.WriteStream,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    try {
      expect(stdout.text().length).toBeGreaterThan(0);
      stdout.reset();
      stdout.resize(8, 4);
      stdin.write('가');
      await flushRender();
      expect(stdout.text().length).toBeGreaterThan(0);
    } finally {
      instance.unmount();
    }
  });
});

describe('terminal lifecycle', () => {
  it.each(['normal exit', 'render error'])('restores the terminal after %s', async (mode) => {
    const stdout = new TestOutput();
    const unmount = vi.fn();
    const error = new Error('render failed');
    const renderer = vi.fn(() => ({
      unmount,
      waitUntilExit:
        mode === 'normal exit'
          ? vi.fn(async () => undefined)
          : vi.fn(async () => Promise.reject(error)),
    }));
    const promise = run({
      stdin: new TestInput() as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: new TestOutput() as unknown as NodeJS.WriteStream,
      renderer: renderer as unknown as typeof render,
    });

    if (mode === 'normal exit') {
      await expect(promise).resolves.toBeUndefined();
    } else {
      await expect(promise).rejects.toThrow('render failed');
    }

    expect(renderer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({exitOnCtrlC: true}),
    );
    expect(unmount).toHaveBeenCalledOnce();
    expect(stdout.chunks.join('')).toBe(
      '\u001B[?1049h\u001B[?25l\u001B[?25h\u001B[?1049l',
    );
  });
});
