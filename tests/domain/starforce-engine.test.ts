import {describe, expect, it, vi} from 'vitest';
import {MAX_STARS, type GameState} from '../../src/domain/game-state.js';
import {attemptEnhancement} from '../../src/domain/starforce-engine.js';
import {
  STARFORCE_RATES,
  STARFORCE_RATE_SOURCE_URL,
  STARFORCE_RATE_VERSION,
  getStarforceRate,
} from '../../src/domain/starforce-rates.js';

const EXPECTED_RATES = [
  [95, 5, 0],
  [90, 10, 0],
  [85, 15, 0],
  [85, 15, 0],
  [80, 20, 0],
  [75, 25, 0],
  [70, 30, 0],
  [65, 35, 0],
  [60, 40, 0],
  [55, 45, 0],
  [50, 50, 0],
  [45, 55, 0],
  [40, 60, 0],
  [35, 65, 0],
  [30, 70, 0],
  [30, 67.9, 2.1],
  [30, 67.9, 2.1],
  [30, 67.9, 2.1],
  [30, 67.2, 2.8],
  [30, 67.2, 2.8],
  [30, 63, 7],
  [30, 63, 7],
  [3, 77.6, 19.4],
  [2, 68.6, 29.4],
  [1, 59.4, 39.6],
] as const;

function state(stars: number, enhancementTickets = 1): GameState {
  return {stars, enhancementTickets};
}

describe('static Starforce rates', () => {
  it('records the fixed version, source, and every 0-to-24-star rate', () => {
    expect(STARFORCE_RATE_VERSION).toBe('kms-starforce-pre-2025-03-rework');
    expect(STARFORCE_RATE_SOURCE_URL).toBe(
      'https://www.inven.co.kr/webzine/news/?news=303950&site=maple',
    );
    expect(
      STARFORCE_RATES.map(({success, failure, destruction}) => [
        success,
        failure,
        destruction,
      ]),
    ).toEqual(EXPECTED_RATES);
  });

  it('makes every row total 100 percent', () => {
    for (const rate of STARFORCE_RATES) {
      expect(rate.success + rate.failure + rate.destruction).toBeCloseTo(100, 10);
    }
  });

  it('has no enhancement rate beyond the 25-star cap', () => {
    expect(getStarforceRate(MAX_STARS)).toBeNull();
    expect(() => getStarforceRate(26)).toThrow(RangeError);
    expect(() => getStarforceRate(1.5)).toThrow(RangeError);
  });
});

describe('attemptEnhancement', () => {
  it('does not attempt, change state, or call RNG without a ticket', () => {
    const original = state(10, 0);
    const random = vi.fn(() => 0);
    const attempt = attemptEnhancement(original, random);

    expect(attempt).toEqual({
      attempted: false,
      reason: 'no-tickets',
      state: original,
    });
    expect(attempt.state).toBe(original);
    expect(random).not.toHaveBeenCalled();
  });

  it('does not consume a ticket or call RNG at 25 stars', () => {
    const original = state(25, 2);
    const random = vi.fn(() => 0);
    const attempt = attemptEnhancement(original, random);

    expect(attempt).toEqual({
      attempted: false,
      reason: 'max-stars',
      state: original,
    });
    expect(attempt.state).toBe(original);
    expect(random).not.toHaveBeenCalled();
  });

  it('reaches 25 stars on success without allowing another attempt', () => {
    const success = attemptEnhancement(state(24, 2), () => 0);

    expect(success).toEqual({
      attempted: true,
      result: {type: 'success'},
      state: {stars: 25, enhancementTickets: 1},
    });
    expect(attemptEnhancement(success.state, () => 0)).toEqual({
      attempted: false,
      reason: 'max-stars',
      state: success.state,
    });
  });

  it.each([
    {name: 'success', roll: 0, result: 'success', stars: 16},
    {name: 'normal failure', roll: 0.3, result: 'failure', stars: 15},
    {name: 'destruction', roll: 0.979, result: 'destroyed', stars: 15},
  ])('consumes exactly one ticket on $name', ({roll, result, stars}) => {
    const attempt = attemptEnhancement(state(15, 3), () => roll);

    expect(attempt).toEqual({
      attempted: true,
      result: {type: result},
      state: {stars, enhancementTickets: 2},
    });
  });

  it.each([
    {stars: 0, roll: 0.949_999, result: 'success'},
    {stars: 0, roll: 0.95, result: 'failure'},
    {stars: 15, roll: 0.299_999, result: 'success'},
    {stars: 15, roll: 0.3, result: 'failure'},
    {stars: 15, roll: 0.978_999, result: 'failure'},
    {stars: 15, roll: 0.979, result: 'destroyed'},
    {stars: 22, roll: 0.029_999, result: 'success'},
    {stars: 22, roll: 0.03, result: 'failure'},
    {stars: 22, roll: 0.805_999, result: 'failure'},
    {stars: 22, roll: 0.806, result: 'destroyed'},
    {stars: 24, roll: 0.009_999, result: 'success'},
    {stars: 24, roll: 0.01, result: 'failure'},
    {stars: 24, roll: 0.603_999, result: 'failure'},
    {stars: 24, roll: 0.604, result: 'destroyed'},
  ])(
    'maps the $stars-star roll $roll to $result at exact probability boundaries',
    ({stars, roll, result}) => {
      const attempt = attemptEnhancement(state(stars), () => roll);

      expect(attempt.attempted).toBe(true);
      if (attempt.attempted) {
        expect(attempt.result.type).toBe(result);
      }
    },
  );

  it('rejects values outside the injected RNG contract', () => {
    expect(() => attemptEnhancement(state(0), () => -0.01)).toThrow(RangeError);
    expect(() => attemptEnhancement(state(0), () => 1)).toThrow(RangeError);
    expect(() => attemptEnhancement(state(0), () => Number.NaN)).toThrow(RangeError);
  });
});
