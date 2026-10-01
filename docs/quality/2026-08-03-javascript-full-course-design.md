# JavaScript全Course 設計

- 状態: 全Course設計は書面レビュー承認済み。Runtime基盤・Ch00〜08・Ch09先頭1単元はmainへ統合済み。Ch09の後続3単元は独立レビュー待ちの候補。Ch10〜13、全Course受入は未完。配信済み範囲とSHAはIssue #5を正本とする。
- 承認日: 2026-08-04
- 作成日: 2026-08-03
- 対象: `javascript` Course Chapter 01〜13、既存Chapter 00の互換維持、全Course公開
- 親ロードマップ: GitHub Issue #1「複数コースとLearningPathを追加する」
- 基盤設計: `docs/quality/javascript-vertical-slice-design.md`

## 1. 目的

既存Chapter 00で実証したJavaScript Analyzer、opaque-origin Runner、Validator、端末保存、Reset、Slide復帰を完成Courseへ拡張する。完全初心者が値と変数から始め、Consoleで小さな結果を確かめ、DOM、Event、State、非同期処理を段階的に組み合わせ、最後にKeyboard操作できる学習クイズを設計・実装・検証できる状態を到達点とする。

Courseは技術項目を列挙するだけの辞書にしない。各標準Chapterで「読む→1点変更→組み合わせる→クイズ部品へ接続」を繰り返す螺旋型とし、直前のSlideにない構文をExerciseで要求しない。全LessonのSlide、課題、Hint、Solution、Fixture、判定条件はTsumuCode独自教材として制作する。

## 2. 承認済み決定事項

1. 最終作品は学習クイズとする。
2. 想定学習時間は14〜18時間とし、本設計では52 Lesson、合計1,000分（16時間40分）とする。
3. Course構成は螺旋型とし、概念単独Exerciseとクイズ部品への統合を交互に行う。
4. 値、Loop、Function、Debug章では、Exerciseごとに必要な場合だけPreview枠をConsoleへ切り替えられる。
5. Consoleは専用REPLにせず、現行Exerciseの3領域Layoutを維持する。
6. Moduleは同一Workspace内の相対static import／exportだけを扱う。
7. Promise、`async`／`await`、bounded timerを扱うが、学習コードのNetwork accessは開放しない。
8. 対話型Exerciseは、判定時にtrusted bridgeが安全な操作Scenarioを実行し、Source、実行Evidence、Console、DOM、FocusをAND評価する。
9. 開発中はCourseを`draft`に保ち、全教材、初心者検証、品質Gateが揃うまでHome、LearningPath、Slide Libraryへ掲載しない。
10. Chapter 00のID、Workspace、進捗、下書き、passing snapshotを維持し、全Course化だけを理由にResetしない。

注記: 設計対話中の章別時間の合計表を再計算し、16時間35分ではなく16時間40分が正しいことを本設計で訂正した。章数、Lesson数、各章時間は変更していない。

## 3. 要件台帳

| ID          | 状態 | 要件                                                                                                           |
| ----------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| REQ-JSC-001 | 維持 | 既存HTML/CSS、LearningPath、端末進捗、下書き、Reset、Slide復帰、Export／Import、GitHub Pages互換を回帰させない |
| REQ-JSC-002 | 維持 | JavaScript Chapter 00の全ID、Workspace、Starter、進捗、下書き、passing snapshotを保持する                      |
| REQ-JSC-003 | 追加 | JavaScript Courseを52 Lesson、1,000分の螺旋型Courseとして構成する                                              |
| REQ-JSC-004 | 追加 | 値、変数、型、演算、条件、Loop、Function、Scope、Closureを扱う                                                 |
| REQ-JSC-005 | 追加 | Array、Object、Destructuring、`map`、`filter`、`reduce`、immutable updateを扱う                                |
| REQ-JSC-006 | 追加 | Module、Error、Debug、DOM、Event、Form、State、Promise、`async`／`await`を扱う                                 |
| REQ-JSC-007 | 追加 | Keyboard、Focus、Accessible Nameを対話型Webアプリの必須品質として扱う                                          |
| REQ-JSC-008 | 追加 | 各標準Lessonに直前Slideと整合するExercise、3段階Hint、Solution、正負Fixtureを持たせる                          |
| REQ-JSC-009 | 追加 | Guided Projectを5 Lessonの共有Workspaceで進め、学習クイズを段階完成させる                                      |
| REQ-JSC-010 | 追加 | CapstoneはBrief、Checklist、評価条件から別デザインのクイズを独力制作させる                                     |
| REQ-JSC-011 | 追加 | ExerciseにstrictなJavaScript runtime設定を持たせ、任意Recordを公開契約へ通さない                               |
| REQ-JSC-012 | 追加 | Capabilityを`core`、`modules`、`dom`、`async`、`project`の固定Profileで段階開放する                            |
| REQ-JSC-013 | 追加 | Profile選択に関係なくNetwork、Storage、popup、親画面、navigation、dynamic code、任意URLを拒否する              |
| REQ-JSC-014 | 追加 | Console outputを件数、1件サイズ、合計サイズ、Object深度を制限してplain text表示する                            |
| REQ-JSC-015 | 追加 | Console outputを進捗へ二重保存せず、Sourceと既存Draftだけを永続化する                                          |
| REQ-JSC-016 | 追加 | 同一Workspaceの相対static module graphを解析・解決・instrumentし、graph hashをEvidenceへ結ぶ                   |
| REQ-JSC-017 | 追加 | bare import、dynamic import、path escape、循環module、未知moduleを初心者向け`code-error`で拒否する             |
| REQ-JSC-018 | 追加 | 対話判定Scenarioはboundedな`click`、`fill`、`select`、`key`、`focus`だけを許可する                             |
| REQ-JSC-019 | 追加 | Scenarioは新しいiframeから開始し、checkpointごとにConsole、DOM、Focus、Evidenceを取得する                      |
| REQ-JSC-020 | 追加 | 非同期checkpointは固定sleepでなく期待状態を750 ms以内でpollする                                                |
| REQ-JSC-021 | 追加 | Source判定は型付きAnalyzer factを使い、任意AST queryやValidator内の学習コード実行を禁止する                    |
| REQ-JSC-022 | 追加 | 早期Lessonは必須概念をSourceでも確認し、後期Lessonは振る舞い中心で別解を許可する                               |
| REQ-JSC-023 | 維持 | Runner失敗を不正解扱いせず、Source、cursor、選択File、自動保存、直前成功Previewを保持する                      |
| REQ-JSC-024 | 追加 | 直前成功Preview／Consoleを残す場合は「前回成功時」と明示し、現在結果と誤認させない                             |
| REQ-JSC-025 | 追加 | JavaScript固有Runtime、Module builder、Console UI、Scenario UIを最初の対象Exerciseまで遅延読込する             |
| REQ-JSC-026 | 維持 | スマートフォンではコード編集を提供せず、公開後は進捗非干渉のSlide Libraryを提供する                            |
| REQ-JSC-027 | 追加 | Course完成まで`draft`を維持し、直接URLだけで章単位検証とPages公開を行う                                        |
| REQ-JSC-028 | 追加 | 完成時だけ`frontend` LearningPathへHTML/CSS後の`required` Stepとして追加する                                   |
| REQ-JSC-029 | 維持 | LearningPath進捗はCourse進捗から導出し、JavaScript用のPath進捗を保存しない                                     |
| REQ-JSC-030 | 追加 | Concept graph、用語初出、Slide→Exercise→Rule trace、screen budget、Example実行をcompile時に検証する            |
| REQ-JSC-031 | 追加 | 全Lessonをauthorと別IDのreviewerがsource hash付きで承認し、変更時はstale化する                                 |
| REQ-JSC-032 | 追加 | Chromium、Firefox、WebKit、axe、Keyboard、複数viewport、Security、Performance、Lighthouseを通す                |
| REQ-JSC-033 | 追加 | 全Courseを少なくとも1名の完全初心者が通し、観察記録と是正結果を残す                                            |
| REQ-JSC-034 | 維持 | taskごとに日本語commit、secret scan、main push、Pages deployment、公開URLとconsoleを確認する                   |
| REQ-JSC-035 | 追加 | Course昇格時にHome、Course直接開始、LearningPathの続きから、Slide Libraryを本番回帰確認する                    |

### 3.1 Core Runtime／Console実装証跡

2026-08-05時点で、Chapter 00互換のCore Runtimeとbounded ConsoleをProduction buildへ実装し、下表の範囲を検証した。これは52 Lessonの全Course完成を意味しない。Courseは引き続き`draft`であり、Chapter 01〜13、全Course review、初心者検証、Course昇格、本番公開後回帰は未完了である。Scenario Runtime基盤の後続証跡は3.3へ追記する。

- Production artifact SHA-256: `38be0f65d89f10a4854b32ef883c32eca9787ba5b38e493894a622e2228ceab0`
- JavaScript固有lazy graph: `19,608 bytes gzip`（予算`180,000 bytes`以下）
- Browser／Accessibility／Security／Responsive: Chromium、Firefox、WebKitで`148 passed / 2 skipped / 0 failed / retry 0`
- Performance: `21/21`、bundle／subpath予算`9/9`
- JavaScript実測: 初回Preview p95 `35 ms`、再Preview p95 `25.5 ms`、判定p95 `62.1 ms`
- Console実測: 100件を20回更新し、50 ms超のlong task `0`
- Visual baseline tree SHA-256: `905a7e2b8cd881439ac5a051ae24c3157139c2c58c8e48f873767ba50c51eb86`

| 要件        | 状態                    | 自動／目視証跡                                                                                                                          |
| ----------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-JSC-011 | Core基盤検証済み        | `javascript-security.spec.ts`の実Analyzer→Worker→opaque iframe経路とstrict diagnostics契約                                              |
| REQ-JSC-012 | 固定Profile基盤検証済み | `core`／`project`の拒否matrix。各章での段階開放教材は未完了                                                                             |
| REQ-JSC-013 | Core基盤検証済み        | Network、Storage、Worker、Service Worker、eval、Function、dynamic import、popup、親画面、navigation、form、外部画像を`code-error`で拒否 |
| REQ-JSC-014 | 検証済み                | 100件、1件4 KiB、合計64 KiB、深さ3、collection 50、cycle、getter、Proxy、Unicode、plain text表示                                        |
| REQ-JSC-015 | 検証済み                | Console確認後のReset／再読込でoutputを復元せず、Source Draftだけを永続化                                                                |
| REQ-JSC-023 | Core基盤検証済み        | runtime error前のConsole保持、再試行、Source保持、直前成功表示をE2Eで確認                                                               |
| REQ-JSC-024 | 検証済み                | `前回成功時のConsoleです`と`前回の記録`をbaseline原寸目視                                                                               |
| REQ-JSC-025 | Core基盤検証済み        | Home／Path／HTML Slideの静的graphからJavaScript Runtime、Console、Analyzer、Validatorを分離し、増分`19,608 bytes gzip`                  |
| REQ-JSC-032 | Core基盤のみ検証済み    | 3 Engine、axe、Keyboard、1280×720／768×1024／390×844、Security、Performanceを通過。全Course Gateは未完了                                |

### 3.2 static Module実装証跡

