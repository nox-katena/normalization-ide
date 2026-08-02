import {
  createEditorState,
  getInputEconomy,
  type BufferGrapheme,
  type EditorState,
} from '../editor/buffer.js';
import type {BufferSnapshot} from '../editor/history.js';
import {
  CORE_UNLOCK_STARS,
  getUnlockState,
  type UnlockState,
} from './game-state.js';
import {attemptEnhancement} from './starforce-engine.js';
import type {
  EnhancementResult,
  RandomSource,
} from './starforce-engine.js';

const FAILURE_REMOVAL_LIMIT = 10;
const UNLOCK_STARS = [
  CORE_UNLOCK_STARS.lineNumbers,
  CORE_UNLOCK_STARS.backspace,
  CORE_UNLOCK_STARS.spaceInput,
  CORE_UNLOCK_STARS.undo,
  CORE_UNLOCK_STARS.pythonRun,
  CORE_UNLOCK_STARS.fileSave,
  17,
  20,
  22,
  25,
] as const;

export type Clock = () => Date;
export type AppliedEnhancementResult = EnhancementResult['type'];

export interface RemovedGrapheme {
  readonly value: string;
  readonly source: BufferGrapheme['source'];
  readonly directInputId: number | null;
  readonly originalIndex: number;
  readonly originalLine: number;
  readonly originalColumn: number;
}

export interface DestructionTrace {
  readonly result: 'failure' | 'destroyed';
  readonly removed: readonly RemovedGrapheme[];
  readonly occurredAt: string;
}

export interface RecentEnhancement {
  readonly result: AppliedEnhancementResult;
  readonly starsBefore: number;
  readonly starsAfter: number;
  readonly occurredAt: string;
}

export interface EnhancementFlowState {
  readonly editor: EditorState;
  readonly stars: number;
  readonly failureLostGraphemes: number;
  readonly destructionLostGraphemes: number;
  readonly destructionTraces: readonly DestructionTrace[];
  readonly recentEnhancement: RecentEnhancement | null;
}

export interface EnhancementStatus {
  readonly stars: number;
  readonly unlocks: UnlockState;
  readonly nextUnlockStars: number | null;
  readonly enhancementTickets: number;
  readonly totalDirectInputs: number;
  readonly currentGraphemes: number;
  readonly survivingDirectInputs: number;
  readonly productivityPercent: number;
  readonly failureLostGraphemes: number;
  readonly destructionLostGraphemes: number;
  readonly recentEnhancement: RecentEnhancement | null;
}

export type EnhancementFlowAttempt =
  | {
      readonly attempted: false;
      readonly reason: 'no-tickets' | 'max-stars';
      readonly state: EnhancementFlowState;
    }
  | {
      readonly attempted: true;
      readonly result: EnhancementResult;
      readonly state: EnhancementFlowState;
    };

export function createEnhancementFlowState(
  editor: EditorState = createEditorState(),
  stars = 0,
): EnhancementFlowState {
  return {
    editor,
    stars,
    failureLostGraphemes: 0,
    destructionLostGraphemes: 0,
    destructionTraces: [],
    recentEnhancement: null,
  };
}

export function getEnhancementStatus(
  state: EnhancementFlowState,
): EnhancementStatus {
  const economy = getInputEconomy(state.editor);

  return {
    stars: state.stars,
    unlocks: getUnlockState(state.stars),
    nextUnlockStars:
      UNLOCK_STARS.find((unlockStars) => unlockStars > state.stars) ?? null,
    enhancementTickets: state.editor.enhancementTickets,
    totalDirectInputs: economy.totalDirectInputs,
    currentGraphemes: economy.bufferGraphemes,
    survivingDirectInputs: economy.survivingDirectInputs,
    productivityPercent: economy.productivityPercent,
    failureLostGraphemes: state.failureLostGraphemes,
    destructionLostGraphemes: state.destructionLostGraphemes,
    recentEnhancement: state.recentEnhancement,
  };
}

