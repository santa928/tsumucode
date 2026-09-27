# Issue #31 Home初期配信容量の復旧

PR #32統合後の[β公開Run 36301810911](https://github.com/santa928/tsumucode/actions/runs/36301810911)は、E2E254件・ブラウザ性能22件を通過した後、Home初期JSの増分容量で停止した。deploy/reportは未実行。対象Sourceは`2a3405939d638b5c64a2f21ea61239aa445c3af5`。

## 要件差分

| ID | 状態 | 内容 |
| --- | --- | --- |
| REQ-031-B01 | 追加 | Homeから不要な実行本体への値importを切り離す |
| REQ-031-B02 | 維持 | 固定baseline158,062 bytes、増分上限20,480 bytes、gzip方式・計測rootを変更しない |
| REQ-031-B03 | 維持 | Registry検査、実行/DOM、stop/dispose、古い処理の失効、下書き・採点・保存を維持 |
| REQ-031-B04 | 維持 | #28、依存更新、UI変更、画像更新、公開Gate緩和は対象外 |

保留・削除はない。新しい非同期生成・待機状態やRepository instanceは追加しない。新SHAの公開は別途対象を固定して許可と既存Gateが必要。

## 原因と変更

`normalLearningEntry → normalLearningRouteModules → ExercisePage/runtimeServices → RunnerRegistry → BrowserExecutionService`が静的importでつながり、実行本体がHomeの共有chunkへ入っていた。生成箇所は元から遅延読込される`EditableExercisePage`なので、Registryの同期`create()`で検査済みRunnerを取得し、同じ箇所で`BrowserExecutionService`を組み立てる。

Registryの登録・factory・adapter・language ID検査、共有保存サービス、実行サービス本体は変更しない。`createExecution()`の薄い組立てだけを移し、既存画面テストのmockもRunner生成境界に合わせた。

## 同じDocker条件での測定

Linux arm64 / Debian bookworm / Node24.18.0 / Playwright1.61.1、`BASE_PATH=/tsumucode/`。beforeは上記Sourceと同じGit treeの既存build、afterは本変更のbuild。Vite manifestの通常学習Entryから静的importsのみを重複排除し、各JSのgzip bytesを合計した。数値は同じ容量テストで照合済み。

| Home静的file（hash以外の名前） | before gzip | after gzip |
| --- | ---: | ---: |
| normalLearning | 120 | 120 |
| router | 102,278 | 102,277 |
| jsx-runtime | 3,264 | 3,264 |
| preload-helper | 736 | 736 |
| resolvePublicAsset | 706 | 706 |
| schemas | 18,714 | 18,714 |
| normalLearningRouteModules | 22,901 | 22,900 |
| StackedCard（共有chunk） | 27,564 | 26,548 |
| canonicalJson | 2,492 | 2,492 |
| EditorLanguageRegistry | 192 | 192 |
| **合計** | **178,967** | **177,949** |
| **baselineからの増分** | **20,905（425超過）** | **19,887（593余裕）** |

共有chunk再配置を含む実測差は1,018 bytes。module生サイズを削減量として足していない。実行本体の出力は`StackedCard-EilyqpXQ.js`から`EditableExercisePage-OFT7eSQU.js`へ移った。

## 検証と残る制限

- Docker内のProduction build（型検査を含む）成功。
- `vitest run --config vitest.bundle.config.ts tests/performance/bundle-budget.test.ts`: before 8成功/1失敗、after 9成功。Home以外のEditor/JS増分等も成功。
- `LearningRoutes`、`runnerRegistry`、`browserExecutionService`: 45成功。初期化中の離脱・本当の読込失敗の通知・stop/disposeの関連回帰を含む。
- Chromium代表E2E5件成功。Home→Slide→演習完了、HTML/CSSの全消去・取消・復元、HTML/CSSのPreview/採点、JS Reset→再編集→Preview/採点、unsupported時の履歴非更新と下書き復旧を既存テストで確認。
- 一時Chromium probeでHome初回Networkに実行本体chunkが含まれず、演習表示で初めて取得し実行成功することを確認。1280×720のHome・演習の画像も目視確認。Homeでは既存のProgressTransferPanelは先読みされるが、本変更対象の実行本体は先読みされない。
- 変更TSのESLint/Prettier、既存`smoke:learning-chunks`成功。
- 新候補の全公開Gate・Lighthouse・Pages配信確認は未実施。旧SHAの成功結果を新候補の公開前Gate成功へ流用しない。
- 失敗診断Artifact ID10926276834はupload/downloadとSource照合を実確認済み。今回の修正はその保存設定を変更しない。
