# Pythonの固定Lesson・事前入力・Local練習

## 現在のLocal練習と固定採点の契約

Local CPythonは「プレビューを更新」（事前入力）、「練習実行」（対話・未採点）、「判定する」（固定テストの別実行）を分けます。Browser/Pyodideは従来の事前入力方式です。以下の事前入力・教材追加の記録は当時の範囲であり、Localの現在の採点入力は本節を正本とします。

練習の入力要求は学習者processから送る不信の申告です。同processから偽装でき、本物のbuiltin input待機や入力消費を証明しません。偽要求で不要な入力欄が出る可能性を画面で示します。申告・送達回数・練習の終了コードやConsoleをValidator、採点履歴、進捗、過去成功へ渡しません。

要求の順序を照合してDockerのpauseを行い、コンテナ全体がRunningかつPausedと確認できた後だけ待機時計を進めます。resume要求の前に計算時計へ戻します。単調時計による計算累計5秒、待機累計60秒、独立した全体65秒の期限を持ち、通常pollの終了と利用者離脱を区別します。pollのleaseは3秒、入力は合計16行・UTF-8で1 KiB、出力は64 KiBです。空行とEOFを別操作にします。run/session/revisionと両Sourceを含むhashを照合し、二重送信・古い入力・停止後の入力を拒否します。

停止は対象全体を削除して404を確認するまで次runを許可しません。削除に失敗した場合は対象IDのboundedなkillと停止確認も試み、回収未確認として次runを拒否します。Dockerへ接続できない状態では物理停止を保証できないため、正常停止とは表示しません。create応答喪失後の空label検索だけで回収済みとせず、遅い作成の可能性を含めて復旧待ちにします。追加の権限、ptrace、PTY、package、外部通信は導入しません。

練習入力は履歴配列・下書き・共有JSON・Source ZIPへ入れません。画面の入力欄は送達後・終了・Source変更・離脱で破棄します。練習の生出力は今回の画面だけに表示し、controllerの結果はackまたは終了から30秒で消去します。終了Promiseはvoidで、生出力を保持しません。文字列参照の破棄はメモリの物理上書きやGC時刻の保証ではありません。使い捨てコンテナは回収します。削除に失敗した場合はコンテナのログが残り得るため、回収済みとは扱わず復旧まで次runを拒否します。

`POST /api/practice/runs`は練習専用Source要求、`/api/practice/runs/:id`はpoll、`/input`・`/cancel`・`/ack`はidentity付き操作です。`POST /api/grades`は入力指定を拒否し、固定の作者入力・期待値だけを採用します。作者の解答Sourceは配信しません。各caseは同じSource/helperを別の使い捨てcontainerで実行し、全件のstdout一致と既存AST事実をANDにします。無入力Lessonも入力なしの実行caseを1件以上持ちます。失敗・不足・未知suiteを合格へ変換しません。最後の結果は通常Controllerの鮮度確認を経て1回だけ進捗へ反映します。

#196の旧試作では、偽装した入力要求を受け入れることを検出しました。この失敗は履歴として維持します。その後ユーザーが「練習専用・不信の入力要求・固定Fixtureの別採点」へ仕様変更を承認したため、「信頼側で本物のinput待機だけを認定する」という撤回済み条件を現在の未完条件には数えません。今回の実装範囲はLocal CPythonです。後続の本人承認に従い、Browserは事前入力と実行全体1.5秒の期限を維持し、途中対話はLocalで扱います。Browserの実行途中入力は未対応として残し、#196はOPENを維持します。61.5秒への期限緩和は行いません。Pages公開は別判断です。

対象は`python-basics-ch01-l01-e01`から`l09-e01`までと`python-basics-ch02-l01-e01`の10教材（値・変数、事前入力、条件分岐、反復、List、Dict、Function、Module、例外、小制作）です。PyodideとCPythonは教材ID、下書き、Rule、採点履歴、JSON移送を共通にします。Pagesからlocalhostを探索しません。ソースの追加は新規Pages公開を意味しません。

## 固定環境と隔離

実行imageは`python:3.14.2-slim-bookworm@sha256:e87711ef5c86aaeaa7031718a69db79d334d94c545c709583f651b8185870941`です。profileは`cpython-values-v1`です。任意image・command・依存指定を受け付けません。`-I -S -B -u`で起動し、事前入力を専用tmpfsの読み取りファイルへ書き、標準入力として実CPythonへ渡します。入力がない場合は空のファイルです。

既存の信頼controllerがNodeと同じ1件の実行枠を管理します。管理socketはcontrollerだけにあり、学習者のコンテナにはありません。学習者はUID/GID 1000、read-only rootfs、network none、host mountなし、capability全削除、no-new-privileges、既定seccompで実行します。既存7教材は`main.py`、新3教材は固定`main.py`と`lesson_tools.py`を専用tmpfsへ渡し、workspaceとtmpは各8 MiBです。CPU 1、memory 256 MiB、PID 64、各実行phase 5秒、stdout/stderr合計64 KiB、Source 100 KiBが上限です。

