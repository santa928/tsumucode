// @vitest-environment node
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import { sha256Text } from '../../../scripts/release/releaseHashes';
import {
  resolveDraftReleaseCourseContract,
  type DraftReleaseCourseId,
} from '../../../scripts/release/draftReleaseCourseContracts';
import { ReleaseCourseIdSchema } from '../../../scripts/release/releaseCourseContracts';
import { compileCourse } from '../../../scripts/content/compileCourse';
import {
  buildSplitContentDelivery,
  writeSplitContentDeliveryTree,
} from '../../../scripts/content/splitContentDelivery';
import {
  checkDraftReleaseCandidate,
  measureDraftReleaseCandidate,
} from '../../../scripts/release/checkDraftReleaseCandidate';
import {
  hashDraftQualityInputs,
  readDraftSourceTree,
} from '../../../scripts/release/draftQualityInputHashes';
import {
  hashDraftCourseQualityRecord,
  verifyDraftCourseQualityEvidence,
} from '../../../scripts/release/verifyDraftCourseQualityEvidence';
import type {
  DraftCandidateBinding,
  DraftCourseQualityRecord,
  DraftQualityReference,
  DraftQualityScope,
} from '../../../scripts/release/draftCourseQualitySchema';

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];
const scopes: DraftQualityScope[] = [
  'runtime',
  'usability',
  'accessibility',
  'persistence',
  'delivery',
];

/** 合成Git fixtureだけを操作し、外側ComposeのGit指定を引き継がない。 */
async function git(root: string, arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', arguments_, {
    cwd: root,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  });
  return stdout.trim();
}

/** privateの合成原本を作る。実際の実行・人・CUAの証拠には使わない。 */
async function reference(
  root: string,
  name: string,
  value: unknown,
): Promise<DraftQualityReference> {
  const bytes = JSON.stringify(value);
  await writeFile(path.join(root, name), bytes);
  return { path: name, sha256: sha256Text(bytes) };
}

