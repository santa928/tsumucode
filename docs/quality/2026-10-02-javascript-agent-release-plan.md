# JavaScript Course 通常公開までの実装・検証計画

- 状態: `実施計画。公開受入・配信は未完了`
- 要件正本: 2026-10-02の本人指示、[JavaScript全Course設計](2026-08-03-javascript-full-course-design.md)
- 本計画の公開基準: [JavaScript通常公開基準](javascript-normal-release-policy.md)
- 模擬学習手順: [JavaScriptエージェント模擬学習runbook](javascript-agent-learning-runbook.md)
- 対象: `javascript`、Chapter 00〜13、52 Lesson、14 Chapter、4 Phase
- 初期BASE: `08d36570950870896d3eeca8ce134340e98eb527`
- 作業場所: `/Users/santa/.codex/worktrees/sol-review-integration/ReactStudy`
- Branch: `codex/javascript-course-release`
- 元checkout: `/Users/santa/Documents/ReactStudy`、別branch `codex/fix-home-launch-target` / `24fe6e8`を保護する
- 実装・レビュー・模擬学習: 本人指定の`GPT-6.1 Sol`、推論強度`high`以上。本計画の実行は`xhigh`

## 目的と現状

JSを最優先として、全教材、制作、独立した模擬学習、是正、通常公開、公開後操作まで完了する。PRの途中mergeや一部教材の合格を完了とは扱わない。TypeScript・React・Next.jsの追加実験は今回の作業から外し、既存変更を保持する。

BASEの実体は`content/javascript/course.yaml`、12 Chapter、46 standard Lesson、184 Slide、48 standard Exercise、760分、3 Phase、`draft`。Chapter 12のGuided Projectは5 Lesson / 100分、Chapter 13のCapstoneは1 Lesson / 150分を追加する。最終合計は現行の標準教材時間を保持した場合、**1,010分（16時間50分）**となる。旧設計の1,000分との差はChapter 03が旧75分から実体85分になっている10分であり、通過目的で時間を削らない。新教材の実体が変わればLesson・Chapter・Course・表示・検査を同じ実測合計へ同期する。

46 Lesson / 48 Exercise / 760分はsource fileの列挙と`estimatedMinutes`の集計、184 Slide / 12 Chapter / 3 PhaseはCourse宣言と対応sourceで確認した初期状態である。この確認はcompileやBrowser成功ではない。

## 要件台帳

| ID          | 区分                 | 要件・受入条件                                                                                                            | 初期状態                               |
| ----------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| REQ-JSR-001 | 維持                 | 52 Lesson = 46 standard + 5 guided + 1 capstone、14 Chapter、4 Phaseを完成する                                            | Guided / Capstone未作成                |
| REQ-JSR-002 | 維持                 | 既習Conceptを制作へ接続し、直前の可視教材にない構文を必須にしない                                                         | 全52の確認は未完了                     |
| REQ-JSR-003 | 維持                 | Guidedは`javascript-quiz-guided`の累積Workspace、Capstoneは別の`javascript-quiz-capstone`                                 | 既存schema / selectorを再利用する      |
| REQ-JSR-004 | 維持                 | 全Lessonの説明・Hint・Solution・正負Fixture・例実行・独立source hash reviewを揃える                                       | 46件の既存記録を検査、6件追加          |
| REQ-JSR-005 | 維持                 | 端末保存、reload / resume、Reset、旧ID / Draft / passing snapshot、HTML/CSS、Path、Library、Export / Importを回帰させない | 最終入力で確認する                     |
| REQ-JSR-006 | 維持                 | 実Analyzer / Runner / Validator / bridgeで別解・誤答・system error・有限実行・隔離を確認する                              | Projectまでの実利用は未確認            |
| REQ-JSR-007 | 維持                 | 既存性能・Security・a11y・Browser・Artifact・出典・内容承認の閾値と必須範囲を維持する                                     | 最終Gateは未実行                       |
| REQ-JSR-008 | 維持（承認済み代替） | 旧REQ-JSC-033の「実在のJS完全初心者1名以上の全通し」を、3独立エージェントの模擬学習全通しに代替する                       | 今回本人が変更を承認した唯一の受入基準 |
| REQ-JSR-009 | 追加                 | 3役が別の保存状態でそれぞれChapter 00から全52 Lessonを最後まで通す。章の分担・合算は禁止                                  | 旧105操作は部分試用であり使用不可      |
| REQ-JSR-010 | 追加                 | 初回操作で正解・実装・Fixture・他役報告を先読みせず、可視教材とHintからUI入力・実行・採点する                             | runbookに固定                          |
| REQ-JSR-011 | 追加                 | Lesson / Exercise / rule / checklist ID、操作、期待、実際、証拠、Hint / Retry / 保存等を記録する                          | 3×52の完走記録が必要                   |
| REQ-JSR-012 | 維持                 | 実装者と別の独立コードレビュー、全blocking 0、必須未確認0の後に公開する                                                   | 最終HEADレビュー未実施                 |
| REQ-JSR-013 | 維持                 | 完成後のみ`published`、Home / frontend Path / Library掲載。HTML/CSS後の`required` Step                                    | 現状JSはdraft / 非掲載                 |
| REQ-JSR-014 | 維持                 | 最終入力の公開前全検査、source / Artifact hash binding、既存Pages・Environment保護・通常公開手順                          | HTML/CSS固定部分に対応が必要           |
| REQ-JSR-015 | 維持                 | 配信SHA・入口・開始/再開・採点・保存・持ち出し・consoleとRelease Reportを実確認する                                       | 未実施                                 |
| REQ-JSR-016 | 維持                 | 達成した受入に対応するIssueだけcloseする。#5全体や未完成後続Courseをcloseしない                                           | rootが判定する                         |
| REQ-JSR-017 | 維持                 | 所要時間等をsource実体へ合わせる。旧1,000分と変更理由を記録する                                                           | 最終暫定合計1,010分                    |
| REQ-JSR-018 | 保留（本人指示）     | TS / React / Next.jsの追加実験を停止してJSを優先する                                                                      | 既存変更を保護                         |

