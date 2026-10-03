# JavaScript通常公開基準

- 状態: `基準の実施計画。JS公開受入は未完了`
- 対象Course: `javascript`
- 計画: [JS通常公開計画](2026-10-02-javascript-agent-release-plan.md)
- 模擬学習: [JSエージェント模擬学習runbook](javascript-agent-learning-runbook.md)
- 変更根拠: 2026-10-02の本人の直接指示。JSを最優先に通常公開まで完成する

## 今回承認された受入代替

旧[JS全Course設計](2026-08-03-javascript-full-course-design.md)のREQ-JSC-033と14節は「少なくとも1名のJavaScript完全初心者がChapter 00からCapstoneまで通し、Lesson単位で観察と是正を記録する」条件である。2026-10-02には3独立personaの全通しへ代替したが、2026-10-03 15:57 JSTの本人指示で、**新規/未確認教材の初学者向け理解・操作を3独立personaで一度確認し、確認済み教材を保持する方式**へ置換した。

新しい検証はUI実操作から教材・採点・保存・制作の問題を発見し是正するために使う。エージェントの既存知識、自己申告、意図的な誤り、入力代行を含むため、実人の理解・感情・自然な誤解頻度と同等には扱わない。旧基準を削除せず、Reportに元基準・今回の理由・限界を保持する。

全52 = 46 standard + 5 guided + 1 capstone、14 Chapter、4 Phase、既存安全・性能・a11y・Browser・内容review・全公開Gateを維持する。所要時間は旧1,000分を実体へ同期し、現在の標準760分と追加100+150分なら1,010分とする。

| 区分                 | 差分                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| 維持                 | 全教材・制作・保存・互換・内容review・独立コードreview・全site品質Gate・同じPages・配信後確認  |
| 維持（承認済み代替） | 実在JS初心者1名全通し → 教材単位の独立3persona評価（実施済みを保持）。旧基準・理由・限界を保持 |
| 追加                 | JS専用のcourseId / source SHA / Artifact / 独立52Lesson review / 模擬学習証拠のstrict binding  |
| 保留                 | 本人指示によるTS / React / Next.js追加実験。JS公開後の本人指示で復帰                           |
| 削除                 | なし。HTML/CSS人観察・過去記録・証拠を削除しない                                               |

## JS通常公開の受入条件

- 全52の説明、Exercise、3段階Hint、正負Fixture、実例実行、正当な別解、source hash付き独立内容reviewが揃う。
- Guidedの5工程が単一累積Workspaceで完成し、Capstoneが別Workspaceで既習Conceptを統合する。工程の採点と全Workspace編集失効を分離する。
- 新規/未確認教材の理解しやすさと操作可能性を3独立personaが一度確認する。以前の部分記録を教材単位で照合して再利用し、commit/hash・test修正・容量変更で確認済み教材の学習をリセットしない。未実施の補完、実装/解答先読み、同じ原本/保存状態の複製、裏DB合格注入は禁止する。
- 通常のコード回帰/採点/安全/保存・公開後確認は技術Gateで検証する。教材評価では可視教材の読解と課題操作を記録し、技術横断操作を毎回全personaへ反復させない。
- 全blocking0・必須未確認0、実装者別の独立コードreviewを満たす。未解消をparkして通常公開しない。
- 受入後のみJSをpublishedへ登録し、Home / frontend PathのHTML/CSS後required Step / Library / 直接開始 / 続きからを検証する。
- 最終source入力の生成、JSとHTML/CSS出典、内容hash review、互換、型 / Lint / 全Unit・Content、規定Browser E2E、axe / Keyboard / 対象viewport、Performance / Lighthouse、Security / Static Artifact、subpath / chunk / 全Release bindingを通す。全Gateは計画のG-01〜22を参照する。G-05は変更filesのDocker Prettierと固定BASE..finalHEAD / staged差分の確認であり、全treeの`format:check`を既存公開必須Gateへ追加しない。製品の既存必須検査・閾値は維持する。
- 同じPagesのcourse-scope JS通常candidateを配信し、新Run / Report / tag / source SHA / Artifact digest / courseId / post-deployを一致させる。公開URLで入口・開始 / 再開・採点・保存 / reload・持ち出しを確認する。
- 旧HTML/CSSのβ配信とdraft / pending手動受入記録を通常公開済みへ変えない。対応Issueは達成したものだけcloseする。

## 既存candidateの適用範囲と未達

2026-10-02 BASE `08d3657`の公開実装はHTML/CSSの初回Releaseを固定対象としている。

