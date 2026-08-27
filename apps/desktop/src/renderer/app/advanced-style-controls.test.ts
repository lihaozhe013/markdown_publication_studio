import { describe, expect, it } from 'vitest';
import { parseNumberFieldValue } from './advanced-style-controls.js';

describe('advanced style numeric input parsing', () => {
  it('keeps incomplete values local until they become valid', () => {
    expect(parseNumberFieldValue('1', 6, 72)).toBeUndefined();
    expect(parseNumberFieldValue('12.', 6, 72)).toBeUndefined();
    expect(parseNumberFieldValue('12', 6, 72)).toBe(12);
    expect(parseNumberFieldValue('12.5', 6, 72)).toBe(12.5);
    expect(parseNumberFieldValue('-', -4, 12)).toBeUndefined();
    expect(parseNumberFieldValue('-1', -4, 12)).toBe(-1);
  });

  it('normalizes a valid trailing decimal when editing ends', () => {
    expect(parseNumberFieldValue('12.', 6, 72, true)).toBe(12);
  });
});
