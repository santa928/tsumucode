// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { compileCourse } from '../../../scripts/content/compileCourse';
import type { CourseManifest } from '../../../src/core/content/types';
import {
  TypescriptReleaseApprovalSchema,
  TypescriptReleaseHistorySchema,
} from '../../../scripts/release/typescriptReleaseSchema';
import {
  parseCourseReleaseApproval,
  parseCourseReleaseHistory,
} from '../../../scripts/release/javascriptReleaseSchema';
import {
  resolveReleaseCourseContract,
  isReleaseMetadataPath,
} from '../../../scripts/release/releaseCourseContracts';
import { loadApprovedReleaseApproval } from '../../../scripts/release/verifyReleaseApproval';
import {
  resolveBetaTarget,
  verifyBetaSitePublication,
} from '../../../scripts/release/verifyReleaseTarget';
import {
  createTypescriptInputManifest,
  compareTypescriptLearningInputs,
} from '../../../scripts/release/typescriptInputHashes';
import { verifyTypescriptSyntheticProgressBundle } from '../../../scripts/release/typescriptSyntheticContinuity';
import {
  buildReleaseReport,
  parseReleaseReport,
  formatArtifactHashOutput,
} from '../../../scripts/release/writeReleaseReport';

const commit = 'a'.repeat(40),
  hash = 'a'.repeat(64);
const encoder = new TextEncoder();
const step =
  '  - courseId: typescript\n    role: required\n    prerequisiteCourseIds: [javascript]\n';
let files: Map<string, Uint8Array>;
let course: CourseManifest;
let bundle: unknown;

beforeAll(async () => {
  files = new Map(
    await Promise.all(
      [
        'content/typescript/course.yaml',
        'content/learning-paths/frontend.yaml',
        'package.json',
        'package-lock.json',
      ].map(async (file) => {
        // TS初公開時のPathを固定し、後続Courseの公開状態から独立させる。
        const source =
          file === 'content/learning-paths/frontend.yaml'
            ? 'tests/fixtures/release/typescript-initial-frontend.yaml'
            : file;
        return [file, new Uint8Array(await readFile(source))] as const;
      }),
    ),
  );
  // 公開済み環境でも独立したdraft→published fixtureを作り、現在の公開状態を変えない。
  const decoder = new TextDecoder(),
    encoder = new TextEncoder();
  files.set(
    'content/typescript/course.yaml',
    encoder.encode(
      decoder
        .decode(files.get('content/typescript/course.yaml'))
        .replace(/^publicationStatus: (draft|published)$/gmu, 'publicationStatus: draft'),
    ),
  );
  course = (await compileCourse('content/typescript')).runtime;
  bundle = JSON.parse(
    await readFile('tests/fixtures/progress/typescript-previous-release-bundle.json', 'utf8'),
  );
});

function publishedFiles(): Map<string, Uint8Array> {
  const final = new Map(files);
  final.set(
    'content/typescript/course.yaml',
    encoder.encode(
      new TextDecoder()
        .decode(files.get('content/typescript/course.yaml'))
        .replace('publicationStatus: draft', 'publicationStatus: published'),
    ),
  );
  final.set(
    'content/learning-paths/frontend.yaml',
    encoder.encode(
      new TextDecoder().decode(files.get('content/learning-paths/frontend.yaml')) + step,
    ),
  );
  return final;
}

