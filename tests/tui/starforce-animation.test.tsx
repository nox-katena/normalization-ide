import {Readable, Writable} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {render} from 'ink';
import {describe, expect, it, vi} from 'vitest';
import {
  createEnhancementFlowState,
  getEnhancementStatus,
  runEnhancement,
} from '../../src/domain/enhancement-flow.js';
import {createEditorState, insertDirectInput} from '../../src/editor/buffer.js';
import {App} from '../../src/ui/App.js';
import {StarforceModal} from '../../src/ui/StarforceModal.js';
import {
  ENHANCEMENT_ANIMATION_DELAYS,
  playEnhancementAnimation,
  type AnimationWait,
} from '../../src/ui/enhancement-animation.js';

const NOW = new Date('2026-08-03T03:00:00.000Z');

class TestInput extends Readable {
  readonly isTTY = true;

  setEncoding(): this { return this; }
  setRawMode(): this { return this; }
  resume(): this { return this; }
  pause(): this { return this; }
  ref(): this { return this; }
  unref(): this { return this; }
  write(data: string): void { this.push(data); }
  override _read(): void {}
}

class TestOutput extends Writable {
  readonly isTTY = true;
  chunks: string[] = [];

  constructor(
    public columns = 140,
    public rows = 40,
    private readonly colors = true,
  ) {
    super();
  }