export function runEnhancement(
  state: EnhancementFlowState,
  random: RandomSource = Math.random,
  clock: Clock = () => new Date(),
): EnhancementFlowAttempt {
  const attempt = attemptEnhancement(
    {
      stars: state.stars,
      enhancementTickets: state.editor.enhancementTickets,
    },
    random,
  );

  if (!attempt.attempted) {
    return {...attempt, state};
  }

  const occurredAt = clock().toISOString();
  const recentEnhancement: RecentEnhancement = {
    result: attempt.result.type,
    starsBefore: state.stars,
    starsAfter: attempt.result.type === 'destroyed' ? 0 : attempt.state.stars,
    occurredAt,
  };
  const editor = {
    ...state.editor,
    enhancementTickets: attempt.state.enhancementTickets,
  };

  if (attempt.result.type === 'success') {
    return {
      attempted: true,
      result: attempt.result,
      state: {
        ...state,
        editor,
        stars: attempt.state.stars,
        recentEnhancement,
      },
    };
  }

  const removed =
    attempt.result.type === 'failure'
      ? getRecentDirectInputRemoval(editor.buffer)
      : getRemovalDetails(editor.buffer, editor.buffer.map((_, index) => index));
  const trace: DestructionTrace = {
    result: attempt.result.type,
    removed,
    occurredAt,
  };
  const nextEditor =
    attempt.result.type === 'failure'
      ? removeDirectInputs(
          editor,
          new Set(
            removed.flatMap(({directInputId}) =>
              directInputId === null ? [] : [directInputId],
            ),
          ),
        )
      : {...editor, buffer: [], cursor: 0, undoStack: []};

  return {
    attempted: true,
    result: attempt.result,
    state: {
      ...state,
      editor: nextEditor,
      stars: attempt.result.type === 'destroyed' ? 0 : attempt.state.stars,
      failureLostGraphemes:
        state.failureLostGraphemes +
        (attempt.result.type === 'failure' ? removed.length : 0),
      destructionLostGraphemes:
        state.destructionLostGraphemes +
        (attempt.result.type === 'destroyed' ? removed.length : 0),
      destructionTraces: [...state.destructionTraces, trace],
      recentEnhancement,
    },
  };
}

function getRecentDirectInputRemoval(
  buffer: readonly BufferGrapheme[],
): readonly RemovedGrapheme[] {
  const indices = buffer
    .map((grapheme, index) => ({grapheme, index}))
    .filter(
      (
        entry,
      ): entry is {
        grapheme: Extract<BufferGrapheme, {source: 'direct'}>;
        index: number;
      } => entry.grapheme.source === 'direct',
    )
    .sort(
      (left, right) =>
        right.grapheme.directInputId - left.grapheme.directInputId,
    )
    .slice(0, FAILURE_REMOVAL_LIMIT)
    .map(({index}) => index)
    .sort((left, right) => left - right);

  return getRemovalDetails(buffer, indices);
}

function getRemovalDetails(
  buffer: readonly BufferGrapheme[],
  indices: readonly number[],
): readonly RemovedGrapheme[] {
  const selected = new Set(indices);
  const removed: RemovedGrapheme[] = [];
  let line = 1;
  let column = 1;

  buffer.forEach((grapheme, index) => {
    if (selected.has(index)) {
      removed.push({
        ...grapheme,
        originalIndex: index,
        originalLine: line,
        originalColumn: column,
      });
    }

    if (grapheme.value === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  });

  return removed;
}

function removeDirectInputs(
  editor: EditorState,
  removedIds: ReadonlySet<number>,
): EditorState {
  const shouldRemove = (grapheme: BufferGrapheme): boolean =>
    grapheme.source === 'direct' && removedIds.has(grapheme.directInputId);
  const current = removeFromSnapshot(editor, shouldRemove);

  return {
    ...editor,
    ...current,
    undoStack: editor.undoStack.map((snapshot) =>
      removeFromSnapshot(snapshot, shouldRemove),
    ),
  };
}

function removeFromSnapshot(
  snapshot: BufferSnapshot,
  shouldRemove: (grapheme: BufferGrapheme) => boolean,
): BufferSnapshot {
  const removedBeforeCursor = snapshot.buffer
    .slice(0, snapshot.cursor)
    .filter(shouldRemove).length;

  return {
    buffer: snapshot.buffer.filter((grapheme) => !shouldRemove(grapheme)),
    cursor: snapshot.cursor - removedBeforeCursor,
  };
}
