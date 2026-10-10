# Python最小Lessonの実行境界案（Issue #138）

## 現在地

値・変数・`print`の1 Lesson原稿と正誤Fixtureを`python-first-lesson-draft/`へ用意した。通常Catalog・LearningPath・公開contentには登録していない。製品実行器、Python公開、実人受講、物理端末検証は未完である。

既存正本は[#27](https://github.com/santa928/tsumucode/issues/27)の`ExecutionService`契約と[Browser Console境界](browser-console-runtime.md)。実行成功と採点合格を分け、同じCourseProgress・下書き・JSON移送を再利用する。停止・Reset・離脱で旧run/session/revisionを失効させ、準備中のfetch/hash/compileの後着にも適用する。環境障害・未対応・制限停止では採点履歴を更新しない。

## 最小設計

- 固定Pyodide `314.0.7`のcoreを作者のDocker内で準備する。公式archiveは6,757,104 bytes、SHA-256は`2abdcc2e35208af406e07724cffa85bc582ced97e9028383ecf5462541393f95`。実interpreter版、実配信byte予算、第三者licenseは製品受け入れ前に別途確定する。
- Python用実行器・採点器・Editorは演習到達時に遅延ロードする。Home・Path・読書の初期chunkには入れない。
- 親側の信頼loaderが固定coreのbytes/hashを照合する。opaque iframe内Workerには固定bytesだけを供給し、native fetchや任意package取得を渡さない。JSからPythonへのglobal設定だけで隔離済みと扱わず、`pyodide_js._module`と`_api`を含めて実能力を検証する。
- 最小Lessonは同期実行で、入力待ち・任意import・package導入は範囲外。初期化期限と学習実行期限を分け、外側のWorker terminationとframe除去で中止する。BrowserプロセスのOOMまで完全に隔離したとは保証しない。
- stdout/stderrは`write(Uint8Array)`で受け、文字境界と改行・部分行を保つ。件数・1行・合計bytesの上限を信頼側でも照合する。`batched`だけで巨大な改行なし出力を安全と扱わない。
- source factsは学習コード実行前の実Python ASTから取得する案とし、出力だけ合うhardcode・文字列と数値の混同を未達にする。任意の変数名でも同じ意味なら合格可能にする。

## 現時点のブロッカーと未適用のCSP差分

私有Chromium probeで、親側compile済み`WebAssembly.Module`をopaque frameへ移送すると`messageerror`になることを確認した。最小classic WorkerへArrayBufferを渡した別probeでは、既存nonce限定CSPがWASM compileを`CompileError`で拒否した。module Workerの起動にも未解決の障害があり、正常Pyodide実行を確認したとは扱わない。

次の差分は提案のみで、製品にも私有probeにもまだ適用していない。

```diff
-script-src 'nonce-${nonce}';
+script-src 'nonce-${nonce}' 'wasm-unsafe-eval';
```

対象はPython専用のopaque frameだけ。`unsafe-eval`によるJS文字列実行、`allow-same-origin`、外部通信の追加を含めない。既存JS/DOM Runnerや親画面のCSPを変更しない。

`wasm-unsafe-eval`は固定coreだけを許可する仕組みではない。到達可能なWASM compilerや`pyodide_js._module`の`addFunction`・`loadDynamicLibrary`・`loadWebAssemblyModule`にも影響する。初期化後の能力除去と、policyを迂回した診断Fixtureによる実証が必要である。未承認の権限拡張を待つユーザー指示に従い、この差分は本人確認前に実行しない。

## 受け入れと検証順

1. 固定core・license・配信bytes、Worker方式、最小CSPを確定する。
2. 実Pyodideで値・変数・`print`、stdout/stderr、構文/名前エラーを確認する。
3. JS連携・内部API・prototypeからの通信/Storage/子Worker/偽message、過大出力、停止後の後着をpolicy迂回Fixtureで確認する。
4. 初期化失敗と再試行、無限実行のtimeout、中止、Reset/離脱、下書きと以前の合格履歴の保持を既存UIで確認する。
5. 代表画面・a11y・遅延chunk・独立内容/コードレビュー・変更関連CIを確認する。実人/物理端末・新規公開は別受け入れとして保持する。

## 一次資料

- [公式coreの配布](https://pyodide.org/en/stable/usage/downloading-and-deploying.html)
- [Worker要件](https://pyodide.org/en/stable/usage/webworker.html)
- [loadPyodide API](https://pyodide.org/en/stable/usage/api/js-api.html)
- [CSP3のWASM評価権限](https://www.w3.org/TR/CSP3/)
