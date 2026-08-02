import {describe, expect, it} from 'vitest';
import {getUnlockState} from '../../src/domain/game-state.js';
import {
  createEditorState,
  getText,
  insertDirectInput,
  paste,
  userUndo,
  type EditorState,
} from '../../src/editor/buffer.js';

const UNLOCK_BOUNDARIES = [
  [2, 3, 'lineNumbers'],
  [4, 5, 'backspace'],
  [6, 7, 'spaceInput'],
  [9, 10, 'undo'],
  [11, 12, 'pythonRun'],
  [14, 15, 'fileSave'],
] as const;

function typeIndividually(text: string): EditorState {
  return Array.from(text).reduce(insertDirectInput, createEditorState());
}

describe('core unlock state', () => {
  it('keeps only the zero-star editor monochrome', () => {
    expect(getUnlockState(0).monochromeEditor).toBe(true);
    expect(getUnlockState(1).monochromeEditor).toBe(false);
  });

  it.each(UNLOCK_BOUNDARIES)(
    'activates %s→%s %s at its exact boundary',
    (beforeStars, unlockedStars, feature) => {
      expect(getUnlockState(beforeStars)[feature]).toBe(false);
      expect(getUnlockState(unlockedStars)[feature]).toBe(true);
    },
  );
});

describe('user Undo history', () => {
  it('undoes the latest user edit without refunding inputs or awarding tickets', () => {
    let editor = typeIndividually('1234567890');

    expect(editor.enhancementTickets).toBe(1);
    editor = userUndo(editor);

    expect(getText(editor)).toBe('123456789');
    expect(editor.totalDirectInputs).toBe(10);
    expect(editor.enhancementTickets).toBe(1);
    expect(editor.nextDirectInputId).toBe(11);
  });

  it('undoes pasted edits without converting them into direct input', () => {
    let editor = insertDirectInput(createEditorState(), '가');
    editor = paste(editor, '붙여넣기');
    editor = userUndo(editor);

    expect(getText(editor)).toBe('가');
    expect(editor.totalDirectInputs).toBe(1);
    expect(editor.enhancementTickets).toBe(0);
  });

  it('leaves an editor without user history unchanged', () => {
    const editor = createEditorState('initial');

    expect(userUndo(editor)).toBe(editor);
  });
});