## 要件差分

| 区分                 | 今回の差分                                                                                                                               | 理由・影響・代替・復帰条件                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 維持                 | 52 / 14 / 4、螺旋型、制作到達点、共有Workspace、既存ID / 保存、Hint、独立レビュー、品質安全性能、通常公開・Environment・公開後確認を維持 | 人の全通し代替以外の条件を緩めない                                                                                                       |
| 維持（承認済み代替） | 旧REQ-JSC-033の人1名の全通しを3独立persona各自全52の模擬学習へ代替                                                                       | 本人が今回明示承認。エージェントの既存知識や感情の再現限界が残る。実人の理解受入と同等には扱わない。実人観察は将来別証拠として追加できる |
| 維持（数値同期）     | 旧1,000分をsource合計に同期。現状は760+100+150=1,010分                                                                                   | Chapter 03の+10分が差の原因。Lessonを削る代替案は採用しない。最終教材実体で再集計する                                                    |
| 追加                 | 独立3役それぞれ全52、先読み禁止、証拠ID単位の記録、公開対象JSの厳格bindingを明示                                                         | 部分試用・他役からの回答継承・HTML/CSS記録との混同を防ぐ                                                                                 |
| 保留                 | TS / React / Next.jsの追加実験。任意Tailwindは従来どおり非必須                                                                           | 本人のJS最優先指示。既存draft・保存済み技術証拠を保持する。JS通常公開完了後、次の本人指示で再開する                                      |
| 削除                 | なし                                                                                                                                     | 旧基準、過去観察、未達、証拠を削除しない                                                                                                 |

HTML/CSSの人観察未達と既存品質条件を今回のJS代替許可で解除しない。rootはJS専用のcourse-scope通常candidateを今回の公開に必要な最小実装と確認した。全site Artifact・安全・性能・E2EのGateを維持し、JS固有の受入記録だけを選択courseIdへ結ぶ。既存HTML/CSSのdraft / pending人手記録とβ配信状態を通常公開済みへ再ラベルしない。物理実機必須Gateは新設しない。

Environmentのlive読取結果は`github-pages`のbranch policyが`main`のみ、required reviewerなし。設定を変更せず既存保護を維持する。Environment経由のDeploy許可通過と、人による独立承認取得は区別し、後者を取得したとは記録しない。古いREADMEの独立Reviewer表記と実設定の差を公開証跡へ残す。

## Global Constraints

- 開発実行・依存・server・test・buildは`./scripts/docker-compose.sh`を用いてDocker内だけで行う。通常のread / file edit / Git確認は既存方針に従う。
- 実装者・reviewer・personaは本人指定のGPT-6.1 Sol / high以上。実装者の自己reviewを独立reviewへ数えない。personaは全52を各自担当し、実装を読ませない。
- 他担当が同じcodebaseで作業している。所有外fileをrevertせず、共有fileへの変更は担当を1人に限定する。
- 小さな可逆編集と必要検証は継続する。push / PR / merge / deploy / Issue操作はrootが今回の本人許可範囲と最終入力を確認して行う。
- 費用・新権限・秘密利用・別公開先・破壊変更・未承認の受入緩和は実施しない。相談前に依存しない実装とレビュー可能な具体案を完成させる。
- 未解消blocking・必須未確認をSkillのpark / Ruling / 回数上限で合格へ変えない。残る場合は公開不可として原因・最小判断を記録する。
- 過去証拠を消さない。私有ledger / brief / report / 画像 / 実行logはgitignored workspaceまたは`/private/tmp`、公開docsは必要な匿名要約だけを保持する。
- 公開入力からSolution / Fixtureを排除する。模擬学習者へ作者専用file、採点実装、hidden expected output、他役の解法を渡さない。
- JSのcourse-scope通常candidateを追加しても、全siteのArtifact / Security / 性能 / E2Eは同じGateで検査する。HTML/CSSのdraft / pending人手記録はapprovedにせず、HTML/CSSのβ配信を通常公開済みと再ラベルしない。source SHA / Artifact / 選択courseIdをApproval・Report・台帳・rollbackへ結ぶ。

