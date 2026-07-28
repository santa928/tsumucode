# TsumuCode 身内向けβ公開設計

- status: `approved`
- approvedBy: `product-owner`
- approvedAt: `2026-07-29`
- scope: `GitHub Pages beta deployment`

## 目的

正式Releaseの品質基準や承認記録を緩めず、完全初心者による全Checkpoint・Guided Project・Capstoneの観察が終わる前でも、個人・身内で利用するTsumuCodeをGitHub Pagesへ公開できるようにする。

β公開は教材やRuntimeの簡易版ではない。正式版と同じ自動品質Gateを通す一方、「全教材を完全初心者が完走した」という手動検証済みの主張、正式Release tag、正式Release台帳への登録だけを行わない。

## 要件台帳

| ID           | 状態 | 要件                                                                                                                                                       |
| ------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-BETA-001 | 追加 | Pages workflowへ`beta`公開Modeを追加する                                                                                                                   |
| REQ-BETA-002 | 追加 | β公開対象はdispatch時点の最新`main` SHAと完全一致させる                                                                                                    |
| REQ-BETA-003 | 維持 | Content provenance、独立Lesson review、Compile、Continuity、Lint、Typecheck、Unit、3 Engine E2E、axe、Performance、Lighthouse、Static Artifactをすべて通す |
| REQ-BETA-004 | 維持 | 正式`candidate`の初心者観察、Release Approval、Artifact binding、tag、台帳の要件を変更しない                                                               |
| REQ-BETA-005 | 追加 | βDeployにもSource SHA、Artifact hash、品質Artifact、Workflow run、公開URLを結合したReportを残す                                                            |
| REQ-BETA-006 | 追加 | βDeployでは正式Release tagを作らず、`release-history.yaml`へReleaseを追加しない                                                                            |
| REQ-BETA-007 | 追加 | TsumuCode名の横へ、Layoutの高さを増やさない小さな「β」表示を追加する                                                                                       |
| REQ-BETA-008 | 維持 | GitHub Pagesは認証を追加せず、URLを知る人以外も閲覧可能な公開Siteとして扱う                                                                                |
| REQ-BETA-009 | 追加 | 正式版への昇格条件は、5 Checkpoint、Guided Project、Capstone、未解決Finding 0件の初心者観察完了とする                                                      |

保留・削除する既存要件はない。

## Architecture

### Release target

`release:target`へ`beta` Modeを追加する。βでは`source_sha`を必須にし、次の3値が同じ40文字SHAである場合だけ対象を解決する。

1. workflowをdispatchした`main`のHEAD
2. workflow checkoutのHEAD
3. 入力された`source_sha`

正式`candidate`は従来どおり`release-approval.yaml`と承認済みArtifact bindingを要求する。`rollback`も公開済みRelease台帳を参照する既存動作を維持する。

### Quality pipeline

βは正式Release用の手動承認検証を呼ばず、Release continuityを`quality-only`相当で検証する。それ以外の自動Gate、canonical `/tsumucode/` build、Pages artifact生成は正式版と同じJobを共有する。

βであることを理由にtest suite、browser、performance budget、security check、accessibility checkを減らさない。

### Deploy and evidence

全自動Gate成功後だけ`github-pages` Environmentを経由してDeployする。Deploy後は既存Release Reportへ`releaseMode: beta`を記録し、品質Artifact ID/digest、成果物hash、公開URL、workflow run/attemptを残す。

`record_release` Jobは`candidate`だけを対象とする既存条件を維持する。このためβDeployはannotated tagや正式Release台帳を生成しない。

### Product表示

共通Headerの`TsumuCode`名の横へ「β」Badgeをinline表示する。BadgeはHeaderの高さ、Slide Focus Shell、Exercise workspaceの利用可能領域を増減させない。支援技術では「ベータ版」と読める名前を持たせる。

## Data flow

1. 公開候補を`main`へfast-forwardする。
2. `main` pushのquality-only runを成功させる。
3. 同じ`main` SHAを`source_sha`に指定し、`release_mode=beta`、`deploy=true`で手動dispatchする。
4. target解決、全自動Gate、Artifact hash記録、Pages Deployを順番に実行する。
5. βDeployment ReportをArtifactとして保存する。
6. 公開URLのHTTP応答、表示、βBadge、公開Source SHAを確認する。

## Error handling

- `source_sha`が空、不正、または最新`main`と不一致ならDeploy前に失敗させる。
- 自動Gateが1件でも失敗したらPages ArtifactをDeployしない。
- βModeで正式Release tagや台帳記録が実行された場合はworkflow testで失敗させる。
- Deploy後のURL確認が失敗した場合、正式公開完了とは報告せず、同じRunの状態とArtifactを調査する。
- βDeployを正式Releaseとして昇格・再利用しない。正式公開時は正式`candidate`を改めて承認する。

## Testing

- `release:target`のβ成功、空SHA、不正SHA、workflow HEAD不一致をunit testする。
- `release:report`が`beta`を受理し、未知Modeを拒否することをunit testする。
- workflowの`beta`入力、正式Approval skip、全自動Gate実行、`record_release`非実行を静的testする。
- HeaderのβBadgeをcomponent／E2E testし、accessible nameを確認する。
- Docker内で`npm run check`を実行する。
- canonical `/tsumucode/` build、3 Engine E2E、Performance、Lighthouse、Static Artifact gateを公開workflowで再実行する。
- 代表viewportでBadgeがHeader高を増やさず、Slide／Exercise領域を圧迫しないことを目視・数値確認する。

## 受け入れ条件

- `release_mode=beta`以外では既存の正式Release／rollback動作が変わらない。
- βDeployは最新`main`の明示SHAだけを対象にできる。
- 正式版と同じ自動品質Gateをすべて通過したArtifactだけがPagesへ公開される。
- βDeployにRelease Reportが残り、正式tagと正式台帳更新は発生しない。
- 公開Siteで「β」が確認でき、Header高さと学習画面の表示領域が変更前と同じである。
- 公開URLが応答し、Home、Slide閲覧、Exerciseの主要Journeyが動作する。

## 非対象

- GitHub Pagesへの認証・アクセス制限
- 未完了の初心者観察を合格として記録すること
- 正式Release Approvalの条件緩和
- β専用教材、機能制限、別Repository、別URL
- βDeploymentをrollback元として正式台帳へ登録すること

## リスクと対策

- **βを正式版と誤認する:** Product内BadgeとReportの`releaseMode`で区別する。
- **古いSHAを公開する:** 最新`main`との完全一致をtarget resolverで強制する。
- **β経路だけ品質検査が減る:** workflow testで自動Gate共有を固定する。
- **正式Release台帳を汚す:** tag／record Jobを`candidate`限定のまま保持し、静的testで確認する。
- **Headerが再び画面を圧迫する:** inline Badgeとし、既存高さ不変をviewport testで確認する。

## 性能目標

βでも既存のLCP 2,500 ms以下、CLS 0.1以下、主要操作200 ms以下、Preview p95 500 ms以下、判定p95 300 ms以下、下書き永続化500 ms以下、Home初期JavaScript gzip 256,000 bytes以下を維持する。Badge追加による新規JavaScript chunk、画像Asset、追加Network requestは発生させない。
