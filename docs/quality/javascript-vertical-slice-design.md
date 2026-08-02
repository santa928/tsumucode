# JavaScript Runner／Validator vertical slice 設計

- 状態: 承認済み・ローカル検証済み（公開待ち）
- 作成日: 2026-08-02
- 対象: JavaScript Course Chapter 00 と、その後のJavaScript全Courseへ残す実行基盤
- 親ロードマップ: GitHub Issue #1「複数コースとLearningPathを追加する」

## 1. 目的

既存HTML/CSS CourseのURL、端末進捗、下書き、Reset、Review、Slide Library、GitHub Pages互換を維持したまま、JavaScriptを安全に編集・実行・判定できる最初の縦切りを追加する。

この縦切りは技術検証用の使い捨てFixtureではない。JavaScript Courseの正式なChapter 00として残し、Course全体が完成するまでは`draft`としてHomeと公開LearningPathから除外する。

## 2. 決定事項

1. 最初の課題は、完成済みのJavaScript 1行にある文字列だけを書き換える。
2. `index.html`、`styles.css`、`script.js`はすべて表示し、すべて編集可能にする。最初に選択されるFileは`script.js`とする。
3. HTMLだけで同じ見た目を作っても合格させない。JavaScript source、実行完了証拠、Preview結果の3点を判定する。
4. JavaScript固有のEditor、Analyzer、Runner、Validatorは最初のJavaScript演習まで遅延読込する。
5. 学習コードの構文・実行失敗と基盤障害を不正解から分離し、Sourceと直前の正常Previewを保持する。
6. Course完成までは非掲載とするが、品質確認用の直接URLから開ける。非掲載は機密性を意味せず、公開Artifactに含まれるdraft教材はURLを知る利用者から参照可能とする。

## 3. 要件台帳

| ID         | 状態 | 要件                                                                                                |
| ---------- | ---- | --------------------------------------------------------------------------------------------------- |
| REQ-JS-001 | 追加 | `javascript` Runner／Validator／Editor languageをRegistryへ登録できる                               |
| REQ-JS-002 | 追加 | JavaScript固有実装をHome、Path、Slide、HTML/CSS初期graphへ混入させない                              |
| REQ-JS-003 | 追加 | HTML、CSS、JavaScriptの3 Fileを同じWorkspaceで編集・保存・Resetできる                               |
| REQ-JS-004 | 追加 | `script.js`をAnalyzer Workerで構文解析し、fail-closedのCapability Policyを適用する                  |
| REQ-JS-005 | 追加 | 偶発的な無限Loop、無限再帰、無限microtask連鎖を実行budgetで停止する                                 |
| REQ-JS-006 | 追加 | 学習コードをopaque-origin iframeで実行し、Network、Storage、popup、親画面操作、form送信を拒否する   |
| REQ-JS-007 | 追加 | JavaScript source、同revisionの実行証拠、DOM Snapshotの全条件で判定する                             |
| REQ-JS-008 | 追加 | HTML/CSSだけの変更、未実行JavaScript、古いrevisionの証拠で合格しない                                |
| REQ-JS-009 | 追加 | Runner失敗を`incomplete`へ変換せず、`code-error`または`system-error`として案内する                  |
| REQ-JS-010 | 追加 | 失敗時も入力Source、cursor、選択File、自動保存、直前の正常Previewを維持する                         |
| REQ-JS-011 | 追加 | Chapter 00のSlide、Exercise、Hint 3段階、Solution、pass／incomplete／security Fixtureを独自制作する |
| REQ-JS-012 | 追加 | draft CourseをHome、公開Path、Slide Libraryから除外し、直接URLの品質確認を可能にする                |
| REQ-JS-013 | 維持 | HTML/CSS Courseの既存Runtime、Validator、進捗、URL、Chunk境界を回帰させない                         |
| REQ-JS-014 | 維持 | スマートフォンでは編集を提供せず、公開後のJavaScript Courseは進捗非干渉のSlide Libraryを提供する    |
| REQ-JS-015 | 追加 | Chromium、Firefox、WebKit、Keyboard、axe、390x844、1280x720、Subpathを検証する                      |
| REQ-JS-016 | 追加 | Security payload、timeout、stale response、偽装evidence、再試行を自動検証する                       |
| REQ-JS-017 | 追加 | JavaScript全Courseで拡張可能なrule schemaとRunner evidence契約を定義する                            |
| REQ-JS-018 | 追加 | task完了時に日本語commit、secret scan、main push、Pages deployment、公開URLとconsoleを確認する      |

