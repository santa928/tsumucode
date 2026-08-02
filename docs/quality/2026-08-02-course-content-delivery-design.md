# Course教材の分割配信設計

- 状態: 実装済み・公開前全Gate確認中
- 作成日: 2026-08-02
- 対象: TsumuCodeの公開Catalog、Course Index、Lesson Manifest、Runtime loader
- 親ロードマップ: GitHub Issue #1「複数コースとLearningPathを追加する」

## 1. 背景と目的

HTML/CSS Courseの公開Manifestは51 Lessonを1 Fileへまとめており、production Artifactで622,313 bytes、Lighthouse計測時の転送量で103,897 bytesである。Course、Slide、Exerciseの直リンク時は最高優先度で取得を開始できているが、1,600 Kbps、RTT 150 ms、CPU slowdown 4倍の品質条件ではLCPが最大2,583.7199 msとなり、既存上限2,500 msを超える。

JavaScript以降のCourse追加前に、現在画面へ必要な教材だけを優先配信する。Authoring形式、既存URL、永続ID、進捗、下書き、Reset、Review、Slide Library、GitHub Pages静的配信は維持する。

## 2. 決定事項

1. 公開教材を`Course Index`とLesson単位の`Lesson Manifest`へ分割する。
2. 初回表示はCourse Indexと現在Lessonだけをpreloadし、共有workspace課題はIndex確定後に現在工程までの依存Lessonを追加取得する。操作可能後は前後1 Lessonを先読みする。
3. HomeはCourse IndexもLesson Manifestも読み込まない。
4. Course map、進捗移行、Export／ImportはCourse Indexだけで完結させる。
5. SlideとReviewはCourse Indexと表示対象Lessonを使う。Exerciseは表示対象に加え、同じworkspaceの現在工程までを累積判定するために必要な所有Lessonだけを使う。
6. Authoring側のCourse定義は分割せず、compilerが公開境界でのみ分割する。
7. 現行`catalog.json`とCourse全体JSONは移行Artifactとして残さない。公開時に開いたままの旧タブは再取得へ失敗する可能性を受け入れ、再読み込みを復旧手段とする。
8. LCP閾値は緩めず、4対象URLを各3回計測した全結果で2,500 ms以下を要求する。

## 3. 要件台帳

| ID         | 状態 | 要件                                                                                                      |
| ---------- | ---- | --------------------------------------------------------------------------------------------------------- |
| REQ-CD-001 | 維持 | Authoring Course形式とcompilerの完全検証を維持する                                                        |
| REQ-CD-002 | 維持 | Course、Lesson、Slide、Exercise、Rule等の永続IDと既存URLを変更しない                                      |
| REQ-CD-003 | 維持 | 端末進捗、下書き、Reset、Review復帰、Export／Import、Slide Libraryを回帰させない                          |
| REQ-CD-004 | 追加 | 公開Catalog schema v3がCourse IndexのpathとSHA-256を保持する                                              |
| REQ-CD-005 | 追加 | Course IndexがCourse map、順序、完了条件、進捗移行に必要な情報を保持する                                  |
| REQ-CD-006 | 追加 | Lesson Manifestが1 LessonのSlide、Exercise、Hint、workspace、validation ruleを保持する                    |
| REQ-CD-007 | 追加 | 初期hashから既知CourseとLessonを特定し、必要Artifactだけをmodule entryと並行preloadする                   |
| REQ-CD-008 | 追加 | Runtime loaderがCatalog、Index、Lessonのpath、SHA、top-level契約、ID／revision対応をfail-closedで検証する |
| REQ-CD-009 | 追加 | 同じArtifactの同時取得をPromise cacheで1回へ集約する                                                      |
| REQ-CD-010 | 追加 | 前後Lessonの任意prefetch失敗が現在画面を壊さず、実移動時に通常取得を再試行する                            |
| REQ-CD-011 | 追加 | 分割Artifactを再結合した結果がcompiler検証済みCourseと完全一致する                                        |
| REQ-CD-012 | 追加 | Catalog、Index、Lesson、LCPの独立予算をCIで固定する                                                       |
| REQ-CD-013 | 維持 | draft Courseの直接URL検証と、Home／公開LearningPath／Libraryからの非掲載を維持する                        |
| REQ-CD-014 | 追加 | production subpath、3 Browser、axe、Keyboard、実画面、公開後consoleを検証する                             |
| REQ-CD-015 | 削除 | 旧CatalogとCourse全体JSONの移行用二重配信は行わない                                                       |
| REQ-CD-016 | 維持 | 共有workspaceの現在工程までを同一snapshotで累積再判定し、別workspaceや未来工程を読み込まない              |

