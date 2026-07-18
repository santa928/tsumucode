# HTML/CSS初回Release Checklist

- releaseStatus: `draft`
- checklistScope: `pre-deploy`
- postDeployVerificationPolicy: `revision-record`
- postDeployVerificationRecord: `docs/quality/post-deploy/2026-07-13.1.yaml`
- automatedGatesStatus: `passed`
- manualGatesStatus: `pending`
- pendingItems: `4`
- failedItems: `0`
- reviewedAt: `2026-07-18`
- verifiedSourceCommit: `afb63516f849c34106e571782c9644db34de591f`
- canonicalDistSha256: `d84d16c571d48e597c6d2f17078f34280742e310af9118e9b9d3d184e36afc78`
- candidateBaseCommit: `clean-root (parentなし)`
- bindingPolicy: `自動Gateと完了済み品質記録を同じ最終source commitと/tsumucode/ canonical distへ結合済み`
- overallStatus: `保留。初心者Observation、VoiceOver、Release Approvalが未完了`

結果が「合格（候補結合済み）」の行は、最終source commitと`/tsumucode/` canonical distへ結び付いた実検証です。「保留」はRelease承認へ使用できません。

| 品質項目                          | Command／確認方法                                                                                                                                                                         | 実施日     | 対象source／artifact            | 結果File／証跡                           | 結果                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------- | ---------------------------------------- | -------------------- |
| 14章／51 Lesson／95 Slide         | `./scripts/docker-compose.sh run --rm app npm run content:check`                                                                                                                          | 2026-07-18 | candidate source commit         | `tests/content/html-css-release.test.ts` | 合格（候補結合済み） |
| 45 Exercise／5 Guided／1 Capstone | `./scripts/docker-compose.sh run --rm app npm run content:check`                                                                                                                          | 2026-07-18 | candidate source commit         | `tests/content/html-css-release.test.ts` | 合格（候補結合済み） |
| 学習時間710分                     | `./scripts/docker-compose.sh run --rm app npm run content:check`                                                                                                                          | 2026-07-18 | candidate source commit         | `tests/content/html-css-release.test.ts` | 合格（候補結合済み） |
| 51 Lesson独立レビュー             | `./scripts/docker-compose.sh run --rm app npm run test:run -- tests/content/content-review-ledger.test.ts`                                                                                | 2026-07-18 | candidate source commit         | `docs/quality/content-review.yaml`       | 合格（候補結合済み） |
| 全Solution／Starter／負例Fixture  | `./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:e2e -- tests/e2e/course-fixtures.spec.ts`                                                                 | 2026-07-18 | candidate canonical `dist/`     | `tests/e2e/course-fixtures.spec.ts`      | 合格（候補結合済み） |
| 完全初心者teach-back              | 実装者／教材authorではない完全初心者1名以上による口頭補助なしの観察                                                                                                                       | 未実施     | 対象Lesson hashは観察記録に固定 | `docs/quality/novice-observation.md`     | 保留                 |
| Guided／Capstone 2 Project        | 完全初心者がGuided 5工程とBriefだけのCapstoneを完了                                                                                                                                       | 未実施     | 対象Lesson hashは観察記録に固定 | `docs/quality/novice-observation.md`     | 保留                 |
| 4 Viewport                        | `./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:e2e -- tests/e2e/responsive-layout.spec.ts --project=chromium`                                            | 2026-07-18 | candidate canonical `dist/`     | `docs/quality/visual-review.md`          | 合格（候補結合済み） |
| Chromium／Firefox／WebKit         | `./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:e2e`                                                                                                      | 2026-07-18 | candidate canonical `dist/`     | `playwright-report`                      | 合格（候補結合済み） |
| Keyboard-only                     | 3 Engine E2EのTab／Shift+Tab／Enter／Escape journey                                                                                                                                       | 2026-07-18 | candidate canonical `dist/`     | `docs/quality/a11y-manual.md`            | 合格（候補結合済み） |
| VoiceOver                         | macOS VoiceOverでHome→Importまでの全journeyを読上げ確認                                                                                                                                   | 未実施     | candidate canonical `dist/`     | `docs/quality/a11y-manual.md`            | 保留                 |
| WCAG A/AA axe                     | `./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:e2e -- tests/e2e/accessibility.spec.ts`                                                                   | 2026-07-18 | candidate canonical `dist/`     | `tests/e2e/accessibility.spec.ts`        | 合格（候補結合済み） |
| World-A Visual                    | 20 Baselineを生成後に原寸目視し、世界観、切れ、重なり、端部、CTA、Focus、PC案内を確認                                                                                                     | 2026-07-18 | candidate canonical `dist/`     | `docs/quality/visual-review.md`          | 合格（候補結合済み） |
| Security                          | `./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:e2e -- tests/e2e/runtime-security.spec.ts`                                                                | 2026-07-18 | candidate canonical `dist/`     | `tests/e2e/runtime-security.spec.ts`     | 合格（候補結合済み） |
| Performance                       | `./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:performance`、`./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:lighthouse` | 2026-07-18 | candidate canonical `dist/`     | `tests/performance/`、`lhci-report`      | 合格（候補結合済み） |
| Static Artifact                   | `./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run release:check`                                                                                                 | 2026-07-18 | candidate canonical `dist/`     | `scripts/release/checkStaticArtifact.ts` | 合格（候補結合済み） |
| Provenance                        | `./scripts/docker-compose.sh run --rm app npm run content:provenance`                                                                                                                     | 2026-07-18 | 748 Source／Asset item          | `content/html-css/provenance.yaml`       | 合格（候補結合済み） |
| 非公式／非提携Notice              | `./scripts/docker-compose.sh run --rm -e BASE_PATH=/tsumucode/ app npm run test:e2e -- tests/e2e/project-notice.spec.ts --project=chromium`                                               | 2026-07-18 | candidate canonical `dist/`     | `tests/e2e/project-notice.spec.ts`       | 合格（候補結合済み） |
| Release Approval                  | 全手動記録hashとProduct treeを`release-approval.yaml`へ固定し、公開前承認を完了                                                                                                           | 未実施     | 未固定                          | `docs/quality/release-approval.yaml`     | 保留                 |

## 現在のRelease阻害項目

1. 実装者・教材authorではない完全初心者によるCheckpoint teach-backと2 Project完了。
2. macOS VoiceOverによる全journeyの読み上げ確認。
3. 上記2件の合格後、全手動記録hashを固定してRelease Approvalを承認する。

`github-pages` Environmentの独立Reviewer承認、公開URL、Release Report、annotated tagの照合はDeploy後にしか実施できないため、この公開前Checklistへ含めません。結果はrevision別の`docs/quality/post-deploy/<revision>.yaml`へ記録し、そのpath/hashを公開台帳へ固定して昇格時と以後のcontinuityで再検証します。