## 4. 要件差分

| 分類 | 内容                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 維持 | HTML/CSS、LearningPath、端末保存、Export／Import、Review、Reset、Slide Library、GitHub Pages静的構成      |
| 追加 | JavaScript Analyzer Worker、Runner、Validator、Editor language、draft Chapter 00、実行証拠、Security gate |
| 保留 | JavaScript全CourseのChapter 01以降、Guided Project、Capstone。vertical slice合格後に別設計で確定する      |
| 削除 | なし                                                                                                      |

保留理由は、Runnerの安全性と教材1 Lessonの難易度整合を先に実証し、未検証の実行契約を全Courseへ複製しないためである。影響はChapter 00だけが先に非掲載Artifactとして存在すること。代替は技術Fixtureだが、使い捨てを避けるため採用しない。復帰条件は本設計の受け入れ条件と初心者確認の合格である。

## 5. 学習体験

### 5.1 Chapter 00

- Course ID: `javascript`
- Publication: `draft`
- Chapter ID: `javascript-ch00`
- Lesson ID: `javascript-ch00-l01`
- Lesson題: 「JavaScriptで画面の文字を変える」
- 到達点: HTMLで用意された要素の文字が、JavaScript実行後に変わることを説明し、文字列だけを変更できる

### 5.2 Slide順序

1. HTMLは内容、CSSは見た目、JavaScriptは動きを担当する
2. `index.html`から`script.js`が読み込まれる関係を見る。ただし`script`要素を暗記課題にしない
3. `document.querySelector("#message").textContent = "...";`を、探す場所・変える場所・結果の3つに分けて読む
4. 演習では引用符の内側だけを変更し、Previewで結果を確認すると予告する

各Slideは既存のscreen budgetを守り、1画面内で本文とコード比較が完結する。世界観は既存の「作業台／ピース／Preview」を維持し、新しい装飾体系を追加しない。

### 5.3 Exercise

- 初期選択: `script.js`
- `index.html`: `#message`を持つ題名と`script.js`読込を含み、編集可能
- `styles.css`: 読みやすい最小見た目を持ち、編集可能
- `script.js`: `document.querySelector("#message").textContent = "ここを書き換えます";`
- 課題: 文字列を「JavaScriptで文字を変えました」へ変更する
- Preview: 変更後の題名を表示する
- Reset: 3 FileをStarterへ原子的に戻す

Hintは、(1) 開くFile、(2) 引用符の位置、(3) 完成する文字列の順で開示し、直前Slideにない構文の新規記述を要求しない。

## 6. Architecture

### 6.1 `JavaScriptAnalyzerWorker`

Workerは`script.js`を実行せず、次を行う。

1. ECMAScript sourceをASTへ構文解析する。
2. Source size、AST node数、入れ子深度、文字列／配列の上限を検証する。
3. Capability Policyに反する構文を診断する。
4. LoopとFunction entryへ、例外ではなく継続可否を返すbudget guardを挿入する。
5. JavaScript Validatorが使うsource factを、同一source hashと共に返す。

Analyzerは専用Workerで動かし、解析deadline超過時は`Worker.terminate()`で破棄する。Worker自体へ学習コードを評価させない。

Parser／transformerはtransitive dependencyへ暗黙依存せず、`acorn@8.18.0`、`acorn-walk@8.3.5`、`magic-string@1.1.0`を直接かつ完全一致versionで追加する。Editor languageは`@codemirror/lang-javascript@6.2.5`を使う。2026-08-02時点のnpm registry metadataでは4 PackageともMIT Licenseである。install後はlockfile全体のaudit、license、実bundle gzipを品質Gateで再検証する。

### 6.2 Capability Policy

Chapter 00で許可するのは、literal、通常の変数／式、許可済みDOM読取・書込、通常Functionである。次はfail-closedで拒否する。

