import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {render} from 'ink';
import {createEnhancementFlowState} from './domain/enhancement-flow.js';
import {createEditorState} from './editor/buffer.js';
import {
  resolveTargetPath,
  targetFileStore,
  type TargetFileStore,
} from './persistence/file-store.js';
import {
  RecoveryWriter,
  recoveryStore,
  type RecoveryStore,
} from './persistence/recovery-store.js';
import {App, APP_TITLE} from './ui/App.js';

export {App, APP_TITLE};

const ENTER_APPLICATION_SCREEN = '\u001B[?1049h\u001B[?25l';
const RESTORE_TERMINAL = '\u001B[?25h\u001B[?1049l';

export interface RunOptions {
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly stderr?: NodeJS.WriteStream;
  readonly renderer?: typeof render;
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly targetFiles?: TargetFileStore;
  readonly recoveries?: RecoveryStore;
}

export async function run(options: RunOptions = {}): Promise<void> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const renderApplication = options.renderer ?? render;
  const targetFiles = options.targetFiles ?? targetFileStore;
  const recoveries = options.recoveries ?? recoveryStore;
  const session =
    options.targetPath === undefined
      ? null
      : await loadFileSession(options.targetPath, targetFiles, recoveries);
  const lifecycle =
    session === null
      ? null
      : {
          session,
          recoveryWriter: new RecoveryWriter(recoveries, session.targetPath),
        };
  let instance: ReturnType<typeof render> | undefined;
  let interrupted = false;
  const handleSigint = (): void => {
    interrupted = true;
    instance?.unmount();
  };

  stdout.write(ENTER_APPLICATION_SCREEN);
  process.once('SIGINT', handleSigint);

  try {
    const application =
      lifecycle === null ? (
        <App />
      ) : (
        <App
          initialState={lifecycle.session.initialState}
          initialRecovery={lifecycle.session.recovery}
          targetPath={lifecycle.session.targetPath}
          fileSaver={targetFiles.write}
          recoveryWriter={lifecycle.recoveryWriter}
        />
      );
    instance = renderApplication(application, {
      stdin,
      stdout,
      stderr,
      exitOnCtrlC: true,
      patchConsole: true,
    });
    if (interrupted) {
      instance.unmount();
    }
    await instance.waitUntilExit();
  } finally {
    process.off('SIGINT', handleSigint);
    try {
      try {
        instance?.unmount();
      } finally {
        await lifecycle?.recoveryWriter.flush();
      }
    } finally {
      stdout.write(RESTORE_TERMINAL);
    }
  }
}

export async function runCli(
  arguments_: readonly string[],
  options: Omit<RunOptions, 'targetPath'> = {},
): Promise<void> {
  const targetPath = resolveTargetPath(arguments_, options.cwd);
  await run({...options, targetPath});
}

async function loadFileSession(
  targetPath: string,
  targetFiles: TargetFileStore,
  recoveries: RecoveryStore,
) {
  const loaded = await targetFiles.read(targetPath);
  const recovery = await recoveries.read(loaded.targetPath);

  return {
    targetPath: loaded.targetPath,
    initialState: createEnhancementFlowState(createEditorState(loaded.source)),
    recovery,
  };
}

const entrypoint = process.argv[1];

if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${APP_TITLE} error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
