# TypeScript Course設計案（Issue #11）

状態: レビュー前の提案。2026-09-29。本人指定の到達点はTypeScript・React・Next.jsまで。以下のLesson数・時間・新しい性能予算・採点契約は未承認であり、既決事項と区別する。教材本文の全量制作・published昇格の承認記録には使わない。

## 到達点と前提

JavaScript最終作品の学習クイズを、型のあるデータ、状態、関数、DOM操作、非同期の境界へ段階的に作り直す。最後に、正常な操作が動くことだけでなく「誤った入力を型検査で止める場所」「実行時に値を確かめる場所」を説明できる。Reactへはデータと関数の型を、Next.jsへは非同期データと失敗状態を引き継ぐ。

既決: JavaScript修了後のrequired Course、Worker型検査→既存JS Runner、最初の演習までCompiler遅延読込、完成と初心者受入後だけ公開Pathへ追加。#8〜#10の教材統合と公開受入が未完了なので、TSの独立した技術実証・設計・小さな教材試作を先行し、学習順序や公開前提は飛ばさない。最終作品は#10の受入済み版の機能チェックリストへ合わせ、独自の簡略作品に置き換えない。

## 要件台帳と今回の差分

| ID          | 区分     | 受け入れ条件                                                                                             |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------- |
| REQ-TSC-001 | 維持     | #11の15トピックを全て扱い、初出説明→小演習→作品への適用を対応させる                                      |
| REQ-TSC-002 | 維持     | JS Capstone相当の挙動、Keyboard/Focus、再挑戦を型安全化後も維持する                                      |
| REQ-TSC-003 | 維持     | 型誤りは未実行・未採点。原文と履歴を保持し、修正・再実行できる                                           |
| REQ-TSC-004 | 維持     | 型検査成功だけでは合格にしない。元TSと実行結果の同一世代を照合する                                       |
| REQ-TSC-005 | 維持     | Home/Path/SlideでCompilerを取得・起動しない。現行隔離・通信禁止・停止上限を維持する                      |
| REQ-TSC-006 | 維持     | 各Lessonに独自Slide、Exercise、Starter、Solution、3段階Hint、正負Fixture、hash付き独立Reviewを持たせる   |
| REQ-TSC-007 | 提案追加 | 下記27 Lesson/595分の順序で制作する。既習JSの再講義ではなく、型による差分を中心にする                    |
| REQ-TSC-008 | 提案追加 | 元TSの限定された型情報と正負の型検査ケースで型習得を確認する。文字列一致や生成JS ASTを代用しない         |
| REQ-TSC-009 | 維持     | 実製品UI、保存、Reset、停止、診断、アクセシビリティ、Security、subpath、性能を対象リスクに沿って検証する |
| REQ-TSC-010 | 維持     | 初心者の通し試用・実機・正式公開受入は未確認のまま残し、合成テストをその代用にしない                     |
| REQ-TSC-011 | 提案追加 | TS固有の初回/再実行/採点/転送量を下記予算で測定し、達成前は予算達成と記録しない                          |

技術境界のREQ-TS-001〜008は維持。追加は上表の提案3件。保留・削除する学習要件はない。依存待ちは#10公開、同Proの独立レビュー、人の受入。復帰条件はそれぞれ前提受入の記録、同Chatでの最新HEADレビュー完了、実施者による観察記録と必要是正の完了である。待機中も依存しない教材試作と型採点実証を進める。

## 再開時の子タスク対応（2026-10-05）

Issue #109で導入03、#110でQuestion/interface、#111でunion/literalとnarrowing・optional/undefinedの独立2Lessonを接続する登録範囲を、#112で関数型/callback・generic・readonlyの3小単元を接続し、#113でDOM Event・unknown・非同期の3課題まで接続した範囲は5Chapter・12Lesson・48枚・225分のdraft。有限な元TS条件と実動作のANDを採用し、type aliasの役割は読む練習、union/optionalは引数を確認して値を使う練習で扱う。以下は全15トピックを残タスクへ対応付けた索引であり、27Lesson/595分案やTS固有性能予算の新たな承認を意味しない。

| 子Issue | 学習目標と順序                                                                      |
| ------- | ----------------------------------------------------------------------------------- |
| #109    | 既存inference → annotation → 型消去と型/実行失敗の区別。現在の通常draft登録範囲     |
| #110    | interface → type alias、オブジェクトと配列の型。#109の製品接続を利用                |
| #111    | optional → union/literal → narrowing。必要な前提を既存教材と接続                    |
| #112    | function type → generic → readonly。再利用と型/値の役割を比較                       |
| #113    | DOM Event、unknown、Error handling、async data。DOM境界を確認して非同期データへ進む |
| #114    | 必要概念が揃った後でJS最終作品を段階的に型安全化するProject                         |
| #115    | 全教材の受入、遅延load・既存性能予算・保存互換、初心者受入と公開Path追加            |

