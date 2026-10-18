import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
  ReviewReportSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionJSONSchema,
  ReviewReportJSONSchema
} from '../src/types/index';

const validQuality = {
  file: 'src/app.js',
  issues: [
    {
      line: 10,
      severity: 'high',
      category: 'security',
      description: 'Unsanitised input',
      suggestion: 'Sanitise it'
    }
  ],
  overallScore: 72,
  summary: 'Some issues'
};

const validCoverage = {
  file: 'src/app.js',
  hasTests: false,
  testFiles: [],
  untestedPaths: [
    {
      type: 'function',
      location: 'addTodo',
      priority: 'high',
      reasoning: 'Core logic',
      suggestedTest: "addTodo('') should throw"
    }
  ],
  coverageEstimate: 0,
  summary: 'No tests'
};

const validRefactor = {
  file: 'src/app.js',
  suggestions: [
    {
      type: 'modernize',
      location: 'line 5',
      impact: 'low',
      description: 'Use const',
      before: 'var a = 1;',
      after: 'const a = 1;',
      benefits: 'Block scoping'
    }
  ],
  summary: 'Minor'
};

const validReport = {
  pullRequest: { owner: 'udacity', repo: 'cd14715-simple-todo-app', number: 1 },
  fileReviews: [
    { file: 'src/app.js', codeQuality: validQuality, testCoverage: validCoverage, refactorings: validRefactor }
  ],
  summary: { totalFiles: 1, overallScore: 72, criticalIssues: 1, highPriorityTests: 1, refactoringOpportunities: 1 },
  recommendations: [{ priority: 'high', category: 'security', description: 'Fix input', files: ['src/app.js'] }],
  metadata: { analyzedAt: '2026-01-01T00:00:00.000Z', duration: 1000, agentVersions: { 'code-quality-analyzer': '1.0.0' } }
};

describe('CodeQualityResultSchema', () => {
  it('accepts valid data', () => {
    expect(() => CodeQualityResultSchema.parse(validQuality)).not.toThrow();
  });
  it('rejects a missing field', () => {
    const { summary, ...bad } = validQuality;
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects an invalid severity enum value', () => {
    const bad = { ...validQuality, issues: [{ ...validQuality.issues[0], severity: 'urgent' }] };
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects a wrong type for line', () => {
    const bad = { ...validQuality, issues: [{ ...validQuality.issues[0], line: 'ten' }] };
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow(ZodError);
  });
  it('accepts an empty issues array', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, issues: [] })).not.toThrow();
  });
  it('accepts boundary scores 0 and 100', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 0 })).not.toThrow();
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 100 })).not.toThrow();
  });
  it('rejects scores outside 0-100', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: -1 })).toThrow(ZodError);
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 101 })).toThrow(ZodError);
  });
});

describe('TestCoverageResultSchema', () => {
  it('accepts valid data', () => {
    expect(() => TestCoverageResultSchema.parse(validCoverage)).not.toThrow();
  });
  it('rejects an invalid priority', () => {
    const bad = { ...validCoverage, untestedPaths: [{ ...validCoverage.untestedPaths[0], priority: 'urgent' }] };
    expect(() => TestCoverageResultSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects hasTests that is not a boolean', () => {
    expect(() => TestCoverageResultSchema.parse({ ...validCoverage, hasTests: 'no' })).toThrow(ZodError);
  });
  it('accepts empty arrays and boundary coverage values', () => {
    const edge = { ...validCoverage, untestedPaths: [], testFiles: [], coverageEstimate: 100 };
    expect(() => TestCoverageResultSchema.parse(edge)).not.toThrow();
  });
  it('rejects coverage above 100', () => {
    expect(() => TestCoverageResultSchema.parse({ ...validCoverage, coverageEstimate: 150 })).toThrow(ZodError);
  });
});

describe('RefactoringSuggestionSchema', () => {
  it('accepts valid data', () => {
    expect(() => RefactoringSuggestionSchema.parse(validRefactor)).not.toThrow();
  });
  it('rejects an invalid refactoring type', () => {
    const bad = { ...validRefactor, suggestions: [{ ...validRefactor.suggestions[0], type: 'delete-everything' }] };
    expect(() => RefactoringSuggestionSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects missing before/after', () => {
    const { before, ...rest } = validRefactor.suggestions[0]!;
    expect(() => RefactoringSuggestionSchema.parse({ ...validRefactor, suggestions: [rest] })).toThrow(ZodError);
  });
  it('accepts an empty suggestions array', () => {
    expect(() => RefactoringSuggestionSchema.parse({ ...validRefactor, suggestions: [] })).not.toThrow();
  });
});

describe('ReviewReportSchema', () => {
  it('accepts a valid full report', () => {
    expect(() => ReviewReportSchema.parse(validReport)).not.toThrow();
  });
  it('accepts a report with no files and no recommendations', () => {
    const empty = { ...validReport, fileReviews: [], recommendations: [] };
    expect(() => ReviewReportSchema.parse(empty)).not.toThrow();
  });
  it('rejects a report with a missing pullRequest', () => {
    const { pullRequest, ...bad } = validReport;
    expect(() => ReviewReportSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects a non-numeric PR number', () => {
    const bad = { ...validReport, pullRequest: { ...validReport.pullRequest, number: '1' } };
    expect(() => ReviewReportSchema.parse(bad)).toThrow(ZodError);
  });
  it('rejects an invalid recommendation priority', () => {
    const bad = { ...validReport, recommendations: [{ ...validReport.recommendations[0], priority: 'asap' }] };
    expect(() => ReviewReportSchema.parse(bad)).toThrow(ZodError);
  });
  it('safeParse returns success false instead of throwing', () => {
    expect(ReviewReportSchema.safeParse({}).success).toBe(false);
    expect(ReviewReportSchema.safeParse(validReport).success).toBe(true);
  });
});

describe('JSON Schema export (for SDK structured outputs)', () => {
  it('exports an object schema for the review report', () => {
    const schema = ReviewReportJSONSchema as any;
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['pullRequest', 'fileReviews', 'summary', 'recommendations', 'metadata'])
    );
  });
  it('marks required properties correctly', () => {
    const schema = ReviewReportJSONSchema as any;
    expect(schema.required).toEqual(
      expect.arrayContaining(['pullRequest', 'fileReviews', 'summary', 'recommendations', 'metadata'])
    );
    expect((CodeQualityResultJSONSchema as any).required).toEqual(
      expect.arrayContaining(['file', 'issues', 'overallScore', 'summary'])
    );
  });
  it('exports object schemas for all subagent results', () => {
    expect((TestCoverageResultJSONSchema as any).type).toBe('object');
    expect((RefactoringSuggestionJSONSchema as any).type).toBe('object');
  });
  it('can be serialised to valid JSON', () => {
    expect(() => JSON.parse(JSON.stringify(ReviewReportJSONSchema))).not.toThrow();
  });
});
