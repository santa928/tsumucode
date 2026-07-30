# TsumuCode 身内向けβ公開 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正式Releaseの手動承認基準を維持したまま、最新`main`の全自動品質Gate済みArtifactを身内向けβとしてGitHub Pagesへ公開できるようにする。

**Architecture:** `release:target`へ正式版と分離した`beta` Modeを追加し、入力SHA、workflow HEAD、実checkout HEADの完全一致を純粋HelperとCLIで強制する。Pages workflowは既存の全品質JobとDeploy Jobを共有するが、正式Approval binding、annotated tag、Release台帳更新は`candidate`だけに限定する。画面は共通の小さな`BetaBadge`を既存Brand行内へ置き、学習Viewportの高さを変えない。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Vitest 4、Playwright 1.61、GitHub Actions、GitHub Pages、Docker Compose

## Global Constraints

- 開発・test・buildコマンドは`./scripts/docker-compose.sh`経由でDocker内だけで実行する。
- `candidate`の初心者観察、Release Approval、Artifact binding、annotated tag、Release台帳の要件を変更しない。
- βでもContent provenance、独立Lesson review、Compile、Continuity、Lint、Typecheck、Unit、3 Engine E2E、axe、Performance、Lighthouse、Static Artifactをすべて通す。
- β対象はdispatch時点の最新`main` SHA、workflow HEAD、checkout HEADの完全一致を必須にする。
- βDeployでは正式Release tagと`content/html-css/release-history.yaml`のRelease追加を行わない。
- `BetaBadge`は画像、追加Network request、新規JavaScript chunkを使わず、Header／Tool Railの高さを増やさない。
- LCP 2,500 ms以下、CLS 0.1以下、主要操作200 ms以下、Preview p95 500 ms以下、判定p95 300 ms以下、下書き永続化500 ms以下、Home初期JavaScript gzip 256,000 bytes以下を維持する。

---

## File map

- `scripts/release/verifyReleaseTarget.ts`: `beta`を含む公開対象ModeとSHA一致検証を所有する。
- `scripts/release/writeReleaseReport.ts`: βを含むDeploy evidence reportのschemaとserializationを所有する。
- `tests/content/release-report.test.ts`: target output、βtarget、Deploy reportのunit testを所有する。
- `.github/workflows/pages.yml`: dispatch入力、品質Job、Deploy、正式tag Jobの条件を所有する。
- `tests/pages-workflow.test.ts`: workflowの権限、分岐、全Gate共有を静的検証する。
- `src/design-system/components/BetaBadge.tsx`: 「β／ベータ版」の見た目とAccessible Nameを一元化する。
- `src/design-system/components/components.test.tsx`: Badge primitiveの表示とAccessibilityを検証する。
- `src/app/AppShell.tsx`: 通常学習のGlobal HeaderへBadgeを配置する。
- `src/app/AppShell.test.tsx`: Global HeaderのBrandとBadgeを検証する。
- `src/features/library/LibraryShell.tsx`: 閲覧目次HeaderへBadgeを配置する。
- `src/features/library/LibraryShell.test.tsx`: 閲覧目次HeaderのBrandとBadgeを検証する。
- `src/features/learning/layout/LearningToolRail.tsx`: Slide／Exerciseの省スペースBrandへBadgeを配置する。
- `src/features/learning/layout/LearningToolRail.test.tsx`: 学習Tool RailのBrandとBadgeを検証する。
- `tests/e2e/responsive-layout.spec.ts`: Badge境界、Tool Rail高、Document scroll不変を数値検証する。
- `README.md`: βと正式Releaseの公開手順、保証範囲、昇格条件を記載する。

### Task 1: βRelease targetとReport schema

**Files:**

- Modify: `tests/content/release-report.test.ts`
- Modify: `scripts/release/verifyReleaseTarget.ts`
- Modify: `scripts/release/writeReleaseReport.ts`

**Interfaces:**

- Produces: `ReleaseMode = 'candidate' | 'beta' | 'rollback'`
- Produces: `resolveBetaTarget(sourceSha: string, workflowHeadSha: string, checkoutHeadSha: string): ResolvedReleaseTarget`
- Produces: `buildReleaseReport(input)`／`parseReleaseReport(source)`が`releaseMode: 'beta'`を往復する。

- [ ] **Step 1: βtargetとReportの失敗testを書く**

`tests/content/release-report.test.ts`へ次を追加する。

