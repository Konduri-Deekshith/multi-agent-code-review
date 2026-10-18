import { describe, it, expect } from 'vitest';
import { withRetry, withTimeout, ReviewError, ErrorCodes, formatError, isReviewError } from '../src/utils/error-handler';
import { RateLimiter } from '../src/utils/rate-limiter';

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const result = await withRetry(async () => 'ok', 3, 1);
    expect(result).toBe('ok');
  });

  it('retries after failures and then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'done';
    }, 3, 1);
    expect(result).toBe('done');
    expect(calls).toBe(3);
  });

  it('throws RETRY_EXHAUSTED when all attempts fail', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error('always fails');
      }, 3, 1)
    ).rejects.toMatchObject({ code: ErrorCodes.RETRY_EXHAUSTED });
    expect(calls).toBe(3);
  });

  it('uses exponential backoff (later waits are longer)', async () => {
    const start = Date.now();
    await expect(withRetry(async () => { throw new Error('x'); }, 3, 50)).rejects.toBeInstanceOf(ReviewError);
    // waits of ~50ms then ~100ms between the 3 attempts
    expect(Date.now() - start).toBeGreaterThanOrEqual(140);
  });
});

describe('withTimeout', () => {
  it('returns the result when the function finishes in time', async () => {
    const result = await withTimeout(async () => 42, 500);
    expect(result).toBe(42);
  });

  it('throws AGENT_TIMEOUT when the function is too slow', async () => {
    const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 300));
    await expect(withTimeout(slow, 30, 'too slow')).rejects.toMatchObject({
      code: ErrorCodes.AGENT_TIMEOUT,
      message: 'too slow'
    });
  });
});

describe('error helpers', () => {
  it('formats ReviewError with its code', () => {
    const err = new ReviewError('boom', ErrorCodes.UNKNOWN_ERROR);
    expect(isReviewError(err)).toBe(true);
    expect(formatError(err)).toBe('[UNKNOWN_ERROR] boom');
  });
  it('formats plain errors and strings', () => {
    expect(formatError(new Error('plain'))).toBe('plain');
    expect(formatError('text')).toBe('text');
  });
});

describe('RateLimiter', () => {
  it('allows requests under the limits', () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 5, maxTokensPerMinute: 10000, maxConcurrent: 2 });
    expect(limiter.canProceed(100)).toBe(true);
  });

  it('tracks requests in the sliding window', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 5, maxTokensPerMinute: 10000, maxConcurrent: 5 });
    await limiter.acquire(100);
    await limiter.acquire(200);
    const status = limiter.getStatus();
    expect(status.requestsInWindow).toBe(2);
    expect(status.tokensInWindow).toBe(300);
    expect(status.activeRequests).toBe(2);
  });

  it('blocks when the concurrent limit is reached and frees on release', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 10, maxTokensPerMinute: 10000, maxConcurrent: 1 });
    await limiter.acquire(100);
    expect(limiter.canProceed(100)).toBe(false);
    limiter.release();
    expect(limiter.canProceed(100)).toBe(true);
  });

  it('blocks when the requests-per-minute limit is reached', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 2, maxTokensPerMinute: 10000, maxConcurrent: 5 });
    await limiter.acquire(10);
    await limiter.acquire(10);
    limiter.release();
    limiter.release();
    expect(limiter.canProceed(10)).toBe(false);
  });

  it('blocks when the token limit would be exceeded', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 10, maxTokensPerMinute: 1000, maxConcurrent: 5 });
    await limiter.acquire(900);
    limiter.release();
    expect(limiter.canProceed(200)).toBe(false);
    expect(limiter.canProceed(100)).toBe(true);
  });

  it('queues a second acquire until the first is released', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 10, maxTokensPerMinute: 10000, maxConcurrent: 1 });
    await limiter.acquire(10);
    let secondDone = false;
    const second = limiter.acquire(10).then(() => { secondDone = true; });
    await new Promise((r) => setTimeout(r, 20));
    expect(secondDone).toBe(false);
    limiter.release();
    await second;
    expect(secondDone).toBe(true);
  });
});
