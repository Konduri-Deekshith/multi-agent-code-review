import { describe, it, expect } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator';
import { ReviewReportSchema } from '../src/types/index';

/**
 * Integration test: reviews a real public PR (octocat/Hello-World #1).
 * Needs real API credentials and takes minutes, so it only runs when
 * RUN_INTEGRATION=1 is set:  RUN_INTEGRATION=1 npm test
 */
describe('Integration: real PR analysis', () => {
  it.skipIf(!process.env.RUN_INTEGRATION)(
    'reviews octocat/Hello-World PR #1 and returns a valid ReviewReport',
    async () => {
      const orchestrator = new CodeReviewOrchestrator();
      const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);
      expect(ReviewReportSchema.safeParse(report).success).toBe(true);
      expect(report.pullRequest.repo).toBe('Hello-World');
    },
    20 * 60 * 1000
  );
});
