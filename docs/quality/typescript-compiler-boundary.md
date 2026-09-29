# TypeScript型検査境界（Issue #11、技術実証）

2026-09-29。今回の本人指定到達点はTypeScript・React・Next.jsまで。JSの学習前提を保持し、未統合教材の独立レビューと並行して、#11の技術検証を進める。Course完成・公開を意味しない。

## 要件台帳

| ID         | 区分 | 要件・今回の扱い                                                                                                                                                |
| ---------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-TS-001 | 維持 | #11の型用語・JS作品の型安全化、#12 React、#14 Next.jsの学習目標を保持。教材順序の確定と全教材制作は後続                                                         |
| REQ-TS-002 | 追加 | 既存固定TypeScript 6.0.3のProgramで構文・意味診断後にemit。型エラー時にJSを返さない                                                                             |
| REQ-TS-003 | 追加 | .ts相対path最大16ファイル、合計131072 UTF-16 code unit。信頼側から同versionの標準libを渡し、CompilerHostは仮想Mapだけを参照                                     |
| REQ-TS-004 | 維持 | 型エラー、構文エラー、環境エラー、実行時エラーを区別。入力Sourceを変更せず、修正後に再試行可能                                                                  |
| REQ-TS-005 | 維持 | Compilerは初期Home/Path/Slideへ入れない。初回要求で専用Workerを生成し、停止/10秒期限/要求置換/離脱でterminate。session/revision/requestを照合。製品画面は未接続 |
| REQ-TS-006 | 維持 | 変換JSにも既存Analyzer/Runnerの隔離と拒否条件を適用する。型検査成功を安全な実行や教材合格とみなさない                                                           |
| REQ-TS-007 | 維持 | 初心者観察・既存公開Gate・独立レビューが揃うまでpublished/Path追加をしない                                                                                      |

保留・削除する既存学習目標はない。同期compiler核に専用Worker境界を追加した。採点/保存への接続、教材、React TSX、常駐Next.jsは未実装の後続作業。

改訂差分: REQ-TS-001〜004/006〜007は維持、REQ-TS-005は維持したままWorkerを実装。要件の保留・削除はなし。source pathは1件256文字以内。Workerの成功/失敗payload混在は環境障害として拒否する。

## 契約と非対象

`compileTypeScript`は文字列Mapを受け、成功時だけESNext moduleのJS Mapを返す。診断は元TSの1始まりのfile/line/columnとplain text（最大50件、1件2000文字）。標準libは学習者入力とは別の信頼側引数。ホストファイル、Node型、npm型の暗黙探索、任意compiler optionは使わない。型定義や.tsxの学習者入力はこの段階では対象外。

コードの実行は一切しない。無限Loopでも型検査は成功し得る。型assertion・any・TypeScript診断抑制の教材上の扱いは、型検査成功だけで採点せず、後続の課題契約で定義する。標準libを渡す責務は信頼側にあり、この関数自体を未検証の外部メッセージへ直接公開しない。

## リスク・性能・受け入れ証拠

入力数/サイズ上限だけでは型計算時間を制限できない。専用Workerは標準libを同梱し、要求ごとに生成・破棄する。読込を含め10秒でterminateし環境障害を返す。これは応答時間の達成目標ではなく停止上限である。cancel/要求置換/離脱はAbortErrorにし、古いWorkerのeventと異なるidentityの応答を無視する。入力は複写し、学習者コードは実行しない。同期関数をUI main threadへ接続しない。低速端末/通信でのp95とproduction配信は未確認、既存Home chunk予算は維持する。

関連テストは実compilerと同versionの標準libを使用し、跨file型不一致→修正→JS生成、DOM/unknown/generic、構文/環境障害、外部import拒否、コード非実行、入力境界を確認する。製品画面のTS診断クリック・停止UI・保存・実行時診断位置は未実装/未確認。Analyzer診断の元TS位置への変換は末尾追補を参照。