- `eval`、`Function` constructor、dynamic `import()`、WebAssembly
- `fetch`、XHR、WebSocket、EventSource、Beacon
- Worker、SharedWorker、Service Worker
- `window`、`globalThis`、`parent`、`top`、`opener`、`location`、`history`の直接利用
- `document`／`navigator`へのcomputed property accessと未知member access
- URL sinkへの代入、外部resource生成、popup、download、form送信
- string timer、上限を超えるtimer、解析不能なalias経由のCapability access

許可範囲はCourseの進行に合わせて明示的に拡張し、未知の構文やCapabilityを自動許可しない。

### 6.3 `JavaScriptRunnerAdapter`

Runnerは既存`RunnerAdapter`契約を実装し、次の順で描画する。

1. HTML/CSSは既存preview kernelでsanitizeし、同一Origin教材Assetだけをdata／blob URLへ変換する。
2. `script`、event handler属性、外部URLを学習HTMLから除去する。
3. Analyzerが返した監視付きJavaScriptだけをtrusted bootstrapから実行する。
4. iframeは`sandbox="allow-scripts"`、`referrerpolicy="no-referrer"`とする。`allow-same-origin`を付けない。
5. CSPは`default-src 'none'`、`connect-src 'none'`、`worker-src 'none'`、`object-src 'none'`、`base-uri 'none'`、`form-action 'none'`を基礎とし、nonce付きtrusted script、inline style、検証済みdata／blob Assetだけを許可する。
6. trusted bootstrapは危険なglobal APIを実行前に無効化し、timerを追跡・上限制御する。
7. 認証token、session ID、execution revisionが一致するresponseだけを受理する。

iframe self-navigationはCSPだけへ依存せず、AnalyzerのCapability Policyで到達経路を拒否し、navigation検知時は現在renderを失敗させてframeを再生成する。

### 6.4 実行budget

- Source: 1 File 100 KiB以下、Workspace合計300 KiB以下
- Analyzer: 500 ms以内。超過時はWorkerをterminateする
- 学習コード: 100,000 checkpointまたは250 msの早い方で継続を止める
- Parent watchdog: bridge readyが1,500 ms以内に届かなければframeを破棄する
- Timer: 同時10件、1 callback当たり同じbudget、validation前に未完了timerを破棄する

budget guardはLoop conditionまたはFunction entryで`false`を返して処理を抜ける。学習コードが`try/catch`で停止を握り潰せない形にし、guard名はrenderごとに生成して学習Sourceと衝突させない。

### 6.5 実行証拠

`RunnerRenderResult`へ、boundedな`RunnerEvidence`配列を追加する。Evidenceは任意Objectにせず、次のscalar契約を持つ。

- `id`: bounded ID
- `file`: 任意の正規化済み相対Path
- `value`: string／number／boolean

JavaScript Runnerは少なくとも、`javascript.executed=true`、`javascript.source-sha256=<hash>`、`javascript.budget-exhausted=false`を同一session／revisionのrender結果として返す。`LearningSessionController`は全Viewportのevidence一致を検証し、diagnostics、files、snapshotsと共にValidatorへ渡す。HTML/CSS Runnerは空配列を返す。

### 6.6 `JavaScriptValidator`

JavaScript Validatorは既存DOM rule engineを内包し、JavaScript専用ruleだけを追加評価する。

Chapter 00は次の必須ruleを持つ。

1. `script.js`のASTに、`document.querySelector("#message")`で取得した対象の`textContent`へ期待文字列を代入する式がある。
2. evidenceのsource hashが現在の`script.js`と一致する。
3. 同revisionの`javascript.executed`が`true`で、budget超過がない。
4. 全対象Viewportの`#message`が期待文字列を表示する。

JavaScript固有ruleはstrict schemaを持ち、Courseの`validatorId`が`javascript`の場合だけ許可する。未知field、HTML/CSS専用でない曖昧payload、authoring-only dataの公開Artifact混入を拒否する。

## 7. Data flow

1. Learnerが3 Fileのいずれかを編集する。
2. `LearningSessionController`がrevisionを進め、Sourceとcursorを自動保存する。
3. Preview操作が`JavaScriptRunnerAdapter.render()`を呼ぶ。
4. Analyzer Workerが`script.js`を検査・変換する。
5. 合格時だけiframeへHTML、CSS、監視付きJavaScriptを投入する。
6. bridge ready後、Runnerがdiagnosticsとevidenceを返す。
7. 判定操作では全Viewportを同revisionでrenderし、Snapshotを取得する。
8. ValidatorがSource、evidence、Snapshotを評価する。
9. pass時だけ既存の原子的なDraft／CourseProgress保存を使う。

