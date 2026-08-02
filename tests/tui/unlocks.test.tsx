import {Readable, Writable} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {render} from 'ink';
import {describe, expect, it} from 'vitest';
import {
  createEnhancementFlowState,
  getEnhancementStatus,
  type EnhancementFlowState,
} from '../../src/domain/enhancement-flow.js';
import {
  createEditorState,
  getText,
  insertDirectInput,
} from '../../src/editor/buffer.js';
import {
  App,
  createAppModel,
  handleAppInput,
} from '../../src/ui/App.js';
import {EditorPane} from '../../src/ui/EditorPane.js';
import {HudPane} from '../../src/ui/HudPane.js';

const FOREGROUND_COLOR = new RegExp(
  `${String.fromCharCode(27)}\\[(?:3[0-7]|9[0-7])m`,
);
const NOW = new Date('2026-08-02T03:04:05.000Z');
const SUCCESS_BOUNDARIES = [
  [2, 3, 'lineNumbers', '5성 Backspace'],
  [4, 5, 'backspace', '7성 공백 입력'],
  [6, 7, 'spaceInput', '10성 Ctrl+Z Undo'],
  [9, 10, 'undo', '12성 Python 실행'],
  [11, 12, 'pythonRun', '15성 파일 저장'],
  [14, 15, 'fileSave', '17성 Python 구문 오류 표시'],
] as const;

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
    return stripVTControlCharacters(this.chunks.join('')).replaceAll('\r', '');
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

function renderEditor(stars: number): {raw: string; text: string} {
  const stdout = new TestOutput();
  const instance = render(
    <EditorPane
      editor={createEditorState('first\nsecond')}
      focused
      stars={stars}
    />,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      patchConsole: false,
    },
  );

  instance.unmount();
  return {raw: stdout.chunks.join(''), text: stdout.text()};
}

function renderStatus(flow: EnhancementFlowState): string {
  const stdout = new TestOutput();
  const status = getEnhancementStatus(flow);
  const instance = render(
    <>
      <EditorPane editor={flow.editor} focused stars={flow.stars} />
      <HudPane status={status} />
    </>,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      patchConsole: false,
    },
  );

  instance.unmount();
  return stdout.text();
}

async function flushRender(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

describe('unlock rendering', () => {
  it('renders the zero-star editor without terminal foreground colors', () => {
    expect(renderEditor(0).raw).not.toMatch(FOREGROUND_COLOR);
  });

  it('hides line numbers at two stars and shows them from three stars', () => {
    const locked = renderEditor(2).text;
    const unlocked = renderEditor(3).text;

    expect(locked).not.toContain('1 │');
    expect(unlocked).toContain('1 │ ▌first');
    expect(unlocked).toContain('2 │ second');
  });

  it.each(SUCCESS_BOUNDARIES)(
    'activates the %s→%s %s unlock immediately and advances the HUD guide',
    (beforeStars, afterStars, feature, nextUnlock) => {
      const editor = insertDirectInput(createEditorState(), '1234567890');
      let model = createAppModel(
        createEnhancementFlowState(editor, beforeStars),
      );

      model = handleAppInput(model, '', {tab: true});
      model = handleAppInput(model, ' ', {}, () => 0, () => NOW);

      expect(model.flow.stars).toBe(afterStars);
      expect(getEnhancementStatus(model.flow).unlocks[feature]).toBe(true);
      expect(renderStatus(model.flow)).toContain(`다음 해금: ${nextUnlock}`);
    },
  );
});

describe('unlock keyboard handling', () => {
  it.each([
    ['Backspace', {backspace: true}],
    ['macOS DEL', {delete: true}],
  ] as const)('blocks %s before five stars and enables it at five stars', (_, key) => {
    const editor = insertDirectInput(createEditorState(), 'x');
    const locked = handleAppInput(
      createAppModel(createEnhancementFlowState(editor, 4)),
      '',
      key,
    );
    const unlocked = handleAppInput(
      createAppModel(createEnhancementFlowState(editor, 5)),
      '',
      key,
    );

    expect(locked.flow.editor).toBe(editor);
    expect(locked.message).toContain('5성');
    expect(getText(unlocked.flow.editor)).toBe('');
  });

  it('handles the DEL byte emitted by macOS Backspace through Ink', async () => {
    const editor = insertDirectInput(createEditorState(), 'x');
    const stdin = new TestInput();
    const stdout = new TestOutput();
    const instance = render(
      <App initialState={createEnhancementFlowState(editor, 4)} />,
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
      stdout.chunks.length = 0;
      stdin.write('\u007F');
      await flushRender();

      expect(stdout.text()).toContain('HUD: Backspace는 5성에서 해금됩니다.');
      expect(stdout.text()).toContain('현재 문자: 1자');
    } finally {
      instance.unmount();
    }
  });

  it('blocks editor Space before seven stars and counts it once after unlock', () => {
    const editor = insertDirectInput(createEditorState(), 'x');
    const locked = handleAppInput(
      createAppModel(createEnhancementFlowState(editor, 6)),
      ' ',
      {},
    );
    const unlocked = handleAppInput(
      createAppModel(createEnhancementFlowState(editor, 7)),
      ' ',
      {},
    );

    expect(locked.flow.editor).toBe(editor);
    expect(locked.message).toContain('7성');
    expect(getText(unlocked.flow.editor)).toBe('x ');
    expect(unlocked.flow.editor.totalDirectInputs).toBe(2);
  });

  it('keeps Ctrl+Z inside the TUI and does not award inputs or tickets', async () => {
    const editor = insertDirectInput(createEditorState(), '1234567890');
    const stdin = new TestInput();
    const stdout = new TestOutput();
    const instance = render(
      <App initialState={createEnhancementFlowState(editor, 10)} />,
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
      stdin.write('\u001A');
      await flushRender();

      const screen = stdout.text();
      expect(screen).toContain('HUD: 최근 사용자 편집을 Undo했습니다.');
      expect(screen).toContain('직접 입력: 10타 · 현재 문자: 0자');
      expect(screen).toContain('강화권: 1장');
    } finally {
      instance.unmount();
    }
  });

  it('blocks Ctrl+Z before ten stars without changing the buffer', () => {
    const editor = insertDirectInput(createEditorState(), 'x');
    const model = handleAppInput(
      createAppModel(createEnhancementFlowState(editor, 9)),
      'z',
      {ctrl: true},
    );

    expect(model.flow.editor).toBe(editor);
    expect(model.message).toContain('10성');
    expect(getText(model.flow.editor)).toBe('x');
  });
});