## 4. 要件差分

| 分類 | 内容                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| 維持 | Authoring形式、URL、永続ID、進捗、下書き、Reset、Review、Library、静的Pages、draft非掲載                     |
| 追加 | Catalog v3、Course Index、Lesson Manifest、hash連動cache、route-aware preload、隣接Lesson prefetch、容量予算 |
| 保留 | なし                                                                                                         |
| 削除 | 旧`catalog.json`と`generated/content/courses/<courseId>.json`の移行用二重配信                                |

削除理由は、利用者が旧形式を残さない方針を選択したためである。影響は、公開時点で開いたままの旧Versionが新しいCatalogまたはCourse全体JSONを再取得できず、教材読込エラーになる可能性があること。代替案は旧Artifactの二重配信だが採用しない。復旧条件はページを再読み込みし、最新のhashed JavaScriptとCatalog v3へ揃えることである。

## 5. 公開Artifact

### 5.1 Path

```text
generated/content/catalog-v3.json
generated/content/courses/<courseId>/index.json
generated/content/courses/<courseId>/lessons/<lessonId>.json
generated/content/courses/<courseId>/provenance.json
```

`courseId`と`lessonId`はlower-kebabのcanonical IDに限定する。Public pathは既存`resolvePublicAsset`契約を通し、absolute URL、network path、query、fragment、backslash、空segment、encoded traversalを拒否する。

### 5.2 Catalog v3

Catalog v3はHomeとLearningPathが必要とする公開metadataを保持する。各Course entryは`indexPath`と`indexSha256`を持つ。Lesson本文、Exercise、Hint、workspace、validation ruleは含めない。`publicationStatus`が`draft`のCourseは直接URL検証用にentryを持つが、Homeと公開LearningPathでは除外する。

### 5.3 Course Index

Course Indexは次を保持する。

- CourseのID、title、description、audience、revision、runnerId、validatorId、supportedDevices
- glossary、concepts、prerequisites、expectedTotals、publicationStatus、provenance path
- progress migrationと、migration対象になる全entityのID index
- Phase、Chapterの順序、title、goal、estimated minutes
- Lessonの順序、kind、title、goal、estimated minutes、prerequisite、next lesson、completion要約
- SlideのID、title、kind、順序
- ExerciseのID、title、kind、workspace ID、順序
- 各Lesson ManifestのpathとSHA-256

Exercise要約はCourse内の教材順を保持する。これにより、現在Exerciseと同じ`workspaceId`を持ち、現在位置以前にあるExerciseの所有Lessonを本文なしで解決できる。

Course IndexはSlide本文、Exercise instructions、files、hints、steps、validation rulesを持たない。Course map、前後移動、404判定、進捗移行、Course完了判定、共有workspace依存Lessonの特定が本文なしで行える境界にする。

### 5.4 Lesson Manifest

Lesson Manifestは`schemaVersion`、`courseId`、`courseRevision`、`lessonId`と、Authoring Course内の1 Lessonを完全に保持する。RuntimeはSHA一致後にtop-level exact keys、Course／revision／Lesson ID対応、配列型を軽量検証する。Lesson内の全参照整合と集計はcompilerで完全検証済みとし、Runtimeで高コストなCourse全体再検証は行わない。