2026-08-05時点でREQ-JSC-016、REQ-JSC-017を実装した。Analyzer Workerは同一Workspaceの到達可能な相対static import／exportを依存先優先へ解決し、全Moduleをinstrumentしてpath昇順のgraph SHA-256へ結ぶ。Runnerは解析済みSourceを文字列断片と依存Fileの閉じたPlanへ変換し、opaque iframe内だけでBlob URLを生成・import・破棄する。ValidatorはWorkspaceを一度だけ再解析し、実行時graph hashと依存Fileの型付きFactを照合する。

- Unit: module path、bare／dynamic import、未知File、path escape、循環、構文位置、決定順、hash、Plan閉包、Runner Evidence、Validator graph照合
- Browser: Chromium、Firefox、WebKitのopaque iframeでstatic Module実行 `3/3`、JavaScript Security回帰 `21/21`
- Security: Network／Storage／popup／親画面／navigation／dynamic codeは未開放。CSPの`connect-src 'none'`とopaque sandboxを維持
- Performance: Runner performance `21/21`、bundle／subpath予算 `9/9`
- Error境界: Module構文エラーは起点Fileと位置付き`syntax`、契約外importとgraphは学習者向け`code-error`、基盤失敗は`system-error`

REQ-JSC-021の型付きAnalyzer FactとModule graph hash照合はModule範囲で実装済みである。ただしChapter 01〜13が要求する全Fact種別とLesson別Ruleは教材タスクで追加するため、要件全体は未完了のままとする。

### 3.3 Scenario Runtime実装証跡と未完了境界

REQ-JSC-018のContent契約は2026-08-06に実装した。公開Artifactは最大4 Scenario、各最大10 action、checkpointごと最大16 expectationをstrict unionで保持し、ID一意性、`afterActionId`参照、`dom`／`async`／`project` profile限定をCompilerで検証する。Runnerの`InteractionRequest`／`InteractionResult`とValidatorの`InteractionCheckpointResult`入力境界も追加済みである。

2026-08-09にtrusted action executor、新規iframeごとのScenario実行、750 ms bounded poll、5種expectationのpure評価、Validator集約をProduction Runtimeへ実装した。回答click→得点→次問→結果→再挑戦、fill、select、Enter／Arrow key、FocusをChromium、Firefox、WebKitで実行し、Scenario間のstate、timer、Console、Focusを分離した。

- Validator: expectation falseは`incomplete`、checkpoint欠落、identity不一致、unknown expectation、duplicate resultは`system-error`としてfail-closedにする
- Security: forged postMessage、別frame、stale revision／generation、replay request ID／token、257文字selector、4,097文字fill、navigation、外部requestを拒否する
- Accessibility: Keyboard-only、Accessible Name、Focus復元、`aria-live="polite"`の判定要約、axe critical／serious 0を3 Engineで確認する
- Responsive: 1280×720は工程票、Editor、Preview、CTAを1画面へ収め、768×1024／390×844はPC案内へ切り替え、390×844のSlideはStageだけを救済Scrollする。境界数値と4枚の実画像を確認した
- Performance: 標準20 Scenario p95 `13.3 ms`（予算`1,500 ms`以下）、Guided相当4 Scenario合計`49.9 ms`（予算`3,000 ms`以下）
- Full local gate: `npm run check`は`156 files / 1,553 tests`、3 Engine E2Eは`461 passed / 124 skipped / 0 failed`、性能は`22/22`とbundle／subpath予算`9/9`、Lighthouseは4 URL×3回の`12/12`、静的Artifactは`199 files`、`/tsumucode/` smokeとPrettierはPASS

WebKitではopaque iframeに対する親からのprogrammatic focusが反映されない既知問題（WebKit Bug 278553）がある。trusted executorはnative `focus()`を実行した上でbootstrap token由来の非公開signalをbridgeへ渡し、SnapshotのFocus証跡だけを補完する。signal名とtokenは学習DOMへ公開せず、Snapshot取得後は親画面のFocusを復元する。

| 要件        | 状態                | 自動／目視証跡                                                                                      |
| ----------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| REQ-JSC-016 | Runtime基盤検証済み | static Module graph、hash、opaque iframe実行、危険import拒否                                        |
| REQ-JSC-017 | Runtime基盤検証済み | bare／dynamic import、path escape、循環、未知moduleのtyped error                                    |
| REQ-JSC-018 | Runtime基盤検証済み | 5 actionのstrict executor、identity、size上限、replay拒否                                           |
| REQ-JSC-019 | Runtime基盤検証済み | Scenarioごとの新規frame、checkpoint Snapshot、state／timer／Console／Focus分離                      |
| REQ-JSC-020 | Runtime基盤検証済み | 50 ms以下interval・最大750 msの期待状態poll、固定sleepなし                                          |
| REQ-JSC-021 | Runtime一部検証済み | 型付きAnalyzer fact、Source＋Evidence＋Console＋DOM＋FocusのAND。全Course用Fact追加は教材taskで継続 |
| REQ-JSC-022 | 集約基盤検証済み    | 必須Source ruleとScenario結果のAND集約。Lesson別の別解許容条件は教材taskで継続                      |

ここで検証済みなのはRuntime基盤である。Chapter 05〜13を含む全52 Lesson、各LessonのScenario／Rule、完全初心者の通し検証、Courseの`published`昇格、LearningPath追加は未完了であり、本証跡を全Course完成へ読み替えない。

### 3.4 Chapter 01〜03 Core教材の実装証跡と未完了境界

2026-08-09にChapter 01〜03の13 Lesson／52 Slide／13 Exercise／195分を実装し、既存Chapter 00を含むCourse累計を14 Lesson／56 Slide／14 Exercise／210分へ更新した。値・変数・型・演算、条件分岐・Loop、Function・Parameter／Return・Scope・Arrow Function・Closureを、各Lesson 4 Slideから1箇所変更のExerciseへ接続した。

- 教材契約: 全13 Exerciseに3段階Hint、Solution、5件以上の正負Fixture、Source FactとConsoleのAND判定を持たせた
- 別解境界: ClosureはFunction expressionまたはArrow Functionを`group: any`で許可し、global変数、毎回reset、出力だけの偽装を拒否した
- 教材品質: JavaScript Provenance `330 files / 330 items`、全2 Course `65 lessons reviewed / stale hashes 0 / rejected 0`
- Unit／Content: `159 files / 1,583 tests / 0 failed`
- Browser／Accessibility: Chromium、Firefox、WebKitで`507 passed / 150 intentionally skipped / 0 failed`。1280×720と390×844のChapter 03代表画面を原寸目視し、Document Scroll、横はみ出し、重大なaxe違反はいずれも0
- Security／Runtime: 全14 Exerciseのpass／incomplete／syntax／security／概念偽装Fixtureを実Analyzer→Runner→Validator経路で確認し、学習者の誤りと基盤失敗を分離した
- Performance: `22/22`、bundle／subpath予算`9/9`、Lighthouse 4 URL×3回の`12/12`
- Static artifact: `/tsumucode/` subpath、学習chunk分離、Production CSS inline、`236 files`の静的Artifact検査を通過した
- 公開境界: Courseは`draft`を維持し、Home、LearningPath、進捗非干渉Slide Libraryへ未掲載のまま、直接URLだけを章単位β検証対象とする

| 要件        | Core範囲の状態                 | 自動／目視証跡                                                                                          |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| REQ-JSC-001 | Core回帰検証済み               | HTML/CSS、LearningPath、保存、Reset、Review復帰、Export／Import、GitHub Pages subpathを全回帰           |
| REQ-JSC-002 | 検証済み                       | Chapter 00のID、Workspace、Starter、Draft、passing snapshotを維持                                       |
| REQ-JSC-003 | Core 13／全52 Lesson           | Chapter 01〜03は195分で完成。Chapter 04〜13の39 Lesson／805分は未実装                                   |
| REQ-JSC-004 | Core範囲検証済み               | 値からClosureまで13 Lesson、52 Slide、13 Exerciseで実装                                                 |
| REQ-JSC-008 | Core範囲検証済み               | 全13 Lessonの直前Slide整合、3 Hint、Solution、5件以上Fixture                                            |
| REQ-JSC-021 | Core範囲検証済み               | 型付きSource Factと同一revisionのConsoleをANDし、Validator内で学習コードを再実行しない                  |
| REQ-JSC-022 | Core範囲検証済み               | 導入概念は必須Fact、既習Function表現は明示的`group: any`で別解許可                                      |
| REQ-JSC-030 | Core範囲検証済み               | Concept、用語、Trace、screen budget、実行ExampleをContent Gateで確認                                    |
| REQ-JSC-031 | Core範囲検証済み               | authorと別reviewer ID、Lesson source hash、stale 0、rejected 0                                          |
| REQ-JSC-032 | Core範囲検証済み               | 3 Engine、axe、Keyboard、複数viewport、Security、Performance、Lighthouse                                |
| REQ-JSC-034 | ローカル前提検証済み・公開待ち | 日本語commit、staged secret scan、main push、Pages deployment、公開Smokeは本Taskのrelease工程で確定する |

この節はChapter 01〜03 Core教材の歴史的証跡である。後続Chapter 04は3.5節で追跡し、Chapter 05〜13、全52 Lessonの完全初心者通し検証、`published`昇格、LearningPath追加、本番公開後の全Course回帰は未完了である。

### 3.5 Chapter 04 Data教材の実装証跡と未完了境界

2026-08-10にChapter 04の5 Lesson／20 Slide／5 Exercise／80分を実装し、既存Chapter 00〜03を含むCourse累計を19 Lesson／76 Slide／19 Exercise／290分へ更新した。Array、indexと`at`、`for...of`、Object、Object／Array Destructuringを、各Lesson 4 Slideから1〜2箇所変更のExerciseへ接続した。

- 教材契約: 全5 Exerciseに3段階Hint、Solution、5件以上の正負Fixture、Source FactとConsoleのAND判定を持たせた
- 視覚説明: 実習直前の5 Slideへ、変更箇所とConsoleまでの流れを示す独自SVGを追加した
- 教材品質: Course累計70 LessonのReview台帳を`stale hashes 0 / rejected 0`で検証した
- Unit／Content: Chapter契約6件とCompiler関連49件を含む全体Gateで`161 files / 1,618 tests / 0 failed`、Content Compile／Check／Reviewを通過した
- Browser／Accessibility: Chapter 04の全Solution、Starter、Fixtureを実Browser Runner／Validatorで確認し、1280×720のExerciseと390×844のSlideでDocument Scroll、横はみ出し、重大なaxe違反がないことを確認した
- 3 Engine／性能: Chromium、Firefox、WebKitで`510 passed / 150 intentionally skipped / 0 failed / retry 0`、性能`22/22`、bundle／subpath予算`9/9`を通過した
- Build／公開前Gate: Lint、Typecheck、Production Build、learning chunk分離、Lighthouse 4 URL×3回の`12/12`、`246 files`の静的Artifact、`/tsumucode/` subpath smokeを通過した
- 進捗互換: Revisionを`2026-08-10.1`へ上げ、旧`2026-08-09.1`からID変更なしの空Migrationで既存進捗と下書きを保持した
- 公開境界: Courseは`draft`を維持し、Home、LearningPath、進捗非干渉Slide Libraryへ未掲載のまま、直接URLだけを章単位β検証対象とする

