export function buildOrchestratorPrompt(owner: string, repo: string, prNumber: number): string {
  return `You are the orchestrator of a multi-agent code review system. Review pull request #${prNumber} in ${owner}/${repo}.

STEP 1 - FETCH PR DATA
Use the GitHub MCP tool mcp__github__get_pull_request to get the PR details, and mcp__github__get_pull_request_files to list the changed files. For each changed source file, use mcp__github__get_file_contents to read the file content.
Skip non-code files (images, lockfiles).

STEP 2 - ANALYSE EVERY CHANGED FILE
For each changed file, invoke ALL THREE subagents with the Task tool. Paste the file path and file content into each Task prompt so the subagent has the code:
- Use the code-quality-analyzer agent to analyze <file>.
- Use the test-coverage-analyzer agent to analyze <file>.
- Use the refactoring-suggester agent to analyze <file>.
Launch the three agents for a file in parallel, since they are independent.
If a subagent fails or returns invalid output, retry once. If it still fails, fill in that part with an empty result (empty arrays, score 0, summary "Analysis failed") so the report is still produced.

STEP 3 - AGGREGATE INTO THE REVIEW REPORT
Return ONLY the final structured JSON matching ReviewReportSchema:
- pullRequest: { owner: "${owner}", repo: "${repo}", number: ${prNumber} }
- fileReviews: one entry per file with codeQuality, testCoverage and refactorings exactly as the subagents returned them.
- summary: totalFiles; overallScore = average of the files' codeQuality.overallScore; criticalIssues = number of issues with severity "critical" or "high"; highPriorityTests = number of untestedPaths with priority "critical" or "high"; refactoringOpportunities = total number of refactoring suggestions.
- recommendations: prioritised actions (priority critical|high|medium|low, category, description, files).
- metadata: analyzedAt (ISO timestamp), duration (0 is fine, the system overwrites it), agentVersions mapping each agent name to "1.0.0".`;
}
