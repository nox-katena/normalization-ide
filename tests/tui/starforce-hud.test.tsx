import {Writable} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {render} from 'ink';
import {describe, expect, it} from 'vitest';
import {
  createEnhancementFlowState,
  getEnhancementStatus,
  runEnhancement,
  type EnhancementFlowState,
} from '../../src/domain/enhancement-flow.js';
import {createEditorState, insertDirectInput} from '../../src/editor/buffer.js';
import {
  formatProgressBar,
  formatStarGauge,
  getHudLayout,
  HudPane,
  type SyntaxCheckStatus,
} from '../../src/ui/HudPane.js';

const COLOR_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[(?:3[0-9]|4[0-9]|9[0-7]|10[0-7]|38;|48;)[^m]*m`,
);

class TestOutput extends Writable {
  readonly isTTY = true;
  readonly chunks: string[] = [];

  constructor(
    public columns: number,
    public rows = 40,
    private readonly colors = true,
  ) {
    super();
  }

  hasColors(): boolean {
    return this.colors;
  }

  raw(): string {
    return this.chunks.join('');
  }

  text(): string {
    return stripVTControlCharacters(this.raw()).replaceAll('\r', '');
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

function renderHud({
  columns,
  stars = 16,
  source = '1234567890',
  colorEnabled = true,
  syntaxCheck,
  state,
  dimmed = false,
}: {
  readonly columns: number;
  readonly stars?: number;
  readonly source?: string;
  readonly colorEnabled?: boolean;
  readonly syntaxCheck?: SyntaxCheckStatus;
  readonly state?: EnhancementFlowState;
  readonly dimmed?: boolean;
}): {readonly raw: string; readonly text: string} {
  const editor = insertDirectInput(createEditorState(), source);
  const status = getEnhancementStatus(
    state ?? createEnhancementFlowState(editor, stars),
  );
  const stdout = new TestOutput(columns, 40, colorEnabled);
  const instance = render(
    <HudPane
      status={status}
      terminalColumns={columns}
      colorEnabled={colorEnabled}
      dimmed={dimmed}
      {...(syntaxCheck === undefined ? {} : {syntaxCheck})}
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

describe('responsive Starforce HUD dashboard', () => {
  it('fixes wide, medium, and narrow layouts at tested boundaries', () => {
    expect(getHudLayout(110)).toBe('wide');
    expect(getHudLayout(109)).toBe('medium');
    expect(getHudLayout(72)).toBe('medium');
    expect(getHudLayout(71)).toBe('narrow');
  });

  it('renders the wide three-column dashboard with every core metric', () => {
    const screen = renderHud({columns: 140}).text;

    expect(screen).toContain('STARFORCE HUD');
    expect(screen).toContain('★★★★★ ★★★★★ ★★★★★ ★☆☆☆☆ ☆☆☆☆☆');
    expect(screen).toContain('★ 16성 → 17성');
    expect(screen).toContain('강화권 1장');
    expect(screen).toContain(`성공 ${formatProgressBar(30)} 30%`);
    expect(screen).toContain(`실패 ${formatProgressBar(67.9)} 67.9%`);
    expect(screen).toContain(`파괴 ${formatProgressBar(2.1)} 2.1%`);
    expect(screen).toContain('NEXT 17성 · Python 구문 오류');
    expect(screen).toContain('UNLOCKS · ✓ 해금 🔒 잠금 ◇ 예정');
    expect(screen).toContain('17🔒 Python 오류');
    expect(screen).toContain('20🔒 Syntax');
    expect(screen).toContain('22◇ Git commit');
    expect(screen).toContain('25◇ Vim');
    expect(screen).toContain('INPUT 10 │ BUFFER 10 │ LOSS F0 D0');
    expect(screen).toContain('PRODUCTIVITY ██████████ 100%');
  });

  it('uses compact stars in medium and narrow layouts while preserving state', () => {
    const medium = renderHud({columns: 90}).text;
    const narrow = renderHud({columns: 48}).text;

    expect(medium).toContain('STARFORCE HUD');
    expect(narrow).toContain('STARFORCE HUD');
    for (const screen of [medium, narrow]) {
      expect(screen).toContain('★ 16성 → 17성');
      expect(screen).not.toContain(formatStarGauge(16));
      expect(screen).toContain('강화권 1장');
      expect(screen).toContain('INPUT 10 │ BUFFER 10 │ LOSS F0 D0');
      expect(screen).toContain('PRODUCTIVITY');
      expect(screen).toContain('25◇ Vim');
    }
  });

  it('replaces zero-percent rates with a 25-star MAX completion state', () => {
    const screen = renderHud({columns: 140, stars: 25}).text;

    expect(screen).toContain('★★★★★ ★★★★★ ★★★★★ ★★★★★ ★★★★★');
    expect(screen).toContain('★ 25성 MAX · 강화 완료');
    expect(screen).toContain('★ MAX · 강화 완료');
    expect(screen).not.toContain('성공 ');
    expect(screen).not.toContain('실패 ');
    expect(screen).not.toContain('파괴 ');
    expect(screen).toContain('17✓ Python 오류');
    expect(screen).toContain('20✓ Syntax');
    expect(screen).toContain('22◇ Git commit');
    expect(screen).toContain('25◇ Vim');
  });

  it('renders zero-star, failure, and destruction telemetry from domain state', () => {
    const zero = renderHud({columns: 140, stars: 0, source: ''}).text;
    const editor = insertDirectInput(
      createEditorState(),
      'abcdefghijklmnopqrst',
    );
    const initial = createEnhancementFlowState(editor, 15);
    const failed = runEnhancement(initial, () => 0.5);
    const destroyed = runEnhancement(initial, () => 0.99);

    expect(failed.attempted).toBe(true);
    expect(destroyed.attempted).toBe(true);
    expect(zero).toContain('★ 0성 → 1성');
    expect(zero).toContain('INPUT 0 │ BUFFER 0 │ LOSS F0 D0');
    expect(renderHud({columns: 140, state: failed.state}).text).toContain(
      'INPUT 20 │ BUFFER 10 │ LOSS F10 D0',
    );
    const destroyedScreen = renderHud({columns: 140, state: destroyed.state}).text;
    expect(destroyedScreen).toContain('★ 0성 → 1성');
    expect(destroyedScreen).toContain('INPUT 20 │ BUFFER 0 │ LOSS F0 D20');
  });

  it('shows one-line syntax status only after unlock and truncates long errors', () => {
    const locked = renderHud({columns: 72, stars: 16}).text;
    const invalid = renderHud({
      columns: 72,
      stars: 17,
      syntaxCheck: {
        status: 'invalid',
        diagnostic: {
          line: 12,
          column: 34,
          message: `invalid syntax ${'very-long-message-'.repeat(8)}`,
        },
      },
    }).text;

    expect(locked).not.toContain('✕ 12행 34열');
    expect(invalid).toContain('✕ 12행 34열 · invalid syntax');
    expect(invalid).not.toContain('very-long-message-'.repeat(8));
  });

  it('preserves symbols, labels, and bars without terminal colors', () => {
    const screen = renderHud({columns: 140, colorEnabled: false});

    expect(screen.raw).not.toMatch(COLOR_SEQUENCE);
    expect(screen.text).toContain('★ 16성 → 17성');
    expect(screen.text).toContain('성공 ███░░░░░░░ 30%');
    expect(screen.text).toContain('17🔒 Python 오류');
    expect(screen.text).toContain('22◇ Git commit');
  });

  it('keeps HUD content when marked dimmed behind the enhancement modal', () => {
    const screen = renderHud({columns: 140, dimmed: true});

    expect(screen.text).toContain('★ 16성 → 17성');
    expect(screen.text).toContain('INPUT 10 │ BUFFER 10 │ LOSS F0 D0');
  });

  it('renders extreme widths and large values without throwing', () => {
    for (const columns of [1, 8, 32, 71, 72, 109, 110]) {
      expect(() =>
        renderHud({columns, source: `한🙂${'x'.repeat(120)}`}))
        .not.toThrow();
    }
  });
});
