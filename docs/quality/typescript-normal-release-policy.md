# TypeScript初公開のRelease Gate

採用対象は6 Chapter・15 Lesson（標準12、制作工程3）・320分。320分は見積りである。TSの履歴と承認は専用のstrict schema、固定path、空の公開履歴から開始する。JavaScriptの承認・52教材の記録を流用しない。

## 現在の状態

教材とRelease candidateはdraft、公開承認はpending。Deployを実行していない。TSのcandidate dispatchは本人承認済みのSource/Artifact/品質記録が揃わなければ失敗する。TSのbetaは公開承認を省略できるため許可しない。公開TSを含むmainはHTML/CSSやJavaScriptを選んでもbetaを拒否し、TS draft時の既存betaだけを維持する。HTML/CSSとJavaScriptの既存契約は保持する。

承認済みの代替受入は3独立初心者役の模擬評価であり、実人の初心者試用と低速物理実機は未確認。性能はChromium 149 / Linux arm64 / 10 logical CPU / local HTTP subpath / throttleなしの基準環境に限定し、CPU機種と物理画面の表示時刻は未確認。予算と区間は[設計書](2026-09-29-typescript-course-design.md#ts専用の承認済み受入方式と性能予算)を参照する。

## 品質照合

公開前のprivate原本は `scripts/release/verifyTypescriptAcceptance.ts` で現在HEAD・配信教材・45組の原文/実UI保存履歴・評価Session・性能rawへ照合する。原文・学習レポート・作業ログは公開pushに含めない。

正式公開用 `typescript-release-acceptance.yaml` では、検査済み記録の可視入力/hashと生の性能数値、3 Engineの代表停止/隔離2検査、独立確認者の原本照合宣言を結び付ける。宣言自身を除く全証拠とSource/Artifactの正規payload hashを照合し、証拠差し替え後の旧宣言の流用を拒否する。Actionsはprivate原本を読んだと主張しない。記録のhash照合は実人の存在・読解・物理実機を証明しない。模擬45組、7計測区間（判定3種を含む6予算）、遅延gzip上限、3 Engine、役間隔離、原本照合者の独立性を必須とする。初回遅延gzipは最終Artifactでも再計算する。

公開前draftと公開SourceのGit入力を別々に固定し、公開metadata以外の変更がないことを再計算する。正規化するのは `course.yaml` のpublicationStatusと、frontendのHTML/CSS→JavaScript直後に加えるrequired/[javascript]の固定TS Stepのみ。教材・採点・移行・依存・UI・harness/workflowの変更は除去しない。変更時は影響範囲の証拠を取り直す。

正式公開の品質jobは既存の全site Compile/Review/Lint/Unit/Type/Bundle/3 Engine/axe/Performance/Lighthouse/Static Artifactを末尾まで要求し、失敗時はDeployしない。TS選択時もHTML/CSSとJavaScriptの公開履歴/tag連鎖を保持する。合成Bundleは全15教材の進捗と13Workspaceの元TS・履歴・成功snapshot・カーソル、および他Courseを実migratorで保持し、実学習の証拠として数えない。

## 本人承認後に必要な公開差分

1. TS publicationStatusをpublishedにし、frontendへJavaScript直後のrequired TS Stepを追加する。Lesson ID/本文/元TS/採点契約を変えない。
2. 専用のContentReview公開metadata、Release candidate、公開用技術記録とApprovalを実Source/最終Artifact/Product hashへ固定する。`approvedBy`/`approvedAt`を本人の公開許可へ結び、draftの値を残さない。
3. 正確な公開Sourceの独立レビュー、通常CI、正式candidateの全site品質CIとArtifact照合を完了してから承認済みのDeployを実行する。
4. 公開後は開始・再開・採点・保存・Export・fresh Import、URL/Report/tagを確認し、revision専用の記録を残す。未確認をpassedへ変えない。公開履歴を追記してから#115/#11の完了可否を判断する。

復旧には公開済みのannotated tagと全bindingが一致するrollbackを使う。現時点ではTSの公開履歴が空のためTS rollback対象は存在しない。
