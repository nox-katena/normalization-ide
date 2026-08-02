import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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

export async function runPython(
  source: string,
  execute: ProcessExecutor = executeProcess,
): Promise<PythonRunResult> {
  const directory = await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX));
  const filename = join(directory, TEMP_FILE_NAME);

  try {
    await writeFile(filename, source, 'utf8');
    return await execute('python3', [filename]);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
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
