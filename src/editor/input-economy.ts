import type {BufferGrapheme} from './buffer.js';

export const INPUTS_PER_TICKET = 10;

export interface InputEconomy {
  readonly totalDirectInputs: number;
  readonly bufferGraphemes: number;
  readonly survivingDirectInputs: number;
  readonly productivityPercent: number;
}

export function countEarnedTickets(
  previousDirectInputs: number,
  addedDirectInputs: number,
): number {
  const previousTickets = Math.floor(previousDirectInputs / INPUTS_PER_TICKET);
  const currentTickets = Math.floor(
    (previousDirectInputs + addedDirectInputs) / INPUTS_PER_TICKET,
  );

  return currentTickets - previousTickets;
}

export function calculateInputEconomy(
  buffer: readonly BufferGrapheme[],
  totalDirectInputs: number,
): InputEconomy {
  const survivingDirectInputs = buffer.filter(
    (grapheme) => grapheme.source === 'direct',
  ).length;

  return {
    totalDirectInputs,
    bufferGraphemes: buffer.length,
    survivingDirectInputs,
    productivityPercent:
      totalDirectInputs === 0
        ? 100
        : (survivingDirectInputs / totalDirectInputs) * 100,
  };
}
