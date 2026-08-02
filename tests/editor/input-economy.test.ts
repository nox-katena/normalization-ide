import {describe, expect, it} from 'vitest';
import {
  backspace,
  createEditorState,
  deleteForward,
  getInputEconomy,
  getText,
  handleShortcut,
  insertDirectInput,
  moveCursor,
  paste,
  userUndo,
  type EditorState,
} from '../../src/editor/buffer.js';

function type(state: EditorState, text: string): EditorState {
  return insertDirectInput(state, text);
}

describe('editor buffer', () => {
  it('edits multiline Unicode text with grapheme-based cursor positions', () => {
    let state = createEditorState();
    state = type(state, '한글\ne\u0301x');

    expect(getText(state)).toBe('한글\ne\u0301x');
    expect(state.cursor).toBe(5);

    state = moveCursor(state, 'up');
    expect(state.cursor).toBe(2);

    state = moveCursor(state, 'down');
    expect(state.cursor).toBe(5);

    state = moveCursor(state, 'up');
    state = moveCursor(state, 'home');
    state = type(state, '🙂');
    state = moveCursor(state, 'end');
    state = deleteForward(state);

    expect(getText(state)).toBe('🙂한글e\u0301x');
    expect(state.cursor).toBe(3);
  });

  it('supports selection-free Backspace and forward deletion', () => {
    let state = type(createEditorState(), '가나다');
    state = moveCursor(state, 'left');
    state = backspace(state);

    expect(getText(state)).toBe('가다');
    expect(state.cursor).toBe(1);

    state = deleteForward(state);

    expect(getText(state)).toBe('가');
    expect(state.cursor).toBe(1);
  });

  it('keeps direct-input identifiers stable as positions change', () => {
    let state = type(createEditorState(), 'abc');
    const originalIds = state.buffer.map(({directInputId}) => directInputId);

    state = moveCursor(state, 'home');
    state = paste(state, '붙여넣기');

    expect(state.buffer.slice(4).map(({directInputId}) => directInputId)).toEqual(
      originalIds,
    );
    expect(new Set(originalIds).size).toBe(3);
    expect(state.buffer.slice(0, 4).every(({directInputId}) => directInputId === null)).toBe(
      true,
    );
  });
});

describe('input economy', () => {
  it('counts characters, whitespace, newlines, and combining text as graphemes', () => {
    const state = type(createEditorState(), '한 e\u0301\n');

    expect(getInputEconomy(state)).toEqual({
      totalDirectInputs: 4,
      bufferGraphemes: 4,
      survivingDirectInputs: 4,
      productivityPercent: 100,
    });
  });

  it('earns exactly one ticket at each crossed multiple of ten', () => {
    let state = type(createEditorState(), '123456789');
    expect(state.enhancementTickets).toBe(0);

    state = type(state, '가');
    expect(state.enhancementTickets).toBe(1);

    state = type(state, '123456789');
    expect(state.enhancementTickets).toBe(1);

    state = type(state, '나');
    expect(state.enhancementTickets).toBe(2);
    expect(state.totalDirectInputs).toBe(20);
  });

  it('inserts pasted graphemes without awarding inputs or tickets', () => {
    let state = type(createEditorState(), '123456789');
    state = paste(state, '붙여 넣기\ne\u0301');

    expect(getText(state)).toBe('123456789붙여 넣기\ne\u0301');
    expect(state.totalDirectInputs).toBe(9);
    expect(state.enhancementTickets).toBe(0);
    expect(getInputEconomy(state)).toMatchObject({
      bufferGraphemes: 16,
      survivingDirectInputs: 9,
    });
  });

  it('does not count deletion, movement, shortcuts, or Undo as direct input', () => {
    let state = type(createEditorState(), '1234567890');
    state = moveCursor(state, 'left');
    state = backspace(state);
    state = deleteForward(state);
    state = handleShortcut(state);

    expect(state.totalDirectInputs).toBe(10);
    expect(state.enhancementTickets).toBe(1);

    state = userUndo(state);
    state = userUndo(state);

    expect(getText(state)).toBe('1234567890');
    expect(state.totalDirectInputs).toBe(10);
    expect(state.enhancementTickets).toBe(1);
  });

  it('keeps cumulative input and identifiers monotonic when typing is undone', () => {
    let state = type(createEditorState(), '가');
    const firstId = state.buffer[0]?.directInputId;

    state = userUndo(state);
    state = type(state, '나');

    expect(getText(state)).toBe('나');
    expect(state.totalDirectInputs).toBe(2);
    expect(state.buffer[0]?.directInputId).not.toBe(firstId);
  });

  it('reports surviving direct inputs and productivity after removal', () => {
    let state = type(createEditorState(), '가나다라');
    state = paste(state, 'XY');
    state = moveCursor(state, 'home');
    state = deleteForward(state);

    expect(getInputEconomy(state)).toEqual({
      totalDirectInputs: 4,
      bufferGraphemes: 5,
      survivingDirectInputs: 3,
      productivityPercent: 75,
    });
  });

  it('reports 100% productivity when there has been no direct input', () => {
    const state = paste(createEditorState(), '붙여넣기');

    expect(getInputEconomy(state)).toEqual({
      totalDirectInputs: 0,
      bufferGraphemes: 4,
      survivingDirectInputs: 0,
      productivityPercent: 100,
    });
  });
});
