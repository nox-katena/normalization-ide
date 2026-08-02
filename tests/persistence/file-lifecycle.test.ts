import {access, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  createEnhancementFlowState,
  runEnhancement,
} from '../../src/domain/enhancement-flow.js';
import {
  createEditorState,
  getText,
  insertDirectInput,
} from '../../src/editor/buffer.js';
import {
  readTargetFile,
  resolveTargetPath,
  writeTargetFile,
} from '../../src/persistence/file-store.js';
import {createRecoveryStore} from '../../src/persistence/recovery-store.js';
import {runPython} from '../../src/runtime/python-runner.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'starforce-lifecycle-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('target file lifecycle', () => {
  it('accepts exactly one Python path and resolves it absolutely', async () => {
    const directory = await makeTemporaryDirectory();

    expect(resolveTargetPath(['demo.py'], directory)).toBe(join(directory, 'demo.py'));
    expect(() => resolveTargetPath([], directory)).toThrow('경로 하나');
    expect(() => resolveTargetPath(['one.py', 'two.py'], directory)).toThrow(
      '경로 하나',
    );
    expect(() => resolveTargetPath(['notes.txt'], directory)).toThrow('.py');
  });

  it('reads an existing file without changing bytes and starts missing files empty', async () => {
    const directory = await makeTemporaryDirectory();
    const existingPath = join(directory, 'existing.py');
    const missingPath = join(directory, 'missing.py');
    const original = Buffer.from('print("기존")\r\n', 'utf8');
    await writeFile(existingPath, original);

    await expect(readTargetFile(existingPath)).resolves.toEqual({
      targetPath: existingPath,
      source: original.toString('utf8'),
      exists: true,
    });
    await expect(readFile(existingPath)).resolves.toEqual(original);
    await expect(readTargetFile(missingPath)).resolves.toEqual({
      targetPath: missingPath,
      source: '',
      exists: false,
    });
    await expect(access(missingPath)).rejects.toThrow();
  });

  it('writes the target only through the explicit file-save operation', async () => {
    const directory = await makeTemporaryDirectory();
    const targetPath = join(directory, 'created.py');

    await expect(access(targetPath)).rejects.toThrow();
    await writeTargetFile(targetPath, 'print("saved")\n');
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('print("saved")\n');
  });
});

describe('recovery persistence', () => {
  it('atomically round-trips the full destruction state under a target-path key', async () => {
    const directory = await makeTemporaryDirectory();
    const targetPath = join(directory, 'target.py');
    const store = createRecoveryStore(join(directory, 'recoveries'));
    const editor = insertDirectInput(createEditorState('loaded\n'), '1234567890');
    const destroyed = runEnhancement(
      createEnhancementFlowState(editor, 15),
      () => 0.999,
      () => new Date('2026-08-02T00:00:00.000Z'),
    );

    expect(destroyed.attempted).toBe(true);
    await store.write(targetPath, destroyed.state);

    await expect(store.read(targetPath)).resolves.toEqual(destroyed.state);
    expect((await readdir(join(directory, 'recoveries'))).filter((name) =>
      name.endsWith('.tmp'),
    )).toEqual([]);
    expect(destroyed.state.destructionTraces).toHaveLength(1);
    expect(destroyed.state.destructionLostGraphemes).toBe(17);

    await store.discard(targetPath);
    await expect(store.read(targetPath)).resolves.toBeNull();
  });

  it('never changes target bytes during execution, enhancement, destruction, or recovery writes', async () => {
    const directory = await makeTemporaryDirectory();
    const targetPath = join(directory, 'protected.py');
    const original = Buffer.from('print("protected")\n', 'utf8');
    const store = createRecoveryStore(join(directory, 'recoveries'));
    await writeFile(targetPath, original);

    const loaded = await readTargetFile(targetPath);
    await runPython(loaded.source, async () => ({stdout: 'protected\n', stderr: '', exitCode: 0}));

    const editor = insertDirectInput(createEditorState(loaded.source), '1234567890');
    const failed = runEnhancement(
      createEnhancementFlowState(editor, 14),
      () => 0.9,
      () => new Date('2026-08-02T00:00:00.000Z'),
    );
    await store.write(targetPath, failed.state);

    const destroyed = runEnhancement(
      createEnhancementFlowState(editor, 15),
      () => 0.999,
      () => new Date('2026-08-02T00:00:01.000Z'),
    );
    await store.write(targetPath, destroyed.state);

    await expect(readFile(targetPath)).resolves.toEqual(original);
    expect(getText(destroyed.state.editor)).toBe('');
  });
});