```ts
import {
  resolveBetaTarget,
  serializeReleaseTargetOutput,
} from '../../scripts/release/verifyReleaseTarget';

it('最新mainとcheckoutが一致するSHAだけをbeta targetにする', () => {
  expect(resolveBetaTarget(sha, sha, sha)).toMatchObject({
    checkoutSha: sha,
    verifiedSourceCommit: sha,
    releaseMode: 'beta',
    revision: 'beta',
  });
});

it.each([
  ['dispatch', 'b'.repeat(40), sha, sha],
  ['checkout', sha, sha, 'b'.repeat(40)],
] as const)('%s SHAが一致しないbeta targetを拒否する', (_label, source, workflow, checkout) => {
  expect(() => resolveBetaTarget(source, workflow, checkout)).toThrow(/beta.*SHA/iu);
});

it('beta Deploy reportをSourceと品質Artifactへ結び付ける', () => {
  const report = buildReleaseReport({
    sourceSha: sha,
    workflowHeadSha: sha,
    releaseMode: 'beta',
    artifactDigest: digest,
    courseHash: 'c'.repeat(64),
    provenanceHash: 'd'.repeat(64),
    qualityArtifactId: '123',
    qualityArtifactDigest: `sha256:${'e'.repeat(64)}`,
    workflowRunId: '456',
    workflowRunAttempt: '1',
    pageUrl: 'https://example.github.io/tsumucode/',
  });

  expect(parseReleaseReport(report)).toMatchObject({
    sourceSha: sha,
    workflowHeadSha: sha,
    releaseMode: 'beta',
  });
});
```

- [ ] **Step 2: 対象unit testが期待どおり失敗することをDockerで確認する**

Run:

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- tests/content/release-report.test.ts
```

Expected: `resolveBetaTarget`未export、または`beta`がschemaで拒否されてFAIL。

- [ ] **Step 3: βtargetの最小実装を書く**

`scripts/release/verifyReleaseTarget.ts`へ次の境界を実装する。

```ts
export type ReleaseMode = 'candidate' | 'beta' | 'rollback';

/** 最新main、workflow、checkoutが同一のβSourceだけをDeploy対象へ変換する。 */
export function resolveBetaTarget(
  sourceShaInput: string,
  workflowHeadShaInput: string,
  checkoutHeadShaInput: string,
): ResolvedReleaseTarget {
  const sourceSha = CommitShaSchema.parse(sourceShaInput);
  const workflowHeadSha = CommitShaSchema.parse(workflowHeadShaInput);
  const checkoutHeadSha = CommitShaSchema.parse(checkoutHeadShaInput);
  if (sourceSha !== workflowHeadSha) {
    throw new Error('beta source SHAが最新mainのworkflow SHAと一致しません');
  }
  if (checkoutHeadSha !== workflowHeadSha) {
    throw new Error('beta checkout SHAがworkflow SHAと一致しません');
  }
  return {
    checkoutSha: sourceSha,
    verifiedSourceCommit: sourceSha,
    releaseMode: 'beta',
    revision: 'beta',
    canonicalDistSha256: '',
    courseManifestSha256: '',
    publicProvenanceSha256: '',
  };
}
```

`verifyReleaseTarget()`は最初に`git rev-parse HEAD`を取得し、`mode === 'beta'`ならRelease ApprovalやRelease Historyを読む前に`resolveBetaTarget()`を返す。CLIのallowlistも`candidate / beta / rollback`へ更新する。

`scripts/release/writeReleaseReport.ts`のMode schemaを次へ更新する。

```ts
const releaseMode = z.enum(['candidate', 'beta', 'rollback']).parse(input.releaseMode);
```

- [ ] **Step 4: 対象unit testを通す**

Run:

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- tests/content/release-report.test.ts
```

Expected: 対象fileが全件PASS。

- [ ] **Step 5: target／report実装をコミットする**

```bash
git add scripts/release/verifyReleaseTarget.ts scripts/release/writeReleaseReport.ts tests/content/release-report.test.ts
git -c user.name=santa928 -c user.email=38289324+santa928@users.noreply.github.com commit -m "機能: ベータ公開対象を厳密に解決"
```

### Task 2: GitHub Pages βworkflow

**Files:**

- Modify: `tests/pages-workflow.test.ts`
- Modify: `.github/workflows/pages.yml`
- Modify: `README.md`

