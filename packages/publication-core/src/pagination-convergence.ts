export interface PaginationPass<T> {
  /** Identifies all page assignments and resolved references for this pass. */
  signature: string;
  result: T;
}

export interface PaginationConvergenceOptions {
  maxPasses: number;
  signal?: AbortSignal;
}

export class PaginationConvergenceError extends Error {
  constructor(
    readonly code: 'layout-cycle' | 'layout-pass-limit' | 'layout-cancelled',
    message: string,
  ) {
    super(message);
    this.name = 'PaginationConvergenceError';
  }
}

/** Repeat pagination until two consecutive resolved page plans are identical. */
export async function convergePagination<T>(
  render: (previous: T | undefined, pass: number) => Promise<PaginationPass<T>>,
  options: PaginationConvergenceOptions,
): Promise<{ result: T; passes: number }> {
  if (!Number.isSafeInteger(options.maxPasses) || options.maxPasses < 2) {
    throw new RangeError('Pagination requires at least two bounded passes.');
  }
  const seen = new Set<string>();
  let previous: PaginationPass<T> | undefined;
  for (let pass = 1; pass <= options.maxPasses; pass += 1) {
    if (options.signal?.aborted) {
      throw new PaginationConvergenceError(
        'layout-cancelled',
        'Pagination was cancelled.',
      );
    }
    const current = await render(previous?.result, pass);
    if (options.signal?.aborted) {
      throw new PaginationConvergenceError(
        'layout-cancelled',
        'Pagination was cancelled.',
      );
    }
    if (current.signature.length === 0) {
      throw new TypeError(
        'Pagination produced an empty convergence signature.',
      );
    }
    if (current.signature === previous?.signature) {
      return { result: current.result, passes: pass };
    }
    if (seen.has(current.signature)) {
      throw new PaginationConvergenceError(
        'layout-cycle',
        `Pagination entered a cycle after ${pass} passes.`,
      );
    }
    seen.add(current.signature);
    previous = current;
  }
  throw new PaginationConvergenceError(
    'layout-pass-limit',
    `Pagination did not converge after ${options.maxPasses} passes.`,
  );
}
