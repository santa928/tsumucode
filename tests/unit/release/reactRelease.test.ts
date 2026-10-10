// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { compileCourse } from '../../../scripts/content/compileCourse';
import {
  resolveReleaseCourseContract,
  isReleaseMetadataPath,
} from '../../../scripts/release/releaseCourseContracts';
import {
  parseCourseReleaseHistory,
  parseCourseReleaseApproval,
} from '../../../scripts/release/javascriptReleaseSchema';
import {
  createReactInputManifest,
  compareReactLearningInputs,
} from '../../../scripts/release/reactInputHashes';
import { verifyReactSyntheticProgressBundle } from '../../../scripts/release/reactSyntheticContinuity';
import {
  resolveBetaTarget,
  verifyBetaSitePublication,
} from '../../../scripts/release/verifyReleaseTarget';
import {
  hashReactReleaseEvidence,
  validateReactReleaseEvidence,
  REACT_ACCEPTANCE_LESSONS,
  type ReactReleaseEvidence,
} from '../../../scripts/release/verifyReactQualityEvidence';

const hash = 'a'.repeat(64),
  commit = 'a'.repeat(40);
const reference = { path: 'private-evidence.json', sha256: hash };
const encode = (source: string): Uint8Array => new TextEncoder().encode(source);
const digest = (source: string): string => createHash('sha256').update(source).digest('hex');

async function inputs() {
  const files = new Map<string, Uint8Array>(
    await Promise.all(
      [
        'content/react/course.yaml',
        'content/learning-paths/frontend.yaml',
        'package.json',
        'package-lock.json',
      ].map(
        async (relative) =>
          [
            relative,
            await readFile(
              relative === 'content/learning-paths/frontend.yaml'
                ? 'tests/fixtures/release/react-initial-frontend.yaml'
                : relative,
            ),
          ] as const,
      ),
    ),
  );
  files.set(
    'content/react/course.yaml',
    encode(
      new TextDecoder()
        .decode(files.get('content/react/course.yaml'))
        .replace('publicationStatus: published', 'publicationStatus: draft'),
    ),
  );
  const step = '  - courseId: react\n    role: required\n    prerequisiteCourseIds: [typescript]\n';
  files.set(
    'content/learning-paths/frontend.yaml',
    encode(
      new TextDecoder().decode(files.get('content/learning-paths/frontend.yaml')).replace(step, ''),
    ),
  );
  const draft = createReactInputManifest(commit, files);
  files.set(
    'content/react/course.yaml',
    encode(
      new TextDecoder()
        .decode(files.get('content/react/course.yaml'))
        .replace('publicationStatus: draft', 'publicationStatus: published'),
    ),
  );
  files.set(
    'content/learning-paths/frontend.yaml',
    encode(new TextDecoder().decode(files.get('content/learning-paths/frontend.yaml')) + step),
  );
  return { draft, final: createReactInputManifest('b'.repeat(40), files), files };
}

