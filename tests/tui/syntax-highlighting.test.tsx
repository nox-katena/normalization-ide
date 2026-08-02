import {Writable} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {describe, expect, it} from 'vitest';
import {getUnlockState} from '../../src/domain/game-state.js';
import {
  createEditorState,
  splitGraphemes,
  type EditorState,
} from '../../src/editor/buffer.js';
import {
  highlightPythonGraphemes,
  type PythonHighlightKind,
} from '../../src/ui/python-highlighting.js';

const previousForceColor = process.env.FORCE_COLOR;
process.env.FORCE_COLOR = '1';
const [{render}, {EditorPane}] = await Promise.all([
  import('ink'),
  import('../../src/ui/EditorPane.js'),
]);
if (previousForceColor === undefined) {
  delete process.env.FORCE_COLOR;
} else {
  process.env.FORCE_COLOR = previousForceColor;
}

const ESCAPE = String.fromCharCode(27);
const HIGHLIGHT_COLORS = new RegExp(`${ESCAPE}\\[(?:34|32|35|90)m`);
const SOURCE =
  'def 인사(name="별🙂", count=42):\n    return count # 미완성';

class TestOutput extends Writable {
  readonly isTTY = true;
  readonly rows = 20;
  readonly chunks: string[] = [];

  constructor(
    readonly columns = 80,
    private readonly colorSupport = true,
  ) {
    super();
  }

  hasColors(): boolean {
    return this.colorSupport;
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

function renderEditor(
  source: string,
  stars: number,
  cursor = 0,
  options: {readonly colors?: boolean; readonly columns?: number} = {},
): {raw: string; text: string} {
  const stdout = new TestOutput(options.columns, options.colors);
  const editor: EditorState = {...createEditorState(source), cursor};
  const instance = render(
    <EditorPane editor={editor} focused stars={stars} />,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      patchConsole: false,
    },
  );

  instance.unmount();
  return {raw: stdout.raw(), text: stdout.text()};
}

function highlightSpans(source: string) {
  const graphemes = splitGraphemes(source);
  const highlights = highlightPythonGraphemes(graphemes);
  const spans: Array<{kind: PythonHighlightKind; text: string}> = [];

  graphemes.forEach((value, index) => {
    const kind = highlights[index] ?? 'plain';
    const previous = spans.at(-1);
    if (previous?.kind === kind) {
      previous.text += value;
    } else {
      spans.push({kind, text: value});
    }
  });

  return {graphemes, highlights, spans};
}

describe('20-star Python syntax highlighting', () => {
  it('keeps code unhighlighted through 19 stars and unlocks at 20', () => {
    const locked = renderEditor(SOURCE, 19);
    const unlocked = renderEditor(SOURCE, 20);

    expect(getUnlockState(19).pythonHighlighting).toBe(false);
    expect(getUnlockState(20).pythonHighlighting).toBe(true);
    expect(locked.raw).not.toMatch(HIGHLIGHT_COLORS);
    expect(unlocked.raw).toContain(`${ESCAPE}[34m`);
    expect(unlocked.raw).toContain(`${ESCAPE}[32m`);
    expect(unlocked.raw).toContain(`${ESCAPE}[35m`);
    expect(unlocked.raw).toContain(`${ESCAPE}[90m`);
  });

  it('renders minimal Python token classes without changing text or cursor', () => {
    const cursor = splitGraphemes('def ').length;
    const beforeUnlock = renderEditor(SOURCE, 19, cursor);
    const highlighted = renderEditor(SOURCE, 20, cursor);
    const tokenized = highlightSpans(SOURCE);

    expect(highlighted.text).toBe(beforeUnlock.text);
    expect(highlighted.text).toContain('1 │ def ▌인사(name="별🙂", count=42):');
    expect(highlighted.text).toContain('2 │     return count # 미완성');
    expect(tokenized.highlights).toHaveLength(tokenized.graphemes.length);
    expect(tokenized.graphemes.join('')).toBe(SOURCE);
    expect(tokenized.spans).toEqual([
      {kind: 'keyword', text: 'def'},
      {kind: 'plain', text: ' 인사(name='},
      {kind: 'string', text: '"별🙂"'},
      {kind: 'plain', text: ', count='},
      {kind: 'number', text: '42'},
      {kind: 'plain', text: '):\n    '},
      {kind: 'keyword', text: 'return'},
      {kind: 'plain', text: ' count '},
      {kind: 'comment', text: '# 미완성'},
    ]);
  });

  it('falls back to the unchanged plain rendering without color support', () => {
    const locked = renderEditor(SOURCE, 19, 0, {colors: false});
    const fallback = renderEditor(SOURCE, 20, 0, {colors: false});

    expect(fallback.raw).toBe(locked.raw);
    expect(fallback.text).toBe(locked.text);
  });

  it('renders long, multiline, Unicode, and incomplete Python in a small terminal', () => {
    const source = [
      'message = "한🙂',
      `items = [${'1,'.repeat(300)}`,
      "note = '''끝나지 않은 문자열",
    ].join('\n');

    const rendered = renderEditor(source, 20, splitGraphemes(source).length, {
      columns: 24,
    });
    const tokenized = highlightSpans(source);

    expect(rendered.text).toContain('1 │ message = "한🙂');
    expect(rendered.text).toContain('2 │ items = [1,1,1,1');
    expect(rendered.text).toContain("3 │ note = '''끝나지");
    expect(tokenized.highlights).toHaveLength(tokenized.graphemes.length);
    expect(tokenized.graphemes.join('')).toBe(source);
  });
});