compilerのテスト用reconstructorはCourse Indexと全Lesson ManifestをAuthoring Courseの順序で結合し、canonical JSONの完全一致を必須にする。

## 6. Component境界

### 6.1 Compiler output adapter

既存の完全な`CourseManifestSchema`検証後にだけ分割する。書込み前に全path、重複ID、SHA、再結合一致、公開専用fieldを検証し、途中失敗した生成物を成功扱いにしない。

### 6.2 Content repository

Runtimeの取得責務を`CourseContentRepository`へ集約する。

- `loadCatalog(baseUrl)`
- `loadCourseIndex(baseUrl, catalogEntry)`
- `loadLesson(baseUrl, courseIndex, lessonId)`
- `loadWorkspaceLessons(baseUrl, courseIndex, currentExerciseId)`
- `prefetchLesson(baseUrl, courseIndex, lessonId)`
- `clearRejected(resourceKey)`

cache keyは正規化済みpathと期待SHAで構成する。pending／fulfilled Promiseは共有し、rejected Promiseは削除して利用者の再試行を可能にする。cacheは現在Versionのin-memoryだけとし、Service Workerや独自永続cacheは追加しない。

### 6.3 Router loaders

- Home／LearningPath: Catalog v3だけ
- Course map: Catalog v3＋Course Index
- Slide: Catalog v3＋Course Index＋所有Lesson
- Exercise: Catalog v3＋Course Index＋所有Lesson。同じworkspaceを持つ現在工程以前のExerciseが別Lessonにある場合、その所有Lesson群も並行取得する
- Review: Exercise所有Lessonを読み、Course Indexでreview Slideの所有Lessonを解決する。所有Lessonが異なる場合だけ2つ目のLessonを読む。判定を行わないためworkspace依存Lessonは読まない
- Library course: Course Index
- Library slide: Course Index＋所有Lesson

nested loaderが同時に同じIndexを要求してもrepository cacheで1 fetchへ集約する。共有workspace Lessonは所有Lesson IDで重複排除し、未来工程と別workspaceを除外する。Componentへは巨大な全Course aggregateを渡さず、`CourseIndex`、現在の`LessonManifest`、必要時だけ`workspaceLessons`を明示的に渡す。

### 6.4 Progress runtime

進捗登録とmigrationはCourse Indexから作る`CourseProgressDescriptor`を受け取る。Lesson完了更新はCourse Indexのcompletion要約と現在Lessonの判定結果だけを使う。永続store名、record key、revision比較、原子的保存は変更しない。

## 7. 初期読込とprefetch

production bootstrapはcompilerが生成した既知Course IDとLesson IDのroute mapだけを埋め込む。

1. `#/courses/<courseId>`または`#/library/<courseId>`ならIndexをpreloadする。
2. URLが既知Lessonを含む場合は、そのLesson ManifestもIndexと並行preloadする。
3. Home、未知Course、未知Lesson、canonicalでないIDでは教材preloadを作らない。
4. preloadは`rel="preload" as="fetch" crossorigin="anonymous"`とし、Runtime fetchと同じURLを使う。
5. mode entryの`modulepreload`は現状どおり維持する。
6. Router dataのcommit後かつ画面がvisibleの時、`requestIdleCallback(callback, { timeout: 1500 })`で前後1 Lessonを先読みする。非対応Browserは500 msの`setTimeout`へfallbackする。

prefetchは同時2件以下、現在Course内だけ、1回だけとする。Network Information APIによる端末判定はBrowser差が大きいため必須契約にせず、明示的な`Save-Data`が取得できる場合だけ任意prefetchを抑止する。

## 8. Error handling