async function evidence(): Promise<ReactReleaseEvidence> {
  const input = await inputs();
  const record: ReactReleaseEvidence = {
    schemaVersion: 1,
    courseId: 'react',
    status: 'preflight-passed-final-ci-required',
    methodsApprovalReference: '本人のReact専用受入承認',
    publicationApprovalReference: '本人のReact正式公開承認',
    realHumanTrial: 'unverified',
    lowEndPhysicalDevice: 'unverified',
    verifiedSourceCommit: input.final.sourceCommit,
    canonicalDistSha256: hash,
    candidateTreeSha256: hash,
    draftCanonicalDistSha256: hash,
    draftInput: input.draft,
    finalInput: input.final,
    applicationSourceSha256: hash,
    dependencyLockSha256: hash,
    personas: (['A', 'B', 'C'] as const).map((role) => ({
      role,
      actor: `actor-${role}`,
      session: `session-${role}`,
      browserContext: `context-${role}`,
      publicInputOnly: true,
      explainsFinalProject: true,
      report: { path: `${role}.md`, sha256: digest(role) },
      results: REACT_ACCEPTANCE_LESSONS.map((lessonId) => ({
        lessonId,
        learnerContentSha256: hash,
        source: reference,
        uiEvidence: reference,
      })),
    })),
    performance: (['react-ch01-l01-e01', 'react-ch01-l11-e01', 'react-ch03-l01-e01'] as const).map(
      (exerciseId) => {
        const raw = JSON.stringify({
          captureBinding: {
            sourceCommit: commit,
            canonicalDistSha256: hash,
            applicationSourceSha256: hash,
            dependencyLockSha256: hash,
            harnessSha256: hash,
            workloadSourceSha256: hash,
          },
          exerciseId,
          browser: '149',
          viewport: { width: 1280, height: 900 },
          cpuSlowdown: 4,
          rttMs: 150,
          downloadBitsPerSecond: 1_600_000,
          uploadBitsPerSecond: 750_000,
          cache: 'HTTP cache disabled; cold Context/IndexedDB fresh; warm same Context',
          initialOutcome: exerciseId === 'react-ch01-l01-e01' ? 'type-error' : 'rendered',
          cold: Array.from({ length: 20 }, () => ({ elapsedMs: 5000, status: 'pass' })),
          preview: Array.from({ length: 20 }, () => 1000),
          validation: Array.from({ length: 20 }, () => 3000),
          failures: [],
          warmupRuns: 1,
          plannedRuns: 20,
          coldP95Ms: 5000,
          coldMaxMs: 5000,
          previewP95Ms: 1000,
          validationP95Ms: 3000,
          scope: 'エミュレーション限定',
        });
        return {
          exerciseId,
          raw,
          sha256: digest(raw),
          harnessSha256: hash,
          workloadSourceSha256: hash,
        };
      },
    ),
    browserMatrix: (['chromium', 'firefox', 'webkit'] as const).map((engine) => ({
      engine,
      passedLessons: 15,
      failedLessons: 0,
      generalLessons: 14,
      refUiLessons: 1,
      sourceCommit: commit,
      canonicalDistSha256: hash,
      reportSha256s: [hash],
      harnessSha256: hash,
      refHarnessSha256: hash,
    })),
    progressRoundTrip: reference,
    reading: { codePreviewSlides: 25, viewports: [1280, 390], axeViolations: 0, report: reference },
    independenceReview: {
      author: 'root',
      reviewer: 'reviewer',
      decision: 'approved',
      privateOriginalsChecked: true,
      productTreeSha256: hash,
      evidenceSha256: hash,
      reportSha256s: ['A', 'B', 'C'].map(digest),
    },
  };
  record.independenceReview.evidenceSha256 = hashReactReleaseEvidence(record);
  return record;
}
const learners = new Map(REACT_ACCEPTANCE_LESSONS.map((id) => [id, hash]));