## Setupと実行記録

rootは実在worktree、branch、BASE、dirty fileと所有を記録し、この計画のTask 1以前にSkillの`bash scripts/sdd-workspace PLAN_FILE`で計画専用のgitignored workspaceを解決する。既存ledgerの先頭が本計画を指す場合、`Task N: complete`を再dispatchせず継続する。別計画のworkspaceは読まず変更しない。

ledgerの先頭は`# SDD ledger — plan: docs/quality/2026-10-02-javascript-agent-release-plan.md`。各TaskのBASE、brief、report、review package、担当agent ID、実行command / 結果 / 証拠、spec / qualityの両review判定、未完了を記録する。各dispatchはSkillの`bash scripts/task-brief PLAN_FILE N`で抽出したTask本文を単一正本にし、全計画や前Taskの履歴を貼り直さない。reportはbriefと同じbasenameの`task-N-report.md`。review packageは記録したBASE..HEADから作り、`HEAD~1`へ短縮しない。

Task内の自分の記述の整合性と共有file / interfaceの組合せを事前確認し、下表をledgerへ記録する。本人要件がSkill一般論に優先する。Skillがworkspace削除を促す場合も、この作業では証拠保持指示を優先する。

## 所有・依存・事前整合確認

| Task | 主な所有範囲                                                                                   | 前提と自己整合確認                                                        |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1    | I-001の関係付き採点・限定migration、I-002の全workspace失効、必要project profile、対象tests     | 実Runner RED→GREEN、別解・旧source保持、採点prefixと全失効を分離          |
| 2    | JS Chapter 12 / 13の6 Lesson、Course / concepts / glossary / provenance、対象testsと内容review | 1人が全共有fileを所有。52 / 14 / 4 / 1,010分を実体同期、既存基盤を再利用  |
| 3    | JS専用公開Gate / evidence、必要release scripts / workflow / tests                              | 全site品質を保持し、JS受入記録をcourseId / source / Artifactへ厳格binding |
| 4    | 独立personaのread-only UI操作・私有証拠                                                        | 各役全52、同じsource / build、別の保存状態。3役の章分担禁止               |
| 5    | 観測blocking修正、published / Home / Path / Library / README、最終独立review                   | 4のレポートを保持、受入後に公開登録。1件もpark合格しない                  |
| 6    | 最終検証、Git / GitHub / candidate / Deploy / post-deploy台帳                                  | root所有。固定final source、全Gate、Environment保護、配信後確認を順守     |
| 7    | 達成Issue照合・close、最終結果                                                                 | 6の配信後受入が完了した項目だけclose                                      |

| 共有Task / interface                                 | Produce → Consume                                     | 競合対策・確認                                                               |
| ---------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1 / 2: Runtime / Validator / 共有Workspace           | 採点・失効・profile契約 → 制作教材                    | 1の独立review後に2をdispatch。正当な既習APIを教材で使う場合だけprofileを整合 |
| 1 / 2 / 3: Course revision / migrations / 内容review | 限定旧合格失効 → 全52原稿 → source binding            | source修正の影響IDを引き継ぐ。旧sourceの隔離/backup保持、全46Reset禁止       |
| 2 / 4 / 5: 公開Lesson bytesと採点Runtime             | 固定候補 → 学習操作 → 是正                            | 学習期間は入力を凍結。変更時はhashと無効化範囲を記録し関連再検証             |
| 2 / 5 / 6: source reviewと公開metadata               | 全52内容承認 → published / Path → candidate binding   | Course登録後に最終hashを固定。教材変更があればstaleを解消                    |
| 3 / 5 / 6: 公開schema・Approval・Continuity          | JS専用contract → 公開登録 → fail-closed検査           | HTML/CSSの未達をJS模擬で埋めない。全siteGateを維持                           |
| 4 / 6: Build / storage / evidence                    | persona fixed build → final candidate / 公開後journey | 有効な同一入力証拠だけ再利用。配信の外部状態は取り直す                       |

## Task 1: 既存誤合格・全Workspace失効・制作Runtime前提を修正する

**Files:** 関係付きのJS analyzer fact / Validator契約、`javascript-ch01-l03-e01`のrule / 負例、`content/javascript/course.yaml`の限定migration、`src/core/content/selectors.ts`、`src/core/persistence/progressUpdates.ts`、`src/features/learning/pages/EditableExercisePage.tsx`、必要なproject capability / scenario契約、各対象tests。制作6Lessonとrelease scriptsは変更しない。関係fact等を追加する場合、新規・実質改修関数に既存書式のdocstringを付ける。

**初期BASE監査:** `/private/tmp/tsumucode-js-existing-quality-audit.md`。Critical0 / Important2。コード読解の仮説を実RunnerのREDで確かめてから修正する。監査自身は実測成功証拠ではない。