| 実体                           | 固定契約・未達                                                                           | JS対応方針                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `releaseSchema.ts`             | 5品質record pathをHTML/CSS既存pathへliteral固定                                          | JS専用pathとstrict記録を追加し、任意path差し替えは許可しない                 |
| `verifyReleaseApproval.ts`     | 内容review 51Lesson、novice 5Checkpoint + Guided / Capstone、人1名以上                   | HTML/CSS契約は維持しJS教材単位の3独立評価・原証拠の再利用を別記録へ結ぶ      |
| `releaseHashes.ts`             | Course / public provenance hashはhtml-css固定。dist全体hashは全site                      | JS Course / provenanceも選択courseIdへ結び、dist全site hashは維持            |
| `checkReleaseContinuity.ts`    | html-css course / history固定                                                            | JSのID / migration / history / Report / rollbackを選択Courseで照合する       |
| `visual-review.md` / validator | reviewedScreens24に対しvalidator exact20。最終source / dist未binding                     | 記録を20へ改ざんしない。対象集合と意味を照合し必要最小の整合を独立reviewする |
| HTML/CSS既存記録               | release-approval / checklist / novice observationはdraft / pending。実人5Checkpoint承認0 | statusを変えない。JS模擬記録で代替しない                                     |
| `.github/workflows/pages.yml`  | candidateは通常approval / continuity / tag、betaはquality-only / 正式tagなし             | JSは通常candidateへ最小course-scope追加。beta成功をJS通常公開の代替にしない  |

rootは最小course-scope拡張を今回のJS通常公開に必要な実装と確認した。これはHTML/CSSの受入基準を解除する実装ではない。全site Artifact / 安全 / 性能 / 規定E2Eはそのまま通し、通常公開のCourse固有受入はJSだけを新記録で承認する。HTML/CSSの人手観察、記録、性能Gateは保持する。

Source SHA・Artifact・選択courseIdをtarget / Approval / Report / Release履歴 / post-deploy / rollbackへ結び、HTML/CSS値をJS証拠と呼ばない。未知course、record差し替え、stale hash、模擬学習欠落、必須未確認、別Runの値は失敗させる。実装完了前のJS approvalはdraftのまま保持する。

## Environmentと配信状態

rootの2026-10-02 GitHub read-only確認では、`github-pages`はcustom branch policyがmainのみ、required reviewer未設定。新Reviewerや設定変更を行わず、既存保護を維持する。Environmentを経由してDeployが許可されたことと、人の独立Environment承認取得は区別する。古いREADMEの独立Reviewer記述との差を同期し、取得していない承認をReportで主張しない。

同じread-only確認で、直近Deploymentは2026-09-28、source `4ea25976c95e5aa25893f3e3b88c6fc100ae6cab`、ID `6700952125`、release tag一覧は空。今回の通常公開は新しい最終Runを取得する。URLは`https://santa928.github.io/tsumucode/`。

## 非対象・リスク・性能の保持

JS ZIP、単独作品の新実行環境、Node / Next.js環境を今回の持ち出し必須へ増やさない。既存の学習bundleはSourceを含み、別の学習状態へExport / Importする実証を取る。HTML導入専用ZIPはJS作品持ち出しとは呼ばない。物理端末・VoiceOver・実人理解を検証済みとは主張しない。新しい物理実機必須Gateも設けない。

リスクはAIの既存知識補完、解法/状態共有、累積Workspace破壊、公開Course取り違え、古い証拠流用である。可視教材の根拠、独立context、全失効とprefix採点分離、courseId / hash binding、入力ごとの証拠有効性で対策する。

性能の正本は既存performance YAMLと固定test。JS初回Preview p95≤500ms、再Preview≤250ms、validation≤1,000ms、Scenario≤1,500ms、Guided batch≤3,000ms、Home JS gzip≤256,000bytes、JS lazy graph≤180,000bytes、Catalog≤20,480bytes、Course Index≤40,960bytes、Lesson Manifest≤12,288bytes、LCP≤2,500ms、CLS≤0.1を保持する。その他既存予算も緩めない。

- [ ] 受入条件・唯一の代替と限界を保持した。
- [ ] 非対象と既存HTML/CSS未達を保持した。
- [ ] リスクと対策・性能目標を保持した。
- [ ] 全blocking / 必須未確認0と配信後の実操作証拠がある。

末尾チェックは最終実証を確認して記入する。基準文書の作成は公開合格を意味しない。

## 2026-10-03の先行配信と作業終了条件

2026-10-03 08:32 JSTの本人指示により、独立レビューと変更に必要な検証を通過した改善・教材は、JSコース全体の完成を待たず、小さくmergeして既存Pagesへ配信する。既存の`beta`経路を使い、独立教材review、誤合格・保存・安全性、全site品質Gate、Source/Artifact/Run/配信後操作を確認する。未検証教材を公開済み・承認済みへ変えず、未完了の全コース受入を完了扱いしない。

