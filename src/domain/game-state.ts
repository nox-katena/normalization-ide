export const MAX_STARS = 25;

export const CORE_UNLOCK_STARS = {
  lineNumbers: 3,
  backspace: 5,
  spaceInput: 7,
  undo: 10,
  pythonRun: 12,
  fileSave: 15,
} as const;

export const PYTHON_SYNTAX_UNLOCK_STARS = 17;
export const PYTHON_HIGHLIGHTING_UNLOCK_STARS = 20;

export interface GameState {
  readonly stars: number;
  readonly enhancementTickets: number;
}

export interface UnlockState {
  readonly monochromeEditor: boolean;
  readonly lineNumbers: boolean;
  readonly backspace: boolean;
  readonly spaceInput: boolean;
  readonly undo: boolean;
  readonly pythonRun: boolean;
  readonly fileSave: boolean;
  readonly pythonSyntax: boolean;
  readonly pythonHighlighting: boolean;
}

export function getUnlockState(stars: number): UnlockState {
  return {
    monochromeEditor: stars === 0,
    lineNumbers: stars >= CORE_UNLOCK_STARS.lineNumbers,
    backspace: stars >= CORE_UNLOCK_STARS.backspace,
    spaceInput: stars >= CORE_UNLOCK_STARS.spaceInput,
    undo: stars >= CORE_UNLOCK_STARS.undo,
    pythonRun: stars >= CORE_UNLOCK_STARS.pythonRun,
    fileSave: stars >= CORE_UNLOCK_STARS.fileSave,
    pythonSyntax: stars >= PYTHON_SYNTAX_UNLOCK_STARS,
    pythonHighlighting: stars >= PYTHON_HIGHLIGHTING_UNLOCK_STARS,
  };
}
