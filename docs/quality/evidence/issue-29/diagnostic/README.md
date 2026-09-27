# Browser Console の別 bundle 診断

2026-09-27 UTC、製品ソース `92eff44c848e48afa68e9fb46f81d8758d7640bf` を Docker 内で診断した記録。`original.mjs.txt` は実行した診断スクリプトの原文で、SHA-256 は `ece8e855050726db438f0df868571baaf7751d750d50b0210a5639087b5466e0`。`.txt` を外して Node.js で実行する。

これは esbuild で製品 service と bootstrap を別 bundle にした診断であり、Vite 製品 entry の E2E とは別証拠。製品 entry の回帰は `tests/e2e/browser-console-runtime.spec.ts`、実画面の採点・永続化・障害復旧は `tests/e2e/runtime-environment.spec.ts` が担当する。

## 環境と再現

- Docker 内 Node.js 24.18.0 / Playwright 1.61.1。
- Chromium 149.0.7827.0、Firefox 151.0 (Playwright revision 1532)、WebKit 26.5 (revision 2311)。
- リポジトリを `/workspace`、上記 SHA の checkout を `/workspace/.worktrees/issue-29-browser-runtime` に配置。依存はプロジェクトの Docker 手順で導入済み。
- 診断原文を `/evidence/issue29-real-service.mjs` として置き、同じ Docker 内で `node /evidence/issue29-real-service.mjs chromium` を実行。`firefox` / `webkit` も同様。結果は `/evidence/issue29-real-service-<engine>.json` に保存される。
- HTTP fixture はコンテナ内 loopback の一時ポートを使用。制御用 fetch の到達を確認してから記録を空にし、学習コードによる後続通信だけを検査する。

対象製品ファイルの git blob（`src/adapters/runtime/javascript/` からの相対パス）:

| ファイル                                 | git blob                                 |
| ---------------------------------------- | ---------------------------------------- |
| analyzer/consoleSourcePolicy.ts          | 9a4ed244448da447c5527bd7acb9303028ffd811 |
| runner/BrowserConsoleExecutionService.ts | 754460ba86a967254fc88d08bc59c548f3bbebd6 |
| runner/consoleFormatter.ts               | 4af909b2d4f4264962d1f6e63e09f04897bdff38 |
| runner/consoleWorkerSource.ts            | 84cf9c2a36db596b0ec02d06168ab5634f80ef59 |

## 入力と結果の対応

正確な入力・期待値・判定式は原文の `cases` / `rawCases` / `lifecycle`、実結果は各 JSON の同名 `name` を参照。3 engine とも下記 26 項目の `passed` が true。

| name                       | 確認内容・期待結果                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------ |
| private-scope              | marker / port / root / arguments が全て undefined                                    |
| poison-builtins            | Promise.prototype.then の変更後も出力 1 と成功                                       |
| array / object             | 動的な配列・オブジェクトキーの参照、20 / 10                                          |
| promise / catch / queue    | 即時 Promise と microtask、および同区間で catch した拒否が成功                       |
| reject / queue-throw       | 未処理拒否・microtask 内例外は code-error                                            |
| syntax / unknown           | 構文・未定義参照は code-error                                                        |
| unsupported / fake-message | MessageChannel / postMessage は unsupported                                          |
| local-name                 | ローカル名の MessageChannel と then プロパティを許容、10 20                          |
| function-csp               | constructor 経由の動的コードは EvalError                                             |
| record-limit / byte-limit  | 出力件数・総 byte 上限は stopped                                                     |
| loop / microtask-loop      | 同期・microtask 暴走は stopped                                                       |
| retry                      | 暴走後の同じ service で成功                                                          |
| lifecycle                  | 旧 run / stop は stopped、新 run / 再試行は成功、dispose 後は stopped、残存 iframe 0 |
| actual-capabilities        | 入力診断を迂回し、20 種の実 global 能力が undefined                                  |
| prototype-capabilities     | prototype chain に検査対象能力が残らない                                             |
| network / dynamic-import   | 入力診断を迂回しても fetch は TypeError、import は blocked                           |
| parent-boundary            | 外向き probe 0、親 pageerror 0、親 localStorage sentinel 不変                        |

`actual-capabilities` から `dynamic-import` は製品の入力診断を意図的に通さず、同じ `createConsoleFrameSource` の実能力を確認する診断専用経路。製品がその入力を受け付けるという意味ではない。`ticks` と `ms` は観測値で、全行の pass 条件ではない。

## 限界

この結果だけで UI、Vite chunk、採点、下書き、実 Node、全教材、実機、OOM 完全隔離を確認済みとはしない。独立レビュー担当者による再実行結果ではなく、Codex が Docker 内で実行した生結果。時間値・一時ポート・source hash を保持したまま保存している。