2026-09-29検証: プロジェクトの既存Composeコンテナ内の一時複写で対象Vitest 12件、`npm run typecheck`、対象ESLint成功。実compiler6件とWorker lifecycle6件を分け、後者のportは遅延/故障を再現するfakeである。Chromiumでは実Vite Worker/標準libを使い、型誤り→修正、中止→再試行、親画面timer継続、source保持、コード非実行を1件で確認（最終3.5秒）。最初はVite依存最適化のHMR reloadで中断したため、境界試験ページをHMR clientから分離して再成功した。独立したproduction形式bundleも成功（Worker約7.28MB、client約4.02KB、非gzip）。この大きさは初期Homeへ加えず、製品接続時に読込体験と圧縮転送を実測する。途中のUnit再確認では構文・環境テスト1件が5000msでtimeoutした。構文エラー時の不要な意味検査を短絡し、同じ時間上限の12件が成功。構文診断の必須fileに対する不要optional chainもLintで修正。初回Lint1件はテスト名生成の数値文字列化を修正。Firefox/WebKit、製品UI、全suite、公開Gate、production配信後は未実施。受け入れ条件・非対象・リスクと対策・性能目標の保持を確認した。

公式参照: [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)。Programの診断とemitを使い、transpileModuleだけを型検査と呼ばない。将来version更新時はAPI互換と教材診断を再検証する。

## 既存Analyzerへの接続（2026-09-29追補）

`TypeScriptPreparationClient`を追加した。入力を固定して型検査Workerへ渡し、成功したJSだけを既存JavaScript Analyzer Workerへ渡す。開始するTSファイルが存在しない場合と型検査失敗時は解析を開始しない。相対`.js` importのmodule graph・危険操作の拒否・計装は既存契約を維持する。型が正しい`fetch`も安全検査で拒否する。

中止・要求置換・離脱では両Workerを破棄し、待機Promiseを即座にAbortErrorへ確定する。型検査完了直後の中止は解析開始を抑止し、解析中の取消は古い結果の返却を抑止する。不正な次入力でも旧要求は失効する。準備処理の例外は環境障害として分ける。

要件改訂差分: REQ-TS-001〜007は全て維持、保留・削除なし。REQ-TS-006のAnalyzer接続を実装し、Runner接続・採点・保存・教材は後続として残す。元TSへの診断位置変換は下記追補でAnalyzer診断のみ対応。`stage: compile`の診断は元TS、`stage: analysis`の診断/facts/graph hashは生成JSに属する。JSの行番号をTSの行番号へ単純に置き換えて表示してはならない。`stage: environment`は準備経路自体の障害。いずれも製品UIには未接続で、型検査や解析の成功を教材合格・実行成功として保存しない。

追加証拠: Docker内の対象Unit6件（うち実compiler＋実Analyzer2件）、型チェック、対象Lintが成功。残り4件は遅延応答/factory障害のfake portを使った取消競合と経路検証。実Chromiumでは実両Workerによる複数module解析・通信拒否・cancel→retryを1件3.7秒で確認した。初回のテストLintは`void`型引数とinline type importの規約違反を修正し再成功。既存12件の型検査/Worker単体証拠は該当ソース不変のため再利用した。Runnerでの実行、元TSへの診断位置変換、製品UI、他Browser、実機、初心者、公開Gateは未実施。追加の性能目標緩和や権限拡大はない。

## Analyzer診断を元のTS位置へ戻す（2026-09-29追補）

実compilerで`.js.map`も生成し、JSとは別の`sourceMaps`として返す。末尾のsourceMappingURLコメントはJSから除き、mapを実行・配信の追加ファイルとして扱わない。Worker応答では入力に対応する同じJSファイル名のmapを必須とし、map合計4194304 UTF-16 code unitを上限にする。欠損・別ファイル・上限超過は環境障害へ閉じる。

準備結果の`result.diagnostics`/facts/hashは引き続き生成JSに属する。新しい`sourceDiagnostics`だけを固定compilerのmapで元TSへ変換し、元ファイルの実在と行・列範囲を照合する。sourceRootや外部sourceは許可せず、欠損/不正/mapに対応しない場所では位置を省略し、診断内容を保持する。Runnerの実行時stackは未対応。これで製品UIの診断クリックまで完了したとは扱わない。