| 失敗                                | 必須読込                                 | 任意prefetch                               |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Network／HTTP                       | 既存`ContentLoadError('http')`と再試行UI | 現在画面を維持しcacheから失敗Promiseを削除 |
| UTF-8／JSON                         | `ContentLoadError('json')`               | 同上                                       |
| SHA不一致                           | `ContentLoadError('integrity')`          | 同上                                       |
| path／schema／ID対応不一致          | `ContentLoadError('schema')`             | 同上                                       |
| 未知Course／Lesson／Slide／Exercise | React Routerの404                        | preloadせず終了                            |

Course Indexが成功して現在Lessonまたはworkspace依存Lessonだけ失敗した場合、進捗や下書きを変更しない。再試行は同じrouteで失敗Lessonを再取得する。`ContentLoadError`はHTTP statusを任意fieldとして保持し、生成教材の404または410にだけ「ページを再読み込みして最新版へ更新する」CTAを出す。offline、5xx、JSON、integrity、schema失敗では既存の再試行CTAを使う。

## 9. SecurityとPrivacy

- 全Artifactは同一OriginかつBASE_URL配下だけを取得する。
- route parameterをそのままpathへ連結せず、compiler由来のroute mapまたは検証済みIndex entryから解決する。
- preloadは既知IDだけに限定し、任意URL fetchや404増幅を許さない。
- SHA-256一致前のJSONをdomain objectとして返さない。
- 公開ArtifactへSolution、Fixture、authoring-only field、秘密情報を含めない。
- optional prefetchは認証情報を扱わず、外部Originへ送信しない。

## 10. 性能目標

| 対象                    | 上限                              |
| ----------------------- | --------------------------------- |
| Catalog v3 gzip         | 20,480 bytes                      |
| Course Index gzip       | 40,960 bytes／Course              |
| Lesson Manifest gzip    | 12,288 bytes／Lesson              |
| route map追加gzip       | 8,192 bytes                       |
| Home初期JavaScript gzip | 256,000 bytes                     |
| LCP                     | 2,500 ms以下、4 URL×3 runの全結果 |
| CLS                     | 0.1以下                           |
| 主要操作                | 200 ms以下                        |

現在のHTML/CSS Courseを投影した試算では、Slide／Exercise本文を要約へ置換したIndexはgzip約26 KBである。entity ID indexを加えても40 KB上限内に収める。Lesson最大raw sizeは約23 KBであり、12 KB gzip上限に十分な余裕がある。閾値を超える場合は内容を削らず、Index境界または重複表現を見直す。

## 11. Testing strategy

### 11.1 Compiler／contract

- 分割後の再結合が元Courseのcanonical JSONと完全一致する
- Catalog、Index、Lessonのexact keys、ID、revision、path、SHA、重複を検証する
- missing、tamper、traversal、encoded traversal、symlink、unknown fieldを拒否する
- authoring-only fieldとSolution／Fixtureの公開混入を拒否する
- draft掲載規則とLearningPath参照を維持する

### 11.2 Runtime

- 同時loaderが同一Promiseを共有する
- fulfilledを再利用し、rejectedは削除して再試行できる
- Course mapはLesson Manifestをfetchしない
- Slideは所有Lesson以外を必須fetchしない
- Exerciseは同じworkspaceの現在工程までを所有するLessonだけを追加fetchし、別workspaceと未来工程を読まない
- Reviewは表示対象が別Lessonの時だけ2 Lessonを読み、workspace依存Lessonを読まない
- migration、Course完了、Export／ImportがIndexだけで完結する
- 既存進捗、下書き、Reset、Review復帰のrecord keyが変わらない

### 11.3 Browser／accessibility

- Chromium、Firefox、WebKitでHome、Course、Slide、Exercise、Review、Libraryを確認する
- offline失敗、SHA不一致、再試行、公開更新後のreload CTAを確認する
- Keyboard-only、focus return、live region、axe critical／serious 0を維持する
- 390x844と1280x720で重なり、はみ出し、通常Scroll回帰がないことを実画像で確認する

### 11.4 Performance／release