1. I-001: `javascript-ch01-l03-e01`は指定計算bindingを未修正のままConsole側だけで正答出力を作るコードが現契約で合格し得る。監査の具体負例を実Analyzer / Runner / Validatorへ通し、誤合格REDを取得する。対象bindingの初期化式とConsole参照を必要範囲で関係付け、Solution・既存正当別解・Starter・固定出力負例を維持する。完全な模範Source一致や汎用データフロー解析へ拡大しない。同型の既存教材は具体負例が成立する対象だけ調べる。
2. 採点変更された既存Exerciseの旧合格だけを限定migrationで失効する。旧Source全文を既存隔離・復旧backupへ残す。全46Lessonの一括Reset、進捗/過去成功Sourceの消去は禁止する。
3. I-002: 採点対象は現在工程までのprefix、編集/ResetによるcurrentComplete失効は同一Workspace全工程へ分離する。Course Indexの全Workspace outlineを用い、未来Lesson本文を先読みしたり未来工程を採点したりしない。後工程合格→前工程へ戻る→後工程要件を破壊→autosave / reload / Map / Export / Importで後工程currentCompleteが失効し、編集では過去passing snapshot / 初回完了日時を保持することを確認する。確定Resetは既存互換としてStarterへ戻しHint / 判定履歴 / passing snapshotを消去して全Workspace現在完了を失効し、取消はすべて保持する。
4. Guided / Capstoneが既習`event.currentTarget`やForm取消+asyncを使う場合、固定`project` profileと既存currentTarget / submit guardを整合する。具体教材で使わないAPIは広げない。新JS専用guided schemaを複製しない。profileの許可/拒否matrix、取消後async、Keyboard/Focusを実Runtimeで検証する。

**Interfaces:** 現在までのvalidation targetと全Workspace invalidation targetを別用途として公開し、Task2へhelper / schema / profileの正確な契約と検証済みAPIを渡す。source fact追加はstrict union・Source hash / Evidence結合を保つ。既存保存schema・ID・採点system error非履歴化を変えない。

**検証:** 実module・実RunnerのRED→GREEN、対象Analyzer / Validator / selectors / progressUpdates / LearningRoutes / Controller、限定旧合格migrationとbackup、共有Draft Export→新repository Import、3 Engineの変更したRuntime安全境界。全公開Gateはfinal candidateで行い、初期修正で無関係な全suiteを繰り返さない。

**完了条件:** Important2を実再現と修正で解消、正当別解・過去Source・採点prefix・全失効分離が成立。Task1の固定BASE..HEAD、command / 結果 / 証拠、影響file / ID / migration、残る懸念をreportへ記録し、実装者別のspec / qualityレビューを両方受ける。rootがcommitを管理し、source workerはsubagentを起動しない。

## Task 2: Guided 5工程・Capstoneと全52教材を完成する

**Files:** `content/javascript/chapters/javascript-ch12/**`、`javascript-ch13/**`、`course.yaml`、concepts / glossary / provenance、専用Content / Unit / E2E、内容review台帳。1人のownerが6Lessonと共有fileを順に変更する。Task1で確定したRuntime接口を再利用し、未解決の必要変更はrootへ報告する。

問題表示、回答、得点、結果、再挑戦を5 Lessonで積み上げる。共有`javascript-quiz-guided`Workspaceのsource / draft / file選択・cursor・passing snapshotを既存契約へ接続する。各Lessonは今回工程だけを判定し、既存工程の破壊、別LessonのHint / validation history混在、誤答で完了履歴が残るケースを防ぐ。既習内容だけで段階的に完成できる説明・3段階Hint・正負Fixture・別解・可視期待を用意する。

**検証:** 実moduleのRED→修正、対象Content / Unit、実Runner / Validatorの全Solution / Starter / 負例、累積保存 / reload / Reset / 取消 / 再編集、KeyboardとError復帰、代表viewportの実画像目視。必要Runtime変更があれば3 Engineの該当suiteへ拡大する。

**完了条件:** 全5工程が実Browserで保存・再開して完成可能、chapter時間100分をLesson合計で説明できる。テストfixtureの状態注入だけで制作journeyを合格にしない。未対応APIを不自然な教材回避で隠さない。

### Capstone 1 Lesson

**Files:** `content/javascript/chapters/javascript-ch13/**`と専用tests。Guidedと同じTask2 ownerが所有する。

カテゴリ選択、問題進捗、得点、結果、再挑戦、Keyboard操作をBrief / Checklist / rule / Scenarioへ結ぶ。Guidedから独立した`javascript-quiz-capstone`を使う。Guideは設計順序・確認観点で助け、完成Sourceの段階コピーへ縮退しない。後期の振る舞い中心の採点と正当な別解を維持し、失敗時復帰・Sourceを含む学習bundle Export / Importを完成作品で確認する。

