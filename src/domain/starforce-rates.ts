import {MAX_STARS} from './game-state.js';

export const STARFORCE_RATE_VERSION = 'kms-starforce-pre-2025-03-rework';
export const STARFORCE_RATE_SOURCE_URL =
  'https://www.inven.co.kr/webzine/news/?news=303950&site=maple';

export interface StarforceRate {
  readonly success: number;
  readonly failure: number;
  readonly destruction: number;
}

export const STARFORCE_RATES: readonly StarforceRate[] = [
  {success: 95, failure: 5, destruction: 0},
  {success: 90, failure: 10, destruction: 0},
  {success: 85, failure: 15, destruction: 0},
  {success: 85, failure: 15, destruction: 0},
  {success: 80, failure: 20, destruction: 0},
  {success: 75, failure: 25, destruction: 0},
  {success: 70, failure: 30, destruction: 0},
  {success: 65, failure: 35, destruction: 0},
  {success: 60, failure: 40, destruction: 0},
  {success: 55, failure: 45, destruction: 0},
  {success: 50, failure: 50, destruction: 0},
  {success: 45, failure: 55, destruction: 0},
  {success: 40, failure: 60, destruction: 0},
  {success: 35, failure: 65, destruction: 0},
  {success: 30, failure: 70, destruction: 0},
  {success: 30, failure: 67.9, destruction: 2.1},
  {success: 30, failure: 67.9, destruction: 2.1},
  {success: 30, failure: 67.9, destruction: 2.1},
  {success: 30, failure: 67.2, destruction: 2.8},
  {success: 30, failure: 67.2, destruction: 2.8},
  {success: 30, failure: 63, destruction: 7},
  {success: 30, failure: 63, destruction: 7},
  {success: 3, failure: 77.6, destruction: 19.4},
  {success: 2, failure: 68.6, destruction: 29.4},
  {success: 1, failure: 59.4, destruction: 39.6},
];

export function getStarforceRate(stars: number): StarforceRate | null {
  if (!Number.isInteger(stars) || stars < 0 || stars > MAX_STARS) {
    throw new RangeError(`stars must be an integer from 0 to ${MAX_STARS}`);
  }

  return stars === MAX_STARS ? null : STARFORCE_RATES[stars] ?? null;
}
