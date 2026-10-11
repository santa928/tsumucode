# Python Module・例外・小Console制作の実装契約（#142）

状態: 固定2ファイルの契約を承認済み。新3教材と両実行器へ実装し、製品検証で受入を確認する。新規Pages公開は保留。
基準main: `d8612ffa0784d9e767db00f22a6a4a4b9e4a1990`（PR197・main必須CI成功、#141 CLOSED）。
#140全体と#196の対話入力待機は未完。今回の案は事前入力だけを利用する。

## 学習単位と受入

| 単位          | 到達点                                                     | 原稿と課題の最小例                                                      | 確認する誤解                                                         |
| ------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Module        | 別ファイルの関数をimportし、変更を次の実行へ反映する       | `lesson_tools.py`のaddをmainから呼び、3＋5、4＋6を表示                  | importだけで関数が呼ばれる、helperを使わず定数表示、古いmodule cache |
| 例外          | helperのValueErrorが呼出し元へ伝わり、限定exceptで復帰する | 事前入力をhelperのintで変換し、成功値または案内、その後に「終了」を表示 | try外の変換、未処理例外、exceptでEOFErrorまで捕捉、正常値を直書き    |
| 小Console制作 | 既習List・for・Functionと2ファイルを組み合わせる           | 事前入力2行を合計。正常時は合計、不正文字列時は案内、最後に「終了」     | 片方の入力を無視、途中合計を完成値として表示、全例外を握りつぶす     |

新構文は`from lesson_tools import ...`、`try`、`except ValueError`だけに絞る。関数名・引数・return・List・for・input・intは既習内容へ接続する。append、内包表記、raise、else/finally、Class、型注釈、with、generatorを必須にしない。
各単位に説明→最小例→結果→理由、予測と修正、Reflection、3 Hint、Solution、正解・誤解・コードエラーの参照ケースを準備する。Module・例外を第1章のl08/l09、小制作を第2章のl01へ登録し、既存7教材のIDを維持する。

## 現行契約からの差分

| 対象            | 現在                                                                                       | #142専用契約                                                                                                                                              | 適用条件                                                 |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 実行Source      | main.pyのexact集合                                                                         | main.py＋lesson_tools.pyのexact集合。欠落・追加・絶対path・../・別名は拒否                                                                                | 承認済み、新profile限定                                  |
| Source容量      | UTF-8内容合計100 KiB                                                                       | 2ファイル合計100 KiB。ファイル数で上限を倍増しない                                                                                                        | 上限維持                                                 |
| import          | Browserの既存profileは教材外ASTを実行前拒否。Localは教材外でも隔離実行後に非採点の場合あり | 新profileだけ、mainから固定lesson_toolsの指定関数をimport。helper内import、stdlib、相対import、star import、任意pathは禁止。両環境で教材外ASTを実行前拒否 | 構文・実行承認済み、新profile限定                        |
| CPythonの検索先 | -I -S -B -u、main.pyを直接実行。専用領域をimport先に追加しない                             | -I -S -B -uを保持し、信頼launcherだけが固定/workspaceを検索先へ追加。リクエストで検索先・commandを選ばせない                                              | 承認済み、新profile限定                                  |
| Browserの実file | Source文字列を実行                                                                         | 信頼Workerだけが固定/workspaceへ2ファイルを配置し、実importを使用。run後にWorker/frameを破棄                                                              | 承認済み、新profile限定                                  |
| Source照合      | main.pyのSHA-256                                                                           | main.pyとlesson_tools.pyのpath＋UTF-8内容を固定順で照合する固定順JSON bundleのSHA-256。解析・実行・判定に同じsnapshot                                     | 旧7profileの単一hashを維持し、新profileだけ追加          |
| 解析            | 単一Sourceをast.parseし、信頼factsを取得                                                   | 両fileをast.parseし、compile(AST)で構文だけを確認する。解析中にhelperをimport・実行しない。import→定義→呼出し→実表示の関係を照合                          | 固定version・state・型を厳密確認                         |
| 保存            | IndexedDBのfiles/cursors Record、選択file、履歴・成功Source、JSON移送                      | 同じ形式で両fileとcursorを保持。新schemaや保存先、クラウド同期を追加しない                                                                                | 既存形式を利用。実保存/Reset/再開/JSONの検証は必要       |
| 持ち出し        | 従来のJSONは学習状態の移送                                                                 | クリック時点の固定2.py＋起動READMEをZIPへ。既存fflateとdownloadArchiveを再利用する。実行token・入力・進捗はZIPへ含めない                                  | 専用ZIP UIを追加。クリックsnapshotと取消後のdownload防止 |

lesson_toolsは標準libraryと同名にせず、書込先は信頼側定数で決める。保存されるSourceと実行時の一時fileは別であり、学習コードが書いたfileを永続draftへ逆流させない。新たなファイル作成UI、任意filename、package指定、Terminal、常駐Python serverは対象外。

## 維持する隔離・通信・上限

CPythonは固定3.14.2 image、UID/GID1000、readonly rootfs、network none、host mountなし、capability全削除、no-new-privileges、既定seccompを維持する。管理socketは信頼controllerだけにあり、学習者へ渡さない。専用/workspace・/tmpは各8 MiB、CPU1、memory/swap256 MiB、PID64、各実行phase5秒、同時実行1件、stdout/stderr合計64 KiBを維持する。解析containerと学習containerは分離し、両方の回収まで実行枠を保持する。