先行配信とJS全体の通常公開は別の成果として記録する。先行配信ではJSの`draft`と全コース受入の未達を維持し、正式approval/tag/通常Release台帳を作らない。教材単位の3独立persona評価は、確認済みを保持して未確認/新規教材だけ進める。毎回各52Lesson・54Exerciseをfreshから繰り返す旧条件は撤回した。先行配信の成功をその証拠へ置き換えない。

2026-10-03 08:20 JSTの本人指示により、JS通常公開と必要な公開後確認を完了した時点で全担当を停止する。TypeScript・React・Next.jsの開発には進まず、旧PAUSED自動継続の再開と新自動継続の作成も行わない。20:36 JSTの順次公開方針は過去の決定として保持し、今回の終了条件はこの最新指示を優先する。

| 区分 | 最新差分                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------- |
| 維持 | 誤合格・保存・安全性、独立教材review、既存品質/性能、教材単位の3persona確認済み証拠、正確な配信証拠 |
| 追加 | レビューと必要検証済みの独立改善を先行配信し、全体完成と区別する                                    |
| 変更 | JS全体完成まで改善を溜めず、JS公開後は後続コースへ進まず停止する                                    |
| 保留 | 未実証のJS全体受入と通常公開は、必要証拠が揃うまで未完了                                            |
| 削除 | なし。品質基準の緩和や失敗記録の消去は行わない                                                      |

## 2026-10-03のEditor配信サイズ予算の承認変更

2026-10-03 14:39 JSTの本人指示により、`content/html-css/performance.yaml`の共通Editor増分JS gzip上限だけを180,000 bytesから256,000 bytesへ変更する。既存公開候補の実容量180,754 bytesに対し75,246 bytes（約42%）の余裕を設け、754 bytesの超過を解消するための最適化・再試験の反復を終える。Homeの既存256,000 bytes予算と同じ明確な容量枠とし、EditorがHomeで読み込まれない既存条件を保持する。未公開のCodeMirror構成変更と演習画面最適化は採用を取りやめる。

変更対象は共通Editorの配信サイズ上限のみ。JavaScript固有lazy graphの180,000 bytes、Starter復元の追加5,120 bytes、既存の採点正しさ・安全性・保存・実操作性能・LCP・CLS・Content配信容量の基準は保持する。サイズ超過で失敗した過去Runと原本は失敗のまま保存する。通常技術検証は変更の影響を照合して有効な証拠を再利用する。3つの独立AIペルソナの教材単位の実績は全体Source/配信物hashの一致を条件にせず保持し、未確認/新規教材と必要な公開後確認だけを完了させる。JavaScript公開後に全担当を停止する。

## 2026-10-03 15:57 JSTの教材評価範囲の置換

本人原文: 「3人分のサブエージェントによる検証は新規教材ができたらそこだけでいい」「一回やったところはもうやらなくて良い」。旧全コースfresh再実施方針を撤回し、[教材評価runbook](javascript-agent-learning-runbook.md)の教材単位の済/未済を正とする。旧部分記録も原証拠の実施内容を照合し、未実施を実施済みへ変えない。教材内容が実際に変わった場合も対象教材の確認に限定する。原Source/操作/report/checkpointを保持し、最終候補のbindingと初学者評価の再利用を分離する。

| 区分 | 最新差分                                                                                 |
| ---- | ---------------------------------------------------------------------------------------- |
| 維持 | 独立性、原証拠、未達を埋めない、通常コード回帰/採点/安全/保存/性能、最終候補と公開後確認 |
| 変更 | 毎回全52/54×3のfresh完走 → 新規/未確認教材の理解・操作を3personaで一度確認               |
| 追加 | 教材別の確認済み/未確認と残件報告、実施済み部分記録の再利用                              |
| 削除 | 全体Source/dist/hash一致を教材評価再利用の必須条件にする運用                             |
| 保留 | TS/React/Next。JS公開後停止の最新方針を維持                                              |

## 2026-10-03 16:39 JSTの非機能公開上限の承認変更

本人原文: 「この2.5秒とかの非機能要件部分全体的に緩くしていいよ」「そういうののやり直しで一生公開できないのは時間の無駄」。この指示を、上記の性能上限維持と14:39 JSTのEditorだけの変更に優先する。従来値は[理想目標の正本](performance-ideal-targets.yaml)へ保存し、公開判定の時間・容量・CLSの数値上限を現performance YAMLで2倍にする。LCPは5,000ms、CLSは0.2、Homeと共通Editor gzipは512,000 bytes、JS固有lazy graphは360,000 bytes。Home増分の20,480 bytesは元から警告なので維持する。