**検証:** 実Runner / Validatorで機能別欠落負例と別解、カテゴリ/正誤/得点/最終結果/再挑戦/Keyboard、Error復帰、保存 / reload / Reset、Checklist表示と実判定の整合、150分の実体合計。

**完了条件:** 作者Solutionと別の実装経路で完成できる。Capstone完了、持ち出し、採点が別々のIDと証拠で確認できる。既存学習bundleを実downloadし、別の学習保存状態へImport・再開してSourceを確認する。HTML専用ZIPをJS持ち出しと呼ばず、JS ZIPや新しい実行環境は必須追加しない。

### 全52の統合と独立技術・教材レビュー

**Files:** `content/javascript/course.yaml` / concepts / glossary / provenance、必要Runtime接続、`docs/quality/content-review-javascript.yaml`、関連tests。Task2 ownerが共有fileを変更する。

52 / 14 / 4、standard46 / guided5 / capstone1と実体時間を同期する。既存累積Workspace schema / selectorへ接続し、不要な別基盤を増やさない。全Concept・初出・前提・Slide→Exercise→Rule / Checklist、公開配信境界、進捗互換を確認する。全Lessonをauthorと別のreviewer IDで実行証拠とsource hashに結んで承認する。

**検証:** compile / source出典 / 内容review、対象型・Lint・Unit / Content、全JS実Fixture、Projectの統合UI、独立コードreview（spec / quality）。旧Chapter 00とHTML/CSSの関連保存・学習回帰を確認する。

**完了条件:** 部分未作成0、教材とRuntimeのblocking0、模擬学習者へ渡せる固定source / production build / 52 Lesson一覧を用意。source / sourceHash / build hashを記録して学習中の変更を凍結する。

## Task 3: JS専用の通常公開GateとEvidence bindingを実装する

**Files:** 必要最小の`scripts/release/**`、`.github/workflows/pages.yml`、release関係tests、JS専用Approval / Checklist / 模擬学習記録schema / 台帳・公開手順。既存HTML/CSSの手動記録のstatusを変更しない。1人のsource ownerがTask2の独立review後に担当する。

**Interfaces:** `courseId=javascript`を選択した通常candidateのtarget、Source approval、Artifact hash、Report、Release履歴、post-deploy、rollbackに同じcourseId / source SHA / Artifactを結ぶ。courseId取り違え・未承認 / stale内容hash・persona全52不足・record path差し替え・前回Run値の流用をfail-closedにする。既存HTML/CSS candidateの人手/記録/性能契約は維持する。全site dist / Security / Performance / 規定E2Eはcourse選択に関係なく検査する。

既存`releaseSchema.ts` / `verifyReleaseApproval.ts`の51Lesson・5Checkpoint等はHTML/CSSの契約として保持し、JSは全52Lesson・3独立全通しと唯一の承認済み代替、旧基準・理由・限界を別のstrict recordで要求する。既存`visual-review.md`のreviewedScreens24とvalidatorのexact20の差は、記録を20へ偽装せず、対象画面集合と既存閾値の意味を確認して最小の整合を取り独立reviewする。rootが公開専用記録の有効性を確認する。

**検証:** JS対象成功、HTML/CSSの既存契約維持、未知course / path / hash / 51と52混同 / persona1役欠落 / 部分試用 / 同一状態 / 必須未確認あり / stale source / Artifact不一致の負例。選択courseを保持したReport / rollback往復、全siteGateのworkflow静的契約、旧βが正式Releaseへ再ラベルされないこと。

**完了条件:** JS専用通常candidateと最終Evidence収集のinterfaceが揃う。まだ模擬学習未完なのでJS approvalはdraftのまま、架空のapprovedを生成しない。模擬学習時の入力hashと最終公開distのbindingは別項目として検査する。Task4はdraft buildで全52、Task5はpublished / Path登録後なのでSHA / distが変わる。Lesson / 採点Runtime / 保存契約の入力hashを比較し、metadataのみの変更なら有効範囲を明記して3役の公開入口 / 再開smokeを最終候補で取り直す。教材 / 採点 / 学習UI変更は影響する後続を再検証し、広い変更は全通しを取り直す。両Artifactが同一と偽装したり、同じdistを無理に要求して契約を緩めたりしない。READMEのEnvironment記述はlive main-only policy / required reviewer未設定に合わせ、独立承認取得済みとは主張しない。新Reviewer / 権限 / 公開先は追加しない。Task3の独立spec / quality reviewを取得後、Task4の固定buildを用意する。

## Task 4: 独立3ペルソナが各自全52を模擬学習する

**Files:** read-only製品UIと`/private/tmp`または本計画のgitignored workspace内の役別証拠。製品file / 進捗DBを直接変更しない。

runbookに固定したJS初心者、うっかり・中断多、自力制作志向の3独立agentを同じ候補・別BrowserContext / 保存状態で開始する。各自Chapter 00から52 Lessonを順に読み、UIからコード入力・実行・採点・Hint・保存 / reload / 再開 / Reset・Guided / Capstone制作・持ち出しを実施する。分担や他役報告の先読みは禁止。

