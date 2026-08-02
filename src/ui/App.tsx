import {Box, Text, useApp, useInput} from 'ink';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  createEnhancementFlowState,
  getEnhancementStatus,
  runEnhancement,
  type Clock,
  type EnhancementFlowState,
} from '../domain/enhancement-flow.js';
import {getUnlockState, type UnlockState} from '../domain/game-state.js';
import type {RandomSource} from '../domain/starforce-engine.js';
import {
  backspace,
  getText,
  insertDirectInput,
  moveCursor,
  paste,
  splitGraphemes,
  userUndo,
} from '../editor/buffer.js';
import {
  runPython,
  type PythonRunner,
  type PythonRunResult,
} from '../runtime/python-runner.js';
import {
  checkPythonSyntax,
  type PythonSyntaxChecker,
} from '../runtime/python-syntax.js';
import type {RecoveryWriter} from '../persistence/recovery-store.js';
import {writeTargetFile} from '../persistence/file-store.js';
import {EditorPane} from './EditorPane.js';
import {HudPane, type SyntaxCheckStatus} from './HudPane.js';
import {ResultPane} from './ResultPane.js';

export const APP_TITLE = 'Starforce TUI Editor';

export type FocusTarget = 'editor' | 'enhancement';

export interface AppModel {
  readonly flow: EnhancementFlowState;
  readonly focus: FocusTarget;
  readonly message: string;
  readonly pythonResult: PythonRunResult | null;
}

export interface AppInputKey {
  readonly upArrow?: boolean;
  readonly downArrow?: boolean;
  readonly leftArrow?: boolean;
  readonly rightArrow?: boolean;
  readonly return?: boolean;
  readonly ctrl?: boolean;
  readonly tab?: boolean;
  readonly backspace?: boolean;
  readonly delete?: boolean;
  readonly meta?: boolean;
  readonly escape?: boolean;
}

export type FileSaver = (targetPath: string, source: string) => Promise<void>;

export interface AppProps {
  readonly initialState?: EnhancementFlowState;
  readonly initialRecovery?: EnhancementFlowState | null;
  readonly targetPath?: string;
  readonly random?: RandomSource;
  readonly clock?: Clock;
  readonly pythonRunner?: PythonRunner;
  readonly syntaxChecker?: PythonSyntaxChecker;
  readonly fileSaver?: FileSaver;
  readonly recoveryWriter?: RecoveryWriter;
}

export function createAppModel(
  flow: EnhancementFlowState = createEnhancementFlowState(),
): AppModel {
  return {
    flow,
    focus: 'editor',
    message: '코드를 직접 입력하세요. 10타마다 강화권 1장을 얻습니다.',
    pythonResult: null,
  };
}

export function handleAppInput(
  model: AppModel,
  input: string,
  key: AppInputKey,
  random: RandomSource = Math.random,
  clock: Clock = () => new Date(),
): AppModel {
  if (key.tab) {
    const focus = model.focus === 'editor' ? 'enhancement' : 'editor';
    return {
      ...model,
      focus,
      message: focus === 'editor' ? '편집기 포커스' : '강화 버튼 포커스',
    };
  }

  if (key.ctrl) {
    const unlocks = getUnlockState(model.flow.stars);

    if (input.toLowerCase() === 'z') {
      if (!unlocks.undo) {
        return {...model, message: 'Ctrl+Z Undo는 10성에서 해금됩니다.'};
      }

      const editor = userUndo(model.flow.editor);
      return updateEditor(
        model,
        editor,
        editor === model.flow.editor
          ? '되돌릴 사용자 편집이 없습니다.'
          : '최근 사용자 편집을 Undo했습니다.',
      );
    }

    const unlockMessage = getLockedShortcutMessage(input, unlocks);
    return unlockMessage === null ? model : {...model, message: unlockMessage};
  }

  if (model.focus === 'enhancement') {
    return input === ' '
      ? enhance(model, random, clock)
      : {
          ...model,
          message: '강화 버튼에서는 Space로 강화합니다. Tab으로 편집기로 돌아가세요.',
        };
  }

  const editor = model.flow.editor;
  const unlocks = getUnlockState(model.flow.stars);

  if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
    const movement = key.leftArrow
      ? 'left'
      : key.rightArrow
        ? 'right'
        : key.upArrow
          ? 'up'
          : 'down';
    return updateEditor(model, moveCursor(editor, movement), '커서 이동');
  }

  // Ink 6 reports the DEL byte (0x7f), emitted by macOS Backspace, as Delete.
  // Treat both key flags as the same backward-delete action so the 5-star
  // Backspace lock cannot be bypassed and the physical key behaves correctly.
  if (key.backspace || key.delete) {
    if (!unlocks.backspace) {
      return {...model, message: 'Backspace는 5성에서 해금됩니다.'};
    }

    return updateEditor(model, backspace(editor), 'Backspace');
  }

  if (key.return) {
    return updateEditor(model, insertDirectInput(editor, '\n'), '줄바꿈 직접 입력');
  }

  if (key.meta || input.length === 0) {
    return model;
  }

  if (input === ' ' && !unlocks.spaceInput) {
    return {...model, message: '공백 입력은 7성에서 해금됩니다.'};
  }

  const graphemeCount = splitGraphemes(input).length;
  const inserted =
    graphemeCount === 1 ? insertDirectInput(editor, input) : paste(editor, input);
  const message =
    graphemeCount === 1
      ? '직접 입력 반영'
      : '붙여넣기 반영 (직접 입력 타수 제외)';

  return updateEditor(model, inserted, message);
}