AST解析用と学習実行用のコンテナは分離します。解析にはBrowser版と同一のASTプログラムを使い、学習Sourceを実行しません。固定版・正常終了・厳密なJSONを確認してから実CPythonで学習コードを実行します。学習者のstdoutを解析factsにしません。両phaseの完了と回収まで実行枠を保持します。

## 実行と採点

`POST /api/python-capabilities`が固定version/profile/contentRevisionを返します。既存のsession認証、Origin/Host確認、run・cancel経路を使用します。学習用adapterはengine/backend/version/run/session/revisionを照合し、古い結果や別engineを採点しません。

変数で数値3をprintし、同じ変数に2を加えてprintした実出力`3\n5\n`と2つのAST factsを照合します。文字列、hardcode、別変数、stdoutによるfacts偽装は合格になりません。構文・実行エラーはコード診断として扱います。

Browserは教材外ASTを実行前に止めます。LocalはOSで隔離した実CPythonで実行するため、教材外ASTでも正常終了する場合があります。その場合はstdout/stderrを表示したまま「未対応」とし、採点しません。実コードの構文・実行エラーは未対応より優先します。この差を合格へ正規化しません。

timeout・出力上限・OOM・利用者停止は制限停止、接続・解析packet・回収の失敗は環境障害です。これらと未対応は不正解履歴へ保存せず、Sourceを保持します。停止はコンテナ全体を終了・削除し、再接続時は自身の所有labelに一致する孤児だけを回収します。Browserへのfallbackはありません。

Pages/LocalのIndexedDBは自動同期しません。HomeでJSONを書き出し、移行先の差分を確認して読み込みます。実行tokenやrunは移送しません。任意pip、外部通信、常駐Pythonサーバーは対象外です。

## 検証

### 反復と遅延生成の草稿Course

`python-practice` は基礎とは独立したrevision・進捗を持つ草稿Courseです。反復の3教材では、`list-comprehension-filter-v1`、`iterator-consumption-v1`、`generator-lifecycle-v1` は、それぞれ説明済みの変換と条件、同じIteratorの消費と再生成、yieldを含む関数の呼び出しと消費をASTで確認します。固定データ・出力順・コード構造はinstructionsに示し、変数名の変更を許容します。使われない正しい構文と表示の直書きは合格にしません。

学生の採点は同一SourceのAST事実と実stdoutを照合します。実Iteratorの同一性やGeneratorのCREATED/SUSPENDED/CLOSEDを直接観測するのは作者検証だけです。作者検証ではCPython 3.14.2とPyodide 314.0.7の実オブジェクトについて、空のList、複数回next、消費済みの再消費、新しいIterator、listによる一括消費を確認します。学生のすべての提出で内部状態を直接観測したとは扱いません。

追加構文は単一の内包表記、iter/list/next、単一引数のGeneratorに限定します。import・属性・入れ子の内包表記・async・class・with・package追加を扱いません。既存の隔離・資源制限・単一main.pyを維持し、対話入力や新しい通信権限を追加しません。Local capabilityのcourseRevisionsで基礎と実践のrevisionを別々に照合し、実践のrevisionがない古いcontrollerは実践の採点に使いません。

`python-iteration-acceptance.mjs` は両engineの正負28 Fixtureと作者の消費/lifecycle観測を行います。`python-iteration.spec.ts` は通常UIで同じFixture、保存・再読込・Reset・JSON移送・基礎との非混入、Preview再実行、Keyboardとa11yを確認します。草稿Courseであり、Pages公開とBrowserの実行途中入力は別の残件です。

### Context managerの正常・例外終了

追加1教材の`context-manager-close-v1`は、固定`from io import StringIO`、with、getvalue()/closed/close()、raise ValueErrorとtry/exceptだけを採点範囲へ追加します。単一main.py、固定engine/image、使い捨てWorker/container、既存の権限・資源制限を維持します。StringIOは各runのメモリ内streamで、OSファイル・path・他Workspaceとの共有・通信を導入しません。一般のimport/属性を解禁しません。ASTは隔離の根拠にせず、Localの既存「教材外を実行して未採点と表示する」契約も維持します。

課題は正常処理・途中例外・終了後利用の固定構成を維持し、streamの変数名だけ変更できます。同じstreamがwithの外でclosedとして参照され、終了後getvalueのValueErrorへつながることをASTの構造・役割名と実stdoutで照合します。未使用with、同じ表示の直書き、manual closeの同じstdoutは合格にしません。任意の同値programを判定する仕組みではありません。

