import {Readable, Writable} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {render} from 'ink';
import {describe, expect, it, vi} from 'vitest';
import {
  createEnhancementFlowState,
  getEnhancementStatus,
} from '../../src/domain/enhancement-flow.js';
import {createEditorState, insertDirectInput} from '../../src/editor/buffer.js';
import type {PythonRunner} from '../../src/runtime/python-runner.js';
import {
  App,
  createAppModel,
  handleAppInput,
  type FileSaver,
} from '../../src/ui/App.js';
import {
  getStarforceModalLayout,
  getStarforceModalPalette,
  StarforceModal,
} from '../../src/ui/StarforceModal.js';

const NOW = new Date('2026-08-03T02:00:00.000Z');
const COLOR_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[(?:3[0-9]|4[0-9]|9[0-7]|10[0-7]|38;|48;)[^m]*m`,
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
  chunks: string[] = [];

  constructor(
    public columns = 140,
    public rows = 40,
    private readonly colors = true,
  ) {
    super();
  }

  hasColors(): boolean {
    return this.colors;
  }

  reset(): void {
    this.chunks = [];
  }

  text(): string {
    return stripVTControlCharacters(this.chunks.join('')).replaceAll('\r', '');
  }

  raw(): string {
    return this.chunks.join('');
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

async function flushRender(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

function renderModal(
  columns: number,
  rows: number,
  colorEnabled = true,
): {readonly raw: string; readonly text: string} {
  const editor = insertDirectInput(createEditorState(), '1234567890');
  const status = getEnhancementStatus(createEnhancementFlowState(editor, 15));
  const stdout = new TestOutput(columns, rows, colorEnabled);
  const instance = render(
    <StarforceModal
      status={status}
      message="강화창 포커스"
      terminalColumns={columns}
      terminalRows={rows}
      targetPath="/private/tmp/demo.py"
      colorEnabled={colorEnabled}
    />,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      patchConsole: false,
    },
  );

  instance.unmount();
  return {raw: stdout.raw(), text: stdout.text()};
}

describe('Starforce modal layout', () => {
  it('selects full, compact, and minimal layouts at tested terminal boundaries', () => {
    expect(getStarforceModalLayout(90, 28)).toBe('full');
    expect(getStarforceModalLayout(89, 28)).toBe('compact');
    expect(getStarforceModalLayout(90, 27)).toBe('compact');
    expect(getStarforceModalLayout(60, 20)).toBe('compact');
    expect(getStarforceModalLayout(59, 20)).toBe('minimal');
    expect(getStarforceModalLayout(60, 19)).toBe('minimal');
  });

  it('renders the full classic-gold modal with every enhancement field', () => {
    const screen = renderModal(120, 36);

    expect(screen.text).toContain('✦ 장비 강화 ✦');
    expect(screen.text).toContain('★★★★★ ★★★★★ ★★★★★ ☆☆☆☆☆ ☆☆☆☆☆');
    expect(screen.text).toContain('</>');
    expect(screen.text).toContain('demo.py');
    expect(screen.text).toContain('15성');
    expect(screen.text).toContain('16성');
    expect(screen.text).toContain('성공 30.0%');
    expect(screen.text).toContain('실패 67.9%');
    expect(screen.text).toContain('파괴 2.1%');
    expect(screen.text).toContain('보유 강화권 1장');
    expect(screen.text).toContain('실패 시 최근 입력 10자');
    expect(screen.text).toContain('[ SPACE ] 강화하기');
    expect(getStarforceModalPalette(true)).toMatchObject({
      border: '#E0BD72',
      surface: '#453326',
      header: '#6A4B2E',
      warningSurface: '#5A3028',
    });
  });

  it('removes decoration in compact mode but preserves core enhancement data', () => {
    const screen = renderModal(80, 24).text;

    expect(screen).toContain('✦ 장비 강화 ✦');
    expect(screen).not.toContain('</>');
    expect(screen).not.toContain('demo.py');
    expect(screen).toContain('★★★★★ ★★★★★ ★★★★★');
    expect(screen).toContain('☆☆☆☆☆ ☆☆☆☆☆');
    expect(screen).toContain('성공 30.0%');
    expect(screen).toContain('보유 강화권 1장');
    expect(screen).toContain('[ SPACE ] 강화');
  });

  it('uses a vertical, minimal-safe presentation in a small terminal', () => {
    const screen = renderModal(52, 18).text;

    expect(screen).toContain('✦ 강화 ✦');
    expect(screen).toContain('15 / 25 ★');
    expect(screen).not.toContain('</>');
    expect(screen).toContain('15성 ➜ 16성');
    expect(screen).toContain('성공 30.0%');
    expect(screen).toContain('실패 67.9%');
    expect(screen).toContain('파괴 2.1%');
    expect(screen).toContain('강화권 1장 · 실패 시 10자 소실');
  });

  it('omits ANSI colors while keeping symbols and labels when color is unsupported', () => {
    const screen = renderModal(120, 36, false);

    expect(getStarforceModalPalette(false)).toBeNull();
    expect(screen.raw).not.toMatch(COLOR_SEQUENCE);
    expect(screen.text).toContain('✦ 장비 강화 ✦');
    expect(screen.text).toContain('[ SPACE ] 강화하기');
  });
});

describe('Starforce modal input isolation', () => {
  it('accepts only Space, Tab, and Escape while the modal is ready', () => {
    const editor = insertDirectInput(createEditorState(), '1234567890');
    const editing = createAppModel(createEnhancementFlowState(editor, 15));
    const ready = handleAppInput(editing, '', {tab: true});
    const blockedInputs = [
      ['x', {}],
      ['', {return: true}],
      ['', {backspace: true}],
      ['', {leftArrow: true}],
      ['z', {ctrl: true}],
      ['r', {ctrl: true}],
      ['s', {ctrl: true}],
    ] as const;

    for (const [input, key] of blockedInputs) {
      expect(handleAppInput(ready, input, key)).toBe(ready);
    }

    expect(handleAppInput(ready, '', {tab: true}).focus).toBe('editor');
    expect(handleAppInput(ready, '', {escape: true}).focus).toBe('editor');
    const enhanced = handleAppInput(ready, ' ', {}, () => 0, () => NOW);
    expect(enhanced.flow.stars).toBe(16);
    expect(enhanced.flow.editor.enhancementTickets).toBe(0);
  });

  it('blocks editor, Python, and save actions in the mounted modal', async () => {
    const editor = insertDirectInput(createEditorState(), '1234567890');
    const stdin = new TestInput();
    const stdout = new TestOutput();
    const pythonRunner = vi.fn<PythonRunner>();
    const fileSaver = vi.fn<FileSaver>();
    const instance = render(
      <App
        initialState={createEnhancementFlowState(editor, 15)}
        targetPath="/private/tmp/demo.py"
        pythonRunner={pythonRunner}
        fileSaver={fileSaver}
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

    try {
      stdin.write('\t');
      await flushRender();
      expect(stdout.text()).toContain('✦ 장비 강화 ✦');

      for (const input of ['x', '\n', '\u007F', '\u001A', '\u0012', '\u0013']) {
        stdin.write(input);
        await flushRender();
      }

      expect(pythonRunner).not.toHaveBeenCalled();
      expect(fileSaver).not.toHaveBeenCalled();

      stdout.reset();
      stdin.write('\t');
      await flushRender();
      const screen = stdout.text();
      expect(screen).toContain('▶ EDITOR (focused)');
      expect(screen).toContain('1234567890▌');
      expect(screen).toContain('INPUT 10 │ BUFFER 10');
    } finally {
      instance.unmount();
    }
  });

  it('explains denied attempts inside the modal without calling the RNG', async () => {
    const stdin = new TestInput();
    const stdout = new TestOutput();
    const random = vi.fn(() => 0);
    const instance = render(
      <App
        initialState={createEnhancementFlowState(createEditorState('safe'))}
        random={random}
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

    try {
      stdin.write('\t');
      await flushRender();
      stdout.reset();
      stdin.write(' ');
      await flushRender();

      expect(random).not.toHaveBeenCalled();
      expect(stdout.text()).toContain(
        '강화권이 없습니다. 직접 입력 10타마다 1장을 얻습니다.',
      );
      expect(stdout.text()).toContain('보유 강화권 0장');
    } finally {
      instance.unmount();
    }
  });
});