既存lockにある`@jridgewell/trace-mapping` 0.3.31を直接依存に固定した。APIの1始まりline/0始まりcolumnを確認し、製品契約の1始まりcolumnへ変換する。Dockerのオフラインpackage-lock更新はmetadataキャッシュ不足で失敗し、公式npm registryからmetadataを取得して更新した。ホスト導入や依存script実行なし。既存transitive versionの一括更新はしていない。

改訂差分: REQ-TS-001〜007は維持、保留/削除なし。REQ-TS-006の生成JS診断→元TS位置対応を追加、実行/採点/保存/製品UI/教材/人受入は残る。性能目標と公開Gateは不変。

検証: Dockerの関連Unit計19件（compiler6、Worker契約6、準備6、mapper1）、型チェック、対象Lint成功。実Chromium2件成功（3.5秒/5.1秒、計9.3秒）。interface/type宣言が消える`src/main.ts`の安全検査診断を元の4行1列へ戻す実両Worker経路を確認した。source map欠損/不正/外部source/未対応位置は位置を省略し、欠損/別file/上限超過Worker応答は環境障害とする回帰も確認。初回Lintの不要null判定2件を型の絞り込みに合わせ修正した。production形式bundle成功（client30.99KB/gzip9.26KB、Analyzer175KB、Compiler7.28MB）。今回のsource map対応版のproduction配信実行、他Browser、低速端末p95、Runner実行時stack、製品画面、初心者試用/実機/公開Gateは未確認。

## 既存隔離Runnerへの接続（2026-09-29追補）

`TypeScriptRunnerAdapter`を追加。`.ts`と静的HTML/CSSを分け、型検査成功時だけ生成JSを既存JavaScript Runnerへ渡す。Analyzerを省略せず、既存のmodule graph・計算予算・opaque iframe・認証済みSnapshot/Interactionを使う。準備専用clientとは別の実行経路であり、同じ要求を二重解析しない。未型検査の`.js`混在は拒否する。製品の言語登録・教材・保存・採点にはまだ接続していない。

次のrender受付時に旧compileを取消し、旧Runnerを解放してから新しい型検査を始める。型エラー後に古いPreview/証拠を残さない。中止/要求置換/離脱は即時AbortErrorを返し、非同期完了時にも世代を照合する。再開はstop→prepare→render、dispose後の再使用は拒否する。

型検査診断は`typescript-type-error-*`と`reference`、構文診断は`syntax`、環境/設定障害は`system`として既存契約へ渡す。新しい診断kind追加や採点契約変更はしない。実行証拠とhashのJSファイル名は維持し、TS sourceの証拠と偽らない。JS診断だけsource mapを使って元TSへ戻し、HTML/CSS診断は維持する。既存Runnerの実行時診断に行・列がない場合はTSファイル名だけを返す。stackの詳細位置対応は引き続き未実装。

要件差分: REQ-TS-001〜007は維持、保留/削除なし。REQ-TS-006の隔離実行接続を追加。非対象（製品UI/採点/保存/教材/React TSX/Next.js）と人の受入、性能目標、公開Gateは維持する。

追加検証: Docker内Runner Unit4件（fake portで型誤り→修正、compile中止、Runner準備中の置換、実行中の離脱）成功。実Chromium1件で型付きDOMを2へ更新した認証済みSnapshot、allow-scriptsだけのsandbox、通信拒否診断の元TS2行目、型誤り時の証拠なし/旧frame解放、stop→prepare→renderの復帰を確認した。製品UI・実機・人の試用ではない。初回のテストLint13件はmockの型指定/void/inline import型/arrowの書式を修正。既存19Unitと両Worker基盤2件は入力不変のため成功証拠を再利用し、全suite/他Browser/現Runnerのproduction配信/公開Gateは未実施。受け入れ条件・非対象・リスク対策・性能目標を維持した。

## 型検査失敗を採点へ渡さない（2026-09-29追補）

REQ-TS-004/006を維持し、実行結果に`type-error`を追加した。compilerが返す`typescript-type-error-*`診断をこの状態へ分類し、一般の実行時`code-error`から分ける。既存の診断kind・永続化形式は変更しない。Sessionは型検査失敗時にValidator/Snapshot/合否保存へ進まず、診断を表示して下書き・過去の合格記録を保持する。実行結果自体は従来どおり永続化しない。画面に「型を確認してください。まだ実行・採点していません。」と示し、コード修正後のPreview更新を使えるままにする。

