import { query } from '@anthropic-ai/claude-agent-sdk';
import { ReviewReport, ReviewReportSchema, ReviewReportJSONSchema } from './types/index.js';
import { mcpServersConfig } from './config/mcp.config.js';
import { codeQualityAnalyzer, testCoverageAnalyzer, refactoringSuggester } from './agents/index.js';
import { buildOrchestratorPrompt } from './prompts/index.js';
import {
  RateLimiter,
  withRetry,
  withTimeout,
  ReviewError,
  ErrorCodes,
  formatError,
  logger
} from './utils/index.js';
import type { RateLimiterConfig } from './utils/rate-limiter.js';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  /** Model name. Defaults to process.env.ANTHROPIC_MODEL */
  model?: string;
  /** Max agent turns for multi-agent coordination */
  maxTurns?: number;
  /** Timeout for one review attempt in milliseconds */
  timeoutMs?: number;
  /** Number of attempts before giving up */
  retries?: number;
  /** Custom rate limit configuration */
  rateLimit?: Partial<RateLimiterConfig>;
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 */
export class CodeReviewOrchestrator {
  private readonly model: string;
  private readonly maxTurns: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly rateLimiter: RateLimiter;

  constructor(options: OrchestratorOptions = {}) {
    const model = options.model ?? process.env.ANTHROPIC_MODEL;
    if (!model) {
      throw new ReviewError(
        'ANTHROPIC_MODEL environment variable is required',
        ErrorCodes.INVALID_CONFIG
      );
    }
    this.model = model;
    this.maxTurns = options.maxTurns ?? 60;
    this.timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
    this.retries = options.retries ?? 2;
    this.rateLimiter = new RateLimiter(options.rateLimit);
  }

  /**
   * Review a pull request using parallel subagent analysis
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startedAt = Date.now();
    const prompt = buildOrchestratorPrompt(owner, repo, prNumber);

    await this.rateLimiter.acquire(20000);
    try {
      const report = await withRetry(
        () =>
          withTimeout(
            () => this.runQuery(prompt),
            this.timeoutMs,
            `Review of ${owner}/${repo}#${prNumber} timed out`
          ),
        this.retries,
        2000
      );
      report.metadata.duration = Date.now() - startedAt;
      return report;
    } finally {
      this.rateLimiter.release();
    }
  }

  /**
   * Run the orchestrator agent once and return the validated report
   */
  private async runQuery(prompt: string): Promise<ReviewReport> {
    const stream = query({
      prompt,
      options: {
        model: this.model,
        maxTurns: this.maxTurns,
        permissionMode: 'acceptEdits',
        settingSources: ['project'],
        cwd: process.env.PROJECT_ROOT || process.cwd(),
        mcpServers: mcpServersConfig,
        allowedTools: [
          'Task',
          'Read',
          'Grep',
          'Glob',
          'Skill',
          'mcp__github__*',
          'mcp__eslint__*'
        ],
        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester
        },
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema
        }
      }
    });

    for await (const message of stream) {
      const msg = message as Record<string, unknown>;
      if (msg.type === 'assistant') {
        logger.debug('Orchestrator step received');
      }
      if (msg.type !== 'result') continue;

      if (msg.subtype !== 'success') {
        throw new ReviewError(
          `Agent run ended with: ${String(msg.subtype)}`,
          ErrorCodes.AGENT_FAILED,
          { subtype: msg.subtype }
        );
      }

      const parsed = ReviewReportSchema.safeParse(msg.structured_output);
      if (!parsed.success) {
        throw new ReviewError(
          `Structured output failed validation: ${formatError(parsed.error)}`,
          ErrorCodes.STRUCTURED_OUTPUT_FAILED,
          { issues: parsed.error.issues }
        );
      }
      return parsed.data;
    }

    throw new ReviewError('Agent finished without a result', ErrorCodes.AGENT_FAILED);
  }
}
