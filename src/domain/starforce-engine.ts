import type {GameState} from './game-state.js';
import {getStarforceRate} from './starforce-rates.js';

export type RandomSource = () => number;

const BASIS_POINTS_PER_PERCENT = 100;
const BASIS_POINTS_PER_ROLL = 10_000;

export type EnhancementResult =
  | {readonly type: 'success'}
  | {readonly type: 'failure'}
  | {readonly type: 'destroyed'};

export type EnhancementAttempt =
  | {
      readonly attempted: false;
      readonly reason: 'no-tickets' | 'max-stars';
      readonly state: GameState;
    }
  | {
      readonly attempted: true;
      readonly result: EnhancementResult;
      readonly state: GameState;
    };

export function attemptEnhancement(
  state: GameState,
  random: RandomSource = Math.random,
): EnhancementAttempt {
  if (state.enhancementTickets <= 0) {
    return {attempted: false, reason: 'no-tickets', state};
  }

  const rate = getStarforceRate(state.stars);

  if (rate === null) {
    return {attempted: false, reason: 'max-stars', state};
  }

  const roll = random();

  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('random source must return a number from 0 inclusive to 1 exclusive');
  }

  const rollBasisPoints = roll * BASIS_POINTS_PER_ROLL;
  const successBoundary = Math.round(rate.success * BASIS_POINTS_PER_PERCENT);
  const failureBoundary =
    successBoundary + Math.round(rate.failure * BASIS_POINTS_PER_PERCENT);
  const result: EnhancementResult =
    rollBasisPoints < successBoundary
      ? {type: 'success'}
      : rollBasisPoints < failureBoundary
        ? {type: 'failure'}
        : {type: 'destroyed'};

  return {
    attempted: true,
    result,
    state: {
      ...state,
      stars: result.type === 'success' ? state.stars + 1 : state.stars,
      enhancementTickets: state.enhancementTickets - 1,
    },
  };
}