JS初回Preview p95は1,000ms、再Previewは500ms、validationは2,000ms、Scenarioは3,000ms、Guided batchは6,000msとする。その他の配信容量、操作時間、保存時間も同じ2倍の公開上限へ同期する。50ms以上LongTaskの有無は観測と警告にし、有限な観測値・意図的なLongTask検出対照・実際の表示/操作/採点/保存の検査は保持する。旧目標を超えた過去Runと実測原本は失敗のまま保存し、新上限で合格したことと旧理想目標の達成を区別する。

Source512のinstrumented 512KiB、workspace 768KiB、raw source、AST/解析の安全上限、runtime実行予算、bounded protocol、隔離、漏洩防止、誤合格防止、保存整合と主要操作の必須条件は変更しない。非機能数値だけの緩和を根拠に、混在する安全・操作検査をskip/continue-on-errorへ変更しない。不要になった性能改善案は採用せず、同じ実測の再作成を避け、変更に必要な検証と通常公開の最終技術確認を行う。

| 区分 | 最新差分                                                             |
| ---- | -------------------------------------------------------------------- |
| 維持 | 誤合格防止・保存・安全・主要操作、原本、理想目標、JS公開後停止       |
| 変更 | 非機能数値の公開上限を2倍にし、LongTaskゼロ件の強制を観測/警告へ置換 |
| 追加 | 旧理想目標と現公開上限を区別する正本と記録                           |
| 保留 | 未達の理想性能改善。今回のJS通常公開をその改善待ちにしない           |
| 削除 | 今回不要になった性能改善案の実装。過去の失敗証拠は削除しない         |

## 2026-10-03 19:13 JSTの今回受入範囲の本人承認

18:41 JSTの質問は「新しく追加した6教材だけ3人で確認し、既存31個の追加評価は公開を止める条件にしない。既存分を確認済みとは扱わず、通常のコード検証は維持する」であり、本人は19:13 JSTに「いいよ」と承認した（質問 Sentinel_c5c282e015d081918d5fd587c7235e55、返答 Sentinel_053775f98d2481919177dfd5dcaa8e47）。今回の教材受入必須集合はGuidedのjavascript-ch12-l01〜l05とCapstoneのjavascript-ch13-l01の6教材とする。全52の独立内容reviewと通常コード安全・採点・保存・互換・最終品質CI、16:39 JST承認の非機能上限は保持する。

既存教材の3役共通完了は15教材、今回新6の完了を合わせ21教材。既存31は3役の未確認状態を教材/role別に保持し、今回の公開blockingへ加えない。acceptanceScope.requiredLessonIdsはコード側の固定6集合へ一致させ、pendingOutsideScopeを全52の実coverageへ照合する。未確認を完了へ変更しない。requiredUnconfirmed=0は今回必須6と公開技術Gateに対してのみ表し、全52の3役完了を意味しない。

| 区分 | 最新差分                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 維持 | 原Source/report/checkpoint、未確認の正直な記録、独立内容/コードreview、通常安全・採点・保存検証、承認済み非機能上限、公開後停止 |
| 変更 | 今回の教材受入必須集合を新6へ限定                                                                                               |
| 追加 | コード固定6集合と台帳の対象外未確認のexact照合                                                                                  |
| 保留 | 既存31の追加3persona評価。今回のJS公開を待たせず、本人の次の指示まで実施しない                                                  |
| 削除 | 既存31の追加3persona評価を今回公開必須へ加える条件。旧実績・失敗原本は削除しない                                                |

必須/任意の演習区分とvalidationRules.requiredは可視教材指紋へ含める。旧v1指紋の原行は改名せず、元sourceLessonHashと現在の教材全Source hashの一致、旧v1 projectionの一致の両方で、実教材が同じ場合だけ再利用する。必須区分やrequired flagが変われば全Source hashが変わるため、この移行経路は拒否する。図版/用語の変更も旧projectionが検出する。新しいハッシュ関数を理由に同じ教材を再学習しない。

配信前checklistの `preflight-passed-final-ci-required` は事前の関連検査成功だけを表し、最終全品質CIの実施済みを主張しない。`required-pages-quality-before-deploy`を伴う場合に限り、検証器は現workflowのUnit/build・bundle・static・全規定Browser・Performance・Lighthouse・Artifact approvalを失敗許容なしで実行し、deployがqualityに依存することを検査する。最終CI失敗時は配信せず、原失敗を保持する。公開後記録に最終Runの実結果を保存する。これは技術Gateを省く条件ではなく、同じ全検査を事前・配信時に二重実行することを避けるための状態区別である。
