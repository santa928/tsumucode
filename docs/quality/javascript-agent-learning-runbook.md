# JavaScript教材の3ペルソナ評価runbook

- 最新根拠: 2026-10-03 15:57 JSTの本人指示（Sentinel_f4b12686a5908191805fbcf3cd0269e1）。
- 目的: 新規教材が初学者に理解でき、画面の課題を操作できるかを3独立ペルソナで一度確認する。
- 対象: 未確認/新規教材。確認済み教材は保持し、commit/hash・test修正・容量変更で全コースを再開始しない。
- モデル: GPT-6.1 Sol、high以上。実人の理解・自然な誤解頻度・物理機器の実証とは区別する。
- [通常公開基準](javascript-normal-release-policy.md)と[実装・検証結果](issue-92-93-verification-efficiency.md)を参照。

## 撤回した手順と保持する証拠

旧「毎回3役各52 Lesson / 54 Exerciseを新しい保存状態で通す」条件と、全体Learning Input/配信物の厳密一致を教材評価の再利用条件にする運用は撤回した。旧手順はGit履歴へ保存され、原report・画像・log・元Source・途中checkpointを消さない。通常のコード回帰、採点、安全、保存、性能、独立教材/コードreview、最終入口と公開後確認は別の公開Gateとして維持する。

旧105操作などの部分試用も、Lessonごとに実際に読んだ内容、操作、担当、原証拠を照合して利用する。HTMLの試用をJSの学習済みにしたり、操作数を教材数に換算したり、未実施を埋めたりしない。適合する証拠がない教材/ペルソナだけを未確認に残す。

## 3ペルソナと独立性

| 役   | 視点                                                               |
| ---- | ------------------------------------------------------------------ |
| JS-A | HTML/CSS修了直後のJS初心者。用語・前提・説明飛躍・Hint             |
| JS-B | 誤入力や中断が多いJS初学者。誤りからの回復・本人の保存状態での再開 |
| JS-C | 自力作品を作りたいJS初学者。概念の制作接続・課題の操作可能性       |

各教材は3つの独立した観点で評価する。同じreportや保存状態を3人分に複製しない。確認済み教材を別担当へ渡して新規学習と呼ばない。同じ担当は本人の途中checkpointを使って未完教材を続行でき、毎回fresh Browser/DBを作る必要はない。

初回評価は可視教材・Hintを読み、自分の期待を先に記録して実UIで操作する。作者専用Solution/Fixture/Validatorや他担当の正答の先読み、裏DB合格注入は禁止する。エージェントの既存知識で不足を補った箇所は記録し、教材だけで理解できたとは主張しない。

## 済/未済の手順

1. 元report/画像/DOM/log/Source・保存checkpointを保全し、教材単位の実施済み行を収集する。過去のSource SHAや原Lesson hashを最終SHAへ書き換えない。
2. 台帳の各行にLesson ID/ペルソナ、actor/session/context/storage、元Source/原Lesson hash、可視教材のlearnerContentSha256、読解readingと教材操作interactionの期待・実際・時刻・原証拠、原report digestを記す。checkpointがある場合はその原本参照も保持する。
3. 可視教材の指紋は `javascriptLearnerContentSha256(lesson, glossary, assets)` で算出する。説明・課題・Starter・Hint・可視feedback・参照用語・図版bytesを教材単位で含める。test、compiler/build設定、Runtime、採点内部、Course全体revision/配信予算は初学者教材評価と結合しない。これらの変更は通常の対象技術testで検証する。
4. partial/draft台帳でも `getJavascriptLessonEvaluationCoverage` が教材別の済/未済と足りないペルソナを返す。確認済み行を保全し、未確認/新規だけを実施する。教材内容が実際に変わったときも対象教材だけを確認し、全コースをリセットしない。
5. 原証拠を読み取った独立reviewerが実施/独立性/期待と実際/原digestを照合する。以前のreportを保持したまま、新しい評価行を追記する。訂正済みでも以前の失敗・未確認記録を消さない。
6. 最終候補の5入口/再開smokeは公開運用担当が一度実施し、現候補Source/Artifact/URL/runへ別に結ぶ。各ペルソナによる全コース再試行の口実にしない。公開後の実HTTPS/同Run確認も別証拠で扱う。

読み取りの残件報告:

```bash
./scripts/docker-compose.sh run --rm app npm run release:learning-coverage -- --record docs/quality/javascript-agent-learning.yaml
```

このコマンドはschemaVersion 3の台帳からconfirmedLessonIdsとpendingを表示する。実績/解答/承認/合格状態を生成しない。未確認が残る間はdraftとして保存し、公開合格へ読み替えない。

## 台帳と公開binding

`JavascriptAgentLearningRecordSchema` v3の `lessonEvaluations` は教材単位の原証拠である。sourceCommit/sourceLessonHashは各行が観測された元固定点、learnerContentSha256はその可視教材の同一性を表す。reading/interactionはそれぞれ画像またはDOM＋原logを持ち、未操作/pending/blockingを済へ数えない。原reportとcheckpointは元digestのまま保持する。旧v2の全コース記録は原本として保全し、実施済みを確認できる教材行だけをv3へ整理する。schema更新を理由に再学習しない。

台帳のverifiedSourceCommit/canonicalDistSha256とfinalSmokesは現公開候補のbindingであり、過去の教材評価のSourceを置換する意味ではない。independentOriginalEvidenceReviewは利用した原report digest集合と最終候補のroot原観測を照合する。learnerContentVerifiedは各行の指紋が元Source/可視教材原本の内容を表すことを確認した場合だけtrueにする。最終smoke実施者自身を原本reviewerにしない。機械schemaの生成・自己申告だけでは実施済みにしない。

inputValidityのdraft/final manifestとRelease HistoryのdraftSourceCommit/draftCanonicalDistSha256/normalizedLearningInputSha256は公開入力監査を維持する既存fieldであり、教材評価を全体hashへ再結合する条件ではない。最終候補と配信物の技術Gate/監査は必要な変更ごとに更新する。

## 最新要件差分

| 区分 | 内容                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 維持 | 原証拠・途中保存、3独立ペルソナ、未実施を埋めない、blocking/必須未確認0、通常技術Gate、公開後確認、JS公開後停止 |
| 変更 | 全コースfresh完走から、教材単位の一度の初学者評価と確認済み行の再利用へ置換                                     |
| 追加 | 教材単位の済/未済照合と残件報告。実教材内容の変更時も対象教材だけ確認                                           |
| 削除 | 毎回52/54×3を再実施する強制、全体Source/dist一致を教材評価の再利用条件にする運用                                |
| 保留 | 実人理解・物理機器の実証、TS/React/Next.js。本人の次の明示指示まで進めない                                      |