**Interfaces:**

- Consumes: `release:target -- --mode beta --source-sha "$SOURCE_SHA" --workflow-head-sha "$SOURCE_SHA"`
- Consumes: `release:report -- --release-mode beta`
- Produces: `workflow_dispatch.inputs.release_mode.options = [candidate, beta, rollback]`

- [ ] **Step 1: βworkflow分岐の失敗testを書く**

`tests/pages-workflow.test.ts`の`WorkflowStep`へ`readonly if?: string`を追加し、次を検証する。

```ts
expect(parsed.on).toHaveProperty('workflow_dispatch.inputs.release_mode.options', [
  'candidate',
  'beta',
  'rollback',
]);

it('betaは全品質Gateを共有し正式Approvalとtag記録だけを実行しない', () => {
  const { parsed, source } = workflow();
  const qualitySteps = parsed.jobs?.quality?.steps ?? [];
  const betaContinuity = qualitySteps.find(
    ({ name }) => name === 'Release continuity for beta deploy',
  );
  const candidateBinding = qualitySteps.find(
    ({ name }) => name === 'Bind candidate Artifact to approval',
  );

  expect(betaContinuity?.if).toContain("needs.resolve.outputs.release_mode == 'beta'");
  expect(betaContinuity?.run).toContain('release:continuity -- --quality-only');
  expect(candidateBinding?.if).toBe("needs.resolve.outputs.release_mode == 'candidate'");
  expect(parsed.jobs?.record_release?.if).toContain("inputs.release_mode == 'candidate'");
  expect(source).toContain('npm run test:e2e');
  expect(source).toContain('npm run test:performance');
  expect(source).toContain('npm run test:lighthouse');
});
```

- [ ] **Step 2: workflow静的testが期待どおり失敗することをDockerで確認する**

Run:

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- tests/pages-workflow.test.ts
```

Expected: `beta` option／continuity stepがなくFAIL。

- [ ] **Step 3: workflowへβ分岐を実装する**

`.github/workflows/pages.yml`を次の方針で更新する。

```yaml
release_mode:
  description: 正式候補、身内向けβ、公開済みReleaseへのrollback
  type: choice
  options: [candidate, beta, rollback]
```

`resolve`は既存`release:target`へ`RELEASE_MODE=beta`をそのまま渡す。`quality`へ次を追加し、他の自動GateとDeploy／Reportは共有する。

```yaml
- name: Release continuity for beta deploy
  if: needs.resolve.outputs.release_mode == 'beta'
  run: ./scripts/docker-compose.sh run --rm app npm run release:continuity -- --quality-only
```

`Bind candidate Artifact to approval`と`record_release`は既存どおり`candidate`限定を維持する。

`README.md`のGitHub Pages節へ次を追加する。

```bash
SOURCE_SHA="$(git rev-parse origin/main)"
gh workflow run "TsumuCode Pages" --ref main -f source_sha="$SOURCE_SHA" -f release_mode=beta -f deploy=true
```

βは全自動Gateを共有するが、初心者全コース観察済みを主張せず、正式tag／台帳を作らないことを明記する。

- [ ] **Step 4: workflowとReportの対象testを通す**

Run:

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- tests/pages-workflow.test.ts tests/content/release-report.test.ts
```

Expected: 対象2 fileが全件PASS。

- [ ] **Step 5: workflowと運用文書をコミットする**

```bash
git add .github/workflows/pages.yml tests/pages-workflow.test.ts README.md
git -c user.name=santa928 -c user.email=38289324+santa928@users.noreply.github.com commit -m "公開: ベータ用Pages経路を追加"
```

### Task 3: 高さを増やさないβ表示

**Files:**

- Create: `src/design-system/components/BetaBadge.tsx`
- Modify: `src/design-system/components/components.test.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/AppShell.test.tsx`
- Modify: `src/features/library/LibraryShell.tsx`
- Modify: `src/features/library/LibraryShell.test.tsx`
- Modify: `src/features/learning/layout/LearningToolRail.tsx`
- Modify: `src/features/learning/layout/LearningToolRail.test.tsx`
- Modify: `tests/e2e/responsive-layout.spec.ts`

**Interfaces:**

- Produces: `BetaBadge(): JSX.Element`
- Accessible Name: `ベータ版`
- Semantic role: `img`（状態変化を通知するlive regionではない）
- Visible text: `β`

