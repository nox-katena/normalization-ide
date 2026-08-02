import {readFile, writeFile} from 'node:fs/promises';
import {extname, resolve} from 'node:path';
import process from 'node:process';

export interface LoadedTargetFile {
  readonly targetPath: string;
  readonly source: string;
  readonly exists: boolean;
}

export interface TargetFileStore {
  readonly read: (targetPath: string) => Promise<LoadedTargetFile>;
  readonly write: (targetPath: string, source: string) => Promise<void>;
}

export function resolveTargetPath(
  arguments_: readonly string[],
  cwd = process.cwd(),
): string {
  if (arguments_.length !== 1) {
    throw new Error('실행할 Python 파일 경로 하나를 지정하세요.');
  }

  const argument = arguments_[0];
  if (argument === undefined || extname(argument).toLowerCase() !== '.py') {
    throw new Error('대상 파일은 .py 확장자여야 합니다.');
  }

  return resolve(cwd, argument);
}

export async function readTargetFile(targetPath: string): Promise<LoadedTargetFile> {
  const absolutePath = resolve(targetPath);

  try {
    return {
      targetPath: absolutePath,
      source: await readFile(absolutePath, 'utf8'),
      exists: true,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {targetPath: absolutePath, source: '', exists: false};
    }

    throw error;
  }
}

export async function writeTargetFile(
  targetPath: string,
  source: string,
): Promise<void> {
  await writeFile(resolve(targetPath), source, 'utf8');
}

export const targetFileStore: TargetFileStore = {
  read: readTargetFile,
  write: writeTargetFile,
};

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