export function App({
  initialState,
  initialRecovery = null,
  targetPath,
  random = Math.random,
  clock,
  pythonRunner = runPython,
  syntaxChecker = checkPythonSyntax,
  fileSaver = writeTargetFile,
  recoveryWriter,
}: AppProps) {
  const {exit} = useApp();
  const [model, setModel] = useState(() => createAppModel(initialState));
  const [dialog, setDialog] = useState<'editing' | 'recovery' | 'quit'>(() =>
    initialRecovery === null ? 'editing' : 'recovery',
  );
  const [busy, setBusy] = useState(false);
  const syntaxSource = getText(model.flow.editor);
  const syntaxUnlocked = getUnlockState(model.flow.stars).pythonSyntax;
  const [syntaxResult, setSyntaxResult] = useState<{
    readonly source: string;
    readonly check: SyntaxCheckStatus;
  }>(() => ({
    source: syntaxSource,
    check: syntaxUnlocked ? {status: 'checking'} : {status: 'locked'},
  }));
  const dirtyRef = useRef(false);
  const previousFlow = useRef(model.flow);
  const syntaxRequestRef = useRef(0);
  const latestSyntaxContext = useRef({
    source: syntaxSource,
    unlocked: syntaxUnlocked,
  });
  latestSyntaxContext.current = {
    source: syntaxSource,
    unlocked: syntaxUnlocked,
  };
  const inputContext = useRef({
    busy,
    clock,
    dialog,
    exit,
    fileSaver,
    initialRecovery,
    model,
    pythonRunner,
    random,
    recoveryWriter,
    targetPath,
  });
  inputContext.current = {
    busy,
    clock,
    dialog,
    exit,
    fileSaver,
    initialRecovery,
    model,
    pythonRunner,
    random,
    recoveryWriter,
    targetPath,
  };
  const syntaxCheck: SyntaxCheckStatus = !syntaxUnlocked
    ? {status: 'locked'}
    : syntaxResult.source === syntaxSource &&
        syntaxResult.check.status !== 'locked'
      ? syntaxResult.check
      : {status: 'checking'};

  useEffect(() => {
    if (previousFlow.current === model.flow) {
      return;
    }

    const bufferChanged = previousFlow.current.editor.buffer !== model.flow.editor.buffer;
    previousFlow.current = model.flow;
    if (bufferChanged) {
      dirtyRef.current = true;
    }

    if (dirtyRef.current && recoveryWriter !== undefined) {
      void recoveryWriter.write(model.flow).catch((error: unknown) => {
        setModel((current) => ({
          ...current,
          message: `복구본 저장 실패: ${formatError(error)}`,
        }));
      });
    }
  }, [model.flow, recoveryWriter]);

  useEffect(() => {
    const requestId = ++syntaxRequestRef.current;

    if (!syntaxUnlocked) {
      setSyntaxResult((current) =>
        current.source === syntaxSource && current.check.status === 'locked'
          ? current
          : {source: syntaxSource, check: {status: 'locked'}},
      );
      return;
    }

    let active = true;
    setSyntaxResult({source: syntaxSource, check: {status: 'checking'}});
    void syntaxChecker(syntaxSource).then(
      (diagnostic) => {
        if (
          active &&
          syntaxRequestRef.current === requestId &&
          latestSyntaxContext.current.source === syntaxSource &&
          latestSyntaxContext.current.unlocked
        ) {
          setSyntaxResult({
            source: syntaxSource,
            check:
              diagnostic === null
                ? {status: 'valid'}
                : {status: 'invalid', diagnostic},
          });
        }
      },
      (error: unknown) => {
        if (
          active &&
          syntaxRequestRef.current === requestId &&
          latestSyntaxContext.current.source === syntaxSource &&
          latestSyntaxContext.current.unlocked
        ) {
          setSyntaxResult({
            source: syntaxSource,
            check: {status: 'error', message: formatError(error)},
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [syntaxChecker, syntaxSource, syntaxUnlocked]);

  const handleInput = useCallback((input: string, key: AppInputKey) => {
    const {
      busy,
      clock,
      dialog,
      exit,
      fileSaver,
      initialRecovery,
      model,
      pythonRunner,
      random,
      recoveryWriter,
      targetPath,
    } = inputContext.current;

    if (busy) {
      return;
    }

    const command = input.toLowerCase();

    if (dialog === 'recovery') {
      if (command === 'r' && initialRecovery !== null) {
        dirtyRef.current = true;
        setDialog('editing');
        setModel({
          ...createAppModel(initialRecovery),
          message: '복구본을 적용했습니다.',
        });
      } else if (command === 'd') {
        setBusy(true);
        void discardRecovery(recoveryWriter).then(
          () => {
            dirtyRef.current = false;
            setDialog('editing');
            setBusy(false);
            setModel((current) => ({
              ...current,
              message: '복구본을 폐기하고 대상 파일 내용으로 시작합니다.',
            }));
          },
          (error: unknown) => {
            setBusy(false);
            setModel((current) => ({
              ...current,
              message: `복구본 폐기 실패: ${formatError(error)}`,
            }));
          },
        );
      }
      return;
    }

    if (dialog === 'quit') {
      if (command === 'n' || key.escape) {
        setDialog('editing');
        setModel((current) => ({...current, message: '종료를 취소했습니다.'}));
      } else if (command === 'y') {
        setBusy(true);
        void discardRecovery(recoveryWriter).then(
          () => {
            dirtyRef.current = false;
            exit();
          },
          (error: unknown) => {
            setBusy(false);
            setModel((current) => ({
              ...current,
              message: `변경 폐기 실패: ${formatError(error)}`,
            }));
          },
        );
      }
      return;
    }

    if (key.ctrl && input.toLowerCase() === 'q') {
      if (dirtyRef.current) {
        setDialog('quit');
        setModel((current) => ({
          ...current,
          message: '저장하지 않은 변경이 있습니다.',
        }));
      } else {
        exit();
      }
      return;
    }

    if (
      key.ctrl &&
      command === 's' &&
      getUnlockState(model.flow.stars).fileSave
    ) {
      if (targetPath === undefined) {
        setModel((current) => ({
          ...current,
          message: '저장 대상 파일이 없습니다.',
        }));
        return;
      }

      const source = getText(model.flow.editor);
      setBusy(true);
      setModel((current) => ({...current, message: '파일 저장 중...'}));
      void fileSaver(targetPath, source).then(
        async () => {
          await discardRecovery(recoveryWriter);
          dirtyRef.current = false;
          setBusy(false);
          setModel((current) => ({
            ...current,
            message: `파일 저장 완료: ${targetPath}`,
          }));
        },
        (error: unknown) => {
          setBusy(false);
          setModel((current) => ({
            ...current,
            message: `파일 저장 실패: ${formatError(error)}`,
          }));
        },
      ).catch((error: unknown) => {
        setBusy(false);
        setModel((current) => ({
          ...current,
          message: `복구본 정리 실패: ${formatError(error)}`,
        }));
      });
      return;
    }

    if (
      key.ctrl &&
      command === 'r' &&
      getUnlockState(model.flow.stars).pythonRun
    ) {
      const source = getText(model.flow.editor);
      setModel((current) => ({
        ...current,
        pythonResult: null,
        message: 'Python 실행 중...',
      }));
      void pythonRunner(source).then(
        (pythonResult) => {
          setModel((current) => ({
            ...current,
            pythonResult,
            message:
              pythonResult.exitCode === 0
                ? 'Python 실행 완료'
                : 'Python 실행이 비정상 종료되었습니다.',
          }));
        },
        (error: unknown) => {
          setModel((current) => ({
            ...current,
            pythonResult: {
              stdout: '',
              stderr: error instanceof Error ? error.message : String(error),
              exitCode: null,
            },
            message: 'Python 실행 오류',
          }));
        },
      );
      return;
    }

    const nextModel = handleAppInput(
      model,
      input,
      key,
      random,
      clock ?? (() => new Date()),
    );
    if (nextModel.flow.editor.buffer !== model.flow.editor.buffer) {
      dirtyRef.current = true;
    }
    setModel(nextModel);
  }, []);

  useInput(handleInput);

  const status = getEnhancementStatus(model.flow);
  const enhancementFocused = model.focus === 'enhancement';

  return (
    <Box flexDirection="column">
      <Text bold>{APP_TITLE}</Text>
      <EditorPane
        editor={model.flow.editor}
        focused={model.focus === 'editor'}
        stars={status.stars}
        diagnostic={
          syntaxCheck.status === 'invalid' ? syntaxCheck.diagnostic : null
        }
      />
      <HudPane status={status} syntaxCheck={syntaxCheck} />
      <Box
        borderStyle="round"
        borderColor={enhancementFocused ? 'yellow' : 'gray'}
        justifyContent="center"
      >
        <Text bold={enhancementFocused} color={enhancementFocused ? 'yellow' : 'white'}>
          {enhancementFocused ? '▶ [ SPACE 강화 ] (focused)' : '  [ SPACE 강화 ]'}
        </Text>
      </Box>
      <ResultPane
        recent={status.recentEnhancement}
        message={model.message}
        pythonResult={model.pythonResult}
      />
      {dialog === 'recovery' ? (
        <Box borderStyle="double" borderColor="yellow">
          <Text>복구본 발견 · R: 복구 · D: 폐기</Text>
        </Box>
      ) : null}
      {dialog === 'quit' ? (
        <Box borderStyle="double" borderColor="red">
          <Text>저장하지 않은 변경을 폐기하고 종료할까요? Y: 폐기 후 종료 · N/Esc: 취소</Text>
        </Box>
      ) : null}
      <Text dimColor>
        Tab: 포커스 전환 · Space: 편집/강화 · Ctrl+Z/R/S: 해금 예정 · Ctrl+Q/C: 종료
      </Text>
    </Box>
  );
}

async function discardRecovery(
  recoveryWriter: RecoveryWriter | undefined,
): Promise<void> {
  await recoveryWriter?.discard();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function updateEditor(
  model: AppModel,
  editor: EnhancementFlowState['editor'],
  message: string,
): AppModel {
  return {
    ...model,
    flow: {...model.flow, editor},
    message,
  };
}

function enhance(
  model: AppModel,
  random: RandomSource,
  clock: Clock,
): AppModel {
  try {
    const attempt = runEnhancement(model.flow, random, clock);

    if (!attempt.attempted) {
      return {
        ...model,
        message:
          attempt.reason === 'no-tickets'
            ? '강화권이 없습니다. 직접 입력 10타마다 1장을 얻습니다.'
            : '25성은 최대 단계입니다. 더 이상 강화할 수 없습니다.',
      };
    }

    const recent = attempt.state.recentEnhancement;
    const removed = attempt.state.destructionTraces.at(-1)?.removed.length ?? 0;
    const message =
      attempt.result.type === 'success'
        ? `강화 성공: ${recent?.starsBefore}성 → ${recent?.starsAfter}성`
        : attempt.result.type === 'failure'
          ? `강화 실패: 최근 직접 입력 ${removed}자 소실`
          : `파괴: 코드 ${removed}자 소실, 0성으로 초기화`;

    return {...model, flow: attempt.state, message};
  } catch (error) {
    return {
      ...model,
      message: `강화 오류: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function getLockedShortcutMessage(
  input: string,
  unlocks: UnlockState,
): string | null {
  switch (input.toLowerCase()) {
    case 'r':
      return unlocks.pythonRun ? null : 'Python 실행은 12성에서 해금됩니다.';
    case 's':
      return unlocks.fileSave ? null : '파일 저장은 15성에서 해금됩니다.';
    default:
      return null;
  }
}
