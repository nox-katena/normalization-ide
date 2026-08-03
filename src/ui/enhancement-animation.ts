export type EnhancementAnimationPhase =
  | 'ready'
  | 'pulse-one'
  | 'pulse-two'
  | 'sparkle'
  | 'result';

export type AnimationWait = (milliseconds: number) => Promise<void>;

export const ENHANCEMENT_ANIMATION_DELAYS = [250, 300, 450] as const;

export const waitForAnimation: AnimationWait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export async function playEnhancementAnimation(
  wait: AnimationWait,
  onPhase: (phase: EnhancementAnimationPhase) => void,
): Promise<void> {
  const phases = ['pulse-one', 'pulse-two', 'sparkle'] as const;

  for (const [index, phase] of phases.entries()) {
    onPhase(phase);
    await wait(ENHANCEMENT_ANIMATION_DELAYS[index] ?? 0);
  }
}

export function isEnhancementAnimating(
  phase: EnhancementAnimationPhase,
): boolean {
  return phase === 'pulse-one' || phase === 'pulse-two' || phase === 'sparkle';
}