**検証:** 各役の52 Lesson coverage、UI操作とID / 期待 / 実際 / URL / 画像 / 保存・復帰を照合。作者の採点正解と学習者の理解申告を混同しない。本人理解・自然な誤解頻度・物理端末の代替証拠にはしない。

**完了条件:** 3役それぞれ52/52の初回通し記録、必須操作の実施記録、残るfindingと必須未確認の明示。blocked役を他役の結果で補完しない。候補修正はTask 5へ渡す。

## Task 5: 全blocking是正・公開登録・最終レビュー

**Files:** findingに直接対応する最小範囲と役別追加証拠、source review台帳。rootが実装ownerを指定する。

難度飛躍、説明不足、操作不能、誤採点、保存 / Reset / 再開 / 制作 / 持ち出しの失敗を修正する。元レポートは保持し、findingごとに原因 / 変更 / 再操作 / 期待 / 実際 / 証拠を追記する。教材 / rule / Runtimeの入力変更を記録し、旧証拠の有効範囲をhashで説明する。学習順序・制作契約に広い変更があれば、独立した全通し証拠を取り直す。

**検証:** 回帰を壊せる最小再現、関連test、affected persona再操作、内容hash再承認、実装者別の独立コード再review。必要未確認は各項目の証拠を取得して解消する。

**完了条件:** 全blocking0、必須未確認0、全52の有効な独立3役証拠。未達をpark・test期待値弱化・範囲削減でゼロにしない。

### 公開登録と通常candidate記録の完成

**Files:** `content/javascript/course.yaml`、`content/learning-paths/frontend.yaml`、Home / Course / Library関連tests、README、必要な`scripts/release/**` / tests / quality台帳。rootがownerを指定し本docs担当はコードを変更しない。

受入済みJSを`published`へ登録し、HTML/CSS後の`required` StepとしてHome / Path / Libraryへ接続する。既存再開先と文言、保存 / 採点 / 持ち出しの入口を確認する。HTML/CSS固定のrelease validatorをJSへ対応させる際は、52 Lesson・3独立全通し・承認済み代替・同一source / dist / review hashを厳格に結ぶ。HTML/CSSの未観察記録をJS合格へ書き換えない。

