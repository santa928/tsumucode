# JavaScript通常公開基準

- 状態: `基準の実施計画。JS公開受入は未完了`
- 対象Course: `javascript`
- 計画: [JS通常公開計画](2026-10-02-javascript-agent-release-plan.md)
- 模擬学習: [JSエージェント模擬学習runbook](javascript-agent-learning-runbook.md)
- 変更根拠: 2026-10-02の本人の直接指示。JSを最優先に通常公開まで完成する

## 今回承認された受入代替

旧[JS全Course設計](2026-08-03-javascript-full-course-design.md)のREQ-JSC-033と14節は「少なくとも1名のJavaScript完全初心者がChapter 00からCapstoneまで通し、Lesson単位で観察と是正を記録する」条件である。今回本人が変更を承認したのは、この実在の初心者の全通しを、**GPT-6.1 Sol / high以上の3独立personaが各自全52を模擬学習する検証**へ代替する1点だけである。

新しい検証はUI実操作から教材・採点・保存・制作の問題を発見し是正するために使う。エージェントの既存知識、自己申告、意図的な誤り、入力代行を含むため、実人の理解・感情・自然な誤解頻度と同等には扱わない。旧基準を削除せず、Reportに元基準・今回の理由・限界を保持する。

全52 = 46 standard + 5 guided + 1 capstone、14 Chapter、4 Phase、既存安全・性能・a11y・Browser・内容review・全公開Gateを維持する。所要時間は旧1,000分を実体へ同期し、現在の標準760分と追加100+150分なら1,010分とする。

| 区分                 | 差分                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- |
| 維持                 | 全教材・制作・保存・互換・内容review・独立コードreview・全site品質Gate・同じPages・配信後確認 |
| 維持（承認済み代替） | 実在JS初心者1名全通し → 独立3persona各自全52模擬学習。旧基準・理由・限界を保持                |
| 追加                 | JS専用のcourseId / source SHA / Artifact / 独立52Lesson review / 模擬学習証拠のstrict binding |
| 保留                 | 本人指示によるTS / React / Next.js追加実験。JS公開後の本人指示で復帰                          |
| 削除                 | なし。HTML/CSS人観察・過去記録・証拠を削除しない                                              |

## JS通常公開の受入条件

- 全52の説明、Exercise、3段階Hint、正負Fixture、実例実行、正当な別解、source hash付き独立内容reviewが揃う。
- Guidedの5工程が単一累積Workspaceで完成し、Capstoneが別Workspaceで既習Conceptを統合する。工程の採点と全Workspace編集失効を分離する。
- 3独立personaが同じ固定候補、別の保存状態から各自Chapter 00〜Capstoneを通す。各役52/52と必須操作をID / 期待 / 実際 / 証拠へ結ぶ。初回正解・実装先読み、章分担、結果合算、裏DB合格注入は禁止する。
- UIから実行・採点・Hint・誤り修正・保存 / reload / resume・Reset / 取消・制作・学習bundleのExport / Importを実操作する。
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
| `verifyReleaseApproval.ts`     | 内容review 51Lesson、novice 5Checkpoint + Guided / Capstone、人1名以上                   | HTML/CSS契約は維持しJS全52・3独立全通し・唯一の承認代替を別記録へ結ぶ        |
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