stale revision、異なるsession、異なるsource hash、Viewport間で一致しないevidenceはsystem errorとして破棄する。

## 8. Error handling

| 失敗                  | 扱い                           | Preview                          | Source                |
| --------------------- | ------------------------------ | -------------------------------- | --------------------- |
| 構文エラー            | `code-error`                   | 直前の正常Previewを保持          | 保持・自動保存        |
| Capability Policy違反 | `code-error`のsecurity診断     | 直前の正常Previewを保持          | 保持・自動保存        |
| budget超過            | 実行停止。判定は不正解にしない | frame再生成後に直前Previewを復元 | 保持・自動保存        |
| stale response        | 利用者へ表示せず破棄           | 最新revisionを維持               | 維持                  |
| Worker／bridge障害    | `system-error`と再試行CTA      | 復元できれば直前Preview          | 保持・自動保存        |
| 保存障害              | 既存memory fallbackと復旧導線  | 実行は継続                       | emergency draftを保持 |

診断はFile、1-based line／column、初心者向け説明、次の行動を持つ。基盤障害に対して「コードが間違っています」と表示しない。

## 9. UIとAccessibility

既存Exerciseの3領域構成を維持し、新しい常設Panelを増やさない。

- File tabへJavaScript色を追加するが、色だけで状態を伝えない
- `script.js`はCodeMirrorのJavaScript highlight、2 space indent、bracket matching、close bracketsを提供する
- Error summaryから該当Fileとlineへ移動できる。移動不能時もtext説明を残す
- 実行中、停止、再試行、判定中をlive regionで通知し、focusを奪わない
- mobileは公開後のSlide Libraryだけを提供し、draft CourseはLibraryへ出さない
- 1280x720ではページ全体を通常Scrollなしで操作でき、390x844ではStage内部の救済Scrollだけを許容する

## 10. Testing strategy

### 10.1 Unit／contract

- Analyzerのsyntax、AST fact、guard挿入、source limit、Capability Policy
- `try/catch`、nested Loop、recursion、async callback、microtaskでbudget停止
- Registry ID、lazy import再試行、Runner evidence型とidentity
- JavaScript rule schema、unknown field、authoring-only field、validator result
- Controllerの全Viewport evidence集約、hash不一致、stale revision
- Reset、自動保存、直前Preview復元、diagnostic dedupe

### 10.2 Content

- Course source compile、expected totals、concept trace、screen budget
- Starter／Solution／pass Fixtureがpassする
- HTML-only、CSS-only、wrong literal、syntax error、security payload、timeout Fixtureが期待statusになる
- 3 Hint、Slide参照、Exercise step、Solution非公開を検証する

### 10.3 Browser／security

- Chromium、Firefox、WebKitで編集、Preview、判定、Reset、Review復帰
- fetch、XHR、WebSocket、Beacon、image、form、popup、top／parent、Storage、Service Worker、self-navigationを拒否する
- 無限Loop中も親画面の再試行導線が利用可能である
- forged postMessage、古いtoken、top window source、別revisionを拒否する
- axe critical／serious 0、Keyboard-only、focus return、live region

### 10.4 Visual／performance／release

- 1280x720と390x844を実画像と境界数値で確認する
- Home／Path／Slide初期graphにAnalyzer、JavaScript Runner、CodeMirror JavaScriptを含めない
- Catalog gzip 20,480 bytes以下、Home初期JavaScript gzip 256,000 bytes以下を維持する
- JavaScript固有の増分lazy graphをgzip 180,000 bytes以下とする
- desktopの初回解析＋Preview p95 500 ms以下、判定p95 1,000 ms以下を目標とする
- production build、`/tsumucode/` subpath、Lighthouse、secret scan、Pages deployment、公開consoleを確認する

## 11. 受け入れ条件

