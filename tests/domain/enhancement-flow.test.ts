import {describe, expect, it} from 'vitest';
import {
  createEnhancementFlowState,
  getEnhancementStatus,
  runEnhancement,
  type EnhancementFlowState,
} from '../../src/domain/enhancement-flow.js';
import {
  backspace,
  createEditorState,
  getText,
  insertDirectInput,
  moveCursor,
  paste,
  userUndo,
  type EditorState,
} from '../../src/editor/buffer.js';

const NOW = new Date('2026-08-02T03:04:05.000Z');

function attempt(
  state: EnhancementFlowState,
  roll: number,
): EnhancementFlowState {
  const result = runEnhancement(state, () => roll, () => NOW);

  expect(result.attempted).toBe(true);
  return result.state;
}

function moveToEnd(state: EditorState): EditorState {
  let moved = state;

  while (moved.cursor < moved.buffer.length) {
    moved = moveCursor(moved, 'right');
  }

  return moved;
}

describe('enhancement flow', () => {
  it('keeps code and immediately advances stars and the next unlock on success', () => {
    const editor = insertDirectInput(createEditorState('print("초기")\n'), '🙂123456789');
    const originalBuffer = editor.buffer;
    const state = attempt(createEnhancementFlowState(editor, 2), 0);

    expect(getText(state.editor)).toBe('🙂123456789print("초기")\n');
    expect(state.editor.buffer).toBe(originalBuffer);
    expect(getEnhancementStatus(state)).toMatchObject({
      stars: 3,
      nextUnlockStars: 5,
      enhancementTickets: 0,
      currentGraphemes: 22,
      failureLostGraphemes: 0,
      destructionLostGraphemes: 0,
      recentEnhancement: {
        result: 'success',
        starsBefore: 2,
        starsAfter: 3,
        occurredAt: NOW.toISOString(),
      },
    });
  });

  it('removes the ten newest surviving direct inputs across lines and Unicode', () => {
    let editor = moveToEnd(createEditorState('LOAD\n'));
    editor = insertDirectInput(editor, '가나\n다라e\u0301마바사아자차');
    editor = moveCursor(editor, 'up');
    editor = paste(editor, '붙임');
    editor = insertDirectInput(editor, '🙂');
    editor = insertDirectInput(editor, 'X');
    editor = userUndo(editor);
    editor = insertDirectInput(editor, 'Y');
    editor = backspace(editor);

    const state = attempt(createEnhancementFlowState(editor, 10), 0.5);
    const trace = state.destructionTraces[0];

    expect(getText(state.editor)).toBe('LOAD\n가나붙임\n');
    expect(state.stars).toBe(10);
    expect(trace).toMatchObject({
      result: 'failure',
      occurredAt: NOW.toISOString(),
    });
    expect(trace?.removed.map(({value}) => value)).toEqual([
      '🙂',
      '다',
      '라',
      'e\u0301',
      '마',
      '바',
      '사',
      '아',
      '자',
      '차',
    ]);
    expect(trace?.removed[0]).toMatchObject({
      originalIndex: 9,
      originalLine: 2,
      originalColumn: 5,
    });
    expect(getEnhancementStatus(state)).toMatchObject({
      failureLostGraphemes: 10,
      destructionLostGraphemes: 0,
      currentGraphemes: 10,
      totalDirectInputs: 15,
      survivingDirectInputs: 3,
      productivityPercent: 20,
      recentEnhancement: {result: 'failure'},
    });

    expect(getText(userUndo(state.editor))).not.toContain('다');
  });

  it('removes fewer than ten survivors without substituting initial or pasted text', () => {
    let editor = moveToEnd(createEditorState('초기'));
    editor = insertDirectInput(editor, '1234567890');

    for (let count = 0; count < 7; count += 1) {
      editor = backspace(editor);
    }

    editor = paste(editor, '붙여넣기');
    const state = attempt(createEnhancementFlowState(editor, 10), 0.5);

    expect(getText(state.editor)).toBe('초기붙여넣기');
    expect(state.destructionTraces[0]?.removed.map(({value}) => value)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(getEnhancementStatus(state)).toMatchObject({
      failureLostGraphemes: 3,
      currentGraphemes: 6,
      survivingDirectInputs: 0,
      productivityPercent: 0,
    });
  });

  it('destroys the whole mixed buffer, resets stars, and records every loss', () => {
    let editor = moveToEnd(createEditorState('초기\n'));
    editor = paste(editor, 'PASTE');
    editor = insertDirectInput(editor, '한글🙂1234567');
    const state = attempt(createEnhancementFlowState(editor, 15), 0.979);
    const trace = state.destructionTraces[0];

    expect(getText(state.editor)).toBe('');
    expect(state.editor.cursor).toBe(0);
    expect(getText(userUndo(state.editor))).toBe('');
    expect(trace).toMatchObject({
      result: 'destroyed',
      occurredAt: NOW.toISOString(),
    });
    expect(trace?.removed.map(({value}) => value).join('')).toBe(
      '초기\nPASTE한글🙂1234567',
    );
    expect(trace?.removed[3]).toMatchObject({
      value: 'P',
      originalIndex: 3,
      originalLine: 2,
      originalColumn: 1,
    });
    expect(getEnhancementStatus(state)).toMatchObject({
      stars: 0,
      nextUnlockStars: 3,
      enhancementTickets: 0,
      failureLostGraphemes: 0,
      destructionLostGraphemes: 18,
      currentGraphemes: 0,
      totalDirectInputs: 10,
      survivingDirectInputs: 0,
      productivityPercent: 0,
      recentEnhancement: {
        result: 'destroyed',
        starsBefore: 15,
        starsAfter: 0,
      },
    });
  });

  it('does not change flow state or read the clock without a ticket', () => {
    const state = createEnhancementFlowState(createEditorState('그대로'), 7);
    const result = runEnhancement(
      state,
      () => {
        throw new Error('RNG must not be called');
      },
      () => {
        throw new Error('clock must not be called');
      },
    );

    expect(result).toEqual({
      attempted: false,
      reason: 'no-tickets',
      state,
    });
    expect(result.state).toBe(state);
  });
});