Browserは固定Pyodide core、opaque sandbox frameとrun専用Worker、private port、既存CSP・FFI/global制限を維持する。追加package・core以外の取得・fetch/WebSocket・保存API・子Workerの許可を追加しない。Source合計100 KiB、出力64 KiB、行4096 bytes・100行、準備20秒・初期化15秒・実行1.5秒を維持する。2fileの解析・importを含めて既存deadlineを適用し、時間が足りない場合に無断で上限を増やさない。BrowserにCPythonと同じOSの256 MiB/PID64強制があるとは主張しない。

事前入力は16行・1 KiB、実行前snapshot固定、TAB以外の制御文字拒否の現契約を利用する。入力はdraft・成功Source・履歴・JSON・ZIPへ保存しない。例外文に混じる実入力も履歴へコピーせず、分類・位置と固定案内だけを保存する。詳細は今回の非永続Consoleで確認する。再開時に再入力を案内する。Pagesからlocalhostを探索・接続しない。Localは既存同一origin/session認証経路だけを利用する。

## 結果と採点の区別

新解析packetは固定versionと`supported`・`unsupported`・`syntax-error`を厳密に区別する。supportedのfactsがfalseなら未達であり、実行可能な課題を構造未達だけで拒否しない。syntax-errorは固定file名と上限付き診断を返し、unsupportedへ潰さない。解析exit/JSON/version/型不一致はsystem-errorとして学習Sourceを実行しない。

新profileのunsupportedは未実行として明示し、executed:trueや成功exitを作らない。現controllerのexitCode比較へ未実行結果をそのまま流すとcode-errorになるため、解析終了状態から明示的に終端する。旧7profileのLocal「教材外でも実出力を表示して非採点」は維持する。

限定exceptで処理したValueErrorは正常出力＋構造条件で判定する。未処理ValueError・NameError・SyntaxErrorはcode-error。事前入力が尽きた本物のEOFErrorはunsupported・採点対象外。停止/時間/出力/OOMは制限停止、接続/解析/回収の失敗はsystem-errorとし、不正解履歴へ保存せずSourceを保持する。tryの外で入力2行を取得してから変換し、EOFErrorをValueErrorの教材処理へ混ぜない。

整数変換は実Pythonのint(text)に基づく。負数、符号、前後空白を理由なく不正入力にしない。Unicode数字や区切り文字等を含むintの受理範囲を、JavaScriptの近似parserだけで採点せず、両固定Pythonで対応を確認する。入力不足・資源停止を不正文字列の案内表示へ正規化しない。

## 適用前に確認するリスクと検証

1. pathやfile集合を緩めると専用領域外への書込や標準moduleの差替えを招く。exact2file・固定書込先・容量・不正path拒否をHTTP入口とBrowser入口の両方で確認する。
2. helperを解析前にimportすると、信頼解析の前に学習コードが動く。両fileの構文解析を先に完了し、解析はASTだけに限定する。
3. mainだけのhashではhelper変更後の古い結果を採点できる。片方ずつ変更した際の停止・stale結果拒否と再実行、run/session/revision、両file hashを確認する。
4. module cacheを再利用すると修正が反映されない。新runのWorker/container、helper変更→別実出力、別Workspace間の混入なしを実測する。
5. 例外分類をまとめるとEOF不足やシステム障害を教材の成功/未達にできる。syntax-error/unsupported/未処理例外/処理済例外/EOF/停止/解析packet異常を分けて確認する。
6. Reset・JSON・ZIPで片方が欠けると制作を再現できない。両file/cursor/selectedFile/成功Sourceの保持、Reset、reload、移送とZIP内容・クリック時snapshot・進捗非変更を確認する。

必要検証は新3教材の正負参照ケースを実Pyodide/CPythonの同じ教材IDで確認すること、代表UI/保存/Reset/再試行/a11y、source offer・compile・型/Lint・関連回帰、独立教材/実行境界レビュー。標準library新対応は最小案では追加しない。将来の追加はmodule名ごとの実対応・追加取得・OSアクセスを別途判断する。

## 実装と統合の範囲

承認済みのexact2file受付、固定lesson_tools importと検索先、Worker内の一時file、両fileの解析/hash、新profileのみのLocal実行前拒否と厳密な解析状態を実装した。OS権限、通信、資源上限、既存7profileの動作を維持する。

入力欄の空欄は従来どおり空文字列1行。新しい例外・小制作教材の「入力を渡さない」操作は0行を渡し、入力不足を区別する。入力は保存せず、実行中は変更できない。

関連回帰と通常画面の両環境検証、独立教材/実行境界レビューを行い、最終HEADの必須CI成功後にマージする。merge SHAのmain CIと受入を確認して#142を閉じる。実施結果はPRの検証記録へ記載する。参照コードだけの実行を製品対応の証拠にしない。

新規Pages deploy/quality dispatch、公開承認/履歴変更、Python正式公開は保留。通常PR/CI成功や契約承認をPages公開の許可へ読み替えない。

## 根拠

- ローカル実体: scripts/local/protocol.mjs、python-profile.mjs、docker-engine.mjs、controller.mjs、PythonExecutionService.ts、pythonWorker.ts、pythonProtocol.ts、PythonLessonValidator.ts、core/persistence/contracts.ts・transferService.ts。
- Python公式: [Module](https://docs.python.org/3.14/tutorial/modules.html)、[例外](https://docs.python.org/3.14/tutorial/errors.html)、[-I等の起動option](https://docs.python.org/3.14/using/cmdline.html)。現行Web文書は3.14.8、固定実行版は3.14.2。本文は独自の日本語説明であり、固定版での作者検証と製品検証は別に記録する。
