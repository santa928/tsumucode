# Issue #31 β公開前検証の復旧

対象は[失敗Run 36294504680](https://github.com/santa928/tsumucode/actions/runs/36294504680)、attempt 1、Source `b581b1d7ea439aca36b9697e2366777c0d336dea`。2026-09-27に認証済みGitHub CLIで再取得した生ログを照合した。このPRは復旧候補であり、公開完了の記録ではない。

## 要件と対応

| ID          | 状態 | 対応                                                                                        |
| ----------- | ---- | ------------------------------------------------------------------------------------------- |
| REQ-031-001 | 維持 | 生ログ・Git tree・Compose内File・Playwright一覧を照合してから修正                           |
| REQ-031-002 | 維持 | 実在する旧期待値1件と、個別に比較した画像15件だけを修正                                     |
| REQ-031-003 | 維持 | 失敗時の診断Artifactを成功Evidenceと分離して保存                                            |
| REQ-031-004 | 維持 | Dockerの対象検証、作業branchへのpush、新PR作成まで。merge・deploy・Issue close・#28は対象外 |

保留・削除・追加する要件はない。安全制約・採点契約・公開Gate・画像閾値・テスト対象数の設定は変更しない。

## 失敗ログとSourceの照合

次の2経路でQuality job `108551003488` を再取得した。

```sh
gh api repos/santa928/tsumucode/actions/jobs/108551003488/logs
gh run view 36294504680 --repo santa928/tsumucode --job 108551003488 --log
git ls-tree -r b581b1d7ea439aca36b9697e2366777c0d336dea tests/e2e
git show b581b1d7ea439aca36b9697e2366777c0d336dea:tests/e2e/course-fixtures.spec.ts
```

生ログの実際の失敗は **course-fixtures 1件＋演習画像15件**。238 passed / 16 failed、合計254件だった。

- `course-fixtures.spec.ts:384`の`javascript-ch04-l02-e01/security`が、期待`code-error`に対して`system-error`。診断は`kind: unsupported`、`code: javascript-analyzer-unsupported`。pageErrors / unhandledRejections / consoleErrorsは空。
- 画像は下表の15件。すべて`visual-regression.spec.ts`の演習画面で、Slideの失敗ではない。
- Issueに転記された`javascript-errors.spec.ts:56`の「未対応構文をsecurity…」、`class Unsupported {}`、`slide-visual-regression.spec.ts`、`layout-regression.spec.ts`、SS-01〜07は、取得し直した生ログ・対象Git tree・テスト一覧に存在しない。実際の`javascript-errors.spec.ts`は構文エラー・実行時例外・無限ループの3件。
- Issueに転記された一覧と生ログは一致しないが、その取得経路で不整合が生じた原因までは未確認。CIが別Sourceを実行したと断定できる証拠はない。

変更前に`git show`のbytes、host File、実Composeコンテナ`/workspace`内FileのSHA-256が以下の値で一致した。コンテナのGit HEADも対象SHAと一致し、変更前のstatusはcleanだった。

| File                                  | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `tests/e2e/javascript-errors.spec.ts` | `74c40c88fec863cb516d5d64eb3df33b32dae65cc15f5dfb6bc4c1e6f286c168` |
| `tests/e2e/course-fixtures.spec.ts`   | `ad7aa7b3b90b229d8dc903ef30fada0b0807fc05af242c0f0e5540b599445cdd` |
| `tests/e2e/visual-regression.spec.ts` | `f5232c42633431cfb9d66812f1d0e830f74f6a53522f73bc37355590cbdd7665` |
| `playwright.config.ts`                | `e3d81fd5d9b25e57fa5578a6273b7a95ca6aae025ebf891279f0d51e7daebd5e` |

実Compose内で`BASE_PATH=/tsumucode/ npm exec -- playwright test --list`を実行し、254 tests / 24 filesを確認した。生ログのファイル・ケース名・行番号と対応する。存在しないテストは追加していない。

## 原因と修正

### 未対応構文のfixture

既存`security.js`の`questions[currentIndex]`は文法的に正しいJavaScriptだが、現在のBrowser解析器では未対応。PR #30以降は`unsupported`診断になり、Validatorは採点しない結果を`system-error`で返す。旧fixtureの`code-error`期待値が残っていた。

期待値を`system-error`、期待診断コードを`javascript-analyzer-unsupported`に変更した。fixture ID・教材ID・Source本文・Validator・Runner・進捗保存・Import/Exportは変更していない。広い`system-error`だけで成功扱いせず、既存fixture検査で診断コードも一致させる。同LessonのReview台帳は、この期待値差分と再実行結果に合わせてhash・notesだけ同期した。

### 画像15件

PR #30で演習の工程票へ追加された「ブラウザで実行」と実行状態の2行が、保存済み基準画像へ未反映だった。expected / actual / diffを15件それぞれ確認し、その表示と後続説明の移動だけを反映した。エラー・ヒント・Resetではダイアログ背後の工程票が変わる。ダイアログ本体、Editor、Preview、Consoleのレイアウトを変更する必要は認めなかった。

1280×720では説明欄末尾が初期表示から下へ移るが、独立スクロールで到達できる。実マウスwheelでHTML/CSSは70px、JavaScript Ch01は44px移動し、末尾bottom 631.03pxがpane bottom 661.41px内に収まり、ページ横overflowはfalse。UI変更はしていない。

失敗したCI RunにはArtifactがなく、以下は**同じSourceをDocker内で再現して取得した画像**である。CI実行時のactual画像そのものではない。旧expectedは対象SHA、新actualは本PRの基準画像、diffは旧expected対再現actual。未掲載の基準画像は変更していない。

| 画像                                                  | 旧基準                                                                                                                                                                                                               | 再現結果                                                                                                                             | 比較差分                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `exercise-desktop-wide`                               | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/exercise-desktop-wide-chromium-linux.png)                               | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/exercise-desktop-wide-chromium-linux.png)                               | [diff](issue31-images/exercise-desktop-wide-diff.png)                               |
| `exercise-desktop-compact`                            | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/exercise-desktop-compact-chromium-linux.png)                            | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/exercise-desktop-compact-chromium-linux.png)                            | [diff](issue31-images/exercise-desktop-compact-diff.png)                            |
| `exercise-diagnostics-desktop-wide`                   | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/exercise-diagnostics-desktop-wide-chromium-linux.png)                   | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/exercise-diagnostics-desktop-wide-chromium-linux.png)                   | [diff](issue31-images/exercise-diagnostics-desktop-wide-diff.png)                   |
| `exercise-diagnostics-desktop-compact`                | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/exercise-diagnostics-desktop-compact-chromium-linux.png)                | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/exercise-diagnostics-desktop-compact-chromium-linux.png)                | [diff](issue31-images/exercise-diagnostics-desktop-compact-diff.png)                |
| `javascript-exercise-desktop-compact`                 | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-exercise-desktop-compact-chromium-linux.png)                 | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-exercise-desktop-compact-chromium-linux.png)                 | [diff](issue31-images/javascript-exercise-desktop-compact-diff.png)                 |
| `javascript-error-desktop-compact`                    | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-error-desktop-compact-chromium-linux.png)                    | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-error-desktop-compact-chromium-linux.png)                    | [diff](issue31-images/javascript-error-desktop-compact-diff.png)                    |
| `javascript-hint-desktop-compact`                     | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-hint-desktop-compact-chromium-linux.png)                     | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-hint-desktop-compact-chromium-linux.png)                     | [diff](issue31-images/javascript-hint-desktop-compact-diff.png)                     |
| `javascript-reset-desktop-compact`                    | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-reset-desktop-compact-chromium-linux.png)                    | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-reset-desktop-compact-chromium-linux.png)                    | [diff](issue31-images/javascript-reset-desktop-compact-diff.png)                    |
| `javascript-console-empty-desktop-compact`            | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-console-empty-desktop-compact-chromium-linux.png)            | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-console-empty-desktop-compact-chromium-linux.png)            | [diff](issue31-images/javascript-console-empty-desktop-compact-diff.png)            |
| `javascript-console-100-records-desktop-compact`      | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-console-100-records-desktop-compact-chromium-linux.png)      | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-console-100-records-desktop-compact-chromium-linux.png)      | [diff](issue31-images/javascript-console-100-records-desktop-compact-diff.png)      |
| `javascript-console-previous-success-desktop-compact` | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-console-previous-success-desktop-compact-chromium-linux.png) | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-console-previous-success-desktop-compact-chromium-linux.png) | [diff](issue31-images/javascript-console-previous-success-desktop-compact-diff.png) |
| `javascript-ch01-exercise-desktop-compact`            | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-ch01-exercise-desktop-compact-chromium-linux.png)            | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-ch01-exercise-desktop-compact-chromium-linux.png)            | [diff](issue31-images/javascript-ch01-exercise-desktop-compact-diff.png)            |
| `javascript-ch02-exercise-desktop-compact`            | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-ch02-exercise-desktop-compact-chromium-linux.png)            | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-ch02-exercise-desktop-compact-chromium-linux.png)            | [diff](issue31-images/javascript-ch02-exercise-desktop-compact-diff.png)            |
| `javascript-ch03-exercise-desktop-compact`            | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-ch03-exercise-desktop-compact-chromium-linux.png)            | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-ch03-exercise-desktop-compact-chromium-linux.png)            | [diff](issue31-images/javascript-ch03-exercise-desktop-compact-diff.png)            |
| `javascript-ch06-exercise-desktop-compact`            | [expected](https://github.com/santa928/tsumucode/blob/b581b1d7ea439aca36b9697e2366777c0d336dea/tests/e2e/visual-regression.spec.ts-snapshots/javascript-ch06-exercise-desktop-compact-chromium-linux.png)            | [actual](../../tests/e2e/visual-regression.spec.ts-snapshots/javascript-ch06-exercise-desktop-compact-chromium-linux.png)            | [diff](issue31-images/javascript-ch06-exercise-desktop-compact-diff.png)            |

### 失敗診断Artifact

Quality job末尾へ`if: failure()`の準備・uploadを追加。存在する`playwright-report`、`playwright-performance-report`、`test-results`、`lhci-report`だけを読み取り可能にし、checkout HEAD・status・上記4Fileのhashと一緒に7日間保存する。欠けたreportを捏造せず、全出力がなくてもSource識別情報を残す。

成功時の`quality-evidence`、品質summary、Pages Artifactと混同しない名前にした。既存Gateの失敗を無視せず、`deploy needs: [resolve, quality]`も維持した。upload Actionは既存と同じcommit SHA固定。

## 検証環境と結果

- プロジェクトの`./scripts/docker-compose.sh run`で起動したCompose app内で実行。Node 24.18.0 / Playwright 1.61.1 / Chromium 1228 / Debian bookworm / Linux arm64。`BASE_PATH=/tsumucode/`。
- CI相当のLinux/amd64 Docker buildも試したが、base imageのmetadata取得から7分間進まず終了した。原因は未確定。arm64で再現できたことをamd64の再実行成功とは扱わない。
- 最初の代表画像実行はブラウザ依存ライブラリの導入完了前だったため、共有ライブラリ不足で起動失敗。導入完了後に再実行した。
- 修正前：実fixture 1件の同一診断不一致、画像15件の不一致を再現。未変更のSlide desktop-compact / mobile-portraitは2件とも一致。
- 修正後：`COURSE_FIXTURE_FILTER=javascript-ch04-l02-e01`で該当演習のSolution・Starter・6 fixture、合計8入力を実Browser Runner / Validatorで確認（Playwright 1件成功）。
- `vitest run tests/pages-workflow.test.ts tests/content/javascript-ch04.test.ts`：20件成功。新しい失敗診断テストは追加前のworkflowでは失敗し、追加後は成功。
- `content:compile` / `content:review`：2 courses / 78 lessons、stale hashes 0 / rejected 0。変更TypeScriptのESLint、変更YAML/TypeScriptのPrettier成功。
- 診断準備stepの実shellをDockerの一時Git repoで、reportが全くない場合と`test-results`だけ存在する場合に実行。両方成功し、ファイル権限600→644、HEAD・File hash記録を確認。Dockerはrootのためsudoだけ直接実行へ置換。初回はComposeのGIT_DIRを引き継いで失敗し、一時検証プロセスからGIT_DIR/GIT_WORK_TREEを外して再実行した。
- 説明欄スクロールの一時Playwright probe：1件成功（上記2画面）。一時テストは本PRに追加していない。
- 最終の関連E2E：31件成功、skipped / unexpected / flakyは全て0。内訳は画像18件（更新15件＋未変更Slide 2件・mobile Exercise 1件）、`javascript-errors` 3件、`runtime-environment` 3件、`runtime-security` 7件。Reset後の再編集・Preview・判定、unsupported時の履歴非保存と下書き保持を含む。

再現・最終確認に使用した対象指定（Compose app内）：

```sh
# 対象SHAのビルド
BASE_PATH=/tsumucode/ npm run build
# 修正した演習の全入力
BASE_PATH=/tsumucode/ COURSE_FIXTURE_FILTER=javascript-ch04-l02-e01 npm exec -- playwright test tests/e2e/course-fixtures.spec.ts --project=chromium --grep 'JavaScriptの全Solution' --retries=0
# 画像と関連回帰。snapshot更新オプションは付けず、合否を再確認
BASE_PATH=/tsumucode/ npm exec -- playwright test tests/e2e/visual-regression.spec.ts tests/e2e/runtime-environment.spec.ts tests/e2e/javascript-errors.spec.ts tests/e2e/runtime-security.spec.ts --project=chromium --grep ' (exercise-desktop-(wide|compact)|exercise-diagnostics-desktop-(wide|compact)|slide-desktop-compact|slide-mobile-portrait|exercise-mobile-portrait|javascript-(exercise|error|hint|reset|console-empty|console-100-records|console-previous-success|ch01-exercise|ch02-exercise|ch03-exercise|ch06-exercise)-desktop-compact)$|runtime-environment.spec.ts|javascript-errors.spec.ts|runtime-security.spec.ts' --retries=0 --output=test-results/issue31-final
```

## 未検証・残る制限

- 新しい診断ArtifactのGitHub Actions上の実upload・ダウンロードは未確認。ローカルshell検証とworkflow構造検査で確認した範囲まで。
- Linux/amd64での15画像再比較、Firefox/WebKit、全コース全E2E、Performance、Lighthouse、公開URL smokeは今回は実行していない。公開時は既存Gateを全て通す必要がある。
- 失敗した旧Runの実画像は保存されておらず、復元できない。
- 本PRは復旧候補の提出まで。main merge、Pages deploy、Issue close、#28実装を行わない。

受け入れ範囲・非対象・安全策・公開Gate・既存性能目標は保持。診断用出力は7日保存に限定し、新たな性能目標や固定テスト件数は設定していない。
