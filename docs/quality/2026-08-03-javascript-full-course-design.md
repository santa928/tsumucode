# JavaScript全Course 設計

- 状態: 書面レビュー承認済み・Runtime基盤およびChapter 01〜04教材実装・Chapter 04全ローカル品質検証済み（Chapter 05〜13教材は未実装）
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

この節はChapter 04教材の実装と全ローカルGateの完成証跡であり、Chapter 05〜13、全52 Lessonの完全初心者通し検証、`published`昇格、LearningPath追加、本番公開後の全Course回帰は未完了である。

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
- `fill`と`select`はtrusted bootstrapが値を設定し、必要な標準input／change eventだけを発火する
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
