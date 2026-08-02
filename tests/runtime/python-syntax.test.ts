import {access, readFile} from 'node:fs/promises';
import {describe, expect, it, vi} from 'vitest';
import {
  checkPythonSyntax,
  type PythonSyntaxDiagnostic,
} from '../../src/runtime/python-syntax.js';
import type {ProcessExecutor} from '../../src/runtime/python-runner.js';

describe('Python syntax checker', () => {
  it('checks an isolated temporary file without placing source in process arguments', async () => {
    const source = 'print("safe; $(touch should-not-run)")\n';
    const diagnostic: PythonSyntaxDiagnostic = {
      line: 1,
      column: 7,
      message: 'invalid syntax',
    };
    let temporaryFile = '';
    const execute = vi.fn<ProcessExecutor>(async (command, arguments_) => {
      expect(command).toBe('python3');
      expect(arguments_[0]).toBe('-c');
      expect(arguments_).toHaveLength(3);
      expect(arguments_).not.toContain(source);

      temporaryFile = arguments_[2] ?? '';
      expect(temporaryFile).toMatch(
        /starforce-tui-editor-syntax-.+\/buffer\.py$/,
      );
      await expect(readFile(temporaryFile, 'utf8')).resolves.toBe(source);
      return {
        stdout: `${JSON.stringify(diagnostic)}\n`,
        stderr: '',
        exitCode: 0,
      };
    });

    await expect(checkPythonSyntax(source, execute)).resolves.toEqual(diagnostic);
    expect(execute).toHaveBeenCalledOnce();
    await expect(access(temporaryFile)).rejects.toThrow();
  });

  it('cleans the temporary file when inspection fails', async () => {
    let temporaryFile = '';
    const execute: ProcessExecutor = async (command, arguments_) => {
      expect(command).toBe('python3');
      temporaryFile = arguments_[2] ?? '';
      throw new Error('python3 not found');
    };

    await expect(checkPythonSyntax('x =', execute)).rejects.toThrow(
      'python3 not found',
    );
    await expect(access(temporaryFile)).rejects.toThrow();
  });

  it.each([
    {scenario: 'empty file', source: ''},
    {scenario: 'valid code', source: 'def greet(name):\n    return f"안녕 {name} 🙂"\n'},
  ])('returns no diagnostic for $scenario', async ({source}) => {
    await expect(checkPythonSyntax(source)).resolves.toBeNull();
  });

  it('reports a Unicode source location using Python columns', async () => {
    await expect(checkPythonSyntax('이름 =\n')).resolves.toEqual({
      line: 1,
      column: 5,
      message: 'invalid syntax',
    });
  });

  it('reports the first parser diagnostic when several error candidates exist', async () => {
    await expect(
      checkPythonSyntax('def broken(:\n    pass\nnext_value =\n'),
    ).resolves.toEqual({
      line: 1,
      column: 12,
      message: 'invalid syntax',
    });
  });
});
