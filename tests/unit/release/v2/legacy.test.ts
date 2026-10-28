// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'flow-legacy-'));
  roots.push(root);
  return root;
}
async function write(root: string, relative: string, value: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
async function lesson(root: string, id: string, directory = id): Promise<string> {
  const source = `id: ${id}\n`;
  await write(root, `content/python-basics/chapters/ch01/lessons/${directory}/lesson.yaml`, source);
  return digest(`lesson.yaml\0${source}`);
}
function reviewRow(id: string, hash: string): string {
  return `  - lessonId: ${id}
    sourceHash: "${hash}"
    authorId: original-author
    reviewerId: independent-reviewer
    accuracy: approved
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
    notes: Original review, not new publication permission.
`;
}
async function review(root: string, rows: string): Promise<string> {
  const source = `schemaVersion: 1
releaseStatus: draft
verifiedSourceCommit: draft
canonicalDistSha256: draft
lessons:
${rows}`;
  await write(root, 'docs/quality/content-review-python-basics.yaml', source);
  return source;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('legacy migration reader', () => {
  it('preserves draft records, original source-review roles, and exact content hashes without approving them', async () => {
    const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
    const root = await temporaryRoot();
    const hash = await lesson(root, 'python-first');
    const rawReview = await review(root, reviewRow('python-first', hash));
    const acceptance = `status: preflight-passed-final-ci-required
verifiedSourceCommit: historical-source
personas:
  - role: lesson
    method: independent-ai-source-review
    sourceCommit: observation-source
    lessons: [{ lessonId: python-first }]
    report: { path: private/secret/report.md, raw: DO-NOT-EMIT }
  - role: usability
    method: independent-ui-observation
    sourceCommit: draft
    lessonIds: [python-first]
  - role: runtime-publication
    results: [{ lessonId: python-first }]
`;
    await write(root, 'docs/quality/python-release-acceptance.yaml', acceptance);
    const [result] = await readLegacyEvidence(root, ['python-basics']);
    expect(result?.format).toBe('legacy');
    expect(result?.records.find((item) => item.kind === 'contentReview')).toMatchObject({
      path: 'docs/quality/content-review-python-basics.yaml',
      sha256: digest(rawReview),
      declaredSource: 'draft',
      declaredStatus: 'draft',
    });
    expect(result?.records.find((item) => item.kind === 'acceptance')).toMatchObject({
      sha256: digest(acceptance),
      declaredSource: 'historical-source',
      declaredStatus: 'preflight-passed-final-ci-required',
      observations: [
        {
          role: 'lesson',
          method: 'independent-ai-source-review',
          source: 'observation-source',
          lessonIds: ['python-first'],
        },
        {
          role: 'usability',
          method: 'independent-ui-observation',
          source: 'draft',
          lessonIds: ['python-first'],
        },
        { role: 'runtime-publication', method: null, source: null, lessonIds: ['python-first'] },
      ],
    });
    expect(result?.contentLessons).toEqual([
      {
        lessonId: 'python-first',
        sourceHash: hash,
        actualSourceHash: hash,
        sourceHashMatches: true,
        authorId: 'original-author',
        reviewerId: 'independent-reviewer',
        examplesExecuted: true,
        decision: 'approved',
        accuracy: 'approved',
        goalExerciseAlignment: 'approved',
        unexplainedTerms: 0,
        hintLeakage: 0,
      },
    ]);
    expect(result?.missingRecordPaths).toContain('docs/quality/python-release-approval.yaml');
    expect(JSON.stringify(result)).not.toMatch(/private\/secret|DO-NOT-EMIT|freshlyVerified/u);
    expect(
      await readFile(path.join(root, 'docs/quality/content-review-python-basics.yaml'), 'utf8'),
    ).toBe(rawReview);
  });

  it.each([
    ['accuracy', 'rejected'],
    ['goalExerciseAlignment', 'rejected'],
    ['unexplainedTerms', 1],
    ['hintLeakage', 1],
  ] as const)(
    'preserves a failing semantic condition %s even when decision is approved',
    async (field, value) => {
      const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
      const root = await temporaryRoot();
      const hash = await lesson(root, 'python-first');
      await review(
        root,
        reviewRow('python-first', hash).replace(
          new RegExp(`${field}: [^\\n]+`, 'u'),
          `${field}: ${String(value)}`,
        ),
      );
      const [result] = await readLegacyEvidence(root, ['python-basics']);
      expect(result?.contentLessons[0]?.decision).toBe('approved');
      expect(result?.contentLessons[0]?.[field]).toBe(value);
    },
  );

  it.each(['accuracy', 'goalExerciseAlignment', 'unexplainedTerms', 'hintLeakage'] as const)(
    'keeps missing semantic condition %s null instead of manufacturing acceptance',
    async (field) => {
      const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
      const root = await temporaryRoot();
      const hash = await lesson(root, 'python-first');
      await review(
        root,
        reviewRow('python-first', hash).replace(new RegExp(`    ${field}: [^\\n]+\\n`, 'u'), ''),
      );
      const [result] = await readLegacyEvidence(root, ['python-basics']);
      expect(result?.contentLessons[0]?.decision).toBe('approved');
      expect(result?.contentLessons[0]?.[field]).toBeNull();
    },
  );

  it('reports missing, extra, duplicate and stale lesson rows without dropping any original rows', async () => {
    const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
    const root = await temporaryRoot();
    const hash = await lesson(root, 'python-first');
    await lesson(root, 'python-added');
    await review(
      root,
      reviewRow('python-first', '0'.repeat(64)) +
        reviewRow('python-first', hash) +
        reviewRow('python-removed', hash),
    );
    const [result] = await readLegacyEvidence(root, ['python-basics']);
    expect(result?.coverage).toEqual({
      actualLessonIds: ['python-added', 'python-first'],
      missingLessonIds: ['python-added'],
      extraLessonIds: ['python-removed'],
      duplicateReviewLessonIds: ['python-first'],
      duplicateSourceLessonIds: [],
    });
    expect(result?.contentLessons.map((row) => row.sourceHashMatches)).toEqual([
      false,
      true,
      false,
    ]);
    expect(result?.contentLessons[2]?.actualSourceHash).toBeNull();
  });

  it('reports duplicate source IDs as ambiguous rather than selecting a matching directory', async () => {
    const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
    const root = await temporaryRoot();
    const hash = await lesson(root, 'python-first', 'first-copy');
    await lesson(root, 'python-first', 'second-copy');
    await review(root, reviewRow('python-first', hash));
    const [result] = await readLegacyEvidence(root, ['python-basics']);
    expect(result?.coverage.duplicateSourceLessonIds).toEqual(['python-first']);
    expect(result?.contentLessons[0]).toMatchObject({
      actualSourceHash: null,
      sourceHashMatches: false,
    });
  });

  it('uses only historical mappings and never reads a new course as legacy approval', async () => {
    const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
    const root = await temporaryRoot();
    await write(root, 'docs/quality/future-topic-release-approval.yaml', 'status: approved\n');
    const results = await readLegacyEvidence(root, ['future-topic', '../private']);
    expect(
      results.map(({ format, records, contentLessons, missingRecordPaths }) => ({
        format,
        records,
        contentLessons,
        missingRecordPaths,
      })),
    ).toEqual([
      { format: 'new-evidence-required', records: [], contentLessons: [], missingRecordPaths: [] },
      { format: 'new-evidence-required', records: [], contentLessons: [], missingRecordPaths: [] },
    ]);
  });

  it('preserves HTML markdown metadata and JS/TS original observation sources without guessing missing methods', async () => {
    const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
    const root = await temporaryRoot();
    await write(
      root,
      'docs/quality/novice-observation.md',
      `# Observation
- releaseStatus: \`draft\`
- verifiedSourceCommit: \`old-human-source\`
- evidenceKind: \`human-novice\`

## Later notes
Source review passed, but no new observation was performed.
`,
    );
    await write(
      root,
      'docs/quality/javascript-agent-learning.yaml',
      `verifiedSourceCommit: final-source
releaseStatus: approved
lessonEvaluations:
  - roleId: JS-A
    sourceCommit: original-js-source
    lessonId: js-one
`,
    );
    await write(
      root,
      'docs/quality/typescript-release-acceptance.yaml',
      `verifiedSourceCommit: final-ts-source
acceptance:
  sourceCommit: original-ts-source
  publicationApproval: pending
  personas:
    - role: A
      results: [{ lessonId: ts-one }]
`,
    );
    const [html, js, ts] = await readLegacyEvidence(root, ['html-css', 'javascript', 'typescript']);
    expect(html?.records.find((item) => item.kind === 'acceptance')).toMatchObject({
      declaredStatus: 'draft',
      declaredSource: 'old-human-source',
      observations: [
        { role: null, method: 'human-novice', source: 'old-human-source', lessonIds: [] },
      ],
    });
    expect(js?.records.find((item) => item.kind === 'acceptance')?.observations).toEqual([
      { role: 'JS-A', method: null, source: 'original-js-source', lessonIds: ['js-one'] },
    ]);
    expect(ts?.records.find((item) => item.kind === 'acceptance')?.observations).toContainEqual({
      role: null,
      method: null,
      source: 'original-ts-source',
      lessonIds: [],
    });
  });

  it('rejects symlinks in records and in any source directory before following them', async () => {
    const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await write(outside, 'secret.yaml', 'status: approved\n');
    await mkdir(path.join(root, 'docs/quality'), { recursive: true });
    await symlink(
      path.join(outside, 'secret.yaml'),
      path.join(root, 'docs/quality/python-release-approval.yaml'),
    );
    await expect(readLegacyEvidence(root, ['python-basics'])).rejects.toThrow(/symlink/u);
    await rm(path.join(root, 'docs/quality/python-release-approval.yaml'));
    await mkdir(path.join(root, 'content/python-basics'), { recursive: true });
    await symlink(outside, path.join(root, 'content/python-basics/unused-link'));
    await expect(readLegacyEvidence(root, ['python-basics'])).rejects.toThrow(/symlink/u);
  });

  it('does not expose private record text in malformed YAML errors', async () => {
    const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
    const root = await temporaryRoot();
    await write(
      root,
      'docs/quality/python-release-acceptance.yaml',
      'personas: [ private/secret/raw DO-NOT-EMIT',
    );
    await expect(readLegacyEvidence(root, ['python-basics'])).rejects.toThrow(
      'Invalid legacy YAML: docs/quality/python-release-acceptance.yaml',
    );
  });

  it('reads all six historical ledgers with exact current lesson coverage while retaining unresolved release states', async () => {
    const { readLegacyEvidence } = await import('../../../../scripts/release/v2/legacy');
    const results = await readLegacyEvidence(process.cwd(), [
      'html-css',
      'javascript',
      'typescript',
      'react',
      'next',
      'python-basics',
    ]);
    expect(results.map(({ contentLessons }) => contentLessons.length)).toEqual([
      51, 52, 15, 15, 9, 10,
    ]);
    for (const result of results) {
      expect(result.missingRecordPaths).toEqual([]);
      expect(result.contentLessons.every((row) => row.sourceHashMatches)).toBe(true);
      expect(result.coverage.missingLessonIds).toEqual([]);
      expect(result.coverage.extraLessonIds).toEqual([]);
    }
    expect(
      results[0]?.records.find((record) => record.kind === 'contentReview')?.declaredStatus,
    ).toBe('draft');
    expect(
      results[5]?.records.find((record) => record.kind === 'contentReview')?.declaredStatus,
    ).toBe('draft');
    expect(
      results[5]?.records
        .find((record) => record.kind === 'acceptance')
        ?.observations.map((row) => row.method),
    ).toEqual([
      'independent-ai-source-review',
      'independent-ai-source-review',
      'independent-ai-source-review',
    ]);
  }, 30_000);
});