describe('React専用公開境界', () => {
  it('専用履歴・承認の混在と未登録metadataを拒否する', async () => {
    const contract = resolveReleaseCourseContract('react');
    expect(contract.lessonCount).toBe(15);
    expect(contract.guidedLessonCount).toBe(2);
    expect(contract.capstoneLessonCount).toBe(1);
    const history: unknown = parse(await readFile(contract.historyPath, 'utf8'));
    const approval: unknown = parse(await readFile(contract.approvalPath, 'utf8'));
    expect(() => parseCourseReleaseHistory('react', history)).not.toThrow();
    expect(() => parseCourseReleaseApproval('react', approval)).not.toThrow();
    expect(() => parseCourseReleaseHistory('typescript', history)).toThrow();
    expect(() => parseCourseReleaseApproval('typescript', approval)).toThrow();
    expect(isReleaseMetadataPath(contract.approvalPath, 'react')).toBe(true);
    expect(isReleaseMetadataPath('docs/quality/typescript-release-approval.yaml', 'react')).toBe(
      false,
    );
    expect(isReleaseMetadataPath('docs/quality/private-log.json', 'react')).toBe(false);
  });
  it('公開metadataの2箇所だけを正規化し、コード変更とPath迂回を拒否する', async () => {
    const input = await inputs();
    expect(compareReactLearningInputs(input.draft, input.final)).toEqual([
      'content/learning-paths/frontend.yaml',
      'content/react/course.yaml',
    ]);
    input.files.set('src/changed.ts', encode('export const changed = true;'));
    expect(() =>
      compareReactLearningInputs(input.draft, createReactInputManifest(commit, input.files)),
    ).toThrow('変更');
    input.files.delete('src/changed.ts');
    input.files.set(
      'content/learning-paths/frontend.yaml',
      encode(
        new TextDecoder()
          .decode(input.files.get('content/learning-paths/frontend.yaml'))
          .replace('prerequisiteCourseIds: [typescript]', 'prerequisiteCourseIds: [javascript]'),
      ),
    );
    expect(() => createReactInputManifest(commit, input.files)).toThrow('required');
  });
  it('合成Bundleを実移行へ通して全教材・14Workspace・履歴・Snapshotを保持する', async () => {
    const course = (await compileCourse('content/react')).runtime;
    const bundle: unknown = JSON.parse(
      await readFile('tests/fixtures/progress/react-previous-release-bundle.json', 'utf8'),
    );
    expect((await verifyReactSyntheticProgressBundle(course, bundle)).resetNotices).toBe(0);
    const tampered = structuredClone(bundle) as { integrity: { digest: string } };
    tampered.integrity.digest = '0'.repeat(64);
    await expect(verifyReactSyntheticProgressBundle(course, tampered)).rejects.toThrow('hash');
  });
  it('React選択と全site betaの両方で公開承認迂回を拒否する', async () => {
    expect(() => resolveBetaTarget(commit, commit, commit, 'react')).toThrow('beta');
    const root = await mkdtemp(path.join(tmpdir(), 'react-beta-'));
    try {
      await mkdir(path.join(root, 'content/react'), { recursive: true });
      await writeFile(
        path.join(root, 'content/react/course.yaml'),
        'id: react\npublicationStatus: published\n',
      );
      await expect(verifyBetaSitePublication(root)).rejects.toThrow('react');
    } finally {
      await rm(root, { recursive: true });
    }
  });
  it('全45組と20標本の正常証拠を受け入れる', async () => {
    expect(validateReactReleaseEvidence(await evidence(), learners).personas).toHaveLength(3);
  });
  it.each([
    'missing-lesson',
    'same-session',
    'same-reviewer',
    'changed-evidence',
    'few-samples',
    'over-budget',
    'duplicate-engine',
    'duplicate-report',
    'old-capture',
    'old-browser-source',
  ])('%sの偽装・欠落を再binding後も拒否する', async (kind) => {
    const record = await evidence();
    if (kind === 'missing-lesson') record.personas[0]!.results.pop();
    if (kind === 'duplicate-report')
      record.personas[1]!.report.sha256 = record.personas[0]!.report.sha256;
    if (kind === 'old-browser-source') record.browserMatrix[0]!.sourceCommit = 'c'.repeat(40);
    if (kind === 'old-capture') record.performance[0]!.harnessSha256 = 'b'.repeat(64);
    if (kind === 'same-session') record.personas[1]!.session = record.personas[0]!.session;
    if (kind === 'same-reviewer') record.independenceReview.reviewer = record.personas[0]!.actor;
    if (kind === 'changed-evidence') record.personas[0]!.report.sha256 = hash;
    if (kind === 'duplicate-engine') record.browserMatrix[1]!.engine = 'chromium';
    if (kind === 'few-samples' || kind === 'over-budget') {
      const entry = record.performance[0]!;
      const raw = JSON.parse(entry.raw) as { preview: number[]; previewP95Ms: number };
      if (kind === 'few-samples') raw.preview.pop();
      else {
        raw.preview.fill(2500);
        raw.previewP95Ms = 2500;
      }
      entry.raw = JSON.stringify(raw);
      entry.sha256 = digest(entry.raw);
    }
    record.independenceReview.evidenceSha256 = hashReactReleaseEvidence(record);
    expect(() => validateReactReleaseEvidence(record, learners)).toThrow();
  });
});