`python-context-acceptance.mjs`は両engineの正負14 Fixtureと、作者による実StringIOの正常/例外close・閉じたgetvalueの失敗・空buffer・再closeを直接観察します。学生の提出毎の直接object観察とは区別します。closeはbufferの利用終了で、物理memory上書きやGC時刻を保証しません。作者の固定実行helperは反復教材と共有し、作者socketをlearnerへ渡しません。

Course revisionは2026-10-12.1から2026-10-12.2へ進め、旧3教材のID/Sourceを維持する空stepsのmigration edgeを持ちます。`python-context.spec.ts`は通常UIの正負Fixture・中止再試行・保存/Reset/JSON移送・旧revision記録をseedした移行・Keyboard/a11yを確認します。Pages公開と既存9教材のレビュー記録不足は別の公開前残件です。

`python-profile.test.mjs`とLocal adapterの回帰に加え、`python-acceptance.mjs`は実Docker/CPythonの版、stdout/stderr、エラー、5秒timeout、実OOM、64 KiB出力、UID/seccomp/capability、通信拒否、socketなし、子processの停止回収、排他と再試行を検査します。

`python-browser-checks` imageは通常UIから既存10 Fixtureと追加3教材の21 Fixtureを同じ期待status/Rule IDで確認し、保存・再読込・JSON移送、接続障害後の再試行、未対応出力、timeout・停止・古い結果、狭幅読書とa11yを確認します。原稿と作者Browserは製品imageへ含めません。CIのLocal Runtime boundaryで既存Node/Nextの回帰と併せて実行します。

Local確認環境はmacOSのDocker Desktop上のLinux container、固定CPython 3.14.2、作者用Playwright 1.61.1のChromiumです。Runtime/停止回収と学習/採点契約の独立レビューを行い、終了コード保持と案内・診断出力表示の指摘を修正しました。

実機と人間の学習観察は未確認です。外部の敵対コードを実行する公開サービスではありません。新しいPages公開はこの変更に含みません。

## 事前入力の契約（#140・A）

ユーザーが選んだA方式は、入力欄の行を実行開始時にコピーし、その実行の終わりまで固定します。空欄は空文字列1行、改行は行の区切りです。16行・UTF-8で1 KiBまで、TAB以外の制御文字は拒否します。入力は下書き、採点履歴、成功Source、共有JSONへ保存しません。

Browserは固定PyodideのsetStdinへ実際の行を渡し、CPythonは固定bootstrapがstdinへ渡します。用意した行が尽きると本物のinput()がEOFErrorを返します。入力不足は未対応・採点対象外です。intのValueErrorや構文・参照エラーとは区別します。実行中に入力を追加して再開する操作は未対応です。

追加3教材のRuleは、inputの結果を表示するAST事実、整数入力と18以上を比較するif/else、range(3)の変数をprintするforを確認します。AST事実だけでなく、実行Sourceのhash・同じrun/session/revision・実入力・実stdoutを照合します。表示の直書き、>で18を外す条件、range(0/1/2)は合格になりません。第1Lessonの2Ruleは維持します。

APIは従来の固定cpython-values-v1と10個の固定exercise IDを使用します。inputLinesはPython要求だけの任意fieldであり、image/command/file path/資源上限の変更は受け付けません。入力不足・上限拒否・停止・環境障害では採点履歴を増やしません。

## 今回完了に含めない条件

#140の元の受け入れ条件にある「実行途中の入力待機」「入力待機中の中止・復帰」は、事前入力方式の検証で満たしたとは扱いません。入力受付・実行・中止・終了は通常画面で区別しますが、実行中の対話入力は残タスクとして維持します。Shell/PTY、SharedArrayBuffer、COOP/COEP、追加権限や公開先を導入していません。

## Collection・Functionの固定教材

l05は同じListを指すaliasから先頭を更新し、元のListを反復して合計します。l06はDictのkeyでvalueを更新し、forで受けたkeyからvalueを読んで合計します。空の観察は要素/keyの更新と読出しを除き、集計部分だけで0を確認します。l07は2引数を足してreturnし、異なる2組で呼び出します。Function内の同名引数と外側の100を比べます。入力は使いません。

各profileは実stdoutと同一SourceのAST事実を照合します。使われない正しいloop/defと定数表示を合格にしません。変数名、加算の左右、Collection集計の+=、Functionの直接return・一時変数return・戻り値保存などの範囲は各instructionsに示します。一般的なPythonの同値性を証明する採点器ではなく、説明済みの固定課題の接続を確認します。AST解析は学習コードを実行せず、Docker隔離の代用にしません。

既存4profileの解析packetは維持し、新3profileはlistReferenceSummed・dictValuesSummed・functionReturnScopedのbooleanを厳密に照合します。Local capabilityのID数上限は固定registryに合わせます。新しいOS・通信・package・対話待機能力は追加しません。#140の対話入力と#196は未完です。