/** 実Git commitと実file bytesを使う、原本bindingの正負検査専用fixture。 */
async function fixture(actualCourse = false, courseId: DraftReleaseCourseId = 'tailwind') {
  const root = await mkdtemp(path.join(tmpdir(), 'tsumucode-draft-quality-'));
  temporaryRoots.push(root);
  const evidence = path.join(root, 'private');
  await mkdir(evidence);
  await writeFile(path.join(root, '.gitignore'), 'private/\n');
  await git(root, ['init']);
  await git(root, ['config', 'user.name', 'Synthetic Test']);
  await git(root, ['config', 'user.email', 'test@example.invalid']);
  const contract = resolveDraftReleaseCourseContract(courseId);
  for (const id of contract.lessonIds) {
    const directory = path.join(
      root,
      contract.sourceRoot,
      'chapters',
      id.replace(/-l\d+$/u, ''),
      'lessons',
      id,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'lesson.yaml'), `id: ${id}\n`);
    const exercise = path.join(directory, 'exercises', `${id}-e01`);
    await mkdir(path.join(exercise, 'starter'), { recursive: true });
    await writeFile(path.join(exercise, 'starter/index.html'), '<p>initial</p>');
    await writeFile(path.join(exercise, 'instructions.md'), 'synthetic instruction');
  }
  await mkdir(path.join(root, 'src/features/learning'), { recursive: true });
  await writeFile(path.join(root, 'src/features/learning/control.ts'), 'export const state = 1;');
  await writeFile(path.join(root, 'package-lock.json'), '{}');
  await writeFile(
    path.join(root, contract.sourceRoot, 'course.yaml'),
    `schemaVersion: 1\nid: ${courseId}\nrunnerId: ${courseId === 'tailwind' ? 'tailwind' : 'python'}\nvalidatorId: ${courseId === 'tailwind' ? 'html-css' : 'python'}\nrevision: 2026-10-15.1\n`,
  );
  const dist = path.join(evidence, 'dist');
  if (actualCourse) {
    await rm(path.join(root, contract.sourceRoot), { recursive: true });
    await cp(contract.sourceRoot, path.join(root, contract.sourceRoot), { recursive: true });
    await mkdir(path.join(root, 'docs/quality'), { recursive: true });
    await cp(contract.contentReviewPath, path.join(root, contract.contentReviewPath));
    await writeFile(
      path.join(root, contract.qualityPath),
      JSON.stringify({
        schemaVersion: 1,
        courseId: courseId,
        status: 'draft',
        publicationAuthorized: false,
        author: 'draft',
        candidate: null,
        observations: [],
        codeReviews: [],
        originalsReview: null,
      }),
    );
    const compilation = await compileCourse(path.join(root, contract.sourceRoot));
    await writeSplitContentDeliveryTree(
      path.join(dist, 'generated/content'),
      buildSplitContentDelivery([compilation], []),
    );
    const html = path.join(dist, 'generated/content/courses/html-css');
    await mkdir(path.join(html, 'lessons'), { recursive: true });
    await writeFile(path.join(html, 'index.json'), '{}');
    await writeFile(path.join(html, 'lessons/synthetic.json'), '{}');
    await writeFile(path.join(dist, 'index.html'), '<main>synthetic artifact fixture</main>');
  }
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', 'synthetic initial input']);
  const sourceCommit = await git(root, ['rev-parse', 'HEAD']);
  const candidate: DraftCandidateBinding = actualCourse
    ? (await measureDraftReleaseCandidate(root, dist, courseId)).candidate
    : {
        sourceCommit,
        sourceTree: await readDraftSourceTree(root, sourceCommit),
        productTreeSha256: 'a'.repeat(64),
        canonicalDistSha256: 'b'.repeat(64),
        runtimeSha256: 'c'.repeat(64),
        publicProvenanceSha256: 'd'.repeat(64),
        contentReviewSha256: 'e'.repeat(64),
      };
  const record: DraftCourseQualityRecord = {
    schemaVersion: 1,
    courseId: courseId,
    status: 'ready-for-technical-verification',
    publicationAuthorized: false,
    author: 'author',
    candidate,
    observations: [],
    codeReviews: [],
    originalsReview: null,
  };
  for (const scope of scopes) {
    const raw = await reference(evidence, `${scope}-raw.json`, { synthetic: true, scope });
    record.observations.push(
      await reference(evidence, `${scope}.json`, {
        schemaVersion: 1,
        courseId: courseId,
        actor: scope === 'usability' ? 'independent-cua' : 'test-author',
        method: scope === 'usability' ? 'computer-use' : 'automated-test',
        executionTarget:
          scope === 'runtime' ? contract.runtimeRequirements[0].target : 'browser-ui',
        portableArtifacts: null,
        contextSharing: scope === 'usability' ? 'none' : 'not-applicable',
        sourceCommit,
        sourceTree: candidate.sourceTree,
        canonicalDistSha256:
          scope === 'runtime' && !contract.runtimeRequirements[0].target.startsWith('browser-')
            ? 'not-applicable'
            : candidate.canonicalDistSha256,
        scopes: [scope],
        lessonIds: contract.lessonIds,
        inputSha256ByScope: {
          [scope]: await hashDraftQualityInputs(
            root,
            sourceCommit,
            courseId,
            scope,
            contract.lessonIds,
          ),
        },
        rawReports: [raw],
        mandatoryFindings: 0,
      }),
    );
  }

  for (const requirement of contract.runtimeRequirements.slice(1)) {
    const raw = await reference(evidence, `${requirement.target}-raw.json`, {
      synthetic: true,
      target: requirement.target,
    });
    const portableArtifacts =
      requirement.target === 'portable-vite'
        ? {
            sourceArchive: await reference(evidence, 'synthetic-source.zip', {
              synthetic: true,
              type: 'archive-byte-binding-only',
            }),
            buildManifest: await reference(evidence, 'synthetic-build.json', {
              synthetic: true,
              type: 'build-byte-binding-only',
            }),
          }
        : null;
    record.observations.push(
      await reference(evidence, `${requirement.target}.json`, {
        schemaVersion: 1,
        courseId,
        actor: 'test-author',
        method: 'automated-test',
        executionTarget: requirement.target,
        contextSharing: 'not-applicable',
        sourceCommit,
        sourceTree: candidate.sourceTree,
        canonicalDistSha256: requirement.target.startsWith('browser-')
          ? candidate.canonicalDistSha256
          : 'not-applicable',
        portableArtifacts,
        scopes: ['runtime'],
        lessonIds: requirement.lessonIds,
        inputSha256ByScope: {
          runtime: await hashDraftQualityInputs(
            root,
            sourceCommit,
            courseId,
            'runtime',
            requirement.lessonIds,
          ),
        },
        rawReports: [raw, ...(portableArtifacts === null ? [] : Object.values(portableArtifacts))],
        mandatoryFindings: 0,
      }),
    );
  }

  /** 変形した原本集合へ独立照合を結び直し、別条件の失敗で負例を隠さない。 */
  async function refreshOriginalsReview() {
    const references = [...record.observations, ...record.codeReviews];
    for (const ref of [...references]) {
      const receipt = JSON.parse(await readFile(path.join(evidence, ref.path), 'utf8')) as {
        rawReports?: DraftQualityReference[];
        rawReport?: DraftQualityReference;
      };
      references.push(...(receipt.rawReports ?? (receipt.rawReport ? [receipt.rawReport] : [])));
    }
    record.originalsReview = await reference(evidence, 'originals-review.json', {
      schemaVersion: 1,
      courseId: courseId,
      reviewer: 'reviewer-1',
      decision: 'approved',
      candidate,
      qualityRecordSha256: hashDraftCourseQualityRecord(record),
      checkedReferences: references,
    });
  }
  /** 新候補のcode receiptだけを更新する。旧操作receiptの元Sourceは変更しない。 */
  async function refreshReview() {
    record.codeReviews = [];
    for (const [i, role] of ['requirements-logic', 'security', 'structure'].entries()) {
      const rawReport = await reference(evidence, `code-${String(i)}-raw.json`, {
        synthetic: true,
        role,
      });
      record.codeReviews.push(
        await reference(evidence, `code-${String(i)}.json`, {
          schemaVersion: 1,
          courseId: courseId,
          actor: `reviewer-${String(i)}`,
          role,
          sourceCommit: candidate.sourceCommit,
          productTreeSha256: candidate.productTreeSha256,
          decision: 'approved',
          mandatoryFindings: 0,
          rawReport,
        }),
      );
    }
    await refreshOriginalsReview();
  }
  await refreshReview();
  return { root, evidence, dist, record, candidate, refreshReview, refreshOriginalsReview };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true });
    }),
  );
});

