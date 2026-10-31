import { describe, expect, it, vi } from 'vitest';
import {
  convergePagination,
  PaginationConvergenceError,
} from './pagination-convergence.js';

describe('page-reference convergence', () => {
  it('returns a stable result after contents references stop changing', async () => {
    const render = vi
      .fn()
      .mockResolvedValueOnce({ signature: 'pages:10;chapter:8', result: 8 })
      .mockResolvedValueOnce({ signature: 'pages:11;chapter:9', result: 9 })
      .mockResolvedValueOnce({ signature: 'pages:11;chapter:9', result: 9 });
    await expect(convergePagination(render, { maxPasses: 5 })).resolves.toEqual(
      {
        result: 9,
        passes: 3,
      },
    );
    expect(render.mock.calls).toEqual([
      [undefined, 1],
      [8, 2],
      [9, 3],
    ]);
  });

  it('detects cycles instead of emitting unstable references', async () => {
    const values = ['A', 'B', 'A'];
    const render = async (_previous: string | undefined, pass: number) => ({
      signature: values[pass - 1] ?? '',
      result: values[pass - 1] ?? '',
    });
    await expect(
      convergePagination(render, { maxPasses: 10 }),
    ).rejects.toMatchObject({
      code: 'layout-cycle',
    });
  });

  it('reports the pass limit for a continuously changing layout', async () => {
    const render = async (_previous: number | undefined, pass: number) => ({
      signature: `page-${pass}`,
      result: pass,
    });
    await expect(
      convergePagination(render, { maxPasses: 3 }),
    ).rejects.toMatchObject({
      code: 'layout-pass-limit',
    });
  });

  it('checks cancellation before and after a layout pass', async () => {
    const controller = new AbortController();
    const render = vi.fn(async () => {
      controller.abort();
      return { signature: 'A', result: 1 };
    });
    await expect(
      convergePagination(render, { maxPasses: 3, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'layout-cancelled' });
    await expect(
      convergePagination(render, { maxPasses: 3, signal: controller.signal }),
    ).rejects.toBeInstanceOf(PaginationConvergenceError);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid pass limits and empty signatures', async () => {
    const render = async () => ({ signature: '', result: null });
    await expect(convergePagination(render, { maxPasses: 1 })).rejects.toThrow(
      RangeError,
    );
    await expect(convergePagination(render, { maxPasses: 2 })).rejects.toThrow(
      TypeError,
    );
  });
});
