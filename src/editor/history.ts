import type {BufferGrapheme, EditorState} from './buffer.js';

export interface BufferSnapshot {
  readonly buffer: readonly BufferGrapheme[];
  readonly cursor: number;
}

export function pushUndoSnapshot(
  state: EditorState,
): readonly BufferSnapshot[] {
  return [...state.undoStack, {buffer: state.buffer, cursor: state.cursor}];
}

export function userUndo(state: EditorState): EditorState {
  const snapshot = state.undoStack.at(-1);

  if (snapshot === undefined) {
    return state;
  }

  return {
    ...state,
    buffer: snapshot.buffer,
    cursor: snapshot.cursor,
    undoStack: state.undoStack.slice(0, -1),
  };
}
