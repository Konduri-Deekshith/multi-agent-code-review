import * as dotenv from 'dotenv';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator, formatError, logger } from './utils/index.js';

// Load environment variables
dotenv.config();

const USAGE = 'Usage: npm run dev <owner> <repo> <pr-number>\nExample: npm run dev udacity cd14715-simple-todo-app 1';

/** Print a friendly error message and exit */
function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev <owner> <repo> <pr-number>
 */
async function main(): Promise<void> {
  const [owner, repo, prStr] = process.argv.slice(2);

  // 1. Validate command line arguments
  if (!owner || !repo || !prStr) {
    fail(`Missing arguments.\n${USAGE}`);
  }
  if (!/^\d+$/.test(prStr)) {
    fail(`PR number must be a positive integer, got "${prStr}".\n${USAGE}`);
  }
  const prNumber = parseInt(prStr, 10);
  if (prNumber <= 0) {
    fail(`PR number must be greater than 0, got "${prStr}".\n${USAGE}`);
  }

  // 2. Validate authentication (Anthropic API OR AWS Bedrock)
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasAwsKeys = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  if (hasAnthropicKey) {
    console.log('🔐 Using Anthropic API authentication');
  } else if (hasAwsKeys) {
    if (!process.env.AWS_REGION) {
      fail('AWS credentials found but AWS_REGION is not set.\nAdd AWS_REGION=us-east-1 (or your region) to your .env file.');
    }
    console.log('🔐 Using AWS Bedrock authentication');
  } else {
    fail(
      'No authentication configured. Use ONE of these options:\n' +
        '  Option 1 (Anthropic API): set ANTHROPIC_API_KEY\n' +
        '  Option 2 (AWS Bedrock):   set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION'
    );
  }

  // 3. Validate model
  if (!process.env.ANTHROPIC_MODEL) {
    fail(
      'ANTHROPIC_MODEL is not set. Add it to your .env file:\n' +
        '  Anthropic API: ANTHROPIC_MODEL=claude-sonnet-4-5-20250929\n' +
        '  AWS Bedrock:   ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0'
    );
  }

  console.log(`🔍 Reviewing ${owner}/${repo} PR #${prNumber} (this can take several minutes)...`);

  try {
    // 4. Run the review
    const orchestrator = new CodeReviewOrchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    // 5. Generate and save reports in all three formats
    const generator = new ReportGenerator();
    const reportsDir = path.resolve(process.env.PROJECT_ROOT || process.cwd(), 'reports');
    await mkdir(reportsDir, { recursive: true });

    const baseName = `${owner}_${repo}_${prNumber}`;
    const outputs: Array<[string, string]> = [
      [`${baseName}.json`, generator.generateJSONReport(report)],
      [`${baseName}.md`, generator.generateMarkdownReport(report)],
      [`${baseName}.html`, generator.generateHTMLReport(report)]
    ];

    for (const [fileName, content] of outputs) {
      const filePath = path.join(reportsDir, fileName);
      await writeFile(filePath, content, 'utf8');
      console.log(`✅ Saved ${filePath}`);
    }

    console.log(
      `\n🎉 Done. Overall score: ${report.summary.overallScore}/100, ` +
        `files: ${report.summary.totalFiles}, critical/high issues: ${report.summary.criticalIssues}`
    );
  } catch (error) {
    logger.error('Review failed', { error: formatError(error) });
    fail(`Review failed: ${formatError(error)}\nCheck your credentials, network access and that the PR exists.`);
  }
}

main();
