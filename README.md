# Multi-Agent Code Review Orchestrator

A multi-agent pull request reviewer built with the Claude Agent SDK, MCP (GitHub + ESLint), Zod and TypeScript.

## How it works
- src/orchestrator.ts runs the main agent with query(). It fetches PR data through the GitHub MCP server and spawns three subagents with the Task tool.
- Subagents (src/agents/): code-quality-analyzer (uses the javascript-best-practices Claude Skill), test-coverage-analyzer, refactoring-suggester. Each uses model 'inherit' and only the tools it needs.
- Output is forced into the ReviewReport JSON schema (zod-to-json-schema) and validated with Zod safeParse.
- src/utils/error-handler.ts provides withRetry (exponential backoff + jitter) and withTimeout (Promise.race).
- src/utils/rate-limiter.ts provides a sliding-window rate limiter.

## Setup
1. Run npm install from the repository root.
2. Copy .env.example to .env and set:
   - ANTHROPIC_MODEL (e.g. claude-sonnet-4-5-20250929)
   - PROJECT_ROOT (absolute path to this folder)
   - ANTHROPIC_API_KEY (or AWS credentials + AWS_REGION for Bedrock)
   - GITHUB_TOKEN (optional, avoids GitHub rate limits)
   Never commit .env or put secrets in source code.

## Usage
    npm run dev <owner> <repo> <pr-number>
    npm run dev udacity cd14715-simple-todo-app 1

Reports are written to reports/ as <owner>_<repo>_<pr>.json, .md and .html.

## Scripts
- npm run build: compile TypeScript
- npm test: run unit tests
- RUN_INTEGRATION=1 npm test: also run the real-PR integration test

## Project layout
- src/agents/, src/prompts/, src/config/mcp.config.ts, src/orchestrator.ts, src/main.ts, src/utils/, tests/
