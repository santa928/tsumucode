# Nextの3 LessonのAIペルソナレビュー

対象はIssue #132/#133の`next-ch01-l01`、`next-ch02-l01`、`next-ch02-l02`。
2026-10-08に、実装担当とは別の3つのAIエージェントが読み取り専用でレビューした。
実人の初心者による受講テストとは区別する。

| ペルソナ / Reviewer ID                         | 観点                                                                   | 方法                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Next初心者 / `next_learner_persona`            | TypeScript/React修了者が提示コードから予測し、診断と修復を理解できるか | Slide・工程・Hint・Solution・Fixtureの独立読解、作者の実行証拠の確認 |
| 教材編集者 / `next_learning_design_persona`    | 予測→実測→修復、説明と目標・採点の整合、答えの開示順                   | 同上、内容Review台帳の確認                                           |
| 運用・a11y担当 / `next_runtime_safety_persona` | Source・進捗の保持、固定URL・資源・認証境界、失敗回復、keyboard操作    | 実装と契約の独立読解、作者の実行証拠の確認                           |

## 指摘と対応

提示前のメッセージ値を予測させる問いを、提示コードから答えられる問いへ変更した。
12 Slideすべてで答えと理由を折り畳み、予測してから開示できるようにした。

Counter Starterを`use client`不足による実診断から始め、CounterだけをClientへ修復する
工程を追加した。pageのasync/Node処理をServerに残す理由を予測し、境界修復後に
初期値2、加算3→4、再読込2を確かめる。

`node:path`の文字列処理と`node:fs`のファイル操作を分け、固定dev環境とproduction
buildで診断が異なる場合を説明した。普通の関数propsのbuildは型検査で先に失敗するため、
その結果をdevの直列化診断と同一視しない。

ブラウザ受入ではリンク、URL選択、Counterをkeyboardで実操作する。
Slide切替は表示中のSlide IDを待ち、前のSlideを操作してしまう検証上の競合を除いた。
iframeから親Stageへ戻るときは既存の編集権再確認を待ってから採点する。
再確認中の保存・採点を拒否する保護は維持する。

## 確認範囲

固定Next 16.3.8の製品実採点APIで、旧Lesson6例・routing8例・境界9例を確認する。
初期境界エラー、詳細pageの500、修復後合格、Source再開、古いhash拒否を含む。
learnerのCPU1、RAM/swap512 MiB、PID64、tmpfs各64 MiB、network:noneを維持する。

通常の製品画面で12 Slideの答え開閉、3 Lessonの編集・反映・採点、停止・再開、
keyboard操作、狭幅表示、axe検査と進捗/DraftのJSON移送を確認する。
旧Lesson・新2Lessonの画面受入とJSON移送は完了。12 Slideのkeyboard開閉、
3 Lessonのaxe違反0、両新LessonのDraft・合格記録のexport/import、管理token/run非含有を確認した。
独立Reviewerの確認はこれらの作者実行証拠に基づき、Reviewer独自実行とは扱わない。
具体的な原稿hashとLesson別結果は`content-review-next.yaml`に記録する。
生ログ・スクリーンショット・学習データは非公開の作者記録へ保管する。

このレビューの対象は現在の3 Lessonである。Courseはdraftを維持する。
正式公開には#134/#135のdata・Form/Action、#136のProject・独立復元・無Hintの転移課題、
#137のCourse全体の受入と公開手順の完了が必要であり、この記録で代替しない。
