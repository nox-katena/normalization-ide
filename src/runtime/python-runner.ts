import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import process from 'node:process';

const TEMP_DIRECTORY_PREFIX = 'starforce-tui-editor-';
const TEMP_FILE_NAME = 'buffer.py';

export interface PythonRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export type ProcessExecutor = (
  command: string,
  arguments_: readonly string[],
) => Promise<PythonRunResult>;

export type PythonRunner = (source: string) => Promise<PythonRunResult>;

interface PythonCommandAttempt {
  readonly command: string;
  readonly argumentsPrefix: readonly string[];
}

export async function runPython(
  source: string,
  execute: ProcessExecutor = executeProcess,
): Promise<PythonRunResult> {
  const directory = await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX));
  const filename = join(directory, TEMP_FILE_NAME);

  try {
    await writeFile(filename, source, 'utf8');
    return await executePython('python3', [filename], execute);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

export async function executePython(
  primaryCommand: string,
  arguments_: readonly string[],
  execute: ProcessExecutor = executeProcess,
): Promise<PythonRunResult> {
  const attempts = getPythonCommandAttempts(primaryCommand);
  let missingCommandError: unknown = null;

  for (const attempt of attempts) {
    try {
      return await execute(attempt.command, [
        ...attempt.argumentsPrefix,
        ...arguments_,
      ]);
    } catch (error) {
      if (!isMissingCommandError(error)) {
        throw error;
      }

      missingCommandError = error;
    }
  }

  throw missingCommandError ?? new Error(`${primaryCommand} not found`);
}

export function executeProcess(
  command: string,
  arguments_: readonly string[],
): Promise<PythonRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...arguments_], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      settled = true;
      reject(error);
    });
    child.once('close', (exitCode) => {
      if (!settled) {
        resolve({stdout, stderr, exitCode});
      }
    });
  });
}

function getPythonCommandAttempts(primaryCommand: string): readonly PythonCommandAttempt[] {
  const configured = process.env.STARFORCE_PYTHON;
  if (configured !== undefined && configured.trim().length > 0) {
    return [{command: configured, argumentsPrefix: []}];
  }

  if (process.platform !== 'win32') {
    return [{command: primaryCommand, argumentsPrefix: []}];
  }

  return [
    {command: primaryCommand, argumentsPrefix: []},
    {command: 'py', argumentsPrefix: ['-3']},
    {command: 'python', argumentsPrefix: []},
  ];
}

function isMissingCommandError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
