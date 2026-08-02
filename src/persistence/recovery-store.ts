import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import type {EnhancementFlowState} from '../domain/enhancement-flow.js';

const RECOVERY_VERSION = 1;
const RECOVERY_DIRECTORY = join(tmpdir(), 'starforce-tui-editor', 'recovery');

interface RecoveryDocument {
  readonly version: typeof RECOVERY_VERSION;
  readonly targetPath: string;
  readonly flow: EnhancementFlowState;
}

export interface RecoveryStore {
  readonly read: (targetPath: string) => Promise<EnhancementFlowState | null>;
  readonly write: (
    targetPath: string,
    flow: EnhancementFlowState,
  ) => Promise<void>;
  readonly discard: (targetPath: string) => Promise<void>;
  readonly getPath: (targetPath: string) => string;
}

export function createRecoveryStore(
  recoveryDirectory = RECOVERY_DIRECTORY,
): RecoveryStore {
  const getPath = (targetPath: string): string =>
    join(recoveryDirectory, `${hashTargetPath(targetPath)}.json`);

  return {
    getPath,
    async read(targetPath) {
      const absolutePath = resolve(targetPath);

      try {
        const value: unknown = JSON.parse(await readFile(getPath(absolutePath), 'utf8'));
        if (!isRecoveryDocument(value, absolutePath)) {
          throw new Error('복구본 형식이 올바르지 않습니다.');
        }

        return value.flow;
      } catch (error) {
        if (isMissingFileError(error)) {
          return null;
        }

        throw error;
      }
    },
    async write(targetPath, flow) {
      const absolutePath = resolve(targetPath);
      const recoveryPath = getPath(absolutePath);
      const temporaryPath = `${recoveryPath}.${process.pid}.${randomUUID()}.tmp`;
      const document: RecoveryDocument = {
        version: RECOVERY_VERSION,
        targetPath: absolutePath,
        flow,
      };

      await mkdir(dirname(recoveryPath), {recursive: true, mode: 0o700});
      try {
        await writeFile(temporaryPath, JSON.stringify(document), {
          encoding: 'utf8',
          mode: 0o600,
        });
        await rename(temporaryPath, recoveryPath);
      } finally {
        await rm(temporaryPath, {force: true});
      }
    },
    async discard(targetPath) {
      await rm(getPath(resolve(targetPath)), {force: true});
    },
  };
}

export const recoveryStore = createRecoveryStore();

export class RecoveryWriter {
  private pending: Promise<void> = Promise.resolve();
  private readonly store: Pick<RecoveryStore, 'write' | 'discard'>;
  private readonly targetPath: string;

  constructor(
    store: Pick<RecoveryStore, 'write' | 'discard'>,
    targetPath: string,
  ) {
    this.store = store;
    this.targetPath = targetPath;
  }

  write(flow: EnhancementFlowState): Promise<void> {
    return this.enqueue(() => this.store.write(this.targetPath, flow));
  }

  discard(): Promise<void> {
    return this.enqueue(() => this.store.discard(this.targetPath));
  }

  flush(): Promise<void> {
    return this.pending;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.pending.catch(() => undefined).then(operation);
    this.pending = next;
    return next;
  }
}

function hashTargetPath(targetPath: string): string {
  return createHash('sha256').update(resolve(targetPath)).digest('hex');
}

function isRecoveryDocument(
  value: unknown,
  targetPath: string,
): value is RecoveryDocument {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === RECOVERY_VERSION &&
    value.targetPath === targetPath &&
    isEnhancementFlowState(value.flow)
  );
}

function isEnhancementFlowState(value: unknown): value is EnhancementFlowState {
  if (!isRecord(value) || !isRecord(value.editor)) {
    return false;
  }

  const editor = value.editor;
  return (
    Array.isArray(editor.buffer) &&
    typeof editor.cursor === 'number' &&
    typeof editor.totalDirectInputs === 'number' &&
    typeof editor.enhancementTickets === 'number' &&
    typeof editor.nextDirectInputId === 'number' &&
    Array.isArray(editor.undoStack) &&
    typeof value.stars === 'number' &&
    typeof value.failureLostGraphemes === 'number' &&
    typeof value.destructionLostGraphemes === 'number' &&
    Array.isArray(value.destructionTraces) &&
    (value.recentEnhancement === null || isRecord(value.recentEnhancement))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