- [ ] **Step 1: Badge primitiveとShell配置の失敗testを書く**

`src/design-system/components/components.test.tsx`へ次を追加する。

```tsx
import { BetaBadge } from './BetaBadge';

it('BetaBadgeは短い表示とベータ版のAccessible Nameを両立する', () => {
  render(<BetaBadge />);
  expect(screen.getByRole('img', { name: 'ベータ版' })).toHaveTextContent('β');
});
```

`AppShell.test.tsx`、`LibraryShell.test.tsx`、`LearningToolRail.test.tsx`のBrand表示testへ次を追加する。

```ts
expect(screen.getByLabelText('ベータ版')).toBeVisible();
```

`tests/e2e/responsive-layout.spec.ts`のSlide Tool Rail testへ次を追加する。

```ts
const betaBadge = page.locator('[aria-label="ベータ版"]');
await expect(betaBadge).toBeVisible();
const badgeRect = await rectangle(betaBadge);
const brandRect = await rectangle(brand);
expect(badgeRect.top).toBeGreaterThanOrEqual(brandRect.top - 0.5);
expect(badgeRect.bottom).toBeLessThanOrEqual(brandRect.bottom + 0.5);
expect(badgeRect.right).toBeLessThanOrEqual(brandRect.right + 0.5);
```

- [ ] **Step 2: component testが期待どおり失敗することをDockerで確認する**

Run:

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/design-system/components/components.test.tsx src/app/AppShell.test.tsx src/features/library/LibraryShell.test.tsx src/features/learning/layout/LearningToolRail.test.tsx
```

Expected: `BetaBadge`未作成、またはShellにBadgeがなくFAIL。

- [ ] **Step 3: Badgeと3つのBrand配置を実装する**

`src/design-system/components/BetaBadge.tsx`を作る。

```tsx
/** 正式版と誤認させず、Brand行の高さを増やさない短いβ表示を返す。 */
export function BetaBadge() {
  return (
    <span
      role="img"
      aria-label="ベータ版"
      className="inline-flex shrink-0 items-center rounded-workshop-piece border border-workshop-border bg-workshop-learning px-1.5 py-0.5 text-[0.625rem] font-black leading-none text-workshop-ink"
    >
      β
    </span>
  );
}
```

`AppShell.tsx`と`LibraryShell.tsx`はBrand文字を次のinline wrapperにする。

```tsx
<span className="inline-flex items-center gap-2 text-xl">
  TsumuCode
  <BetaBadge />
</span>
```

Brand linkへ`aria-label="TsumuCodeホームへ（ベータ版）"`を付け、Link自体のAccessible Nameでもβ版であることを明示する。`BetaBadge`は非liveの`role="img"`であり、画面表示時に不要な状態通知を発生させない。

`LearningToolRail.tsx`は既存の最後のBrand label `span`内へ`BetaBadge`を置く。既存CSSの`.tc-learning-tool-brand > span:last-child`が低幅時にlabelとBadgeを一緒に隠すため、新しい縦領域を作らない。

- [ ] **Step 4: component testと代表Layout E2Eを通す**

Run:

```bash
./scripts/docker-compose.sh run --rm app npm run test:run -- src/design-system/components/components.test.tsx src/app/AppShell.test.tsx src/features/library/LibraryShell.test.tsx src/features/learning/layout/LearningToolRail.test.tsx
./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:e2e -- tests/e2e/responsive-layout.spec.ts --project=chromium --retries=0
```

Expected: component test全件PASS。代表viewportでTool Rail 52px以下、BadgeがBrand境界内、Document scrollなし。

- [ ] **Step 5: β表示をコミットする**

```bash
git add src/design-system/components/BetaBadge.tsx src/design-system/components/components.test.tsx src/app/AppShell.tsx src/app/AppShell.test.tsx src/features/library/LibraryShell.tsx src/features/library/LibraryShell.test.tsx src/features/learning/layout/LearningToolRail.tsx src/features/learning/layout/LearningToolRail.test.tsx tests/e2e/responsive-layout.spec.ts
git -c user.name=santa928 -c user.email=38289324+santa928@users.noreply.github.com commit -m "表示: ベータ版ラベルを追加"
```

### Task 4: 完全な公開前検証

**Files:**

- Verify only: repository working tree and canonical `dist/`

**Interfaces:**

- Consumes: Tasks 1–3のcommits
- Produces: 公開対象SHAに対するDocker品質証跡

- [ ] **Step 1: Source全体の静的検査とunit testを実行する**

```bash
./scripts/docker-compose.sh build app
./scripts/docker-compose.sh run --rm app npm run check
./scripts/docker-compose.sh run --rm app npm run format:check
```

Expected: Content、Lint、Typecheck、Unit、Build、Chunk smoke、FormatがすべてPASS。

- [ ] **Step 2: canonical subpathの全Browser／Accessibility Journeyを実行する**

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run build
./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:e2e -- --retries=0
```