通常candidateのHTML/CSS手動条件を含む未達については、[公開基準の既存契約差](javascript-normal-release-policy.md#既存candidateの適用範囲と未達)の具体案を先に作る。今回の代替1点を越える受入変更が必要なら、実装で既定を解除せず本人判断を得る。quality-only / beta / 別公開先を通常公開の代替にしない。

**検証:** draft非掲載を維持する他Course、published JS入口、Home初期chunk / 性能、Path導出進捗、直開始 / 途中再開 / Library読書、公開targetの負例・stale / hash / course取り違え拒否、HTML/CSS既存契約の回帰。既存必須Screen / Browser範囲を保持し、変更箇所の実画像を目視する。

**完了条件:** local candidateの正常な入口と公開contractがレビュー可能、全公開blocking解消。公開契約判断が未確定ならdeployは止めるが、依存しない検証は続ける。

## Task 6: 最終Gate・PR・merge・Pages通常公開・配信後確認

**所有:** root。必要なコード変更後は独立reviewへ戻す。

最終Product入力に対し下表の全必須Gateを実行する。同一入力の有効な成功証拠を再利用するときはsource / file / Artifact hashと確認範囲を報告する。過去の通常CI成功を公開前全Gate成功へ読み替えない。日本語commit / staged秘密情報検査 / PR / 最新HEAD独立review / 必要CIの後、許可範囲内でmergeする。mergeでProductが変われば必要証拠を取り直す。

既存PagesのJS course-scope `candidate`経路で承認source / Artifact / quality記録を固定し、dispatch直前のmain・入力SHA・workflow headの関係を検証する。Environmentのmain-only保護を経て実Deploy / Report / tagを確認し、required reviewer未設定のため独立Environment承認取得済みとは主張しない。配信後はhash・入口・開始 / 再開・採点・保存 / reload・持ち出し・consoleを実操作し、revision別post-deploy記録と正式台帳に同Run値を結ぶ。

rootのlive読取では直近Pages Deploymentは`2026-09-28`の`4ea25976c95e5aa25893f3e3b88c6fc100ae6cab` / Deployment ID `6700952125`、release tag一覧は空。今回対象の通常公開成功証拠ではない。公開URLは`https://santa928.github.io/tsumucode/`。最終新Run / Report / post-deployを取得する。

**完了条件:** 全必須Gate成功、source / dist / 出典 / 内容review / quality Artifact / Report / Run / tag / URL / post-deployが一致し、公開後主要操作が成功。未確認URLやActions pending、途中mergeは完了ではない。

## Task 7: Issue受入と最終報告を照合する

**所有:** root。Issue / PR / automationの操作権限はこの担当へ委譲しない。

#9の5 Guided Lesson、#10のCapstone・全JS受入・通常公開、関連Issueの各チェックを本人要件と実証に照合し、実際に達成したIssueだけcloseする。#5全体、TS / React / Next / 常駐環境等は今回達成しない条件を保持する。automationは実在設定と本人の最新指示に従いrootが扱う。

**完了条件:** 公開配信SHA・URL・最小証拠・模擬検証の限界・残る非対象を短く報告し、JS通常公開を完了とする。

## 実行Gate完全一覧

以下はBASEのscript / workflow実体に基づく一覧である。後続変更で命令が増えた場合は本表へ追加し、減らす場合は本人合意なく採用しない。npm等はすべてDocker内。表のcommandはCompose `app`での実行を意味し、canonical公開検査は`BASE_PATH=/tsumucode/`を渡す。test / buildはlog・生成教材 / dist・reportを生成し、browser計測はserverを一時起動する。依存installや外部送信はこの表で新たに許可しない。

| Gate | 必須検査と実在command / 方法                                                                                | 範囲・注意                                                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 | `npm run content:compile`、`npm run content:check`                                                          | 全52 / 14 / 4 / 種別 / 実体時間、Concept / 用語 / trace / screen budget、配信生成。compile成功だけで学習受入にしない                                                                     |
| G-02 | `npm run content:provenance`、`npm exec tsx -- scripts/content/checkProvenance.ts content/javascript`       | 前者はpackage実体ではHTML/CSS固定。JSも明示実行し、全file・出典・Solution / Fixture visibilityを検査                                                                                     |
| G-03 | `npm run content:review`                                                                                    | all-course台帳、JS全52、author別reviewer、source hash、accuracy / alignment、未説明語0 / Hint leakage0 / 例実行 / decision。通常CIのwarningを公開時は許容しない                          |
| G-04 | `npm run lint`、`npm run typecheck`、`npm run test:run`                                                     | 最終公開前は全Unit / Component / Content。build:app内にもtypecheckがあるが独立成功証拠を区別                                                                                             |
| G-05 | 変更filesのDocker内Prettier、`git diff --check BASE HEAD`、`git diff --cached --check`                      | 固定BASE..finalHEADとstaged差分を確認する。書式は今回変更したfilesだけを対象とし、既存pages / check:release必須Gateと区別する                                                            |
| G-06 | `npm run build:app`、`npm run smoke:learning-chunks`                                                        | canonical dist、Editor / Runner等のlazy境界、Home漏洩禁止                                                                                                                                |
| G-07 | `npm run check:release`                                                                                     | compile / content:review / lint / 全test / build:app / learning-chunksの既存公開aggregate。単独Gateと同じ入力の実行重複は有効証拠で説明                                                  |
| G-08 | `npm run release:continuity`                                                                                | candidateのsource / Artifact / ID / tombstone / migration / 過去Release / 合成進捗bundle。既存実体はHTML/CSS固定、JS対応の厳格bindingが必要                                              |
| G-09 | `npm run test:e2e`                                                                                          | Chromium全規定E2E、Firefox / WebKitは設定の6smoke spec。`@visual-extended`は既存通常範囲外。全Solution / Starter / 負例、Security、保存、採点、Reset、入口、a11yを含む                   |
| G-10 | JS Project / 共有Runtime変更に対する3 Engineの該当追加E2E                                                   | 全52FixtureとGuided / Capstone累積制作、保存・別tab・Focus・Keyboard・安全拒否。単なる`--project`は既存testMatchを広げないので、対象suiteを明示した一時config等で実行、0件成功を認めない |
| G-11 | E2Eのaxe / Keyboard、変更したUIの手動実画像確認                                                             | WCAG A/AA、critical / serious0に加え既存all-impact0の契約を保持。最低PC、reflow / mobile読書 / tablet等は影響範囲に応じ実測。VoiceOverは既存非対象、物理実機未確認を隠さない             |
| G-12 | `npm run test:performance`                                                                                  | Playwright性能3spec + bundle Vitest。JS Preview / validation / scenario / Projectと全既存予算                                                                                            |
| G-13 | `npm run test:lighthouse`                                                                                   | 既存4URL×3runs、LCP / CLS / Home JS。JS公開入口追加で必要なJS代表URLも同じ条件を確認。既存HTML/CSS4URLを削らない                                                                         |
| G-14 | `npm run smoke:subpath`                                                                                     | canonical `/tsumucode/`でrouting / hashed asset / 静的配信を確認                                                                                                                         |
| G-15 | `npm run release:check`                                                                                     | Static ArtifactのCSP / inline / 依存 / 許可asset / authoring混入 / 生解答 / Browser本番安全境界                                                                                          |
| G-16 | JS変更画面のvisual確認、必要時`npm run test:visual:extended`                                                | extendedは既存opt-in。今回の新制作/公開画面の実測・画像目視は必須。baselineを通過目的で更新しない                                                                                        |
| G-17 | 3役各自全52の模擬学習、保存 / 制作 / 持ち出し                                                               | runbook。全blocking0 / 必須未確認0、AI模擬として記録                                                                                                                                     |
| G-18 | 全52独立内容review、最終差分の独立コードreview                                                              | 実装者別、固定BASE / HEAD、spec / quality、全必須findingを解消                                                                                                                           |
| G-19 | staged差分の秘密情報確認                                                                                    | `pre-push-security-check`の現行手順。秘密値・認証URL・私有証拠等の混入を防ぐ。未許可の外部scannerへ送信しない                                                                            |
| G-20 | `release:report -- --hash-only`、`release:approval -- --artifact`、`release:target -- --mode candidate ...` | actual dist / Course / public provenance / visual baseline / 手動記録 / Product tree / 承認source / workflow headを厳格にbinding                                                         |
| G-21 | 既存Pages quality job / quality Artifact、Environment保護、Deploy / Report / annotated tag                  | quality reportの必須ファイル存在、Artifact ID / digest、run / attempt。Environmentはliveでmainのみ、required reviewerなし。設定を維持し、人の独立承認取得とは呼ばない                    |
| G-22 | 公開URL実操作、revision別post-deploy、`release:continuity -- --promote --report ...`                        | 配信SHA・Home / Path / Library・開始 / 再開 / 採点 / 保存 / reload / 持ち出し / console、Report・tag・台帳・URLの一致。既存公開履歴は保持                                                |

G-05の`BASE`は本計画の固定BASE、`HEAD`は最終公開候補の40文字SHAを指定する。Prettierは同範囲で変更したdocs・教材等の対象pathだけをDocker内で指定して確認し、stage済み差分も`git diff --cached --check`で確認する。全treeの`npm run format:check`（`prettier --check .`）は、既存Pages quality / `check:release`の必須Gateには含まれない別の診断である。未変更fileの書式差を新たな公開blocking、無関係な全体整形、製品必須検査や閾値の緩和の理由にしない。

## 性能目標

正本は`content/html-css/performance.yaml`、`content/javascript/performance.yaml`と固定予算test。JSは初回Preview p95 ≤500ms、再Preview ≤250ms、通常validation ≤1,000ms、standard Scenario ≤1,500ms、Guided batch ≤3,000ms、Home initial JS gzip ≤256,000bytes、JS追加lazy graph ≤180,000bytes。配信はCatalog gzip ≤20,480bytes、Course Index ≤40,960bytes、Lesson Manifest ≤12,288bytesを保持する。LCP ≤2,500ms、CLS ≤0.1、既存主要操作 / 保存 / Console long task等も保持する。古い設計にあるLesson p95 32KiB / max48KiBを現在の12,288bytes制約へ緩和する根拠にしない。

## 非対象

- TS / React / Next.js / 任意Tailwind / Pythonの追加制作や新しい公開先。
- 実人の理解・感情・自然な誤解頻度の証明、物理スマホ / タッチ / VoiceOverの検証済み主張。
- 学習コードのNetwork / Storage / navigation / dynamic code許可、費用や認証の新設。
- HTML/CSSの未達観察をJS模擬で合格へ置換すること、Gate / 閾値 / 必須範囲の削減。

## リスクと対策

| リスク                                     | 対策                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| AIが既存知識で説明飛躍を補う               | 初回先読み禁止、根拠となる可視教材を記録、既存知識で補った箇所をfinding化。実人の受入へ一般化しない |
| 3役が解法や保存状態を共有する              | 新規独立contextと保存領域、役別証拠、他役報告を渡さない。3×52を個別確認                             |
| Project共有Workspaceが前工程を壊す         | 既存契約再利用、工程ごとの実保存 / reload / Reset / passing snapshot / history分離を検証            |
| 公開scriptのHTML/CSS固定が偽JS承認を作る   | Courseごとのstrict contractとhash / record bindingを具体化。既存HTML条件を解除しない                |
| 同じ入力の重複全検査・旧証拠の不適切再利用 | source / Artifact hashと環境で有効性を判定。最終変更と配信外部状態は取り直す                        |
| 対応中に別branch・公開βを破壊する          | 指定worktreeと単一owner、既存変更を保護、同じPages手順、復旧は登録済みReleaseの既存rollbackに限定   |

## 最終版保持チェック

- [ ] 受け入れ条件: 全52完成、独立3役各自全通し、先読み禁止、全blocking / 必須未確認0、独立レビュー、通常公開・配信後操作を保持した。
- [ ] 非対象: 後続Course・新費用/権限・実人/実機の誤認・HTML/CSS未達の代替を含めて保持した。
- [ ] リスクと対策: 既存知識、独立状態、累積保存、公開契約、証拠再利用、元作業保護を保持した。
- [ ] 性能目標: source実体の全固定予算を保持し、閾値・Gate・範囲を緩めていない。
- [ ] 唯一の受入代替、旧基準、理由、限界、時間実体の差、未確定判断を隠さず記録した。

このチェックは計画の保持確認であり、各製品Gateの合格欄ではない。rootが最終版と実証を照合して記入する。
