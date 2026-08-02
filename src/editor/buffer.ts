import {
  calculateInputEconomy,
  countEarnedTickets,
  type InputEconomy,
} from './input-economy.js';
import {pushUndoSnapshot, type BufferSnapshot} from './history.js';

export {userUndo} from './history.js';

export type BufferGrapheme =
  | {
      readonly value: string;
      readonly source: 'direct';
      readonly directInputId: number;
    }
  | {
      readonly value: string;
      readonly source: 'initial' | 'paste';
      readonly directInputId: null;
    };

export interface EditorState {
  readonly buffer: readonly BufferGrapheme[];
  readonly cursor: number;
  readonly totalDirectInputs: number;
  readonly enhancementTickets: number;
  readonly nextDirectInputId: number;
  readonly undoStack: readonly BufferSnapshot[];
}

export type CursorMove = 'left' | 'right' | 'up' | 'down' | 'home' | 'end';

const graphemeSegmenter = new Intl.Segmenter('und', {granularity: 'grapheme'});

export function splitGraphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), ({segment}) => segment);
}

export function createEditorState(initialText = ''): EditorState {
  return {
    buffer: splitGraphemes(initialText).map((value): BufferGrapheme => ({
      value,
      source: 'initial',
      directInputId: null,
    })),
    cursor: 0,
    totalDirectInputs: 0,
    enhancementTickets: 0,
    nextDirectInputId: 1,
    undoStack: [],
  };
}

export function getText(state: EditorState): string {
  return state.buffer.map(({value}) => value).join('');
}

export function getInputEconomy(state: EditorState): InputEconomy {
  return calculateInputEconomy(state.buffer, state.totalDirectInputs);
}

export function insertDirectInput(state: EditorState, text: string): EditorState {
  const values = splitGraphemes(text);

  if (values.length === 0) {
    return state;
  }

  const inserted = values.map(
    (value, index): BufferGrapheme => ({
      value,
      source: 'direct',
      directInputId: state.nextDirectInputId + index,
    }),
  );

  return insertGraphemes(state, inserted, {
    totalDirectInputs: state.totalDirectInputs + inserted.length,
    enhancementTickets:
      state.enhancementTickets +
      countEarnedTickets(state.totalDirectInputs, inserted.length),
    nextDirectInputId: state.nextDirectInputId + inserted.length,
  });
}

export function paste(state: EditorState, text: string): EditorState {
  const inserted = splitGraphemes(text).map(
    (value): BufferGrapheme => ({
      value,
      source: 'paste',
      directInputId: null,
    }),
  );

  if (inserted.length === 0) {
    return state;
  }

  return insertGraphemes(state, inserted);
}

export function moveCursor(state: EditorState, movement: CursorMove): EditorState {
  const cursor = findMovedCursor(state.buffer, state.cursor, movement);

  return cursor === state.cursor ? state : {...state, cursor};
}

export function backspace(state: EditorState): EditorState {
  if (state.cursor === 0) {
    return state;
  }

  return removeAt(state, state.cursor - 1, state.cursor - 1);
}

export function deleteForward(state: EditorState): EditorState {
  if (state.cursor === state.buffer.length) {
    return state;
  }

  return removeAt(state, state.cursor, state.cursor);
}

export function handleShortcut(state: EditorState): EditorState {
  return state;
}

function insertGraphemes(
  state: EditorState,
  inserted: readonly BufferGrapheme[],
  counters: Pick<
    EditorState,
    'totalDirectInputs' | 'enhancementTickets' | 'nextDirectInputId'
  > = state,
): EditorState {
  return {
    ...state,
    ...counters,
    buffer: [
      ...state.buffer.slice(0, state.cursor),
      ...inserted,
      ...state.buffer.slice(state.cursor),
    ],
    cursor: state.cursor + inserted.length,
    undoStack: pushUndoSnapshot(state),
  };
}

function removeAt(
  state: EditorState,
  index: number,
  cursor: number,
): EditorState {
  return {
    ...state,
    buffer: [...state.buffer.slice(0, index), ...state.buffer.slice(index + 1)],
    cursor,
    undoStack: pushUndoSnapshot(state),
  };
}

function findMovedCursor(
  buffer: readonly BufferGrapheme[],
  cursor: number,
  movement: CursorMove,
): number {
  if (movement === 'left') {
    return Math.max(0, cursor - 1);
  }

  if (movement === 'right') {
    return Math.min(buffer.length, cursor + 1);
  }

  const lineStart = findLineStart(buffer, cursor);
  const lineEnd = findLineEnd(buffer, cursor);

  if (movement === 'home') {
    return lineStart;
  }

  if (movement === 'end') {
    return lineEnd;
  }

  const column = cursor - lineStart;

  if (movement === 'up') {
    if (lineStart === 0) {
      return cursor;
    }

    const previousLineEnd = lineStart - 1;
    const previousLineStart = findLineStart(buffer, previousLineEnd);
    return previousLineStart + Math.min(column, previousLineEnd - previousLineStart);
  }

  if (lineEnd === buffer.length) {
    return cursor;
  }

  const nextLineStart = lineEnd + 1;
  const nextLineEnd = findLineEnd(buffer, nextLineStart);
  return nextLineStart + Math.min(column, nextLineEnd - nextLineStart);
}

function findLineStart(buffer: readonly BufferGrapheme[], cursor: number): number {
  for (let index = cursor - 1; index >= 0; index -= 1) {
    if (buffer[index]?.value === '\n') {
      return index + 1;
    }
  }

  return 0;
}

function findLineEnd(buffer: readonly BufferGrapheme[], cursor: number): number {
  for (let index = cursor; index < buffer.length; index += 1) {
    if (buffer[index]?.value === '\n') {
      return index;
    }
  }

  return buffer.length;
}
