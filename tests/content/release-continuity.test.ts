// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  validateReleaseMetadata,
  type ReleaseHistory,
} from '../../scripts/release/checkReleaseContinuity';
import { hashPersistentIds } from '../../scripts/release/releaseHashes';
import {
  assertPromotionDiff,
  assertPromotionLedger,
} from '../../scripts/release/verifyReleasePromotion';
import { assertDigestMatch } from '../../scripts/release/verifyReleaseApproval';
import {
  assertPublishedTagMessage,
  resolveRollbackRelease,
  verifyPublishedTag,
} from '../../scripts/release/verifyReleaseTarget';
import type { PublishedRelease } from '../../scripts/release/releaseSchema';
import { buildReleaseReport, parseReleaseReport } from '../../scripts/release/writeReleaseReport';

const execFileAsync = promisify(execFile);
const temporaryGitRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryGitRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

/** Composeから継承したGit変数を除外し、一時RepositoryでGitを実行する。 */
async function git(repositoryRoot: string, arguments_: readonly string[]): Promise<string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  const { stdout } = await execFileAsync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: environment,
  });
  return stdout.trim();
}

const migration = {
  fromRevision: '2026-07-10.1',
  toRevision: '2026-07-13.1',
  steps: [
    {
      action: 'intentionally-reset' as const,
      entity: 'lesson' as const,
      id: 'legacy-lesson',
      reason: '教材構成を更新するため',
    },
  ],
};

/** Release metadataの最小正常Fixtureを返す。 */
function history(): ReleaseHistory {
  return {
    schemaVersion: 1,
    releases: [],
    candidate: {
      revision: '2026-07-13.1',
      status: 'draft',
      verifiedSourceCommit: 'draft',
      canonicalDistSha256: 'draft',
      courseManifestSha256: 'draft',
      publicProvenanceSha256: 'draft',
      persistentIdsSha256: 'draft',
      persistentIds: ['current-lesson'],
      previousReleaseTag: null,
      tombstonedIds: ['legacy-lesson'],
      migrations: [migration],
      syntheticProgressBundlePath: 'tests/fixtures/progress/previous-release-bundle.json',
    },
  };
}

const course = {
  revision: '2026-07-13.1',
  progressMigrations: [migration],
};

/** annotated tag binding検査に使う公開済みRelease fixtureを返す。 */
function publishedRelease(): PublishedRelease {
  return {
    revision: '2026-07-12.1',
    tag: 'tsumucode-release-2026-07-12.1',
    sourceCommit: 'a'.repeat(40),
    workflowHeadCommit: '9'.repeat(40),
    canonicalDistSha256: 'b'.repeat(64),
    courseManifestSha256: 'c'.repeat(64),
    publicProvenanceSha256: 'd'.repeat(64),
    persistentIdsSha256: hashPersistentIds(['current-lesson']),
    persistentIds: ['current-lesson'],
    previousReleaseTag: null,
    tombstonedIds: [],
    migrations: [],
    syntheticProgressBundlePath: 'tests/fixtures/progress/previous-release-bundle.json',
    qualityArtifactId: '99',
    qualityArtifactDigest: `sha256:${'0'.repeat(64)}`,
    reportArtifactId: '123',
    reportArtifactDigest: `sha256:${'f'.repeat(64)}`,
    workflowRunId: '456',
    workflowRunAttempt: 2,
    pageUrl: 'https://example.github.io/tsumucode/',
    postDeployVerificationPath: 'docs/quality/post-deploy/2026-07-12.1.yaml',
    postDeployVerificationSha256: '7'.repeat(64),
  };
}

/** 公開済みRelease fixtureの完全なannotated tag messageを返す。 */
function publishedTagMessage(release: PublishedRelease): string {
  return `source=${release.sourceCommit} head=${release.workflowHeadCommit} dist=${release.canonicalDistSha256} course=${release.courseManifestSha256} provenance=${release.publicProvenanceSha256} quality_id=${release.qualityArtifactId} quality_digest=${release.qualityArtifactDigest} report_id=${release.reportArtifactId} report_digest=${release.reportArtifactDigest} workflow=${release.workflowRunId}-${String(release.workflowRunAttempt)} page_url=${release.pageUrl}`;
}