## Module・例外・小制作の固定2ファイル

l08は`lesson_tools.py`のaddをmainから呼び、2組の結果を表示します。l09はparse_number内のintが投げるValueErrorを呼出し元の限定exceptで処理し、その後に終了を表示します。第2章l01は入力2行をListとforで合計する制作です。正常入力、不正文字列、入力不足、未処理例外、構文エラー、構造未達を区別します。整数の受理と期待出力は固定Python自身のintで求め、JavaScript Numberへ丸めません。

新profileだけexact集合`main.py`＋`lesson_tools.py`、UTF-8内容合計100 KiBを受け付けます。任意path、追加ファイル、stdlib、helper内import、相対/star/as import、任意packageを許可しません。信頼側が固定/workspaceへ配置し、固定launcherで検索先を追加します。両fileのAST解析とcompileによる構文確認は学習コードを実行せず、実importは別の学習実行phaseで行います。新profileの教材外ASTは両環境で実行前に拒否します。

両fileのpathと内容を固定順JSONへまとめたSHA-256を、解析・実行・採点で照合します。helper変更時も古い結果を採点しません。Localは各runのcontainerを回収し、Browserは各runのWorker/frameを破棄するためmodule cacheを次のrunや別Workspaceへ持ち越しません。既存7profileの単一Source hashとLocalの教材外実行表示は維持します。

両fileと選択file/cursor、成功Sourceは既存保存形式とJSON移送を使用します。「制作Sourceを持ち出す」はクリック時点の固定2.pyと起動READMEだけをZIPへ入れ、入力・進捗・実行tokenを含めません。展開先での実行は、その環境のPythonと権限に従います。例外・小制作の「入力を渡さない」は0行を渡し、空欄の空文字列1行と区別します。入力は保存しません。

`python-module-profile.test.mjs`は固定file集合・合計容量・bundle hash・解析packetを確認します。`python-module.spec.ts`は通常画面で新3教材の47 Fixture、両fileの保存/Reset/再開、helper変更、古い結果拒否、Workspace非混入、ZIP/JSON、キーボードとa11yを検証します。Pagesの新規公開、#140/#196の実行途中の対話入力はこの変更に含めません。

実行時の例外文にはinputの実値が含まれる場合があります。詳細は今回の非永続Consoleへ表示し、採点履歴には診断の分類・位置と固定案内だけを保存します。履歴やJSONから実入力を再現できる診断文をコピーしません。履歴のcode-error区分は維持します。

### Type hint・dataclass・Testの小Project

草稿ch03-l01は固定単一main.pyで、標準dataclasses.dataclassとio.StringIOを使います。Recordの最小Class/Instance/attribute、注釈非強制、生成init、int変換と負値拒否、with内のyield→sumを組み合わせます。新profile dataclass-test-project-v1は限定教材構文を受け入れ、固定Class/Function名・型注釈・値検証・Test driverのASTと実stdoutをANDで採点します。括弧/空白/コメント/docstringは構造から独立させ、任意の等価Projectを判定するとは扱いません。

Test driverが捕捉したAssertionErrorはConsole『Test失敗』とincompleteの固定案内、未捕捉例外はcode-error、教材外構文や環境障害はsystem-error/未採点です。新ValidationResult種別やtest serviceは追加しません。assertはTestだけに使い、値検証はif/raiseで行います。固定実行は最適化を指定しません。

dataclassとClassの追加は採点grammarの拡張です。ASTは安全境界ではなく、既存のBrowser worker/CSP/deadlineとLocalの単発コンテナ・資源制限・socket非共有が実行境界です。Localの教材外Sourceを未採点で実行する既存挙動も維持します。OS file/通信/任意package/Browser入力/実行権限は追加しません。作者だけが実dataclass fields/注釈非強制/値検証/正常・空・不正時の実stream closeを観察し、提出毎のobject状態証拠とは扱いません。

revision2026-10-12.2→.3は空stepsで移行し、旧4教材のSource/IDを保持します。Home/Path/Pages公開と既存Python基礎9教材のreview不足は別の保留です。

## CIのBrowser診断

`Local Runtime boundary`はPythonのBrowser検証結果をホストへ保持し、`python-browser-evidence-<Source SHA>-<run attempt>`として7日間保存します。検証コンテナはrunnerのUID/GIDで動き、capabilityを追加せず出力先へ書き込みます。結果JSONと、生成された失敗画面・error contextを対象にします。再実行時も元attemptの記録を区別します。

認証ヘッダー等を含み得るtraceはArtifactへ含めません。結果がない場合は警告になり、元の検証失敗を成功へ変換しません。失敗時は該当テストと画面の保存・実行・編集権の案内を照合し、ダイアログ未表示だけで原因を断定しないでください。成功した再実行も、最初の失敗原因が解消した証明とは区別します。