describe('3草稿の私有原本と候補binding', () => {
  it.each(['python-practice', 'python-oop'] as const)(
    '%sのNode・Local・代表Browser原本を元Sourceのまま受理する',
    async (courseId) => {
      const f = await fixture(false, courseId);
      await expect(
        verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
      ).resolves.toBeUndefined();
    },
  );
  it.each(['browser-pyodide', 'local-cpython'])(
    'Pythonの%sが欠落した原本をNodeの成功だけで補わない',
    async (target) => {
      const f = await fixture(false, 'python-practice');
      const remaining: DraftQualityReference[] = [];
      for (const ref of f.record.observations) {
        const observation = JSON.parse(
          await readFile(path.join(f.evidence, ref.path), 'utf8'),
        ) as Record<string, unknown>;
        if (observation.executionTarget === target) continue;
        observation.canonicalDistSha256 = f.candidate.canonicalDistSha256;
        remaining.push(await reference(f.evidence, ref.path, observation));
      }
      f.record.observations = remaining;
      await f.refreshOriginalsReview();
      await expect(
        verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
      ).rejects.toThrow(/実行対象/u);
    },
  );

  it('TailwindのBrowser成功だけでproduction buildを代用しない', async () => {
    const f = await fixture();
    f.record.observations = f.record.observations.filter(
      ({ path: relative }) => relative !== 'portable-vite.json',
    );
    await f.refreshOriginalsReview();
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).rejects.toThrow(/実行対象/u);
  });

  it('Browser操作のサイトdistなしと、portableの成果物なしを拒否する', async () => {
    const f = await fixture();
    const browser = JSON.parse(
      await readFile(path.join(f.evidence, 'usability.json'), 'utf8'),
    ) as Record<string, unknown>;
    browser.canonicalDistSha256 = 'not-applicable';
    f.record.observations[1] = await reference(f.evidence, 'usability.json', browser);
    await f.refreshOriginalsReview();
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).rejects.toThrow();
    browser.canonicalDistSha256 = f.candidate.canonicalDistSha256;
    f.record.observations[1] = await reference(f.evidence, 'usability.json', browser);
    const portable = JSON.parse(
      await readFile(path.join(f.evidence, 'portable-vite.json'), 'utf8'),
    ) as Record<string, unknown>;
    portable.portableArtifacts = null;
    portable.canonicalDistSha256 = f.candidate.canonicalDistSha256;
    const index = f.record.observations.findIndex(
      ({ path: relative }) => relative === 'portable-vite.json',
    );
    f.record.observations[index] = await reference(f.evidence, 'portable-vite.json', portable);
    await f.refreshOriginalsReview();
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).rejects.toThrow(/成果物/u);
  });

  it('portableのSource ZIPを別bytesへ差替えた原本を拒否する', async () => {
    const f = await fixture();
    await writeFile(path.join(f.evidence, 'synthetic-source.zip'), 'different archive bytes');
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).rejects.toThrow();
  });
  it('実Compilerの草稿一致から全原本bindingまで検証しても公開許可を返さない', async () => {
    const f = await fixture(true);
    await writeFile(
      path.join(f.root, resolveDraftReleaseCourseContract('tailwind').qualityPath),
      JSON.stringify(f.record),
    );
    await expect(
      checkDraftReleaseCandidate(f.root, f.dist, f.evidence, 'tailwind'),
    ).resolves.toMatchObject({
      status: 'draft-candidate-verified',
      publicationAuthorized: false,
      lessonsReviewed: 5,
      candidate: f.candidate,
    });
  });

  it('実候補の未commit Product変更を品質記録のhash一致で隠さない', async () => {
    const f = await fixture(true);
    await writeFile(
      path.join(f.root, resolveDraftReleaseCourseContract('tailwind').qualityPath),
      JSON.stringify(f.record),
    );
    await writeFile(
      path.join(f.root, 'src/features/learning/control.ts'),
      'export const state = 3;',
    );
    await expect(
      checkDraftReleaseCandidate(f.root, f.dist, f.evidence, 'tailwind'),
    ).rejects.toThrow(/Product入力/u);
  });
  it('宣言済み品質metadataだけのcommit後も元Product Sourceを保持できる', async () => {
    const f = await fixture();
    const contract = resolveDraftReleaseCourseContract('tailwind');
    await mkdir(path.dirname(path.join(f.root, contract.qualityPath)), { recursive: true });
    await writeFile(path.join(f.root, contract.qualityPath), 'status: draft\n');
    await git(f.root, ['add', '.']);
    await git(f.root, ['commit', '-m', 'quality metadata only']);
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).resolves.toBeUndefined();
  });
  it.each([
    ['tailwind', 5],
    ['python-practice', 5],
    ['python-oop', 9],
  ] as const)('%sの固定契約を準備しても公開allowlistへ登録しない', (courseId, count) => {
    expect(resolveDraftReleaseCourseContract(courseId).lessonIds).toHaveLength(count);
    expect(ReleaseCourseIdSchema.safeParse(courseId).success).toBe(false);
  });

  it.each(['共有context', '作者CUA', 'code担当CUA', '元tree偽装', 'root外参照', 'symlink原本'])(
    '%sは独立照合の形だけを更新しても受理しない',
    async (kind) => {
      const f = await fixture();
      const observation = JSON.parse(
        await readFile(path.join(f.evidence, 'usability.json'), 'utf8'),
      ) as Record<string, unknown>;
      if (kind === '共有context') observation.contextSharing = 'not-applicable';
      if (kind === '作者CUA') observation.actor = f.record.author;
      if (kind === 'code担当CUA') observation.actor = 'reviewer-0';
      if (kind === '元tree偽装') observation.sourceTree = 'f'.repeat(40);
      if (kind === 'root外参照')
        observation.rawReports = [{ path: '../outside.json', sha256: 'f'.repeat(64) }];
      if (kind === 'symlink原本') {
        await writeFile(path.join(f.evidence, 'target.json'), 'outside');
        await symlink(path.join(f.evidence, 'target.json'), path.join(f.evidence, 'symlink.json'));
        observation.rawReports = [{ path: 'symlink.json', sha256: sha256Text('outside') }];
      }
      f.record.observations[1] = await reference(f.evidence, 'usability.json', observation);
      await f.refreshOriginalsReview();
      await expect(
        verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
      ).rejects.toThrow();
    },
  );

  it('code reviewと原本照合の自己承認を拒否する', async () => {
    const f = await fixture();
    const review = JSON.parse(
      await readFile(path.join(f.evidence, 'code-0.json'), 'utf8'),
    ) as Record<string, unknown>;
    review.actor = f.record.author;
    f.record.codeReviews[0] = await reference(f.evidence, 'code-0.json', review);
    await f.refreshOriginalsReview();
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).rejects.toThrow(/独立code/u);
    await f.refreshReview();
    const originals = JSON.parse(
      await readFile(path.join(f.evidence, 'originals-review.json'), 'utf8'),
    ) as Record<string, unknown>;
    originals.reviewer = f.record.author;
    f.record.originalsReview = await reference(f.evidence, 'originals-review.json', originals);
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).rejects.toThrow(/独立原本照合/u);
  });
  it('同Courseの他Lesson・revision変更で未変更Lessonの実行入力を失効させない', async () => {
    const f = await fixture();
    const contract = resolveDraftReleaseCourseContract('tailwind');
    const first = [contract.lessonIds[0]];
    const before = await hashDraftQualityInputs(
      f.root,
      f.candidate.sourceCommit,
      'tailwind',
      'runtime',
      first,
    );
    await writeFile(
      path.join(f.root, contract.sourceRoot, 'course.yaml'),
      'schemaVersion: 1\nid: tailwind\nrunnerId: tailwind\nvalidatorId: html-css\nrevision: 2026-10-15.2\n',
    );
    const last = contract.lessonIds.at(-1)!;
    await writeFile(
      path.join(
        f.root,
        contract.sourceRoot,
        'chapters',
        last.replace(/-l\d+$/u, ''),
        'lessons',
        last,
        'exercises',
        `${last}-e01`,
        'starter/index.html',
      ),
      '<p>changed</p>',
    );
    await git(f.root, ['add', '.']);
    await git(f.root, ['commit', '-m', 'change another lesson']);
    const after = await git(f.root, ['rev-parse', 'HEAD']);
    await expect(hashDraftQualityInputs(f.root, after, 'tailwind', 'runtime', first)).resolves.toBe(
      before,
    );
    await expect(
      hashDraftQualityInputs(f.root, after, 'tailwind', 'runtime', [last]),
    ).resolves.not.toBe(
      await hashDraftQualityInputs(f.root, f.candidate.sourceCommit, 'tailwind', 'runtime', [last]),
    );
  });
  it('元操作のSourceを保持した実file/hashと独立照合receiptを受理する', async () => {
    const f = await fixture();
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).resolves.toBeUndefined();
  });

  it.each([
    'draft',
    '公開自己申告',
    '他Course',
    '候補dist',
    '原本改変',
    '原本欠落',
    '参照重複',
    'scope不足',
    '独立review不足',
  ])('%sを拒否する', async (kind) => {
    const f = await fixture();
    const input: Record<string, unknown> = structuredClone(f.record);
    if (kind === 'draft') input.status = 'draft';
    if (kind === '公開自己申告') input.publicationAuthorized = true;
    if (kind === '他Course') input.courseId = 'python-oop';
    if (kind === '候補dist')
      input.candidate = { ...f.candidate, canonicalDistSha256: 'e'.repeat(64) };
    if (kind === '原本改変')
      await writeFile(path.join(f.evidence, 'usability-raw.json'), 'changed');
    if (kind === '原本欠落') await rm(path.join(f.evidence, 'usability-raw.json'));
    if (kind === '参照重複')
      input.observations = [...f.record.observations, f.record.observations[0]];
    if (kind === 'scope不足') input.observations = f.record.observations.slice(1);
    if (kind === '独立review不足') input.codeReviews = f.record.codeReviews.slice(1);
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, input, f.candidate),
    ).rejects.toThrow();
  });

  it('Course外教材・検査文書のcommit変更だけなら元入力を再利用する', async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, 'README.md'), 'unrelated inspection documentation');
    await mkdir(path.join(f.root, 'content/javascript'), { recursive: true });
    await writeFile(path.join(f.root, 'content/javascript/unrelated.md'), 'another course');
    await git(f.root, ['add', '.']);
    await git(f.root, ['commit', '-m', 'unrelated input']);
    f.candidate.sourceCommit = await git(f.root, ['rev-parse', 'HEAD']);
    f.candidate.sourceTree = await readDraftSourceTree(f.root, f.candidate.sourceCommit);
    await f.refreshReview();
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).resolves.toBeUndefined();
  });

  it('画面入力が変わった旧CUAを互換申告だけで再利用しない', async () => {
    const f = await fixture();
    await writeFile(
      path.join(f.root, 'src/features/learning/control.ts'),
      'export const state = 2;',
    );
    await git(f.root, ['add', '.']);
    await git(f.root, ['commit', '-m', 'changed UI input']);
    f.candidate.sourceCommit = await git(f.root, ['rev-parse', 'HEAD']);
    f.candidate.sourceTree = await readDraftSourceTree(f.root, f.candidate.sourceCommit);
    await f.refreshReview();
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).rejects.toThrow(/入力/u);
  });

  it('対象record全体または独立照合の全参照集合が違えば拒否する', async () => {
    const f = await fixture();
    const review = JSON.parse(
      await readFile(path.join(f.evidence, 'originals-review.json'), 'utf8'),
    ) as Record<string, unknown>;
    review.checkedReferences = (review.checkedReferences as unknown[]).slice(1);
    f.record.originalsReview = await reference(f.evidence, 'originals-review.json', review);
    await expect(
      verifyDraftCourseQualityEvidence(f.root, f.evidence, f.record, f.candidate),
    ).rejects.toThrow(/全参照集合/u);
    expect(hashDraftCourseQualityRecord(f.record)).toBe(
      sha256Text(
        canonicalJson(
          Object.fromEntries(Object.entries(f.record).filter(([key]) => key !== 'originalsReview')),
        ),
      ),
    );
  });
});