describe('release continuity metadata', () => {
  it('教材内容hashが変わったのにrevisionを据え置く候補を拒否する', () => {
    const fixture = history();
    fixture.releases.push({
      revision: '2026-07-13.1',
      tag: 'tsumucode-release-2026-07-13.1',
      sourceCommit: 'a'.repeat(40),
      workflowHeadCommit: '9'.repeat(40),
      canonicalDistSha256: 'a'.repeat(64),
      courseManifestSha256: 'a'.repeat(64),
      publicProvenanceSha256: 'a'.repeat(64),
      persistentIdsSha256: hashPersistentIds(['current-lesson']),
      persistentIds: ['current-lesson'],
      previousReleaseTag: null,
      tombstonedIds: [],
      migrations: [],
      syntheticProgressBundlePath: 'tests/fixtures/progress/previous-release-bundle.json',
      qualityArtifactId: '1',
      qualityArtifactDigest: `sha256:${'a'.repeat(64)}`,
      reportArtifactId: '1',
      reportArtifactDigest: `sha256:${'a'.repeat(64)}`,
      workflowRunId: '1',
      workflowRunAttempt: 1,
      pageUrl: 'https://example.github.io/tsumucode/',
      postDeployVerificationPath: 'docs/quality/post-deploy/2026-07-13.1.yaml',
      postDeployVerificationSha256: '7'.repeat(64),
    });

    expect(() => {
      validateReleaseMetadata({
        history: fixture,
        course,
        currentCourseManifestSha256: 'b'.repeat(64),
        currentPersistentIds: ['current-lesson'],
        releaseTags: ['tsumucode-release-2026-07-13.1'],
        mode: 'quality-only',
      });
    }).toThrow(/revision/iu);
  });

  it('削除IDに移行宣言がない候補を拒否する', () => {
    const fixture = history();
    fixture.releases.push({
      revision: '2026-07-12.1',
      tag: 'tsumucode-release-2026-07-12.1',
      sourceCommit: 'a'.repeat(40),
      workflowHeadCommit: '9'.repeat(40),
      canonicalDistSha256: 'a'.repeat(64),
      courseManifestSha256: 'b'.repeat(64),
      publicProvenanceSha256: 'a'.repeat(64),
      persistentIdsSha256: hashPersistentIds(['removed-without-declaration']),
      persistentIds: ['removed-without-declaration'],
      previousReleaseTag: null,
      tombstonedIds: [],
      migrations: [],
      syntheticProgressBundlePath: 'tests/fixtures/progress/previous-release-bundle.json',
      qualityArtifactId: '1',
      qualityArtifactDigest: `sha256:${'a'.repeat(64)}`,
      reportArtifactId: '1',
      reportArtifactDigest: `sha256:${'a'.repeat(64)}`,
      workflowRunId: '1',
      workflowRunAttempt: 1,
      pageUrl: 'https://example.github.io/tsumucode/',
      postDeployVerificationPath: 'docs/quality/post-deploy/2026-07-12.1.yaml',
      postDeployVerificationSha256: '7'.repeat(64),
    });

    expect(() => {
      validateReleaseMetadata({
        history: fixture,
        course,
        currentCourseManifestSha256: 'b'.repeat(64),
        currentPersistentIds: ['current-lesson'],
        releaseTags: ['tsumucode-release-2026-07-12.1'],
        mode: 'quality-only',
      });
    }).toThrow(/移行宣言/iu);
  });

  it('公開CourseとRelease Historyのmigration不一致を拒否する', () => {
    const fixture = history();
    fixture.candidate.migrations = [];

    expect(() => {
      validateReleaseMetadata({
        history: fixture,
        course,
        currentCourseManifestSha256: 'b'.repeat(64),
        currentPersistentIds: ['current-lesson'],
        releaseTags: [],
        mode: 'quality-only',
      });
    }).toThrow(/migration/iu);
  });

  it('tombstone IDの再利用を拒否する', () => {
    expect(() => {
      validateReleaseMetadata({
        history: history(),
        course,
        currentCourseManifestSha256: 'b'.repeat(64),
        currentPersistentIds: ['current-lesson', 'legacy-lesson'],
        releaseTags: [],
        mode: 'quality-only',
      });
    }).toThrow(/tombstone/iu);
  });

  it('map-to元IDにtombstoneがない候補を拒否する', () => {
    const fixture = history();
    fixture.candidate.migrations = [
      {
        fromRevision: '2026-07-10.1',
        toRevision: '2026-07-13.1',
        steps: [
          {
            action: 'map-to',
            entity: 'lesson',
            fromId: 'legacy-lesson',
            toId: 'current-lesson',
          },
        ],
      },
    ];
    fixture.candidate.tombstonedIds = [];
    const mappedCourse = {
      revision: course.revision,
      progressMigrations: fixture.candidate.migrations,
    };

    expect(() => {
      validateReleaseMetadata({
        history: fixture,
        course: mappedCourse,
        currentCourseManifestSha256: 'b'.repeat(64),
        currentPersistentIds: ['current-lesson'],
        releaseTags: [],
        mode: 'quality-only',
      });
    }).toThrow(/tombstone/iu);
  });

  it('map-to先IDが現行Courseにない候補を拒否する', () => {
    const fixture = history();
    fixture.candidate.migrations = [
      {
        fromRevision: '2026-07-10.1',
        toRevision: '2026-07-13.1',
        steps: [
          {
            action: 'map-to',
            entity: 'lesson',
            fromId: 'legacy-lesson',
            toId: 'missing-current-lesson',
          },
        ],
      },
    ];
    const mappedCourse = {
      revision: course.revision,
      progressMigrations: fixture.candidate.migrations,
    };

    expect(() => {
      validateReleaseMetadata({
        history: fixture,
        course: mappedCourse,
        currentCourseManifestSha256: 'b'.repeat(64),
        currentPersistentIds: ['current-lesson'],
        releaseTags: [],
        mode: 'quality-only',
      });
    }).toThrow(/map-to.*現行/iu);
  });

  it('Release tagがあるのに台帳が空の状態を拒否する', () => {
    expect(() => {
      validateReleaseMetadata({
        history: history(),
        course,
        currentCourseManifestSha256: 'b'.repeat(64),
        currentPersistentIds: ['current-lesson'],
        releaseTags: ['tsumucode-release-2026-07-13.1'],
        mode: 'quality-only',
      });
    }).toThrow(/tag/iu);
  });

  it('promote対象tagに加えて未登録tagがある状態を拒否する', () => {
    expect(() => {
      validateReleaseMetadata({
        history: history(),
        course,
        currentCourseManifestSha256: 'b'.repeat(64),
        currentPersistentIds: ['current-lesson'],
        releaseTags: ['tsumucode-release-2026-07-13.1', 'tsumucode-release-2026-07-14.1'],
        mode: 'promote',
      });
    }).toThrow(/登録されていません/iu);
  });

  it('公開Releaseのrevision/tag/source重複とchain改変を拒否する', () => {
    const fixture = history();
    const release = publishedRelease();
    fixture.releases = [release, { ...release, sourceCommit: '8'.repeat(40) }];
    fixture.candidate.previousReleaseTag = release.tag;

    expect(() => {
      validateReleaseMetadata({
        history: fixture,
        course,
        currentCourseManifestSha256: release.courseManifestSha256,
        currentPersistentIds: ['current-lesson'],
        releaseTags: [release.tag],
        mode: 'quality-only',
      });
    }).toThrow(/重複/iu);
  });

  it('手動品質記録のstale hashを拒否する', () => {
    expect(() => {
      assertDigestMatch('visual-review.md', 'a'.repeat(64), 'b'.repeat(64));
    }).toThrow(/visual-review/iu);
  });

  it('公開台帳へ未登録のrollback SHAを拒否する', () => {
    expect(() => {
      resolveRollbackRelease(history(), 'a'.repeat(40));
    }).toThrow(/rollback/iu);
  });

  it('同じsource SHAが重複する公開台帳をrollback対象にしない', () => {
    const fixture = history();
    const release = publishedRelease();
    fixture.releases = [release, { ...release, tag: 'tsumucode-release-2026-07-13.1' }];

    expect(() => {
      resolveRollbackRelease(fixture, release.sourceCommit);
    }).toThrow(/rollback/iu);
  });

  it('annotated tag messageのsource・Artifact・Report・Workflow不一致を拒否する', () => {
    const release = publishedRelease();
    const message = publishedTagMessage(release);

    expect(() => {
      assertPublishedTagMessage(release, message);
    }).not.toThrow();
    expect(() => {
      assertPublishedTagMessage(release, message.replace('report_id=123', 'report_id=999'));
    }).toThrow(/report_id/iu);
    expect(() => {
      assertPublishedTagMessage(release, message.replace('quality_id=99', 'quality_id=98'));
    }).toThrow(/quality_id/iu);
  });

  it('一時Git Repositoryのannotated tag object・target・messageを実検証する', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tsumucode-release-tag-'));
    temporaryGitRoots.push(root);
    await git(root, ['init']);
    await git(root, ['config', 'user.name', 'TsumuCode Test']);
    await git(root, ['config', 'user.email', 'test@example.invalid']);
    await writeFile(path.join(root, 'README.md'), 'release fixture\n');
    await git(root, ['add', 'README.md']);
    await git(root, ['commit', '-m', 'Release fixture']);
    const sourceCommit = await git(root, ['rev-parse', 'HEAD']);
    const release = {
      ...publishedRelease(),
      sourceCommit,
      workflowHeadCommit: sourceCommit,
    };
    await git(root, [
      'tag',
      '--annotate',
      release.tag,
      '--message',
      publishedTagMessage(release),
      release.sourceCommit,
    ]);

    const inheritedGitDirectory = process.env['GIT_DIR'];
    const inheritedWorkTree = process.env['GIT_WORK_TREE'];
    process.env['GIT_DIR'] = path.join(root, '.git');
    process.env['GIT_WORK_TREE'] = root;
    try {
      await expect(verifyPublishedTag(root, release)).resolves.toBeUndefined();
      await expect(
        verifyPublishedTag(root, { ...release, reportArtifactId: '999' }),
      ).rejects.toThrow(/report_id/iu);
    } finally {
      if (inheritedGitDirectory === undefined) Reflect.deleteProperty(process.env, 'GIT_DIR');
      else process.env['GIT_DIR'] = inheritedGitDirectory;
      if (inheritedWorkTree === undefined) Reflect.deleteProperty(process.env, 'GIT_WORK_TREE');
      else process.env['GIT_WORK_TREE'] = inheritedWorkTree;
    }
  });

  it('Promotionは未追跡Productを拒否し、未追跡の品質記録だけを許可する', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tsumucode-release-promotion-diff-'));
    temporaryGitRoots.push(root);
    await git(root, ['init']);
    await git(root, ['config', 'user.name', 'TsumuCode Test']);
    await git(root, ['config', 'user.email', 'test@example.invalid']);
    await writeFile(path.join(root, 'README.md'), 'release fixture\n');
    await git(root, ['add', 'README.md']);
    await git(root, ['commit', '-m', 'Release fixture']);
    const sourceCommit = await git(root, ['rev-parse', 'HEAD']);
    const inheritedGitDirectory = process.env['GIT_DIR'];
    const inheritedWorkTree = process.env['GIT_WORK_TREE'];
    process.env['GIT_DIR'] = path.join(root, '.git');
    process.env['GIT_WORK_TREE'] = root;
    try {
      await mkdir(path.join(root, 'src'));
      await writeFile(
        path.join(root, 'src', 'untracked-product.ts'),
        'export const unsafe = true;\n',
      );
      await expect(assertPromotionDiff(root, sourceCommit)).rejects.toThrow(
        /PromotionにProduct変更を含められません.*src\/untracked-product\.ts/iu,
      );

      await rm(path.join(root, 'src'), { recursive: true });
      await mkdir(path.join(root, 'docs', 'quality'), { recursive: true });
      await writeFile(path.join(root, 'docs', 'quality', 'evidence.md'), 'quality evidence\n');
      await expect(assertPromotionDiff(root, sourceCommit)).resolves.toBeUndefined();
    } finally {
      if (inheritedGitDirectory === undefined) Reflect.deleteProperty(process.env, 'GIT_DIR');
      else process.env['GIT_DIR'] = inheritedGitDirectory;
      if (inheritedWorkTree === undefined) Reflect.deleteProperty(process.env, 'GIT_WORK_TREE');
      else process.env['GIT_WORK_TREE'] = inheritedWorkTree;
    }
  });

  it('承認済みcandidate 1件とRelease Reportだけを公開台帳へ昇格する', () => {
    const approved = history();
    approved.candidate = {
      ...approved.candidate,
      status: 'approved',
      verifiedSourceCommit: 'a'.repeat(40),
      canonicalDistSha256: 'b'.repeat(64),
      courseManifestSha256: 'c'.repeat(64),
      publicProvenanceSha256: 'd'.repeat(64),
      persistentIdsSha256: hashPersistentIds(['current-lesson']),
    };
    const release: PublishedRelease = {
      revision: approved.candidate.revision,
      tag: `tsumucode-release-${approved.candidate.revision}`,
      sourceCommit: 'a'.repeat(40),
      workflowHeadCommit: '9'.repeat(40),
      canonicalDistSha256: 'b'.repeat(64),
      courseManifestSha256: 'c'.repeat(64),
      publicProvenanceSha256: 'd'.repeat(64),
      persistentIdsSha256: hashPersistentIds(['current-lesson']),
      persistentIds: ['current-lesson'],
      previousReleaseTag: null,
      tombstonedIds: ['legacy-lesson'],
      migrations: [migration],
      syntheticProgressBundlePath: 'tests/fixtures/progress/previous-release-bundle.json',
      qualityArtifactId: '99',
      qualityArtifactDigest: `sha256:${'e'.repeat(64)}`,
      reportArtifactId: '123',
      reportArtifactDigest: `sha256:${'f'.repeat(64)}`,
      workflowRunId: '456',
      workflowRunAttempt: 2,
      pageUrl: 'https://example.github.io/tsumucode/',
      postDeployVerificationPath: 'docs/quality/post-deploy/2026-07-13.1.yaml',
      postDeployVerificationSha256: '7'.repeat(64),
    };
    const promoted: ReleaseHistory = {
      schemaVersion: 1,
      releases: [release],
      candidate: {
        ...approved.candidate,
        status: 'draft',
        verifiedSourceCommit: 'draft',
        canonicalDistSha256: 'draft',
        courseManifestSha256: 'draft',
        publicProvenanceSha256: 'draft',
        persistentIdsSha256: 'draft',
        persistentIds: [],
        previousReleaseTag: release.tag,
      },
    };
    const report = parseReleaseReport(
      buildReleaseReport({
        sourceSha: release.sourceCommit,
        workflowHeadSha: release.workflowHeadCommit,
        releaseMode: 'candidate',
        artifactDigest: release.canonicalDistSha256,
        courseHash: release.courseManifestSha256,
        provenanceHash: release.publicProvenanceSha256,
        qualityArtifactId: release.qualityArtifactId,
        qualityArtifactDigest: release.qualityArtifactDigest,
        workflowRunId: release.workflowRunId,
        workflowRunAttempt: String(release.workflowRunAttempt),
        pageUrl: release.pageUrl,
      }),
    );

    expect(assertPromotionLedger(approved, promoted, report)).toEqual(release);
    expect(() => {
      assertPromotionLedger(approved, { ...promoted, releases: [] }, report);
    }).toThrow(/1件/iu);
  });
});