- [x] Chapter 00のSlideとExerciseが直前に教えた文字列変更だけを要求する
- [x] 3 Fileを編集でき、`script.js`が初期選択され、3 File Resetと自動保存が動く
- [x] HTMLだけで期待表示を作っても合格しない
- [x] 正しいJavaScript source、実行証拠、DOM結果の組だけがpassする
- [x] 構文、security、timeout、system errorが不正解と区別され、Sourceと直前Previewが残る
- [x] Network、Storage、popup、parent操作、form、navigationのsecurity testが3 Browserで合格する
- [x] draft CourseがHome、公開LearningPath、Slide Libraryへ出ない
- [x] HTML/CSSの全回帰、LearningPath、進捗、Export／Importが合格する
- [x] Editor／Runner／Validatorが遅延配信され、既存bundle budgetを維持する
- [x] Keyboard、axe、390x844、1280x720、performance、Subpath、production buildが合格する
- [ ] 日本語commit、secret scan、main push、Pages deployment、公開URL／console確認が完了する

### 11.1 受け入れ証跡対応

| 要件            | 主な自動証跡                                                                                           | 状態     |
| --------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| REQ-JS-001〜003 | `javascriptRuntimeServices.test.ts`、`javascriptEditorLanguage.test.ts`、`javascript-learning.spec.ts` | 合格     |
| REQ-JS-004〜006 | Analyzer／Runner Unit、`javascript-security.spec.ts`                                                   | 合格     |
| REQ-JS-007〜010 | `JavaScriptValidator.test.ts`、`javascript-learning.spec.ts`、`javascript-errors.spec.ts`              | 合格     |
| REQ-JS-011〜012 | JavaScript content tests、Compiler draft境界test                                                       | 合格     |
| REQ-JS-013〜014 | 全Unit／3 Engine E2E、`javascript-accessibility.spec.ts`                                               | 合格     |
| REQ-JS-015〜016 | 3 Engine Security／Accessibility E2E、14 visual baseline                                               | 合格     |
| REQ-JS-017      | strict rule schema／runtime evidence contract tests                                                    | 合格     |
| REQ-JS-018      | secret scan、commit、push、Pages、公開console                                                          | 実施待ち |

## 12. 非対象

- Chapter 01以降のJavaScript全教材
- `console`専用UI、debugger、Network access、npm package実行
- JavaScript module graph、TypeScript、React、Backend execution
- スマートフォン上のコード編集
- 悪意ある任意JavaScriptへ完全なWeb Platform能力を提供すること

## 13. リスクと対策

| リスク                                         | 対策                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| iframe内の同期Loopで親画面まで応答不能になる   | AST budget guard、dynamic code禁止、Worker解析、parent watchdog、3 Browser実測を重ねる                          |
| HTML編集だけで合格条件を偽装する               | JavaScript AST rule、source hash付き実行証拠、DOM SnapshotをAND評価する                                         |
| JavaScriptから外部通信やnavigationが発生する   | fail-closed Capability Policy、sanitize、opaque origin、CSP、API無効化、navigation検知、E2E request監視を重ねる |
| Parser／Editor／Runnerが初期bundleを肥大化する | JavaScript routeからだけdynamic importし、manifest graphとgzip budgetをGate化する                               |
| Errorが初心者へ難しすぎる                      | raw stackを直接表示せず、File／lineと次の行動を日本語diagnosticへ変換する                                       |
| draft Artifactが公開される                     | Home／Path／Library非掲載を保証し、direct URLは品質確認用で機密ではないと文書化する                             |

## 14. 性能目標

- Catalog gzip: 20,480 bytes以下
- Home初期JavaScript gzip: 256,000 bytes以下
- JavaScript固有incremental lazy graph gzip: 180,000 bytes以下
- 初回Preview p95: 500 ms以下
- 再Preview p95: 250 ms以下
- 判定p95: 1,000 ms以下
- Autosave debounce: 既存450 ms契約を維持
- 編集後Preview debounce: 既存250 ms契約を維持
- UI主要操作応答: 200 ms以内を維持し、長処理はbusy状態を即時表示する

## 15. 完了定義

受け入れ条件、非対象、リスクと対策、性能目標の4項目がすべて残り、テストと実画面のfresh evidenceが揃った時だけvertical sliceを完了とする。pass FixtureやUnit testだけで、Security、3 Browser、公開後確認を代替しない。