- bundleとArtifact容量の独立budgetを固定する
- LighthouseをHome、Course、Slide、Exerciseで各3回実行する
- `/tsumucode/` subpathで全preloadとfetch URLを確認する
- release Artifactに旧CatalogとCourse全体JSONが存在しないことを確認する
- secret scan、main push、Pages deployment、公開URL、console、代表viewportを確認する

## 12. 受け入れ条件

- [x] Catalog v3、Course Index、Lesson Manifestがstrict契約とSHA付きで生成される
- [x] 再結合CourseがAuthoring Courseと完全一致する
- [x] HomeはCatalogだけ、Course mapはIndexまで、Slideは対象Lessonまでを必須取得する
- [x] Exerciseは対象Lessonと同じworkspaceの現在工程までに必要なLessonだけを取得する
- [x] 既知直リンクでIndexと対象Lessonがentryと並行preloadされる
- [x] 未知routeとHomeで教材preloadが発生しない
- [x] 進捗、下書き、Reset、Review、Library、Export／Importの既存データが維持される
- [x] 任意prefetch失敗が現在画面を壊さず、実移動時に再取得できる
- [x] 旧Artifactを公開せず、旧Version失敗時にreload CTAを表示する
- [x] Unit、Content、Lint、Typecheck、3 Browser E2E、axe、Keyboard、performance、build、subpathが合格する
- [x] 4 URL×3 runのLCPがすべて2,500 ms以下である
- [ ] 日本語commit、secret scan、main push、Pages公開後検証が完了する

### 12.1 実装・性能確認結果（2026-08-02）

- route別教材JSON取得契約: Chromium／Firefox／WebKitで27件PASS
- 全静的／Unit Gate: 138 files、1320 tests PASS
- 全3 Engine E2E: 342 passed、90 skipped、failure／retry／flaky 0
- Preview／判定／主要操作性能: Playwright 18件PASS
- bundle／Catalog／Index／Lesson／route map容量: 7件PASS
- Lighthouse: 4 URL×3 runの12件PASS、LCP最大2,192.337 ms、CLSは全件0
- 教材Review: 51 Lesson、stale hash 0、rejected 0
- WebKitで検出したCompletion直後の履歴復帰とLease解放競合は、解放完了後の再取得へ修正し、対象Flowを3回連続PASSで確認
- Chromium reloadで検出した旧documentのLease解放競合は、同一ownerの新tokenへ原子的に置換し旧tokenをfenceする契約へ修正した
- 1280x720／390x844のHome、Course、Slide、Exercise、Library計10画面を原寸目視し、横overflow、Text切れ、重なり、CTA欠け、console errorは0件

## 13. 非対象

- Authoring CourseをLesson別Fileへ分割すること
- Service Worker、offline Course download、永続HTTP cacheを追加すること
- 教材本文を削減または簡略化して容量を合わせること
- URL、永続ID、progress store schemaを変更すること
- JavaScript Runner／Validatorや新Course教材をこの配信変更へ同梱すること

## 14. リスクと対策

| リスク                                  | 対策                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Index要約とLesson本文が不一致になる     | compiler再結合完全一致とSHAを必須にする                                               |
| fetch数増加で逆に遅くなる               | 直リンクpreload、Promise cache、前後1件だけのbounded prefetchを使う                   |
| Course mapやmigrationが本文へ再依存する | `CourseProgressDescriptor`とIndex専用型を境界にし、fetch数テストで固定する            |
| 共有workspaceの累積判定が分割で欠落する | Indexのworkspace順序から現在工程までの所有Lessonだけを読み、既存累積判定E2Eを維持する |
| 未知routeから任意pathを作られる         | compiler由来route mapとcanonical IDだけを許可する                                     |
| 旧タブが公開更新後に失敗する            | 旧Artifactは残さず、Error UIのreload CTAで最新版へ復旧する                            |
| 将来CourseでIndexが肥大化する           | Courseごとの40 KB予算を固定し、本文混入をmanifest graphテストで拒否する               |