describe('TypeScript正式Releaseの隔離された契約', () => {
  it('採用15教材のpath/schemaを固定しJS/HTML記録の差し替えを拒否する', async () => {
    const contract = resolveReleaseCourseContract('typescript');
    expect([
      contract.lessonCount,
      contract.standardLessonCount,
      contract.guidedLessonCount,
      contract.chapterCount,
      contract.phaseCount,
      contract.estimatedMinutes,
    ]).toEqual([15, 12, 3, 6, 2, 320]);
    const approval = {
      ...TypescriptReleaseApprovalSchema.parse(
        parse(await readFile(contract.approvalPath, 'utf8')),
      ),
      status: 'draft' as const,
      approvedBy: 'draft',
      approvedAt: 'draft' as const,
    };
    const history = {
      ...TypescriptReleaseHistorySchema.parse(parse(await readFile(contract.historyPath, 'utf8'))),
      releases: [],
    };
    expect(TypescriptReleaseApprovalSchema.parse(approval).status).toBe('draft');
    expect(TypescriptReleaseHistorySchema.parse(history).releases).toEqual([]);
    expect(() => parseCourseReleaseApproval('javascript', approval)).toThrow();
    expect(() => parseCourseReleaseHistory('javascript', history)).toThrow();
    expect(isReleaseMetadataPath(contract.approvalPath, 'typescript')).toBe(true);
    expect(
      isReleaseMetadataPath('docs/quality/javascript-release-approval.yaml', 'typescript'),
    ).toBe(false);
    expect(isReleaseMetadataPath('docs/quality/arbitrary.yaml', 'typescript')).toBe(false);
  });
  it('TSのdispatchでも既存2 Courseの継続性と全site最終CIを省略しない', async () => {
    const workflow = parse(await readFile('.github/workflows/pages.yml', 'utf8')) as {
      on: { workflow_dispatch: { inputs: { course_id: { options: string[] } } } };
      jobs: { quality: { steps: { name?: string; if?: string; run?: string }[] } };
    };
    expect(workflow.on.workflow_dispatch.inputs.course_id.options).toEqual([
      'html-css',
      'javascript',
      'typescript',
      'react',
      'next',
    ]);
    const step = workflow.jobs.quality.steps.find(
      ({ name }) => name === 'Keep existing JavaScript continuity in the all-site gate',
    );
    expect(step?.if).toBe(
      "(needs.resolve.outputs.course_id == 'typescript' || needs.resolve.outputs.course_id == 'react' || needs.resolve.outputs.course_id == 'next') && needs.resolve.outputs.release_mode != 'rollback'",
    );
    expect(step?.run).toContain('--quality-only --course-id javascript');
  });
  it('公開許可がdraftならcandidate承認を拒否し、betaで迂回できない', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-draft-approval-'));
    try {
      await mkdir(path.join(root, 'docs/quality'), { recursive: true });
      const pending = {
        ...TypescriptReleaseApprovalSchema.parse(
          parse(await readFile('docs/quality/typescript-release-approval.yaml', 'utf8')),
        ),
        status: 'draft',
        approvedBy: 'draft',
        approvedAt: 'draft',
      };
      await writeFile(
        path.join(root, 'docs/quality/typescript-release-approval.yaml'),
        JSON.stringify(pending),
      );
      await expect(loadApprovedReleaseApproval(root, 'typescript')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    expect(() => resolveBetaTarget(commit, commit, commit, 'typescript')).toThrow('beta');
  });
  it('HTML/JSを選んでも公開TSを含むbetaを拒否し、TS draftと旧Sourceは許可する', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ts-beta-site-'));
    try {
      await expect(verifyBetaSitePublication(root)).resolves.toBeUndefined();
      await mkdir(path.join(root, 'content/typescript'), { recursive: true });
      const file = path.join(root, 'content/typescript/course.yaml');
      await writeFile(file, 'id: typescript\npublicationStatus: draft\n');
      await expect(verifyBetaSitePublication(root)).resolves.toBeUndefined();
      await writeFile(file, 'id: typescript\npublicationStatus: published\n');
      for (const selected of ['html-css', 'javascript']) {
        expect(
          resolveBetaTarget(commit, commit, commit, selected as 'html-css' | 'javascript').courseId,
        ).toBe(selected);
        await expect(verifyBetaSitePublication(root)).rejects.toThrow('全site beta');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('draft→publishedとJS直後のrequired登録だけを正規化する', () => {
    const before = createTypescriptInputManifest(commit, files);
    const after = createTypescriptInputManifest('b'.repeat(40), publishedFiles());
    expect(compareTypescriptLearningInputs(before, after)).toEqual([
      'content/learning-paths/frontend.yaml',
      'content/typescript/course.yaml',
    ]);
    expect(before.normalizedInputSha256).toBe(after.normalizedInputSha256);
    for (const alteredStep of [
      step.replace('[javascript]', '[html-css]'),
      step.replace('required', 'optional'),
      step + step,
    ]) {
      const altered = publishedFiles();
      altered.set(
        'content/learning-paths/frontend.yaml',
        encoder.encode(
          new TextDecoder().decode(files.get('content/learning-paths/frontend.yaml')) + alteredStep,
        ),
      );
      expect(() => createTypescriptInputManifest(commit, altered)).toThrow();
    }
    const changed = publishedFiles();
    changed.set('src/changed.ts', encoder.encode('export const value = 2;'));
    expect(() =>
      compareTypescriptLearningInputs(before, createTypescriptInputManifest(commit, changed)),
    ).toThrow('変更');
  });
  it('合成Bundleは全教材/WorkspaceのTSと他Courseを保持し再移行しても不変', async () => {
    expect(await verifyTypescriptSyntheticProgressBundle(course, bundle)).toEqual({
      migratedCourses: 3,
      migratedDrafts: 14,
      resetNotices: 0,
    });
    const tampered = structuredClone(bundle) as {
      drafts: Record<string, { files: Record<string, string> }>;
    };
    Object.values(tampered.drafts)[0]!.files['main.ts'] = 'changed';
    await expect(verifyTypescriptSyntheticProgressBundle(course, tampered)).rejects.toThrow('hash');
  });
  it('ReportとArtifact outputはTSを明示しJSへの読み替えを拒否する', () => {
    const input = {
      courseId: 'typescript' as const,
      revision: '2026-10-06.4',
      draftSourceCommit: commit,
      draftCanonicalDistSha256: hash,
      normalizedLearningInputSha256: hash,
      sourceSha: commit,
      workflowHeadSha: commit,
      releaseMode: 'candidate',
      artifactDigest: hash,
      courseHash: hash,
      provenanceHash: hash,
      qualityArtifactId: '1',
      qualityArtifactDigest: `sha256:${hash}`,
      workflowRunId: '2',
      workflowRunAttempt: '1',
      pageUrl: 'https://example.com/tsumucode/',
    };
    expect(parseReleaseReport(buildReleaseReport(input))).toEqual(input);
    expect(
      formatArtifactHashOutput({
        courseId: 'typescript',
        artifactDigest: hash,
        courseHash: hash,
        provenanceHash: hash,
        visualBaselineHash: hash,
      }),
    ).toContain('course_id=typescript');
  });
});