| 要件        | Data範囲の状態                 | 自動／目視証跡                                                                                   |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| REQ-JSC-003 | 累計19／全52 Lesson            | Chapter 04まで290分で完成。Chapter 05〜13の33 Lesson／710分は未実装                              |
| REQ-JSC-005 | Chapter 04範囲検証済み         | Array、Object、Destructuringを5 Lesson、20 Slide、5 Exerciseで実装                               |
| REQ-JSC-008 | Chapter 04範囲検証済み         | 全5 Lessonの直前Slide整合、3 Hint、Solution、5件以上Fixture                                      |
| REQ-JSC-021 | Chapter 04範囲検証済み         | collection、access、loop、destructuringの型付きFactと同一revisionのConsoleをAND判定              |
| REQ-JSC-030 | Chapter 04範囲検証済み         | Concept、用語、Trace、screen budget、実行Example、公開／authoring provenanceをContent Gateで確認 |
| REQ-JSC-031 | Chapter 04範囲検証済み         | authorと別reviewer ID、Lesson source hash、stale 0、rejected 0                                   |
| REQ-JSC-032 | Chapter 04全体検証済み         | 3 Engine、axe、複数viewport、Security、Performance、Lighthouse、subpathを全体Gateで確認          |
| REQ-JSC-034 | ローカル前提検証済み・公開待ち | 日本語commit、staged secret scan、main push、Pages deployment、公開SmokeはRelease工程で確定      |

この節はChapter 04教材の歴史的証跡である。後続Chapter 05は3.6節で追跡し、Chapter 06〜13、全52 Lessonの完全初心者通し検証、`published`昇格、LearningPath追加、本番公開後の全Course回帰は未完了である。

### 3.6 Chapter 05 Data変換教材の実装証跡と未完了境界

2026-08-10にChapter 05の4 Lesson／16 Slide／4 Exercise／60分を実装し、既存Chapter 00〜04を含むCourse累計を23 Lesson／92 Slide／23 Exercise／350分へ更新した。問題Object Arrayを題材に、`map`、`filter`、`reduce`、Array `map`とObject spreadによるimmutable updateを、各Lesson 4 Slideから1箇所変更のExerciseへ接続した。

- 教材契約: 全4 Exerciseに3段階Hint、Solution、5件以上の正負Fixture、Collection変換FactとConsole完全一致のAND判定を持たせた
- 視覚説明: 実習直前の4 Slideへ、元Arrayから新しいArray／集計値を作る流れを示す独自SVGを追加した
- 教材品質: JavaScript Provenance `530 files / 530 items`、全2 Course `74 lessons reviewed / stale hashes 0 / rejected 0`を検証した
- Unit／Content: Chapter契約12件と解析器回帰23件を含む全体Gateで`162 files / 1,625 tests / 0 failed`、Content Compile／Check／Reviewを通過した
- Runtime修正: 丸括弧付きObject literalを返すConcise Arrow Functionのinstrument範囲を式全体へ広げ、生成後Sourceの再Parseと実Browser Solution実行で回帰を固定した
- Browser／Accessibility: 全23 JavaScript ExerciseのSolution、Starter、Fixtureを実Browser Runner／Validatorで確認し、1280×720のExerciseと390×844のSlideを原寸目視して、Document Scroll、横はみ出し、重大なaxe違反、操作阻害がないことを確認した
- 3 Engine／性能: Chromium、Firefox、WebKitで`513 passed / 150 intentionally skipped / 0 failed / retry 0`、性能`22/22`、bundle／subpath予算`9/9`を通過した
- Build／公開前Gate: Lint、Typecheck、Production Build、learning chunk分離、Lighthouse 4 URL×3回の`12/12`、`254 files`の静的Artifact、`/tsumucode/` subpath smokeを通過した
- 進捗互換: Revisionを`2026-08-10.2`へ上げ、旧`2026-08-10.1`からID変更なしの空Migrationで既存進捗と下書きを保持した
- 公開境界: Courseは`draft`を維持し、Home、LearningPath、進捗非干渉Slide Libraryへ未掲載のまま、直接URLだけを章単位β検証対象とする

| 要件        | Data変換範囲の状態             | 自動／目視証跡                                                                                            |
| ----------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| REQ-JSC-003 | 累計23／全52 Lesson            | Chapter 05まで350分で完成。Chapter 06〜13の29 Lesson／650分は未実装                                       |
| REQ-JSC-005 | Chapter 04〜05範囲検証済み     | Array、Object、Destructuring、map、filter、reduce、immutable updateを9 Lesson、36 Slide、9 Exerciseで実装 |
| REQ-JSC-008 | Chapter 05範囲検証済み         | 全4 Lessonの直前Slide整合、3 Hint、Solution、5件以上Fixture                                               |
| REQ-JSC-021 | Chapter 05範囲検証済み         | collection-transform、immutable-updateの型付きFactと同一revisionのConsoleをAND判定                        |
| REQ-JSC-030 | Chapter 05範囲検証済み         | Concept、用語、Trace、screen budget、実行Example、公開／authoring provenanceをContent Gateで確認          |
| REQ-JSC-031 | Chapter 05範囲検証済み         | authorと別reviewer ID、Lesson source hash、stale 0、rejected 0                                            |
| REQ-JSC-032 | Chapter 05全体検証済み         | 3 Engine、axe、複数viewport、Security、Performance、Lighthouse、subpath buildを全体Gateで確認             |
| REQ-JSC-034 | ローカル前提検証済み・公開待ち | 日本語commit、staged secret scan、main push、Pages deployment、公開SmokeはこのTaskのRelease工程で確定する |

この節はChapter 05教材の実装と全ローカルGateの完成証跡であり、Chapter 06〜13、全52 Lessonの完全初心者通し検証、`published`昇格、LearningPath追加、本番公開後の全Course回帰は未完了である。

### 3.7 Chapter 06およびData Phaseの完成証跡と未完了境界

2026-08-10にChapter 06の4 Lesson／16 Slide／4 Exercise／70分を追加し、Data PhaseをChapter 04〜06の13 Lesson／52 Slide／13 Exercise／210分で完成した。既存Chapter 00〜03を含むCourse累計は27 Lesson／108 Slide／27 Exercise／420分である。Array・Object・DestructuringからCollection変換、immutable update、static Module、Error、Debugまでを、各Lesson 4 Slideから1〜2箇所変更のExerciseへ接続した。