Home初期JSと共通Editorの公開上限はそれぞれgzip 512,000 bytes、Catalog 40,960 bytes、Course Index 81,920 bytes、Lesson Manifest 24,576 bytesを維持する。正本は既存performance YAMLと[2026-10-03の承認済み公開方針](javascript-normal-release-policy.md#2026-10-03-1639-jstの非機能公開上限の承認変更)で、旧理想値へ戻さない。Compiler/Runnerの通信・停止・入力上限は既存契約どおり。この登録でTS固有p95/転送量予算案の達成を主張しない。非対象は下記のCourse設計どおりで、React/Next.js・全TS公開を#109へ追加しない。

## exact curriculum案

IDは `typescript-chNN-lNN`。同一章内は記載順、章先頭は前章末を前提にする。標準Lessonは原則4枚のSlide（意味、読解、予測、編集への接続）と1演習。表の「確認」は教材制作時にRule/Fixtureへ具体化し、実装済みを意味しない。

| Lesson   |  分 | 初出・学習する差分                       | 演習と確認                                                                                                  |
| -------- | --: | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ch01-l01 |  15 | 型推論、number/string/boolean            | 得点変数の値から型を読み、誤った再代入を直す。型の手書きを必須にしない                                      |
| ch01-l02 |  15 | 型注釈、型と値の違い                     | 得点の境界をnumberと注釈し、文字列で同じ表示を作る迂回を区別する                                            |
| ch01-l03 |  15 | 型消去、型誤りと実行時誤り               | 型が通るコードの実行時失敗も観察し、型は実行時の検査ではないと説明する                                      |
| ch02-l01 |  20 | オブジェクト型、interface                | 問題文・選択肢・正答をQuestionとして表し、フィールド不足/誤型を拒否する                                     |
| ch02-l02 |  20 | type alias、配列型                       | 型に名前を付け、問題一覧を型付けする。interfaceとの共通点と用途を比較する                                   |
| ch02-l03 |  20 | optional、undefined、添字の欠損          | 解説のない問題や空の一覧を扱う。省略と明示undefinedの違いも固定設定に合わせる                               |
| ch03-l01 |  20 | literal、union                           | 回答状態を許された値だけで表し、任意stringに広げず誤状態を拒否する                                          |
| ch03-l02 |  20 | narrowing、typeof、null確認              | stringまたはnumberの回答IDを分岐で扱い、値の変換と型の絞り込みを区別する                                    |
| ch03-l03 |  20 | 判別できるunion                          | 未回答/正解/不正解ごとの表示データを持ち、存在しないプロパティを読まない                                    |
| ch04-l01 |  20 | 引数・戻り値の型、void                   | 採点関数の入力と出力を型付けし、数値と表示文字列の境界を分ける                                              |
| ch04-l02 |  20 | function type、callbackの文脈推論        | 回答通知を関数として渡し、引数型の不一致を止める。arrow/宣言の別解を許す                                    |
| ch04-l03 |  20 | generic、型引数                          | 同じ型を保って返す小関数を数値と問題で使う。anyや片方専用のunion実装を区別する                              |
| ch05-l01 |  20 | readonly、読み取り専用配列               | 元の問題一覧を変更せず結果を作る。readonlyを実行時freezeと説明しない                                        |
| ch05-l02 |  20 | DOM取得のnull、要素型                    | querySelector結果を確認してから表示/入力を扱う。非null assertionを省略の代用にしない                        |
| ch05-l03 |  20 | DOM Event、currentTarget、要素の絞り込み | handlerのEvent型と対象を確認して回答を取得する。DOM EventとReact Eventを混同しない                          |
| ch06-l01 |  20 | unknown、anyとの差                       | 未確認データをunknownで受け取り、使用前にtypeof/存在確認を行う                                              |
| ch06-l02 |  20 | 実行時検査と型guard                      | 有効/不正な問題データを分ける。型述語の宣言だけで正しさが保証されると扱わない                               |
| ch06-l03 |  20 | Error handling、catchのunknown           | Errorと文字列等のthrowを分け、画面に安全な失敗案内を返す                                                    |
| ch07-l01 |  20 | Promiseの結果型、async関数の戻り型       | 同梱した非同期データ取得関数を型付けする。外部Networkは開放しない                                           |
| ch07-l02 |  20 | 非同期データを確かめる境界               | await後もunknownを検査し、壊れたデータを問題一覧として扱わない                                              |
| ch07-l03 |  20 | 読込/成功/失敗の状態型                   | 失敗と再試行を含む非同期画面をunionで構成し、誤状態と失敗経路を検証する                                     |
| ch08-l01 |  25 | Guided: 問題modelを型付け                | JS作品のデータmoduleをTSへ移す。全ファイルを型検査対象にし、未型検査JSを混ぜない                            |
| ch08-l02 |  25 | Guided: 状態と採点を型付け               | 共有workspaceを続け、進行状態と得点関数を分離。二重回答と最終問題を確認する                                 |
| ch08-l03 |  25 | Guided: DOM/Eventの境界                  | 既存Keyboard/Focus/ラベルと画面遷移を保ち、型の確認を接続する                                               |
| ch08-l04 |  25 | Guided: 非同期/失敗/再試行               | 正常・空・不正・拒否データを試し、型検査と実行時検査の責務を説明する                                        |
| ch09-l01 |  45 | Capstone: 別題材の型安全なクイズ         | Brief/Checklistから独力制作。標準入出力境界を示し、内部構成や命名の別解を許す                               |
| ch09-l02 |  45 | Capstone: 境界の検証と引継ぎ             | 既存作品とは別workspaceの完成コードを初期値として検証・修正。型が守る範囲/守らない範囲を説明しReactへつなぐ |

集計: 標準21 Lesson/405分、Guided 4 Lesson/100分、Capstone 2 Lesson/90分、計9章27 Lesson/595分（9時間55分）。標準Slideは84枚を提案。ProjectのBrief/Checklist/振り返りは標準Slide数と混同しない。Guidedだけ同一workspaceを継続し、Capstone間のworkspace共有禁止は既存契約どおり維持する。第2Capstoneの初期コードの渡し方は既存持ち出し/保存契約を確認してから確定し、無断で下書きを上書きしない。

全15トピックの初出: inference=01-01、annotation=01-02、interface=02-01、type alias=02-02、optional=02-03、union/literal=03-01、narrowing=03-02、function type=04-02、generic=04-03、readonly=05-01、DOM Event=05-03、unknown=06-01、Error handling=06-03、async data=07-01。JS既習のimport/export、関数、配列、条件、DOM、Event、Promiseは必要箇所で短く復習し、未完の前提教材を既習扱いしない。

## 型習得の判定契約案

現実装は元TS hashと実行証拠を照合する動作採点まで。以下は未実装で、型検査成功やDOM合格で代用しない。

1. まず元workspace全体を現行strict設定で型検査する。構文/型誤りなら既存の未実行・未採点に戻す。Worker故障や契約不整合も合格を作らない。
2. 型が通る場合、教材で明示した対象だけを固定CompilerのAST/checkerで検査する。初期Lessonの注釈有無、interface宣言、readonly等の少数の事実を扱い、任意AST query、ASTそのもの、Compiler objectをWorker境界へ出さない。返却はRule IDと有限の結果/元TS位置に限定する。
3. 型の関係は信頼側が保持する正負の型検査ケースで確認する。正例は受理、負例は指定した検査箇所と診断コードで拒否されることを要求する。関係のない別エラーが出ただけでは負例成功にしない。検査専用ファイルを実行/emit/保存へ渡さない。検査ファイルの型誤りは学習者ファイルの型エラーと別の判定結果にする。
4. 必要な型条件と既存DOM/Console/InteractionのANDで合格にする。例えばnumberの注釈を消して同じ表示を作る解答は、注釈が目標のLessonでは未達、推論が目標のLessonでは別扱いにする。目標と関係しない構文を不必要に固定しない。
5. any、型assertion、非null assertion、診断抑制はLessonごとの明示した禁止条件として元TSで検査する。後半は正負の関係検査と実行時データ検証も組み合わせる。「安全性の完全な証明」や任意の採点回避を防ぐ仕組みとは呼ばない。`as const`のような別用途を一律に教材へ要求せず、必要なら先に説明と許可範囲を追加する。
6. 検査要求はRule種別/件数/対象fileをstrict schemaで制限する。入力上限16ファイル/131072文字とWorker10秒上限を拡大しない。検査用の予約path衝突、stale session/revision、型だけの編集、重複結果、想定外診断はfail-closed。検査量が枠内に収まらない教材は分割し、期限を伸ばして隠さない。

最初の実証は01-02の「得点の注釈」に絞る。正解/合法な別解/型だけ削除/any化/二重assertion/診断抑制/表示固定/型誤り/検査故障の各責務を区別する。結果が整合してからinterface、union、generic、readonlyへ拡張する。正負の型ケースを学習者に秘密の制約として課さず、必要な公開境界と理由を課題に明示する。

## 性能予算案と検証の分け方

共通Home初期JSとEditorの公開上限は2026-10-03承認によりgzip 512000 bytesで、従来の256000 bytesは理想目標の記録に残る。遅延読込条件を維持する。現Compiler Worker約7.28MBは非gzipで、転送量やp95の達成証拠ではない。以下のTS予算は提案値であり、承認済み公開上限や既存JS予算を変更しない。

| 対象                   |           提案上限 | 測り方                                                                         |
| ---------------------- | -----------------: | ------------------------------------------------------------------------------ |
| TS専用初回遅延取得合計 | gzip 2500000 bytes | Compiler/標準lib/TS Runner/Validator/Editorと共通分との差分を生成graphから合算 |
| 初回Preview p95        |            5000 ms | 初回TS演習、cold cacheの新規context 20回、型検査開始から表示結果まで           |
| 再Preview p95          |            2000 ms | 同じ演習、3 warmup後20回、ネットワークcacheとWorker再生成条件を記録            |
| 動作＋型条件の判定p95  |            5000 ms | 代表の単純/DOM/async各演習、3 warmup後20回、再型検査込み                       |
| 操作中の案内           |             100 ms | 検査中/停止可能が描画されるまで。操作を受けた時刻から計測                      |
| 停止時の待機解除       |             300 ms | compile中の停止操作から待機解除まで。遅れた結果が反映されないことも確認        |

Chromium、実行OS/CPU、browser version、Artifact SHA、cache、通信/CPU制限の有無を記録する。CI実測を低速実機の保証へ読み替えない。低速通信/端末の観察では待機案内・操作可能性・再試行も記録し、p95が未達なら読込範囲/再利用戦略を検討する。承認なしに上限を緩めない。非同期Scenarioは既存のbounded待機契約を維持し、この予算を理由にsleepや待機上限を伸ばさない。

作業中は変更対象の型情報/Worker契約テスト、該当正負Fixture、代表Chromium操作を優先する。公開前は既存公開Gate、3 Browser、Security/保存/Keyboard/axe、subpath、初期chunk、代表性能と必要viewportを実行する。同じ入力の成功証拠は再利用する。人の初心者通し試用はJS修了相当・TS初学者を対象に、詰まり、用語、Hint使用、誤概念、作品の自力説明を記録し、未実施を合格扱いにしない。

## 非対象・リスク・承認までの作業

このCourseの非対象はReact TSX、Next.js server/常駐環境、外部Network/秘密鍵、任意npm型、設定自由化、decorator、型体操、ライブラリ宣言作成。React/Next.js/#25は今回の全体目標に残る別Course/環境であり、削除しない。Pythonと任意Tailwindは今回の必須作業に追加しない。

大きなリスクは、型を書くだけの暗記、anyによる迂回、型と実行時の安全の混同、DOM型とsandboxの機能差、診断原文の難しさ、初回Compiler読込である。対策は対応する正負Fixture、未知データの実検証、元TS位置と短い日本語の次アクション、実Runnerの能力照合、上記性能測定。DOM要素constructorやError判定等は標準libに型があってもRunnerで使える証拠にはならないので、教材採用前に実際の許可範囲と実行を確認する。安全設定を教材都合で解除しない。

承認前でも技術実証と少量の教材原稿は進められる。全量制作前に、27 Lesson/595分、Capstoneの引継ぎ方法、型条件契約、性能予算を同じProで独立レビューし、本人判断が必要な範囲変更は具体案で確認する。Proの助言を本人許可へ読み替えない。最新HEADレビュー・必要CI・既存公開Gateが揃うまではmerge/公開条件を満たしたと扱わない。

- [x] #11の受入条件・全15トピックを保持した設計案になっている。
- [x] 非対象はTS Course単位と全体目標を区別した。
- [x] リスク、対策、性能目標、実測条件を明示した。
- [ ] 設計と性能予算のレビュー/必要な本人合意を完了した。
- [ ] 型習得採点契約と最初の教材を実証した。
- [ ] 全教材・独立Review・人の受入・公開Gateを完了した。

型の説明で確認した一次資料（2026-09-29、教材文章は独自制作）: [Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)（推論/注釈/型消去の説明方針）、[Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)（値の検査と絞り込み）、[More on Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html)（関数の入出力とgeneric）。固定Compiler 6.0.3での実行証拠は各教材作成時に別途取得する。
