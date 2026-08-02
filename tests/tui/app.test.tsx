import {describe, expect, it} from 'vitest';
import {APP_TITLE} from '../../src/app.js';

describe('seed TUI', () => {
  it('keeps the application title stable', () => {
    expect(APP_TITLE).toBe('Starforce TUI Editor');
  });
});
