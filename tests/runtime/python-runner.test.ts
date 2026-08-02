import {access, readFile} from 'node:fs/promises';
import {describe, expect, it, vi} from 'vitest';
import {
  runPython,
  type ProcessExecutor,
  type PythonRunResult,
} from '../../src/runtime/python-runner.js';

const SOURCE = 'print("safe; $(touch should-not-run)")\n';

describe('Python runner', () => {
  it.each([
    {
      scenario: 'success',
      result: {stdout: 'hello\n', stderr: '', exitCode: 0},
    },
    {
      scenario: 'syntax error',
      result: {
        stdout: '',
        stderr: 'SyntaxError: invalid syntax\n',
        exitCode: 1,
      },
    },
    {
      scenario: 'runtime error',
      result: {stdout: '', stderr: 'RuntimeError: boom\n', exitCode: 1},
    },
    {
      scenario: 'abnormal termination',
      result: {stdout: '', stderr: '', exitCode: null},
    },
  ] satisfies ReadonlyArray<{
    readonly scenario: string;
    readonly result: PythonRunResult;
  }>)(
    'uses an isolated file and preserves $scenario process results',
    async ({result}) => {
      let temporaryFile = '';
      const execute = vi.fn<ProcessExecutor>(async (command, arguments_) => {
        expect(command).toBe('python3');
        expect(arguments_).toHaveLength(1);
        expect(arguments_).not.toContain(SOURCE);

        temporaryFile = arguments_[0] ?? '';
        expect(temporaryFile).toMatch(/starforce-tui-editor-.+\/buffer\.py$/);
        await expect(readFile(temporaryFile, 'utf8')).resolves.toBe(SOURCE);
        return result;
      });

      await expect(runPython(SOURCE, execute)).resolves.toEqual(result);
      expect(execute).toHaveBeenCalledOnce();
      await expect(access(temporaryFile)).rejects.toThrow();
    },
  );

  it('cleans the temporary file when process execution fails', async () => {
    let temporaryFile = '';
    const execute: ProcessExecutor = async (command, arguments_) => {
      expect(command).toBe('python3');
      temporaryFile = arguments_[0] ?? '';
      throw new Error('spawn failed');
    };

    await expect(runPython(SOURCE, execute)).rejects.toThrow('spawn failed');
    await expect(access(temporaryFile)).rejects.toThrow();
  });
});
