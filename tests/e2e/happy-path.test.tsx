import {access, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable, Writable} from 'node:stream';
import {render} from 'ink';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createEnhancementFlowState} from '../../src/domain/enhancement-flow.js';
import {createEditorState} from '../../src/editor/buffer.js';
import {writeTargetFile} from '../../src/persistence/file-store.js';
import {
  createRecoveryStore,
  RecoveryWriter,
  type RecoveryStore,
} from '../../src/persistence/recovery-store.js';
import {App, type FileSaver} from '../../src/ui/App.js';

const ANSI_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'g',
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true}),
    ),
  );
});

class TestInput extends Readable {
  readonly isTTY = true;
  isRaw = false;

  setEncoding(): this {
    return this;
  }

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }

  resume(): this {
    return this;
  }

  pause(): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  write(data: string): void {
    this.push(data);
  }

  override _read(): void {
    // Test input is driven explicitly through write().
  }
}

class TestOutput extends Writable {
  readonly isTTY = true;
  readonly columns = 160;
  readonly rows = 50;
  readonly chunks: string[] = [];

  text(): string {
    return this.chunks.join('').replace(ANSI_SEQUENCE, '').replaceAll('\r', '');
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(String(chunk));
    callback();
  }
}

interface MountedApp {
  readonly stdin: TestInput;
  readonly stdout: TestOutput;
  readonly instance: ReturnType<typeof render>;
}

function mountApp(options: {
  readonly targetPath: string;
  readonly stars: number;
  readonly source: string;
  readonly recovery?: ReturnType<typeof createEnhancementFlowState> | null;
  readonly writer: RecoveryWriter;
  readonly fileSaver?: FileSaver;
}): MountedApp {
  const stdin = new TestInput();
  const stdout = new TestOutput();
  const instance = render(
    <App
      initialState={createEnhancementFlowState(
        createEditorState(options.source),
        options.stars,
      )}
      initialRecovery={options.recovery ?? null}
      targetPath={options.targetPath}
      recoveryWriter={options.writer}
      fileSaver={options.fileSaver ?? writeTargetFile}
    />,
    {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: new TestOutput() as unknown as NodeJS.WriteStream,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );

  return {stdin, stdout, instance};
}

async function makeSession(): Promise<{
  directory: string;
  targetPath: string;
  store: RecoveryStore;
  writer: RecoveryWriter;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'starforce-e2e-test-'));
  temporaryDirectories.push(directory);
  const targetPath = join(directory, 'demo.py');
  const store = createRecoveryStore(join(directory, 'recoveries'));
  return {
    directory,
    targetPath,
    store,
    writer: new RecoveryWriter(store, targetPath),
  };
}

async function flushRender(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushRender();
    }
  }

  throw lastError;
}

