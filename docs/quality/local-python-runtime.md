# Pythonの固定Lessonと事前入力

対象は`python-basics-ch01-l01-e01`から`l04-e01`までの4教材（値・変数、事前入力、条件分岐、反復）です。PyodideとCPythonは教材ID、下書き、Rule、採点履歴、JSON移送を共通にします。Pagesからlocalhostを探索しません。ソースの追加は新規Pages公開を意味しません。

## 固定環境と隔離

実行imageは`python:3.14.2-slim-bookworm@sha256:e87711ef5c86aaeaa7031718a69db79d334d94c545c709583f651b8185870941`です。profileは`cpython-values-v1`です。任意image・command・依存指定を受け付けません。`-I -S -B -u`で起動し、事前入力を専用tmpfsの読み取りファイルへ書き、標準入力として実CPythonへ渡します。入力がない場合は空のファイルです。

既存の信頼controllerがNodeと同じ1件の実行枠を管理します。管理socketはcontrollerだけにあり、学習者のコンテナにはありません。学習者はUID/GID 1000、read-only rootfs、network none、host mountなし、capability全削除、no-new-privileges、既定seccompで実行します。必要な`main.py`だけを専用tmpfsへ渡し、workspaceとtmpは各8 MiBです。CPU 1、memory 256 MiB、PID 64、各実行phase 5秒、stdout/stderr合計64 KiB、Source 100 KiBが上限です。

AST解析用と学習実行用のコンテナは分離します。解析にはBrowser版と同一のASTプログラムを使い、学習Sourceを実行しません。固定版・正常終了・厳密なJSONを確認してから実CPythonで学習コードを実行します。学習者のstdoutを解析factsにしません。両phaseの完了と回収まで実行枠を保持します。

## 実行と採点

`POST /api/python-capabilities`が固定version/profile/contentRevisionを返します。既存のsession認証、Origin/Host確認、run・cancel経路を使用します。学習用adapterはengine/backend/version/run/session/revisionを照合し、古い結果や別engineを採点しません。

変数で数値3をprintし、同じ変数に2を加えてprintした実出力`3\n5\n`と2つのAST factsを照合します。文字列、hardcode、別変数、stdoutによるfacts偽装は合格になりません。構文・実行エラーはコード診断として扱います。

Browserは教材外ASTを実行前に止めます。LocalはOSで隔離した実CPythonで実行するため、教材外ASTでも正常終了する場合があります。その場合はstdout/stderrを表示したまま「未対応」とし、採点しません。実コードの構文・実行エラーは未対応より優先します。この差を合格へ正規化しません。

timeout・出力上限・OOM・利用者停止は制限停止、接続・解析packet・回収の失敗は環境障害です。これらと未対応は不正解履歴へ保存せず、Sourceを保持します。停止はコンテナ全体を終了・削除し、再接続時は自身の所有labelに一致する孤児だけを回収します。Browserへのfallbackはありません。

Pages/LocalのIndexedDBは自動同期しません。HomeでJSONを書き出し、移行先の差分を確認して読み込みます。実行tokenやrunは移送しません。任意pip、外部通信、常駐Pythonサーバーは対象外です。

## 検証

`python-profile.test.mjs`とLocal adapterの回帰に加え、`python-acceptance.mjs`は実Docker/CPythonの版、stdout/stderr、エラー、5秒timeout、実OOM、64 KiB出力、UID/seccomp/capability、通信拒否、socketなし、子processの停止回収、排他と再試行を検査します。

`python-browser-checks` imageは通常UIから既存10 Fixtureと追加3教材の21 Fixtureを同じ期待status/Rule IDで確認し、保存・再読込・JSON移送、接続障害後の再試行、未対応出力、timeout・停止・古い結果、狭幅読書とa11yを確認します。原稿と作者Browserは製品imageへ含めません。CIのLocal Runtime boundaryで既存Node/Nextの回帰と併せて実行します。

Local確認環境はmacOSのDocker Desktop上のLinux container、固定CPython 3.14.2、作者用Playwright 1.61.1のChromiumです。Runtime/停止回収と学習/採点契約の独立レビューを行い、終了コード保持と案内・診断出力表示の指摘を修正しました。

実機と人間の学習観察は未確認です。外部の敵対コードを実行する公開サービスではありません。新しいPages公開はこの変更に含みません。

## 事前入力の契約（#140・A）

ユーザーが選んだA方式は、入力欄の行を実行開始時にコピーし、その実行の終わりまで固定します。空欄は空文字列1行、改行は行の区切りです。16行・UTF-8で1 KiBまで、TAB以外の制御文字は拒否します。入力は下書き、採点履歴、成功Source、共有JSONへ保存しません。

Browserは固定PyodideのsetStdinへ実際の行を渡し、CPythonは固定bootstrapがstdinへ渡します。用意した行が尽きると本物のinput()がEOFErrorを返します。入力不足は未対応・採点対象外です。intのValueErrorや構文・参照エラーとは区別します。実行中に入力を追加して再開する操作は未対応です。

追加3教材のRuleは、inputの結果を表示するAST事実、整数入力と18以上を比較するif/else、range(3)の変数をprintするforを確認します。AST事実だけでなく、実行Sourceのhash・同じrun/session/revision・実入力・実stdoutを照合します。表示の直書き、>で18を外す条件、range(0/1/2)は合格になりません。第1Lessonの2Ruleは維持します。

APIは従来の固定cpython-values-v1と4つの固定exercise IDを使用します。inputLinesはPython要求だけの任意fieldであり、image/command/file path/資源上限の変更は受け付けません。入力不足・上限拒否・停止・環境障害では採点履歴を増やしません。

## 今回完了に含めない条件

#140の元の受け入れ条件にある「実行途中の入力待機」「入力待機中の中止・復帰」は、事前入力方式の検証で満たしたとは扱いません。入力受付・実行・中止・終了は通常画面で区別しますが、実行中の対話入力は残タスクとして維持します。Shell/PTY、SharedArrayBuffer、COOP/COEP、追加権限や公開先を導入していません。