改訂差分: REQ-TS-001〜007維持、保留・削除なし。型エラー非採点境界と状態案内を追加。TS Course登録・教材・型の学習要件を採点する仕組み・人の受入・既存公開Gateは引き続き未完了/必須。

Docker関連90件（BrowserExecutionService6、Session46、Routes38）成功、型/対象Lint成功。型検査失敗と実行時reference診断の分類、Validator非呼出し・履歴/合格snapshot維持、修正後再実行を検証した。実Chromiumでは実演習画面に診断portだけをfake注入し、1280×900で案内の表示と収まり（x29/y104.375/w259.75/h38.375）、判定時の診断、再実行成功を確認。これはTS教材の通し試用ではない。初回テストのTesting Library非対応exact引数2件を除去して型検査成功。一時画面検証のURLを実際のルート配信に修正して成功。全suite/他Browser/実機/公開Gateは未実施。

## 元TSと動作採点の接続（2026-09-29追補）

| 要件            | 改訂 | 今回の差分                                                                                                      |
| --------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| REQ-TS-001〜007 | 維持 | 保留・削除なし。教材・型の習得条件・初心者/実機受入・公開Gateを残す                                             |
| REQ-TS-008      | 追加 | 元TSを含む全ファイル・実行設定・session/revisionをSHA-256で結び、型消去で生成JSが同じでも古い実行証拠を拒否する |

`TypeScriptValidator`は元ソース証拠と同一世代のSnapshotを照合してからWorkerで再型検査し、生成JSを既存JavaScript Validatorへ渡す。JS module graph hash、認証済み実行証拠、DOM/console/Interactionの採点を維持する。型検査成功だけでpassを作らず、動作要件が不足すればincomplete、証拠欠落/重複/不一致・Worker障害はsystem-errorで未採点にする。入力TSは保存用の原文のまま保持する。

TSからの委譲に限ってJavaScript Validatorを`behaviorOnly`で使う。通常のJavaScript教材は従来どおりSource Ruleを必須にする。TS側は`javascript-source` Ruleを拒否し、消去後ASTを「型を学べた」証拠にしない。型の学習要件（anyへの逃げ・必要な型境界など）を判定する教材固有契約は後続で必要であり、現在の動作採点だけでTS教材完成とはしない。

Runtime schemaへTypeScript module/.ts entryを追加し、Course/entryの言語一致と既存Interaction profile制約を確認する。編集可能なTypeScript演習に到達した時だけRunner/Validator/TS Editorを登録し、Compilerは最初のcompileまでWorkerを生成しない。Course CatalogやPathには追加しない。

性能目標は不変。採点時の再型検査には追加コストがあり、全TS教材を接続する前に初回/再採点のp95を測定する。現段階では採点整合を優先し、型検査を省略するcacheは導入しない。受け入れ条件・非対象・リスク対策・性能目標を維持する。

Dockerの関連8ファイル計185件が成功（schema98、JS Validator16/Rule14、TS Runner4/Validator10、言語登録4/TS Editor1、Routes38）。型・対象Lint・production build・既存chunk検査も成功。実Chromium2件では型検査→隔離実行→採点のpass/incomplete、型だけ変更した元TS・改変されたJS hashの拒否、型エラー非実行と停止後復帰を確認した。初期配信のlibrary/normalLearning両entryの静的7/10chunkとindex HTMLにTS実装・Compiler参照が混入していないことを生成物で確認した。

初回の型検査では配列要素のundefined考慮不足と検証mirror内のファイル名大文字小文字重複を修正。テストLintのspy型とmatcher代入を修正し、受入条件の緩和はしていない。手動配信graph検査は実在しないindex.html manifest keyで一度失敗し、実ビルドの両entryとHTMLに合わせて成功した。製品TS演習の通し操作・保存・診断クリック・Console表示の接続、型の学習要件、現版のproduction実配信、他Browser、全suite、人の試用/実機、p95、公開Gateは未確認であり、教材作成時/公開前に確認する。
