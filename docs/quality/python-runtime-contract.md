# Python最小Lessonのローカル実行境界（Issue #138）

## 現在地と承認範囲

値・変数・printの1 Lessonを作者用の[通常Course構造](python-course-draft/course.yaml)へ組み立てた。3枚のスライド、予測・修正・Reflection、2要件、3 Hint、Solutionと10 Fixtureを含む。最初の[原稿](python-first-lesson-draft/lesson.yaml)は比較用に残す。通常のcontent・公開Catalog・LearningPathには登録しない。

2026-10-10の本人承認は、ローカルのPython専用opaque frame／Workerに限るWASM生成許可である。固定core以外のWASM生成にも許可が及ぶことを説明して承認を得た。外部通信・保存・JavaScript eval禁止を維持する。公開環境への適用・Python新規公開は含まない。

ローカル接続はbuild時のVITE_PYTHON_LOCAL_PROOF=1とloopback hostnameを両方要求する。flagなしの通常buildではPython runtime chunkとWASM用CSPを除去する。core assetも通常public directoryへ置かない。

既存正本は[#27](https://github.com/santa928/tsumucode/issues/27)のExecutionService契約と[Browser Console境界](browser-console-runtime.md)。同じController・下書き・進捗保存を使い、実行成功と採点合格を分ける。環境障害・未対応・制限停止では採点しない。

## 固定coreと実行

- Pyodideは314.0.7、実interpreterはPython 3.14.2。公式archiveは6,757,104 bytes、SHA-256は2abdcc2e35208af406e07724cffa85bc582ced97e9028383ecf5462541393f95。
- 親の信頼loaderが固定同origin assetを上限付きstreamで取得し、bytes/hashを照合する。WASM 9,598,218 bytes、stdlib 2,545,637 bytes、lock 119,077 bytesにWorker bundleを加える。準備に失敗したPromiseはcacheせず、残る並列fetchをabortする。
- classic Workerには固定bytesとprivate MessagePortだけを渡す。loader用fetchは固定bytesを返すstubで、native通信能力を渡さない。初期化後はglobalとWorker prototypeの通信・保存・子Worker能力を除去し、pure intrinsicのprototypeを再帰的に固定する。
- Python専用frameはsandbox=allow-scriptsのみ。script-srcはnonceとwasm-unsafe-eval、connect-srcはnone。JS unsafe-eval、allow-same-origin、外部取得許可は追加しない。既存JS／DOM実行器のCSPは変えない。
- 最小教材policyは値・単一変数への代入・加算・単一引数printだけ。任意import、入力待ち、package追加、printの再束縛、実行系builtinの別名参照は未対応とし、未達とは区別する。
- AST解析と学習sourceは別の新規Python globalsで動く。実ASTの2事実と実stdout、親が確定した元source SHA-256をANDで採点する。任意の変数名は許可し、答えだけのhardcodeや別の変数による加算は要件を満たさない。

## 期限・出力・結果

信頼側core準備は20秒、Worker初期化は15秒、学習実行は1.5秒。外側のframeがWorker termination・port close・Blob URL revokeを行ってから結果を返し、親がframeを除去する。手動停止、Reset、離脱、次のrunで旧generation／run／session／revisionを失効させる。BrowserプロセスのOOMまで完全に隔離する保証はない。

sourceは100 KiB。stdout／stderr合計は64 KiB、1行4,096 bytes、結果は100行以内。別々のUTF-8 decoderで部分writeを結合する。Consoleは実write callbackの行開始順を保ち、Python自身のstdoutバッファリングは反映される。信頼側でもbytes・行数・schemaを照合する。コードのSyntaxError／実行エラー、初期化／Worker障害、未対応、期限／出力制限／手動停止を分ける。環境障害を未達や合格に変換しない。

## ローカルの検証と残る受け入れ

Docker内の実Chromiumで、10 Fixtureを実Pyodideと製品採点器へ渡し、pass／incomplete／code-errorと未達Ruleを照合した。policyとは別の診断bundleでJS文字列実行、通信、保存、子Worker、内部参照、prototype、非同期障害、無限実行・停止・過大出力を確認した。親Storageのcanaryは不変、禁止通信の受信は0件だった。これは確認した経路と環境の証拠であり、任意コードを完全に隔離したとの主張ではない。

製品UIで未達→修正→合格、構文エラー、reload後の下書き保持を確認した。core取得失敗時のSource・既存判定履歴の保持と再試行、構文エラー後のEditorフォーカスも確認した。desktop／mobileのaxe違反0件、Home・Path・スライド初期表示ではPython runtime/coreの取得0件。通常Course compilerの概念診断・欠落メタデータ0件、対象型検査・Lintと既存Controller／Console 58テストが成功した。WebKitとFirefoxでも正常実行・構文エラー・明示flushした分割出力とstale source拒否を確認した。FirefoxはDockerの非rootユーザーで同じresource／capability制限を維持した代表検証であり、物理端末の証拠ではない。

[ローカル再現手順](python-local-proof.md)は公開には使わない。教材・使い勝手・運用安全性の独立レビューでPython画面のJS用案内を修正し、予測の答えを開示前に隠した。修正後の実表示・実行・答えの開閉とdesktop／mobileのaxe違反0件を確認し、必須残件は0件。実行境界の追加読み取りレビューでも必須指摘はなかった。これは通常経路の契約・コードを確認した範囲の結論であり、任意コードの完全隔離を保証しない。

[第三者coreのlicense原文と出典](python-core-distribution.md)は確認した。通知・MPL対象ソース案内の公開artifactへの同梱、実Pages Worker、公開配信・公開前の範囲検証、実人・物理端末は未完である。#138は実Pages受け入れを含むため、ローカル実証だけでは閉じない。#15の後続#139以降の全curriculum、Local CPython、input／package対応はこの最小変更に含めない。

## 一次資料

- [公式coreの配布](https://pyodide.org/en/stable/usage/downloading-and-deploying.html)
- [固定release](https://github.com/pyodide/pyodide/releases/tag/314.0.7)
- [Worker要件](https://pyodide.org/en/stable/usage/webworker.html)
- [loadPyodide API](https://pyodide.org/en/stable/usage/api/js-api.html)
- [CSP3のWASM評価権限](https://www.w3.org/TR/CSP3/)