  hasColors(): boolean { return this.colors; }
  reset(): void { this.chunks = []; }
  text(): string {
    return stripVTControlCharacters(this.chunks.join('')).replaceAll('\r', '');
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

class ControlledWait {
  readonly calls: number[] = [];
  private readonly resolvers: Array<() => void> = [];

  readonly wait: AnimationWait = (milliseconds) => {
    this.calls.push(milliseconds);
    return new Promise<void>((resolve) => {
      this.resolvers.push(resolve);
    });
  };

  resolveNext(): void {
    const resolve = this.resolvers.shift();
    if (resolve === undefined) {
      throw new Error('대기 중인 강화 프레임이 없습니다.');
    }
    resolve();
  }
}

async function flushRender(turns = 3): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function mountApp(
  source: string,
  stars: number,
  random: () => number,
  animationWait: AnimationWait,
) {
  const stdin = new TestInput();
  const stdout = new TestOutput();
  const editor = insertDirectInput(createEditorState(), source);
  const instance = render(
    <App
      initialState={createEnhancementFlowState(editor, stars)}
      random={random}
      clock={() => NOW}
      animationWait={animationWait}
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

describe('단계형 강화 연출', () => {
  it('uses deterministic 250/300/450ms beats totaling about one second', async () => {
    const waits: number[] = [];
    const phases: string[] = [];

    await playEnhancementAnimation(
      async (milliseconds) => { waits.push(milliseconds); },
      (phase) => { phases.push(phase); },
    );

    expect(waits).toEqual([...ENHANCEMENT_ANIMATION_DELAYS]);
    expect(waits.reduce((total, wait) => total + wait, 0)).toBe(1000);
    expect(phases).toEqual(['pulse-one', 'pulse-two', 'sparkle']);
  });

  it('keeps the pending result hidden, advances every beat, and blocks extra input', async () => {
    const scheduler = new ControlledWait();
    const random = vi.fn(() => 0);
    const mounted = mountApp('abcdefghij', 0, random, scheduler.wait);

    try {
      mounted.stdin.write('\t');
      await flushRender();
      mounted.stdin.write(' ');
      await flushRender();
      expect(mounted.stdout.text()).toContain('✦  강화 중 .');
      expect(mounted.stdout.text()).toContain('강화권 1장');
      expect(mounted.stdout.text()).not.toContain('SUCCESS');

      mounted.stdin.write(' ');
      mounted.stdin.write('\t');
      mounted.stdin.write('x');
      await flushRender();
      expect(random).toHaveBeenCalledOnce();
      expect(scheduler.calls).toEqual([250]);

      scheduler.resolveNext();
      await flushRender();
      expect(mounted.stdout.text()).toContain('✦  강화 중 ..');
      expect(scheduler.calls).toEqual([250, 300]);

      scheduler.resolveNext();
      await flushRender();
      expect(mounted.stdout.text()).toContain('강화 중 ...');
      expect(scheduler.calls).toEqual([250, 300, 450]);

      scheduler.resolveNext();
      await flushRender();
      const result = mounted.stdout.text();
      expect(result).toContain('✦ SUCCESS ✦');
      expect(result).toContain('0성  ➜  1성');
      expect(result).toContain('보유 강화권 0장');
      expect(result).toContain('abcdefghij');
    } finally {
      mounted.instance.unmount();
    }
  });

  it('confirms the result before returning to probabilities and permits another enhancement', async () => {
    const random = vi.fn(() => 0);
    const mounted = mountApp('abcdefghijklmnopqrst', 0, random, async () => undefined);

    try {
      mounted.stdin.write('\t');
      await flushRender();
      mounted.stdin.write(' ');
      await flushRender(5);
      expect(mounted.stdout.text()).toContain('0성  ➜  1성');
      expect(mounted.stdout.text()).toContain('보유 강화권 1장');

      mounted.stdout.reset();
      mounted.stdin.write(' ');
      await flushRender();
      expect(mounted.stdout.text()).toContain('성공 90.0%');
      expect(mounted.stdout.text()).toContain('[ SPACE ] 강화하기');
      expect(mounted.stdout.text()).not.toContain('✦ SUCCESS ✦');
      expect(random).toHaveBeenCalledOnce();

      mounted.stdin.write(' ');
      await flushRender(5);
      expect(mounted.stdout.text()).toContain('1성  ➜  2성');
      expect(random).toHaveBeenCalledTimes(2);

      mounted.stdout.reset();
      mounted.stdin.write('\t');
      await flushRender();
      expect(mounted.stdout.text()).toContain('★ 2성 → 3성');
      expect(mounted.stdout.text()).toContain('최근 결과: 성공 (1성 → 2성)');
      expect(mounted.stdout.text()).not.toContain('✦ SUCCESS ✦');
    } finally {
      mounted.instance.unmount();
    }
  });

  it('confirms without a ticket, then denies a new attempt, and closes with Escape', async () => {
    const random = vi.fn(() => 0);
    const mounted = mountApp('abcdefghij', 0, random, async () => undefined);

    try {
      mounted.stdin.write('\t');
      await flushRender();
      mounted.stdin.write(' ');
      await flushRender(5);
      expect(mounted.stdout.text()).toContain('✦ SUCCESS ✦');

      mounted.stdout.reset();
      mounted.stdin.write(' ');
      await flushRender();
      expect(mounted.stdout.text()).toContain('[ SPACE ] 강화하기');
      expect(mounted.stdout.text()).not.toContain('✦ SUCCESS ✦');
      expect(random).toHaveBeenCalledOnce();

      mounted.stdout.reset();
      mounted.stdin.write(' ');
      await flushRender();
      expect(mounted.stdout.text()).toContain(
        '강화권이 없습니다. 직접 입력 10타마다 1장을 얻습니다.',
      );
      expect(mounted.stdout.text()).toContain('[ SPACE ] 강화하기');
      expect(random).toHaveBeenCalledOnce();

      mounted.stdout.reset();
      mounted.stdin.write('\u001B');
      await flushRender();
      expect(mounted.stdout.text()).toContain('★ 1성 → 2성');
      expect(mounted.stdout.text()).not.toContain('✦ SUCCESS ✦');
    } finally {
      mounted.instance.unmount();
    }
  });
});

describe('결과별 강화 피드백', () => {
  it.each([
    {name: 'success', roll: 0, title: '✦ SUCCESS ✦', detail: '15성  ➜  16성'},
    {name: 'failure', roll: 0.5, title: '× FAILED ×', detail: '최근 입력 10자 소실'},
    {name: 'destroyed', roll: 0.99, title: '☠ DESTROYED ☠', detail: '전체 12자 소실 · 0성 초기화'},
  ])('renders $name with distinct symbols and exact loss in no-color mode', ({roll, title, detail}) => {
    const editor = insertDirectInput(createEditorState(), 'abcdefghijkl');
    const attempt = runEnhancement(
      createEnhancementFlowState(editor, 15),
      () => roll,
      () => NOW,
    );
    expect(attempt.attempted).toBe(true);
    const status = getEnhancementStatus(attempt.state);
    const removed = attempt.state.destructionTraces.at(-1)?.removed.length ?? 0;
    const stdout = new TestOutput(120, 36, false);
    const instance = render(
      <StarforceModal
        status={status}
        message="결과"
        terminalColumns={120}
        terminalRows={36}
        colorEnabled={false}
        phase="result"
        recentRemovedGraphemes={removed}
      />,
      {stdout: stdout as unknown as NodeJS.WriteStream, debug: true, patchConsole: false},
    );

    instance.unmount();
    expect(stdout.text()).toContain(title);
    expect(stdout.text()).toContain(detail);
    expect(stdout.text()).toContain('[ SPACE ] 확인');
  });
});
