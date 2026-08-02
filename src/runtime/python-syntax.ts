import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  executeProcess,
  type ProcessExecutor,
} from './python-runner.js';

const TEMP_DIRECTORY_PREFIX = 'starforce-tui-editor-syntax-';
const TEMP_FILE_NAME = 'buffer.py';
const SYNTAX_CHECK_SCRIPT = [
  'import ast, json, pathlib, sys',
  'source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")',
  'try:',
  '    ast.parse(source, filename=sys.argv[1])',
  'except SyntaxError as error:',
  '    print(json.dumps({"line": error.lineno or 1, "column": error.offset or 1, "message": error.msg}, ensure_ascii=False))',
].join('\n');

export interface PythonSyntaxDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export type PythonSyntaxChecker = (
  source: string,
) => Promise<PythonSyntaxDiagnostic | null>;

export async function checkPythonSyntax(
  source: string,
  execute: ProcessExecutor = executeProcess,
): Promise<PythonSyntaxDiagnostic | null> {
  const directory = await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX));
  const filename = join(directory, TEMP_FILE_NAME);

  try {
    await writeFile(filename, source, 'utf8');
    const result = await execute('python3', ['-c', SYNTAX_CHECK_SCRIPT, filename]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'Python 구문 검사를 실행하지 못했습니다.');
    }

    const output = result.stdout.trim();
    return output.length === 0 ? null : parseDiagnostic(output);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

function parseDiagnostic(output: string): PythonSyntaxDiagnostic {
  const value: unknown = JSON.parse(output);

  if (
    typeof value !== 'object' ||
    value === null ||
    !('line' in value) ||
    !('column' in value) ||
    !('message' in value) ||
    typeof value.line !== 'number' ||
    typeof value.column !== 'number' ||
    !Number.isInteger(value.line) ||
    !Number.isInteger(value.column) ||
    value.line < 1 ||
    value.column < 1 ||
    typeof value.message !== 'string'
  ) {
    throw new Error('Python 구문 검사 결과 형식이 올바르지 않습니다.');
  }

  return {
    line: value.line,
    column: value.column,
    message: value.message,
  };
}