Expected: Chromium、Firefox、WebKitの全必須testがPASSし、retry／flaky 0。

- [ ] **Step 3: Performance、Lighthouse、Static Artifactを実行する**

```bash
./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:performance
./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:lighthouse
./scripts/docker-compose.sh run --rm app npm run release:check
./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run smoke:subpath
```

Expected: 既存性能予算、12 Lighthouse、静的Artifact、subpath smokeがすべてPASS。

- [ ] **Step 4: 差分・working tree・commit identityを確認する**

```bash
git diff --check
git status --short --branch
git log --format=fuller origin/main..HEAD
```

Expected: 未commit差分なし。公開範囲のcommit author／committerにホスト名メールなし。

### Task 5: main反映とGitHub Pages β公開

**Files:**

- External state: `origin/main`
- External state: GitHub Actions `TsumuCode Pages`
- External state: `https://santa928.github.io/tsumucode/`

**Interfaces:**

- Consumes: Task 4を通過した40文字`HEAD` SHA
- Produces: 同じSHAへ結合されたGitHub Pages βDeploymentとReport Artifact

- [ ] **Step 1: `pre-push-security-check`で公開範囲を検査する**

`origin/main..HEAD`全体を対象に、秘密情報、ホスト名メール、内部作業物、生成物、巨大file、workflow権限を検査する。検出時はpushせず修正する。

```bash
git diff --name-status origin/main..HEAD
git diff --check origin/main..HEAD
git log --format=fuller origin/main..HEAD
git diff --numstat origin/main..HEAD
rg -n -i '(api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|password\\s*[:=])' .
rg -n '(santa@[^[:space:]]+\\.local|@[^[:space:]]+\\.local)' .
```

Expected: 秘密値、ホスト名メール、`.superpowers/`、`docs/superpowers/`、`progress.md`、生成Report、意図しない巨大fileが公開差分にない。

- [ ] **Step 2: remoteを更新しfast-forward条件を確認する**

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
DEPLOY_SHA="$(git rev-parse HEAD)"
printf '%s\n' "$DEPLOY_SHA"
```

Expected: merge-base checkが0終了し、公開対象SHAを取得できる。

- [ ] **Step 3: 検証済みHEADを`main`へpushする**

```bash
git push origin HEAD:main
git ls-remote origin refs/heads/main
```

Expected: remote `main`が公開対象SHAと完全一致。

- [ ] **Step 4: `main` pushのquality-only Runを完了まで監視する**

```bash
QUALITY_RUN_ID="$(gh run list --workflow "TsumuCode Pages" --branch main --event push --limit 10 --json databaseId,headSha --jq "map(select(.headSha == \"$DEPLOY_SHA\"))[0].databaseId")"
gh run watch "$QUALITY_RUN_ID" --exit-status
```

Expected: `quality` Job成功、Deploy Job skip。

- [ ] **Step 5: 同じSHAをβModeで明示dispatchする**

```bash
gh workflow run "TsumuCode Pages" --ref main -f source_sha="$DEPLOY_SHA" -f release_mode=beta -f deploy=true
DEPLOY_RUN_ID="$(gh run list --workflow "TsumuCode Pages" --branch main --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$DEPLOY_RUN_ID" --exit-status
```

Expected: resolve、quality、deploy、reportが成功し、`record_release`はskip。

- [ ] **Step 6: 公開URL、表示、SHA evidenceを確認する**

cache-busting query付き公開URLを開き、Home、Slide閲覧、Exerciseを確認する。`β`が表示され、Document scrollや操作阻害がなく、Deploy Runの`verifiedSourceCommit`、remote `main`、公開対象SHAが一致することを確認する。

Expected:

```text
pageUrl=https://santa928.github.io/tsumucode/
releaseMode=beta
verifiedSourceCommit=$DEPLOY_SHA
record_release=skipped
```