- 教材契約: 全13 Exerciseに3段階Hint、Solution、5件以上の正負Fixture、導入Conceptの型付きSource Factと実行結果のAND判定を持たせた
- 公開境界: SolutionとFixtureはauthoring treeにのみ保持し、公開Artifactへの混入は0件。Courseは`draft`を維持し、Home、LearningPath、進捗非干渉Slide Libraryには未掲載である
- 教材監査: 13 Lesson／52 Slide／13 Exercise／210分、3 Hint、Solution、5 Fixture以上を章別契約64件で確認。全2 Courseの78 Lessonは`stale hashes 0 / rejected 0`、未追跡Conceptと未解説用語は0件である
- 進捗互換: Revisionを`2026-08-10.3`へ上げ、空Migrationで既存進捗と下書きを保持した。`45ebb6b`からのChapter 00〜03に永続IDの追加・削除・変更がないことを差分監査した
- 自動Gate: `163 files / 1,635 tests / 0 failed`、3 Engine E2E `527 passed / 154 intentionally skipped / 0 failed / retry 0`、性能`22/22`、bundle／subpath予算`9/9`、Lighthouse 4 URL×3回の`12/12`を通過した
- 表示確認: 1280×720と390×844の代表Slide／Exerciseを原寸目視し、Document Scroll、横はみ出し、重大なaxe違反、操作阻害がないことを確認した
- 公開証跡: commit `dbb556b2265f6acdae70f9598de33aebf994f157`を`main`へpushし、[GitHub Pages β run 31347145826](https://github.com/santa928/tsumucode/actions/runs/31347145826)を成功させた。[public URL](https://santa928.github.io/tsumucode/)のCourse map、代表Slide／Exercise／Console、404復帰でbrowser console `warn 0 / error 0`を確認した

| 要件        | Data Phaseの状態                 | 自動／目視証跡                                                                                          |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| REQ-JSC-003 | 累計27／全52 Lesson              | Chapter 06まで420分で完成。Chapter 07〜13の25 Lesson／580分は未実装                                     |
| REQ-JSC-005 | 検証済み                         | Array、Object、Destructuring、map、filter、reduce、immutable updateを13 Lessonの螺旋型教材へ接続        |
| REQ-JSC-006 | Module／Error／Debug範囲検証済み | static Module、Error、Debugを4 Lessonで実装。DOM、Event、Form、State、Promise、`async`／`await`は未実装 |
| REQ-JSC-008 | Data Phase範囲検証済み           | 全13 Lessonの直前Slide整合、3 Hint、Solution、5件以上Fixtureを確認                                      |
| REQ-JSC-016 | 検証済み                         | 同一Workspace内のnamed static import／export、graph hash、複数File Editorを実教材とE2Eで確認            |
| REQ-JSC-017 | 検証済み                         | bare／dynamic import、path escape、循環、未知Fileを診断code付き`code-error`で拒否                       |
| REQ-JSC-021 | Data Phase範囲検証済み           | bounded strict unionのData Factと実行EvidenceをANDし、Validator内で学習コードを再実行しない             |
| REQ-JSC-022 | Data Phase範囲検証済み           | 導入method／boundaryのFactと振る舞いをANDし、既習Function表現は要件でない限り固定しない                 |
| REQ-JSC-030 | Data Phase範囲検証済み           | Concept、用語、Trace、screen budget、実行Example、provenanceをContent Gateで確認                        |
| REQ-JSC-031 | Data Phase範囲検証済み           | authorと別reviewer ID、Lesson source hash、stale 0、rejected 0を確認                                    |
| REQ-JSC-032 | Data Phase全体検証済み           | 3 Engine、axe、Keyboard、複数viewport、Security、Performance、Lighthouse、subpathを全体Gateで確認       |
| REQ-JSC-034 | Task 1〜4公開検証済み            | 各taskの日本語commit、staged secret scan、`main` push、Pages β、公開URLとconsoleをIssue #4へ記録        |

ここで完了したのはData Phaseだけである。Chapter 07〜13のBrowser App・Guided Project・Capstone、全52 Lessonの完全初心者通し検証、`published`昇格、Home／LearningPath／Slide Libraryへの追加、昇格後の本番回帰はすべて未完了とする。

## 4. 要件差分

| 分類 | 内容                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 維持 | HTML/CSS、LearningPath導出、端末保存、Chapter 00、Reset、Review復帰、Slide Library、静的GitHub Pages、Runner失敗時のSource保持                   |
| 追加 | Chapter 01〜13、bounded Console、fixed Capability Profile、static module graph、対話Scenario、Guided Quiz、Capstone、全Course reviewと初心者検証 |
| 保留 | Tailwind CSS CourseをHTML/CSSとJavaScriptの間へ`recommended` Stepとして挿入する作業                                                              |
| 削除 | なし                                                                                                                                             |

### 4.1 保留事項

- 理由: Tailwind CSS Courseが未完成であり、「完成CourseだけLearningPathへ追加する」要件を守るため。
- 影響: JavaScript完成時点の`frontend` PathはHTML/CSS→JavaScriptとなる。
- 代替案: 未完成Tailwindのplaceholderを置く案は、開始不能なStepを公開するため採用しない。
- 復帰条件: Tailwind CSS Courseの教材、Runner、全品質Gate、初心者検証、Pages公開が完了した時点で、HTML/CSSとJavaScriptの間へ`recommended`として挿入する。

## 5. Course構成

| Chapter | 種別           | 学習内容                                    | Lesson |    分 |
| ------- | -------------- | ------------------------------------------- | -----: | ----: |
| 00      | standard       | 既存: JavaScriptで画面の文字を変える        |      1 |    15 |
| 01      | standard       | 値・変数・型・演算                          |      4 |    60 |
| 02      | standard       | 条件分岐・Loop                              |      4 |    60 |
| 03      | standard       | Function・Scope・Closure                    |      5 |    75 |
| 04      | standard       | Array・Object・Destructuring                |      5 |    80 |
| 05      | standard       | `map`・`filter`・`reduce`・immutable update |      4 |    60 |
| 06      | standard       | Module・Error・Debug                        |      4 |    70 |
| 07      | standard       | DOMを探す・変える・作る                     |      4 |    70 |
| 08      | standard       | Event・Form・入力検証                       |      4 |    65 |
| 09      | standard       | Stateと「state → render」                   |      4 |    70 |
| 10      | standard       | Promise・`async`／`await`                   |      4 |    75 |
| 11      | standard       | Keyboard・Focus・安全なUI                   |      3 |    50 |
| 12      | guided-project | Guided Project: 学習クイズ                  |      5 |   100 |
| 13      | capstone       | Capstone: 自分で設計するクイズ              |      1 |   150 |
| 合計    |                |                                             |     52 | 1,000 |

標準Lessonは46件、Guided Project Lessonは5件、Capstone Lessonは1件とする。各Lessonは1つの主目標へ絞り、3〜5枚を目安とするSlideと、少なくとも1つのExerciseを持つ。

### 5.1 Phase

1. `javascript-p00-core`: Chapter 00〜03。Consoleで値と制御を確かめる。
2. `javascript-p01-data`: Chapter 04〜06。問題データを変換し、Moduleへ分割する。
3. `javascript-p02-browser-app`: Chapter 07〜11。DOM、Event、State、非同期、Accessibilityを統合する。
4. `javascript-p03-project`: Chapter 12〜13。Guided ProjectとCapstoneで制作する。

### 5.2 螺旋型の接続

- Chapter 01の値は問題文、選択肢、得点へ接続する。
- Chapter 02の条件とLoopは正誤判定、問題一覧表示へ接続する。
- Chapter 03のFunctionとClosureは回答処理と得点保持へ接続する。
- Chapter 04〜05のCollectionは問題データ、絞り込み、集計、immutable state updateへ接続する。
- Chapter 06のModuleはUI、data、stateの責務分離へ接続する。
- Chapter 07〜09は画面、操作、state→renderを接続する。
- Chapter 10は同梱問題データをPromiseで取得する`loadQuestions()`へ接続する。
- Chapter 11は回答操作をMouseだけに依存させず、FocusとAccessible Nameを仕上げる。

## 6. 教材Authoring契約

### 6.1 標準Lesson

- 直前Slideで導入済みの構文だけをExerciseで要求する。
- `read`→`transform`→`compose`のmasteryをConcept graphで追跡する。
- Hintは「対象File」「変更箇所／考え方」「完成形に近い最小例」の3段階とする。
- Solutionはauthoring treeだけに保持し、公開Lesson Artifactへ混入させない。
- Fixtureは少なくともpass、incomplete、syntax、security、Concept固有の誤りを持つ。
- 実行ExampleはSolutionとFixtureを実Analyzer／Runner／Validatorへ通す。

### 6.2 Guided Project

- `javascript-quiz-guided`の単一Workspaceを5 Lessonで共有する。
- 工程は問題表示、回答、得点、結果、再挑戦とする。
- 各Lessonは現在工程だけを判定し、以前にpassした工程のpassing snapshotも保持する。
- 別LessonのHint、validation history、Review位置は混在させない。

### 6.3 Capstone

- `javascript-quiz-capstone`をGuided Projectとは別Workspaceにする。
- Briefはカテゴリ選択、問題進捗、得点、結果、再挑戦、Keyboard操作を必須要件にする。
- Guideは設計順序と検証観点だけを示し、完成Sourceを段階コピーさせない。
- Checklistは振る舞い、Accessibility、Error時の復帰をruleとScenarioへ結ぶ。

## 7. Runtime設定

JavaScript Exerciseは次のstrictな設定を持つ。公開Schemaはfield追加を拒否し、Courseの`runnerId=javascript`と組み合わせて検証する。

```yaml
runtime:
  kind: javascript
  entryFile: script.js
  sourceType: script
  capabilityProfile: core
  primaryOutput: console
```

- `sourceType`: `script`または`module`
- `capabilityProfile`: `core`、`modules`、`dom`、`async`、`project`
- `primaryOutput`: `console`または`preview`

Chapter 00は設定省略時に`script`、`core`、`preview`を使う互換既定値を持つ。CompilerはJavaScript Course以外のExerciseへJavaScript runtime設定が現れた場合に拒否する。

## 8. Architecture

### 8.1 `JavaScriptCapabilityProfiles`

Profileは教材YAMLの任意allowlistでなく、コードに定義した固定集合とする。

- `core`: literal、binding、operator、branch、Loop、Function、Array、Object、bounded Console。Chapter 00互換のため、既存教材が使う`document.querySelector()`と`textContent`代入だけを限定許可し、DOM生成・属性変更・Eventは許可しない。
- `modules`: `core`に同一Workspaceのstatic import／exportを追加。
- `dom`: `modules`に許可済みDOM query、生成、属性、class、Event APIを追加。
- `async`: `dom`にPromise、`async`／`await`、bounded timerを追加。
- `project`: `async`にGuided／Capstoneで必要な既習APIを追加。

Network、Storage、Worker生成、Service Worker、dynamic code、popup、親画面、navigation、form送信、外部resource URLは全Profileで拒否する。未知構文は自動許可せず、必要なConceptを設計とtest付きでProfileへ追加する。

### 8.2 `JavaScriptModuleGraphBuilder`

1. Workspace内の`.js`を安全なPOSIX相対pathとして収集する。
2. Acornを`sourceType=module`で実行し、全static import／exportを抽出する。
3. 相対specifierをWorkspace内へ正規化し、bare、dynamic、path escape、未知Fileを拒否する。
4. graphを巡回して循環を初心者向け診断にする。
5. 全Fileへ同じ実行budget契約のguardをinstrumentする。
6. 依存specifierを世代固有のBlob URLへ書き換え、entry moduleを実行する。
7. render破棄、stale、error、disposeの全経路でBlob URLをrevokeする。
8. 正規化pathとSource bytesを決定的順序でhashし、module graph hashをEvidenceへ渡す。

循環moduleはJavaScript仕様上可能だが、初学Courseでは初期化順序の認知負荷が高いため扱わない。この制限はModule章のSlideと診断文で明示する。

### 8.3 `RunnerConsoleOutput`

共通Runtime契約へ次のbounded outputを追加し、HTML/CSS Runnerは空配列を返す。

- `sequence`: 0から始まる整数
- `level`: `log`、`info`、`warn`、`error`
- `text`: safe formatterが作るplain text

上限は100件、1件4 KiB、合計64 KiB、Object深度3、Collection要素50とする。循環参照、getter、Proxy例外でRunnerを落とさず、省略記号または安全な代替文字列を返す。OutputはHTMLとして挿入せず、React text nodeで表示する。

### 8.4 `JavaScriptInteractionBridge`

判定Scenario用bridgeは、認証済みの同一session／revision／frameだけを操作する。

- action: `click`、`fill`、`select`、`key`、`focus`
- 1 Exercise最大4 Scenario
- 1 Scenario最大10 action
- checkpointは`afterActionId`で同Scenarioのactionへ結び、1 checkpoint最大16 expectation
- expectationは`selector-exists`、`selector-text`、`attribute`、`focused`、`console-includes`のstrict union
- selector、入力値、key、request ID、responseをbounded化
- 任意JavaScript、任意Event constructor、URL、navigation、任意sleepを公開契約へ含めない
- `fill`は未確定の文字入力としてtrusted bootstrapが値を設定し、`input`だけを発火する。blurや確定を合成せず、`change`だけのhandlerを「入力のたびに更新」の正解にしない。`select`は選択確定なので`input`と`change`を発火する
- action後の期待状態は最大750 ms、短いintervalでSnapshotをpollする

Scenarioごとに新しいiframeを使い、前Scenarioのstate、timer、Focus、Consoleを引き継がない。

Content契約と公開Artifact投影は実装済みである。trusted bootstrap、frame generation付きBridge、checkpoint evaluator、Controller orchestration、Validator統合は後続Runtime Gateで実装・検証する。

### 8.5 `JavaScriptAnalyzerFacts`

Analyzer factは任意AST queryでなく、Courseで必要なdomain factのstrict unionとする。

- binding、branch、loop
- function、call、scope、closure
- collection、destructuring、collection-transform、immutable-update
- module-boundary
- DOM query／mutation、event-handler
- state-render-flow
- async-function、await-flow

各factはkind、file、line、columnと、kind固有のbounded scalarだけを持つ。Validatorは学習Sourceを再実行せず、同じgraph hashのfactだけを信頼する。

### 8.6 `JavaScriptValidator`

- 早期LessonはSource fact、同revisionの実行Evidence、Console／DOM結果をAND評価する。
- 後期LessonはScenario後のDOM、Focus、Consoleを主条件とし、必須ConceptだけSource factで確認する。
- 変数名、Function名、File分割が要件でない場合は模範解答と一致させない。
- Module時はentry File hashでなくmodule graph hashを照合する。
- すべてのviewportとScenarioでEvidence identityが一致しなければ`system-error`にする。

## 9. UIとAccessibility

- Exerciseの工程票、Editor、Previewの3領域Layoutを維持する。
- Preview Headerに「画面」「Console」のtablistを置き、Exerciseの`primaryOutput`を初期選択する。
- Console非対象Lessonは不要なtabを表示しない。
- Consoleは行番号、level text、output textを持ち、色だけでlevelを伝えない。
- Output各行をlive announceせず、既存live regionで「Consoleを更新しました。N件」を通知する。
- Error summaryからFileとlineへ移動でき、移動不能でも初心者向け説明を残す。
- 直前成功結果を表示する場合は「前回成功時」のstatusをHeaderに表示する。
- Scenario bridgeのFocus結果はSnapshotで検査するが、判定中に親画面のFocusを奪わない。
- 1280×720はdocument scrollなし、390×844と768×1024はStage内部の救済scrollだけを許容する。
- mobileの通常Exerciseは既存どおり編集不能案内を出し、公開後のSlide Libraryは進捗を変更しない。

## 10. Data flow

### 10.1 Preview

1. LearnerがWorkspaceを編集し、既存Controllerがrevisionを進めて自動保存する。
2. Controllerがstrictなruntime設定をRunnerへ渡す。
3. Analyzer WorkerがCapability、Module graph、fact、budget guard、graph hashを生成する。
4. RunnerがHTML/CSSをsanitizeし、opaque-origin iframeへtrusted bootstrapとinstrument済みJavaScriptを投入する。
5. bootstrapがConsoleを捕捉し、学習コードを実行する。
6. 認証済みresponseだけをRunnerが受理し、diagnostics、Evidence、Console outputを返す。
7. UIは現在revisionの結果だけを表示する。

### 10.2 判定

1. ControllerがDraftをflushし、同じSource revisionを固定する。
2. viewportとScenarioの組ごとに新しいrenderを作る。
3. Scenario actionをtrusted bridgeで順に実行する。
4. checkpointの期待状態をbounded pollし、Snapshot、Focus、Console、Evidenceを取得する。
5. ValidatorがSource fact、Evidence、checkpoint結果を評価する。
6. 全必須条件がpassした時だけ既存の原子的保存で進捗とpassing snapshotをcommitする。
7. 保存失敗、stale revision、別frame responseでは候補進捗をrollbackし、Sourceを保持する。

## 11. Error handling

| 失敗                                  | status         | Learner表示                        | 保持するもの                           |
| ------------------------------------- | -------------- | ---------------------------------- | -------------------------------------- |
| Syntax／Reference error               | `code-error`   | File、line、原因、次の確認         | Source、cursor、選択File、直前成功結果 |
| Capability違反                        | `code-error`   | 使えない機能と安全な代替           | Source、cursor、選択File、直前成功結果 |
| Module解決／循環                      | `code-error`   | specifier、起点File、修正方向      | 全Workspace Source                     |
| Scenario後に期待状態へならない        | `incomplete`   | 失敗checkpoint、期待、次の行動     | Source、現在Preview                    |
| Promise結果が750 ms内に現れない       | `incomplete`   | 待っている状態と非同期処理の確認点 | Source、直前成功結果                   |
| budget、Worker、bridge、forged／stale | `system-error` | コードを不正解扱いせず再試行CTA    | Source、Draft、直前成功結果            |
| 保存失敗                              | `system-error` | memory fallback、Export、再試行    | emergency draft                        |

system errorは不正解履歴へ保存しない。現在revisionと異なるConsole、Scenario、Snapshotは利用者へ見せず破棄する。

## 12. 進捗互換と公開

### 12.1 Chapter 00

- 既存IDとWorkspaceを変更しない。
- Course revision更新時は、既存Chapter 00のchapter、lesson、slide、exercise、rule、hint、workspaceを`preserve`するmigrationを登録する。
- Starterまたは判定条件を変更する必要が生じた場合は、理由、影響、代替、復帰条件を別途提示し、ユーザー承認なしにResetしない。
- migration testでDraft Source、selected File、cursor、Review位置、passing snapshot、Course進捗を確認する。

### 12.2 draft期間

- Chapter単位で設計、実装、教材Review、3 Browser、Pages公開を行う。
- `publicationStatus: draft`を維持し、Home、公開Path、Slide Libraryには出さない。
- 直接URLは公開Artifactであり、機密性を持たないことを維持する。

### 12.3 完成時

1. 52 Lessonと全ProjectをContent compileする。
2. 全source hash reviewと初心者通し検証を完了する。
3. 全品質Gateと本番直接URLの回帰を通す。
4. JavaScriptを`published`へ変更する。
5. `frontend.yaml`へHTML/CSS後の`required` Stepとして追加する。
6. Home、Path、Course、Slide Library、続きから、Export／Import、本番consoleを確認する。

## 13. Testing strategy

### 13.1 Unit／contract

- strict runtime設定とCourse runner binding
- Capability Profileの許可／拒否matrix
- Console formatterのsize、depth、cycle、getter、Proxy、Unicode
- Module path、graph、循環、instrument、hash、Blob revoke
- Analyzer factのstrict union、location、unknown field
- Scenario action schema、identity、token、stale、bounded poll
- ValidatorのSource＋Evidence＋Console＋DOM＋Focus AND条件
- ControllerのOutput反映、前回成功label、system error非履歴化
- Chapter 00 progress／Draft migration

### 13.2 Content

- 52 Lesson、14 Chapter、4 Phase、46 standard、5 guided、1 capstone、1,000分のexact total
- 全Conceptの初出、prerequisite、mastery、Project trace
- Slide screen budget、未説明用語0、Hint leakage 0
- Solutionと全Fixtureを実Analyzer／Runner／Validatorで実行
- Solution、Fixture、authoring runtime dataが公開Artifactへ混入しない
- 全Lesson source hash review、author／reviewer分離

### 13.3 Browser／Accessibility

- Chromium、Firefox、WebKitでConsole、Module、DOM、Event、async、Scenarioを検証
- 編集、Preview、判定、Reset、Slide見直し、Review復帰、再読込、別tab lease
- Keyboard-onlyでTool rail、File tab、Preview／Console tab、Hint、判定を操作
- Scenario後のFocus、Accessible Name、role、live通知
- axe critical／serious 0
- 1280×720、390×844、768×1024のスクリーンショット目視と境界数値

### 13.4 Security

- fetch、XHR、WebSocket、EventSource、Beacon
- localStorage、sessionStorage、IndexedDB、cookie
- eval、Function constructor、dynamic import、WebAssembly
- Worker、Service Worker、SharedWorker
- parent、top、opener、location、history、popup、form、download
- image／font／script外部resource、Module path escape、bare import
- forged postMessage、別frame、別revision、再利用token、self-navigation
- infinite Loop、recursion、microtask、timer flood、Console flood

### 13.5 Performance／release

- Catalog gzip: 20,480 bytes以下
- Home初期JavaScript gzip: 256,000 bytes以下
- JavaScript固有lazy graph gzip: 180,000 bytes以下
- Lesson JSON gzip: p95 32 KiB以下、最大48 KiB
- desktop初回Preview p95: 500 ms以下
- 標準Scenario判定p95: 1,500 ms以下
- Guided／Capstone判定p95: 3,000 ms以下
- Console 100件表示: 50 ms超のlong task 0
- production build、learning chunk isolation、`/tsumucode/` subpath、Lighthouse
- secret scan、main push、Pages deploy、公開URL、console warn／error 0

## 14. 初心者検証

全Course公開前に、少なくとも1名のJavaScript完全初心者がChapter 00からCapstoneまで通す。観察記録は個人情報を含めず、次をLesson単位で残す。

- 開始／終了時刻と所要時間
- Hint level、Answer利用、Retry回数
- Slideにない構文を要求された箇所
- 誤解した用語と説明
- system errorと再試行結果
- Console、Module、Scenario UIで迷った操作
- Guided ProjectとCapstoneで自力説明できたConcept

blockingな難度ずれ、直前Slideとの不整合、操作不能、誤判定は修正して再検証する。未観察Lessonを自動test成功だけで初心者検証済みにしない。

## 15. 受け入れ条件

- [ ] 52 Lesson、14 Chapter、4 Phase、1,000分のCourseがexact totalと一致する
- [ ] 親Issue記載の全JavaScript ConceptをSlide、Exercise、Projectで扱う
- [ ] 各標準Lessonに3 Hint、Solution、正負Fixture、独立Reviewがある
- [ ] Consoleが対象Lessonだけ表示され、bounded outputとAccessibility契約を満たす
- [x] static ModuleがWorkspace内だけで動き、危険なimportを拒否する
- [x] 対話Scenario Runtimeが回答、得点、次問、結果、再挑戦を実利用順で判定する
- [ ] 後期ExerciseとProjectが不要なSource固定をせず、別解を許可する
- [ ] Runner／Analyzer／bridge失敗が不正解にならず、Sourceと直前成功結果が残る
- [ ] Chapter 00の進捗、下書き、Reset、Review復帰、passing snapshotが維持される
- [ ] JavaScript固有graphがHome、Path、Slide初期chunkへ混入しない
- [ ] Course完成前はdraftのまま非掲載で、直接URLの章単位品質確認ができる
- [ ] 3 Browser、axe、Keyboard、Security、Performance、Lighthouse、subpathが合格する
- [x] Scenario Runtime対象画面は3 viewportの実画像と境界数値で重なり、はみ出し、操作阻害がない
- [ ] 完全初心者の通し検証と是正が完了する
- [ ] 完成時だけCourseをpublishedへ昇格し、frontend Pathへrequiredとして追加する
- [ ] HTML/CSS、LearningPath、端末進捗、Export／Import、Slide Libraryが回帰しない
- [ ] 各taskの日本語commit、secret scan、main push、Pages、本番console確認が完了する

## 16. 非対象

- learner codeによる任意Network access
- localStorage、sessionStorage、IndexedDB、cookie
- npm package、Node.js、backend runtime
- 専用REPL、debugger、breakpoint UI
- bare module import、dynamic import、循環module
- スマートフォン上のコード編集
- JavaScript Course内でのTypeScript、React、Tailwind CSS、Next.js
- 未完成CourseのHome／LearningPath掲載
- login、課金、Cloud進捗同期、Analytics、SLA

## 17. リスクと対策

| リスク                              | 対策                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Capability拡張でSecurity holeを作る | 固定Profile、未知構文fail-closed、Profile差分test、3 Browser request監視を必須にする      |
| Scenarioがflakyになる               | 新規frame、固定sleep禁止、期待状態poll、action上限、同revision identityを使う             |
| WebKitでiframe Focus証跡が欠落する  | native focus後の非公開signalでSnapshotだけを補完し、学習DOMへtokenを公開せず親Focusを復元 |
| Module Blobが残る                   | opaque iframeがgeneration内で所有し、import成功／失敗の`finally`で全URLをrevokeする       |
| ConsoleがMain threadを塞ぐ          | 件数、size、depthを制限し、100件long-task testを行う                                      |
| Source ruleが別解を落とす           | 早期ConceptだけSource factで確認し、後期は振る舞い中心にする                              |
| 52 Lessonで難度や用語がずれる       | Concept graph、trace、source hash review、初心者通し検証を重ねる                          |
| 教材量で初期表示が遅くなる          | Catalog／Course index／Lessonの分割配信、必要Lesson優先、隣接Lessonだけidle prefetchする  |
| Chapter 00の利用データが失われる    | ID維持、preserve migration、Draft／progressのfixture migration testをrelease gateへ入れる |
| draftを正式公開と誤認する           | Home／Path／Library除外と直接URLのβ表示をcompiler／E2Eで固定する                          |

## 18. 実装境界

本設計は次の独立taskへ分割し、各taskをmainへcommit、push、Pages公開する。

1. Full Course Runtime基盤: strict runtime設定、Console、Capability Profile、Module graph、Scenario bridge、Validator fact拡張。
2. Core教材: Chapter 01〜03。
3. Data教材: Chapter 04〜06。
4. Browser App教材: Chapter 07〜11。
5. Guided Project: Chapter 12。
6. Capstoneと公開昇格: Chapter 13、初心者検証、published、LearningPath追加。

各教材taskはCourse totals、Concept trace、Fixture、independent reviewを同じcommit範囲へ含める。Runtime未実装のConcept教材を先に量産しない。

## 2026-09-28 #8 Browser App再開: Ch07の最初の1 Lesson

既存Ch00〜06はClosureパイロット改訂後、27 Lesson／108 Slide／29 Exercise／430分である。以前の27演習／420分という値は改訂前の実績として保持する。今回の追加は `javascript-ch07-l01` の1 Lesson／4 Slide／1 Exercise／20分のみで、累計28／112／30／450分となる。Ch07残りとCh08〜11、Guided Project、Capstoneは未実装。Courseはdraftを維持する。

| ID              | 状態 | 要件と今回の対応                                                                           |
| --------------- | ---- | ------------------------------------------------------------------------------------------ |
| REQ-JSC-003     | 維持 | 全体の学習範囲を維持し、今回の小単元と未実装範囲を区別する                                 |
| REQ-JSC-DOM-001 | 追加 | 変数・ifの既習説明を明示し、DOM参照・最初の一致・null・textContentの説明から編集へ接続する |
| REQ-JSC-DOM-002 | 追加 | 同じclassの先頭だけを変更する実DOM結果を採点し、別変数名や特定ifの形を強制しない           |
| REQ-JSC-DOM-003 | 維持 | 実行成功と課題達成を区別する。安全なnull分岐で何も変わらなければ課題未達                   |
| REQ-JSC-DOM-004 | 維持 | 既存ID、進捗・下書き・Import/Export、独立教材レビュー、公開Gateを維持する                  |
| REQ-JSC-DOM-005 | 追加 | 試用目次だけへ今回の1件を追加し、未完成Lessonへ先読み・移動させない                        |

既存のDOM Runnerを使い、Runtime・隔離・判定器の新設や緩和はしない。新教材に対する独立内容レビューと実初心者の試用は別の証拠であり、ソースの構造チェックや自動操作で代替しない。#26 Bの既存教材改訂サイクルをこの新設教材で完了扱いにしない。

検証は新演習のSolution/Starter/代表Fixture、編集→Reset→再編集→Preview→判定、PCのTab操作、390px読書、既存入口・読書回帰、旧revisionの保存データ引継ぎに絞る。共有実行基盤を変えていないため全Course×全Browserの再実行は通常開発の目標にしない。性能は既存の遅延ロード分離を維持し、Home/読書へJS実行依存を混入させない。全体のRelease Gateは採用後の公開時に実行する。


## 2026-09-28 #8 続き: Ch07 classの付け外し

Ch07-l02を15分・4Slide・1Exerciseで追加し、累計29Lesson／116Slide／31Exercise／465分。Ch07残り2単元とCh08以降は未実装、Courseはdraftのまま。既存IDは維持し2026-09-28.1→.2の空移行edgeで追加する。

| ID | 状態 | 今回の要件差分 |
| --- | --- | --- |
| REQ-JSC-DOM-001〜004 | 維持 | 既習説明、実DOMによる達成確認、実行と合否の区別、保存互換と独立レビュー |
| REQ-JSC-DOM-005 | 変更 | 試用の有限目次へ完成したl02だけを追加。l03以降の未完成単元は掲載しない |
| REQ-JSC-DOM-006 | 追加 | querySelectorで取得した要素の共通classを残し、状態classを付け外しする。classListを推奨手段として説明するが同じ結果のsetAttribute別解も許す |
| REQ-JSC-DOM-007 | 追加 | classの有無と対象外要素・文字の保持を採点し、class文字列順序やcomputed color・変数名・if・操作順を固定しない |

classList能力は既存製品DOM Runnerの3 engineで実測し、保護設定・Runtimeは変更しない。DOM生成・イベントは後続。検証は新演習の正解/誤解Fixture、編集/Reset/Preview/判定、PC/390px読書と関連入口、Compile・Review・遅延chunkを対象とする。スライドの操作前後図は独自制作。性能予算と公開Gateは維持し、今回の自動検証を人の初心者試用や実機検証として扱わない。


## #8 Ch07の第3単元追加（2026-09-28）

l03「要素を作ってページへ追加する」は4Slide/1Exercise/20分。累計30Lesson/120Slide/32Exercise/485分、Ch07は55分。Course draft、2026-09-28.2→.3は既存IDを保つ空移行edge。

| 要件 | 区分 | 内容 |
|---|---|---|
| REQ-JSC-DOM-001〜004・006〜007 | 維持 | 既習内容、保存互換、実行/合否、先行単元のclass操作と独立レビュー |
| REQ-JSC-DOM-005 | 変更 | 試用の有限目次へ完成したl03だけを追加。未完成l04以降を通常Pathへ出さない |
| REQ-JSC-DOM-008 | 追加 | createElementによる生成とページ接続を分け、textContentとappendChildの役割を説明・予測・修正で学ぶ |
| REQ-JSC-DOM-009 | 追加 | 元の子と対象外のリストを保ち、期待文字の新しいliが末尾に1件だけ増える実DOMを主採点とする |

createElementの既存call factを最小の概念確認に使う。appendChildは推奨手段として説明し、親変数名を含むcall factで別名解答を固定しない。接続後に文字を設定する別解も実DOMで確認する。Runtime・セキュリティ・依存・性能予算・公開Gateは不変。Eventと複数要素の走査は後続。

受入検証は新演習の代表Fixture、編集/Reset/Preview/判定と保存、PC/390px通読、掲載例の実Runner実行、対象Compile/Review/型/Lint/遅延chunk。全Courseや全Browserをこの教材追加ごとの条件へ拡大しない。人の初心者・物理実機・#26Bの既存教材改訂計測は別途未完を維持する。

## #8 Ch07の第4単元追加（2026-09-28）

l04「複数の要素へ同じ変更を行う」は4Slide/1Exercise/15分。Ch07は4Lesson70分、累計31Lesson/124Slide/33Exercise/500分。Course draft、2026-09-28.3→.4は既存IDを保つ空移行edge。Ch08以降は未完成である。

| 要件 | 区分 | 内容 |
|---|---|---|
| REQ-JSC-DOM-001〜004・006〜009 | 維持 | 先行DOM教材、保存、実行/合否、独立内容レビュー、既存公開Gate |
| REQ-JSC-DOM-005 | 変更 | 有限試用へ完成したl04だけを追加。Ch08以降は未完成として拒否する |
| REQ-JSC-DOM-010 | 追加 | querySelectorAllのstatic NodeListと0件、各要素を扱うforEach、mapとの目的の違いを説明する |
| REQ-JSC-DOM-011 | 追加 | 本3件のclass状態、共通class、各文字、対象外メモを実DOMで確認し、別名とfor-ofの別解も許す |

forEachは既習扱いせず明示導入し、Arrowの引数とmapのcallbackの既習説明をリンクする。最小Source条件はquerySelectorAllのみ、foreachの構文やcallback変数名を固定しない。Runtime/新fact/隔離は変更せず、能力小例と新教材Fixture/実操作/PCと390px読書/掲載例/変更関連Compilerで検証する。性能予算と公開Gateは維持し、Ch07のまとまりを統合してからβ公開候補とする。人の初心者/物理実機やCh08以降の完成を代替しない。

## Ch08先頭: クリックの登録と実行（Issue #8）

| 要件             | 区分 | 今回の内容                                                                    |
| ---------------- | ---- | ----------------------------------------------------------------------------- |
| REQ-JS-EVENT-001 | 追加 | click/addEventListener/handlerを初出説明し、登録と呼出しを4Slideで分ける      |
| REQ-JS-EVENT-002 | 追加 | 初期待機、実click後の変更、対象外メモ保持を実Scenarioで判定する               |
| REQ-JS-EVENT-003 | 維持 | Sourceは最小querySelector call、Arrow/名前付きFunctionや変数名を固定しない    |
| REQ-JS-EVENT-004 | 追加 | Fixture Feedbackは宣言済みScenario expectation IDを受理し、未知参照を拒否する |
| REQ-JS-EVENT-005 | 維持 | draft有限試用・既存ID/保存形式を維持し、revision.4→.5は空移行edge             |

Ch08-l01は15分/4Slide/1演習。Ch00〜07と合わせ32Lesson/128Slide/34Exercise/515分。前提はDOMの初回、Functionの呼出し、Arrowで、目次から既習Slideへ戻れる。最初から完成文字列を表示するコードは初期Snapshotで拒否する。学習者は実Previewでボタンを押し、判定時は共通Scenario実行から操作結果を受け取る。

受入は教材内容・正誤Fixture・直接Previewクリック・判定/Reset/再編集/保存の整合と390px読書。宣言外のScenario/Checkpoint/Expectationやcheckpoint集合そのものをFeedbackのcheck IDとして受理しない。Form/submit、後続Ch08〜11、全Course公開昇格、人の初心者/実機は非対象・未完。既存の公開Gate・安全境界・Home/読書のchunk分離を維持する。

### Ch08-l02 実装範囲（2026-09-28）

| 要件 | 区分 | 実装と受入条件 |
|---|---|---|
| REQ-JS-EVENT-001〜005 | 維持 | 前単元の実観測・既存ID/保存互換・draft有限試用・独立レビューを維持 |
| REQ-JS-EVENT-006 | 追加 | input通知、Event Object、currentTarget、現在のvalueを4枚で導入。既習propertyとイベント登録へ戻れる |
| REQ-JS-EVENT-007 | 追加 | handler内で現在値を読む演習。実Scenarioで別の値と空を観測し、change-only・固定値・空を無視する誤答を拒否 |
| REQ-JS-EVENT-008 | 維持 | Form/入力検証/trimは後続。sandboxや採点Gateを変更せず、実行成功と採点を分離 |

15分を追加しCh08は2 Lesson/30分、JavaScript累計33 Lesson/132 Slide/35演習/530分。revision .5→.6は既存IDを保つ空移行。読む時点の誤りを直す小演習に限定し、currentTarget構文だけへの固定はせず登録先変数.valueも正解とする。文字列末尾空白は既存Snapshotが正規化するため、その差を採点の主題にはしない。性能予算・安全境界は維持し、人の初心者試用と後続章を完了扱いにしない。

### Ch08-l03 Formの送信（2026-09-28）

| 要件 | 区分 | 実装と受入条件 |
|---|---|---|
| REQ-JS-EVENT-001〜008 | 維持 | 既習説明、入力の現在値、保存互換、独立レビュー、有限試用を保持 |
| REQ-JS-FORM-001 | 追加 | form/submit button、submitの登録先、preventDefault、送信時のvalueを4枚で説明 |
| REQ-JS-FORM-002 | 追加 | formのcurrentTargetと入力欄を区別し、既習のfield.valueで現在値を読む |
| REQ-JS-FORM-003 | 追加 | 入力だけでは表示を変えず、2回の送信で現在値を表示し、対象外メモを保つ実採点 |
| REQ-JS-FORM-004 | 維持 | Preview安全装置と学習者自身の取消を区別。PR55の限定dom-formを使い、CSP・通信禁止・送信API禁止を保持 |
| REQ-JS-FORM-005 | 維持 | 既存IDを維持する空移行 .6→.7、draft有限試用。後続検証とCh09〜11は未完 |
| REQ-JS-FORM-006 | 追加 | Starter/正解/名前付き別解/届かない取消/click取消/固定値/対象外変更を実Runnerで確認。直接click・EnterとReset・保存、390px通読を確認 |

20分を追加しCh08は3 Lesson/50分、JavaScript累計34 Lesson/136 Slide/36演習/550分。送信を取り消す1行の修正へ焦点を絞る。安全装置が画面遷移を止めるだけでは課題達成にならず、同じsubmitの学習者コードによる取消を採点する。return、stopPropagation、FormData、外部送信、サーバー、constraint validationは今回教えない。Enterの説明と実測は単一入力欄とsubmit buttonの構成に限定する。

仕様は [MDN submit event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event) と [MDN preventDefault](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault) を2026-09-28に確認。文章・例・図は独自制作。公開GateとHome予算/遅延chunk分離を維持し、機械操作を人の初心者試用・実機確認の代用にしない。

### Ch08-l04 入力検証の準備（2026-09-28）

| 要件 | 区分 | 実装と受入条件 |
|---|---|---|
| REQ-JS-FORM-001〜006 | 維持 | submit/現在値/取消/保存/有限試用と独立レビューを保持。前提PR56はmain統合済み |
| REQ-JS-VALIDATE-001 | 追加 | 入力検証、空文字、trimの戻り値、元の値と途中空白の保持を説明 |
| REQ-JS-VALIDATE-002 | 維持 | 既習if/else/===と前単元Formへ戻り、新構文で分岐を回避しない |
| REQ-JS-VALIDATE-003 | 追加 | 空欄/空白だけ/有効値/再び空/別の有効値の送信で、案内更新と登録済み表示の保持を実採点 |
| REQ-JS-VALIDATE-004 | 維持 | 既存ID・空移行 .7→.8、入力時点と送信時点の区別、安全装置と学習者取消の区別 |
| REQ-JS-VALIDATE-005 | 追加 | 名前付き別解と、trimの戻り値を使わない/常に拒否/無効入力で消去/案内が残る/取消忘れの誤答を実Runnerで検証 |
| REQ-JS-VALIDATE-006 | 維持 | 外部送信/FormData/HTML constraint validation/サーバーは非対象。画面内の案内をサーバー保護と誤認させない |

15分/4Slide/1演習。Ch08は4Lesson65分、累計35Lesson140Slide37演習565分draftとなる候補。前後空白の厳密な表示差はSnapshotの既存正規化があるため主採点にしない。trimで空白だけを空と扱うこと、入力欄を直接書き換える課題ではないことを明示する。受入は説明/予測/演習の対応、実Fixtureと直接操作・Reset・保存・390px読書。Runtime、安全境界、性能予算、公開Gateは維持する。人の初心者試用、物理実機、Ch09〜11は未完のまま。

### Ch09-l01 Stateの準備（2026-09-28）

| 要件 | 区分 | 実装と受入条件 |
|---|---|---|
| REQ-JS-VALIDATE-001〜006 | 維持 | PR56/57/58はmain統合済み。Ch08既存教材・保存移行・有限試用を維持 |
| REQ-JS-STATE-001 | 追加 | stateを特別な構文でなく現在の状況を表す値として説明し、DOM表示と区別 |
| REQ-JS-STATE-002 | 維持 | Scope・Closure・click・再代入を再利用し、宣言の位置と更新→表示の順序を説明 |
| REQ-JS-STATE-003 | 追加 | 0→1→2→3の繰り返しclickを実採点し、毎回1/2ずつ/更新前表示/未接続を検出。名前付き別解を許す |
| REQ-JS-STATE-004 | 維持 | 再Preview時の実行state初期化と学習Draft保存を区別。既存ID・空移行 .8→.9を維持 |
| REQ-JS-STATE-005 | 追加 | 掲載例・Fixture・編集/Reset/別解/実click/判定/再読込、PC/390読書を検証。最初の判定click修正PR57の依存を明記 |
| REQ-JS-STATE-006 | 維持 | Ch09後続3単元・専用render関数・Collection表示・非同期・人の試用を今回の完成範囲へ含めない |

15分/4Slide/1演習。Ch09は1Lesson15分、累計36Lesson144Slide38演習580分draftの候補。独立内容レビューと必要CI前に統合せず、試用導線だけへ追加する。Runtime・安全境界・Home性能予算・公開Gateを維持する。Chapter09全体4Lesson70分の計画を削減したものではない。

### Ch09-l02 state→renderの準備（2026-09-28）

| 要件 | 区分 | 実装と受入条件 |
|---|---|---|
| REQ-JS-STATE-001〜006 | 維持 | stateと表示の区別、既習Scope/Closure、有限試用、独立レビュー条件を維持 |
| REQ-JS-RENDER-001 | 追加 | renderを現在のstateを表示へ反映する普通のFunctionとして紹介。宣言と呼出しを区別 |
| REQ-JS-RENDER-002 | 維持 | Object property、Function、clickを利用し、初期描画と更新→renderの順を説明 |
| REQ-JS-RENDER-003 | 追加 | 読了数と次の冊数を同じstateから作り、2回読了→0へ戻す2回→読了を実採点 |
| REQ-JS-RENDER-004 | 追加 | 名前付き別解・複数renderを許し、更新前描画/描画中の状態変更/Reset描画漏れ/片方だけ更新を検出 |
| REQ-JS-RENDER-005 | 維持 | 既存ID・空移行 .9→.10、有限draft。前提PR56/57/58/59はmain統合済み。今回の内容・最新HEAD独立レビュー条件を維持 |
| REQ-JS-RENDER-006 | 維持 | DOM全面差替え・Collection描画・Framework・非同期・実行state永続化は非対象。実Fixture/例/UI/390目視と関連静的検証で確認 |

20分/4Slide/1演習。Ch09は2Lesson35分、累計37Lesson148Slide39演習600分draftの候補。renderという関数名や呼出し回数そのものを採点条件にせず、操作後の両表示の整合を確認する。人の初心者試用・実機は未実施。安全境界・Home性能予算・公開Gateを維持し、Chapter09後続2単元を完了扱いにしない。

### Ch09-l03 Array stateと一覧の準備（2026-09-28）

| 要件 | 状態 | 内容 |
|---|---|---|
| REQ-JS-LIST-001 | 追加 | Arrayをstate.itemsへ持ち、forEach/createElement/textContent/appendChildを既習として結ぶ |
| REQ-JS-LIST-002 | 追加 | replaceChildren()で一覧の子だけを消去し、今の全項目と件数を描画する |
| REQ-JS-LIST-003 | 維持 | state更新→render。初期1→追加2→追加3→空0→空0→追加1。空Arrayでも古い行を残さない |
| REQ-JS-LIST-004 | 維持 | Starterの消去忘れを修正するtransform。二重render・textContent空文字の別解を振る舞いで許容する |
| REQ-JS-LIST-005 | 維持 | 既存ID/学習保存を空移行.10→.11で維持。draft有限試用。PR56/57/58/59はmain統合済み、PR60と本PRの独立レビューは未完 |
| REQ-JS-LIST-006 | 維持 | Framework/非同期/実行state永続化は非対象。Runtime・安全境界・性能予算・公開Gateは変更しない |

20分4Slide1演習、累計38Lesson152Slide40演習620分候補。Chapter09は3Lesson55分、残り1単元15分の計画を維持。受入は掲載コードと実Fixture、編集→Reset→再編集→判定→保存再開、390px読書。人の初心者試用/実機/公開は未実施のまま区別する。

### Ch09-l04 元データを残す表示絞り込み（2026-09-28）

| 要件 | 状態 | 内容 |
|---|---|---|
| REQ-JS-FILTER-001 | 追加 | 元の本Arrayと表示条件onlyUnreadをstateに持ち、visibleはrender内で計算する |
| REQ-JS-FILTER-002 | 維持 | 既習filter/boolean/if/Objectと一覧renderをつなぎ、条件変更→render→visible→描画を行う |
| REQ-JS-FILTER-003 | 追加 | 全3→未読2→未読2→全3→未読2→全3を内容/順序/表示件数/全件数で確認 |
| REQ-JS-FILTER-004 | 維持 | 元Array上書きのStarterをvisibleへの代入へ修正。関数名やコード形を固定しない |
| REQ-JS-FILTER-005 | 維持 | .11→.12空移行。既存ID/進捗/下書き/ImportExport・有限試用を保持。PR56/57/58/59はmain統合済み、PR60/61と本PRの独立レビューは未完 |
| REQ-JS-FILTER-006 | 維持 | 検索入力/非同期/Framework/実行state保存は非対象。Runtime/安全/性能/公開Gate不変 |

15分4Slide1演習、累計39Lesson156Slide41演習635分draft候補。Ch09は4Lesson70分の原稿候補となるが、独立reviewと人試用を完了扱いにしない。受入は実Runnerの例/正誤・UI編集Reset判定保存・390px読書。Ch10/11と後続Issueは未完を維持。

### Ch10-l01 Promise結果の最初の単元（2026-09-28）

| 要件 | 区分 | 内容 |
|---|---|---|
| REQ-JS-PROMISE-001 | 追加 | Promiseと結果Arrayを区別し、thenの引数から件数と最初の問題を表示する |
| REQ-JS-PROMISE-002 | 追加 | new Promise/resolveと既存bounded timerを使う教材用loadQuestionsを明示。実通信を発生したと教えない |
| REQ-JS-PROMISE-003 | 維持 | 既習callback/Array/Object/DOM/clickをつなぐ。引数名・named callbackの別解を許容 |
| REQ-JS-PROMISE-004 | 維持 | .12→.13空移行、ID/進捗/下書き/ImportExportと限定試用を維持 |
| REQ-JS-PROMISE-005 | 維持 | async/await・失敗処理・読み込みstateは後続。実通信/公開昇格/人試用の代替は非対象 |
| REQ-JS-PROMISE-006 | 維持 | 750msの既存Scenario観測、Home分離、安全境界を維持。最新Promise境界PR63と遅延診断PR66を候補branchに保持し、両PRと本教材の最新HEAD独立レビュー・必要CI後だけmainへ統合 |

20分4Slide1演習、候補40Lesson160Slide42演習655分。Ch10計画75分のうち最初の20分であり、残り3単元55分は未完。受入は実Runner/Validatorの正誤・掲載例・編集Reset再編集判定保存・狭幅読書で確認する。候補をmain/公開完了とは扱わない。

2026-10-02の前提更新では、表示絞り込みPR62 `fde451c610247682c4b44a3d3f196fe525fe40aa`、Promise境界PR63 `c1a14bd86c78802bb61434936e2721082f1dd760`、遅延診断PR66 `0ec8b6c823efde5bbac7ec949700598dfd03048b`を履歴を保持して候補branchに合わせる。前回のRuntime一時上書きは今回の検証入力に使わない。REQ-JS-PROMISE-001〜006の教材・受入・非対象・Home予算・公開Gateは維持する。実検証で判明した追加007は後述し、保留・削除はない。PR56/57/58/59はmain統合済みだが、PR60/61/62/63/66と本教材の独立レビューは未完である。新しいRuntime前提も本PRの差分へ含まれるため、教材だけの変更とは扱わない。検証とCIの実結果はPR本文へ記録し、成功しても内容hash台帳の承認、人の初心者試用・物理実機・全Course受入を完了扱いにしない。

| 要件 | 区分 | 前提更新時に見つかった回帰への対応 |
|---|---|---|
| REQ-JS-PROMISE-001〜006 | 維持 | 教材・採点・保存・非対象・Runtime前提・性能予算・公開Gateを保持 |
| REQ-JS-PROMISE-007 | 追加 | 読書位置URLのコピーが拒否された間にスクロールで位置が変わっても、現在の入力欄URLを選択する案内を保持する。コピー成功の案内は実際にコピーしたURLだけに結び、古いURLの成功を新しいURLへ表示しない |

追加007は1280×720の既存読書操作で発見した競合の修正であり、教材内容・読み取り位置の保存方法・Clipboardへの新しい自動送信を増やさない。手動コピー1回、拒否中の位置変更、成功後の位置変更を関連componentで確認し、実Browserの拒否操作も確認する。保留・削除はない。

### Ch10-l02 async/await（2026-09-28）

| 要件 | 区分 | 内容 |
|---|---|---|
| REQ-JS-AWAIT-001 | 追加 | async関数はPromiseを返し、awaitの後に結果Arrayを受け取ってlengthを表示する |
| REQ-JS-AWAIT-002 | 追加 | 待つのは関数の続きで、呼び出し元が先に進む順番を実例で示す |
| REQ-JS-AWAIT-003 | 維持 | 同梱loadQuestionsを使い通信しない。PromiseのlengthがundefinedになるStarterを修正 |
| REQ-JS-AWAIT-004 | 維持 | 引数改名/async arrow/既習thenの同じ振る舞いも許容し、コードの形を固定しない |
| REQ-JS-AWAIT-005 | 維持 | .13→.14空移行、ID/進捗/下書き/ImportExport、限定試用、750ms観測とHome分離 |
| REQ-JS-AWAIT-006 | 維持 | 失敗/読み込みstateは残り2単元。実通信/人試用代替/公開昇格は非対象。PR57はmain統合済み。候補の最新Runtime前提PR63/66と前教材PR64の独立レビュー条件を保持 |

20分4Slide1演習、候補41Lesson164Slide43演習675分。Ch10候補40分と残り2単元35分を区別。実例の順序、実Runner正誤、編集Reset再編集判定保存、390px読書で検証する。

2026-10-02のCh10-l02前提更新はPR64 `26f20bf8fc9b8c56372e0f01ae7d5416aa61c9fe`を履歴保持で取り込み、最新Promise境界・遅延診断・読書コピー拒否案内を実際の候補入力に含める。旧Runtime一時上書きは使わない。教材本文と正誤の採点契約は維持し、async/await構文だけを要求する理解評価とは扱わない。

| 要件 | 区分 | 最新前提へ合わせた差分 |
|---|---|---|
| REQ-JS-AWAIT-001〜006 | 維持 | 教材の順序/振る舞い/別解、空移行/既存保存、有限観測、Home性能、安全境界、独立レビュー、公開Gate、非対象を保持 |

追加・保留・削除はない。受入は現在の実Runner/Validatorと編集・Reset・判定・保存再開・狭幅読書で再確認し、同一入力の有効なRuntime証拠は確認範囲を示して再利用する。最新HEADの必要CIと独立内容レビュー/hash台帳を満たすまでmainへ統合しない。人の初心者試用・物理実機・全Course/正式公開受入は別条件として残す。

### Ch10-l03 失敗と再試行（2026-09-28）

| 要件             | 区分 | 内容                                                                                |
| ---------------- | ---- | ----------------------------------------------------------------------------------- |
| REQ-JS-CATCH-001 | 追加 | Promise拒否を既習try/catchとawaitで受け取り、成功結果と分けて表示する               |
| REQ-JS-CATCH-002 | 追加 | 成功→失敗→成功を実操作し、失敗を0問や前回成功表示へ隠さず再試行できる               |
| REQ-JS-CATCH-003 | 維持 | 同梱データの成功/失敗を明示し、ネット通信を実施しない                               |
| REQ-JS-CATCH-004 | 維持 | 改名やthen/catchの別解を許容。DOMの振る舞い中心で採点する                           |
| REQ-JS-CATCH-005 | 維持 | .14→.15空移行、ID/進捗/下書き/ImportExport、限定試用、750ms観測とHome分離           |
| REQ-JS-CATCH-006 | 維持 | loading/二重操作は次単元。初心者試用・公開昇格は非対象。PR57はmain統合済み。最新Runtime前提PR63/66と前教材PR65の独立レビュー条件を保持 |

15分4Slide1演習、候補42Lesson168Slide44演習690分。Ch10候補55分と残り1単元20分を区別。初期code-errorを課題不一致に隠さず、実際の捕捉と状態表示を検証する。

2026-10-02のCh10-l03前提更新はPR65 `36c5ea90935b8aa18b911335ea7a36b52fcb9659`を履歴保持で取り込む。最新Promise境界・遅延診断・読書コピー案内は実際の候補入力に含まれ、旧Runtime一時上書きを使わない。Ch07〜09の3検査は同じ教材を共有して読み込む既存の集約を維持し、最新前提の準備枠30秒を共有beforeAllへ引き継ぐ。各章のassertion・Concept確認・3件の検証本体・既定5秒枠は保持する。

| 要件 | 区分 | 最新前提へ合わせた差分 |
|---|---|---|
| REQ-JS-CATCH-001〜006 | 維持 | 失敗と再試行の教材・振る舞い・別解・空移行・保存・有限観測・Home性能・安全境界・最新HEAD独立レビュー・公開Gate・非対象を保持 |

追加・保留・削除はない。実Runner/Validatorの成功→失敗→成功、掲載例、編集・Reset・再編集・判定・保存再開、狭幅読書を受入証拠とする。最新前提と一致するRuntime・読書の既存成功証拠はその範囲で再利用する。必要CI、独立内容レビュー/hash台帳を満たすまでmainへ統合しない。初心者本人試用、物理実機、全Course・正式公開受入は別条件として残す。

### Ch10-l04 読み込み状態と操作回復（2026-09-28）

| 要件 | 区分 | 内容 |
|---|---|---|
| REQ-JS-LOADING-001 | 追加 | await前に読み込み中を表示し、loadingとdisabledで二重開始を防ぐ |
| REQ-JS-LOADING-002 | 追加 | finallyで両方のボタンを戻し、成功後・失敗後の再操作を実証する |
| REQ-JS-LOADING-003 | 維持 | 同梱データと250msの教材用待機を明示し、実通信を行わない |
| REQ-JS-LOADING-004 | 維持 | 改名・disabled属性の別解も許容。待機と完了のDOM状態、再試行で判定 |
| REQ-JS-LOADING-005 | 維持 | .15→.16空移行、ID/進捗/下書き/ImportExport、有限試用、750ms観測/Home分離 |
| REQ-JS-LOADING-006 | 維持 | Ch11/Project/人試用/独立review/公開昇格は未完。PR57はmain統合済み。最新Runtime前提PR63/66と前教材PR67の独立レビュー条件を維持 |

20分4Slide1演習、候補43Lesson172Slide45演習710分。Ch10の4Lesson75分は原稿候補がそろった段階。本人の初心者試用や独立reviewを完了扱いにしない。実Runnerの正誤と待機時の操作不可/成功失敗後の復旧、Reset後再編集判定、390px読書を確認する。

2026-10-02のCh10-l04前提更新はPR67 `98ef7a0a3e907cb159780a0289ae6f85247fa43e`を履歴保持で取り込む。最新Promise境界・遅延診断・読書コピー拒否案内と、Ch07〜09の全検査を保持する共有読込を実際の候補入力に含める。旧Runtime一時上書きは使わない。教材本文、250msの有限待機、正誤の振る舞い契約、既定の準備枠と検証枠は維持する。

| 要件 | 区分 | 最新前提へ合わせた差分 |
|---|---|---|
| REQ-JS-LOADING-001〜006 | 維持 | 読み込み案内・二重開始防止・成功失敗後の再操作・別解・空移行・保存・有限観測・Home性能・安全境界・最新HEAD独立レビュー・公開Gate・非対象を保持 |

追加・保留・削除はない。実Runner/Validatorの待機中と完了後の両ボタン、成功→失敗→成功、掲載例、編集・Reset・再編集・判定・保存再開、狭幅読書を受入証拠とする。一致するRuntime・読書の既存成功証拠は範囲を示して再利用する。必要CIと独立内容レビュー/hash台帳を満たすまでmainへ統合しない。Ch10原稿候補がそろっても、Ch11/Project、初心者本人試用・物理実機・全Course/正式公開受入を完了扱いにしない。

### Ch11-l01 Keyboard（2026-09-28）

| 要件 | 区分 | 内容 |
|---|---|---|
| REQ-JS-KEY-001 | 追加 | 標準buttonのTab/Enter/Spaceと追加Escape handlerを分け、二重clickを教えない |
| REQ-JS-KEY-002 | 追加 | event.keyの条件でEscapeだけ閉じ、他キーと再操作を保持する |
| REQ-JS-KEY-003 | 維持 | 既存Scenarioの合成keyはhandler検証。標準キー動作は実Browserキー入力で別途確認 |
| REQ-JS-KEY-004 | 維持 | .16→.17空移行、ID/進捗/下書き/ImportExportとHome分離・能力制限 |
| REQ-JS-KEY-005 | 維持 | Ch11残2単元/Project/本人試用/独立レビュー/公開は未完 |

15分4Slide1演習、候補44Lesson176Slide46演習725分。読み取り専用HTMLは標準buttonと明確な名前、CSSはFocus枠を提供し、学習者はJavaScriptの条件へ集中する。実操作ではTabからEnter/Space/Escapeを試し、390px読書と既存保存を確認。画面全体のキー捕捉やRuntimeの合成キーをOS相当とみなす変更は行わない。

2026-10-02のCh11-l01前提更新はPR68 `49d9e2995c55ec68c47de1b76940263be586a224`と、実Tab入場修正PR69 `853d7c4541163f01d770bc771f9ef052f51d647b`を履歴保持で候補へ取り込む。最新Promise境界・遅延診断・読書コピー拒否案内を含む実入力とし、旧Runtime一時上書きは使わない。標準buttonのEnter/Spaceと、追加したEscape handlerの合成Scenario検査を区別する。

| 要件 | 区分 | 最新前提へ合わせた差分 |
|---|---|---|
| REQ-JS-KEY-001〜005 | 維持 | 標準キー動作/条件/他キー保持、実キーと合成Scenarioの証拠区別、空移行/保存、安全/有限観測/Home性能、独立レビュー/公開Gate、人の受入/後続非対象を保持 |

追加・保留・削除はない。現在の実Runner/Validator、標準buttonの実Enter/Space/Escape、編集・Reset・別解再編集・判定・保存再開、狭幅読書で確認する。Tab修正と最新Runtimeを組み合わせた既存iframe復帰も実Browserで確認し、一致するRuntime・読書の有効な成功証拠は範囲を示して再利用する。前提PR63/66/69と本教材の最新HEAD独立レビュー・必要CI、内容hash台帳を満たすまでmainへ統合しない。Ch11残2単元/Project、初心者本人試用・物理実機・全Course/正式公開受入は別条件として残す。

Ch11-l01の操作画面を実目視した後、全体Previewの親canvas幅によるWebKitの横ずれを検出した。PR69 `2416fa2800e12d2dd0538e6dfb038c5522f0af8f`の表示寸法修正と独立回帰を追加で取り込み、Ch11の実ArrowRight後にも左右端とscrollLeftを確認する。標準キーの既定動作/iframeの論理Viewport/同じ実行状態は維持する。

| 要件 | 区分 | 横ずれ修正を取り込んだ差分 |
|---|---|---|
| REQ-JS-KEY-001〜005 | 維持 | 教材のキー条件/他キー保持、実キーと合成Scenarioの証拠区別、保存/能力/Home分離、残単元/人受入/Gateを保持 |
| REQ-DOM-KEY-004 | 維持 | PR69で追加した全体表示の寸法と100%表示切替の契約を同じPreviewへ適用 |

この教材側の追加・保留・削除はない。Course候補44Lesson/176Slide/46Exercise/725分とCh11残2単元35分は変わらない。新表示入力で実3Browserと代表画面を再検証し、教材/Runtime bytesが同一の実Fixture・掲載例だけを再利用する。内容hash承認、固定HEAD独立レビュー、公開前の既存性能/Release Gate、本人初心者試用・実機・正式公開受入は別条件として保持する。