describe('single-file happy path', () => {
  it('keeps Ctrl+S locked before 15 stars while updating recovery', async () => {
    const session = await makeSession();
    const original = 'print("original")\n';
    await writeFile(session.targetPath, original);
    const mounted = mountApp({...session, stars: 14, source: original});

    try {
      mounted.stdin.write('x');
      await flushRender();
      await session.writer.flush();
      mounted.stdin.write('\u0013');
      await flushRender();

      expect(mounted.stdout.text()).toContain('파일 저장은 15성에서 해금됩니다.');
      await expect(readFile(session.targetPath, 'utf8')).resolves.toBe(original);
      await expect(session.store.read(session.targetPath)).resolves.toMatchObject({
        stars: 14,
        editor: {totalDirectInputs: 1},
      });
    } finally {
      mounted.instance.unmount();
    }
  });

  it('saves explicitly from 15 stars, reports success, and removes recovery', async () => {
    const session = await makeSession();
    const original = 'print("original")\n';
    await writeFile(session.targetPath, original);
    const mounted = mountApp({...session, stars: 15, source: original});

    try {
      mounted.stdin.write('x');
      await flushRender();
      await session.writer.flush();
      mounted.stdin.write('\u0013');

      await waitFor(() => {
        expect(mounted.stdout.text()).toContain('HUD: 파일 저장 완료:');
      });
      await session.writer.flush();
      await expect(readFile(session.targetPath, 'utf8')).resolves.toBe(`x${original}`);
      await expect(access(session.store.getPath(session.targetPath))).rejects.toThrow();
    } finally {
      mounted.instance.unmount();
    }
  });

  it('reports save failure and leaves the target and recovery intact', async () => {
    const session = await makeSession();
    const original = 'print("original")\n';
    await writeFile(session.targetPath, original);
    const fileSaver = vi.fn<FileSaver>().mockRejectedValue(new Error('read only'));
    const mounted = mountApp({...session, stars: 15, source: original, fileSaver});

    try {
      mounted.stdin.write('x');
      await flushRender();
      await session.writer.flush();
      mounted.stdin.write('\u0013');

      await waitFor(() => {
        expect(mounted.stdout.text()).toContain('HUD: 파일 저장 실패: read only');
      });
      expect(fileSaver).toHaveBeenCalledWith(session.targetPath, `x${original}`);
      await expect(readFile(session.targetPath, 'utf8')).resolves.toBe(original);
      await expect(session.store.read(session.targetPath)).resolves.not.toBeNull();
    } finally {
      mounted.instance.unmount();
    }
  });

  it('restores recovery and distinguishes cancelled exit from explicit discard', async () => {
    const session = await makeSession();
    const original = 'print("original")\n';
    const recovered = createEnhancementFlowState(
      createEditorState('print("recovered")\n'),
      13,
    );
    await writeFile(session.targetPath, original);
    await session.store.write(session.targetPath, recovered);
    const mounted = mountApp({
      ...session,
      stars: 0,
      source: original,
      recovery: recovered,
    });

    try {
      expect(mounted.stdout.text()).toContain('복구본 발견 · R: 복구 · D: 폐기');
      mounted.stdin.write('r');
      await flushRender();
      expect(mounted.stdout.text()).toContain('print("recovered")');

      mounted.stdin.write('\u0011');
      await flushRender();
      expect(mounted.stdout.text()).toContain('저장하지 않은 변경을 폐기하고 종료할까요?');

      mounted.stdin.write('n');
      await flushRender();
      expect(mounted.stdout.text()).toContain('HUD: 종료를 취소했습니다.');
      await expect(session.store.read(session.targetPath)).resolves.not.toBeNull();

      mounted.stdin.write('\u0011');
      await flushRender();
      mounted.stdin.write('y');
      await mounted.instance.waitUntilExit();
      await session.writer.flush();
      await expect(session.store.read(session.targetPath)).resolves.toBeNull();
      await expect(readFile(session.targetPath, 'utf8')).resolves.toBe(original);
    } finally {
      mounted.instance.unmount();
    }
  });

  it('can explicitly discard recovery and start from the target file', async () => {
    const session = await makeSession();
    const original = 'print("original")\n';
    const recovered = createEnhancementFlowState(
      createEditorState('print("recovered")\n'),
      13,
    );
    await writeFile(session.targetPath, original);
    await session.store.write(session.targetPath, recovered);
    const mounted = mountApp({
      ...session,
      stars: 0,
      source: original,
      recovery: recovered,
    });

    try {
      mounted.stdin.write('d');
      await waitFor(() => {
        expect(mounted.stdout.text()).toContain('복구본을 폐기하고 대상 파일 내용으로 시작합니다.');
      });
      await session.writer.flush();
      expect(mounted.stdout.text()).toContain('print("original")');
      expect(mounted.stdout.text()).not.toContain('print("recovered")');
      await expect(session.store.read(session.targetPath)).resolves.toBeNull();
    } finally {
      mounted.instance.unmount();
    }
  });
});
