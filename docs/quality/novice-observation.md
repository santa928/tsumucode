# 完全初心者Observation

- releaseStatus: `draft`
- participantCount: `1`
- requiredCheckpoints: `5`
- approvedCheckpoints: `0`
- guidedProjectStatus: `pending`
- capstoneStatus: `pending`
- unresolvedFindings: `1`
- status: `部分観察（Chapter 00実習と導入Slide 3枚。Starter Reset自動Gate合格済み、同範囲再観察待ち。合格扱いしない）`
- verifiedSourceCommit: `a9c2553a8e0b654ff2dc11ee04b9db16ab8b4978`
- canonicalDistSha256: `draft`
- checkpointHashStatus: `partial-observation-reset-implemented-reobservation-pending`
- runbook: `docs/quality/novice-observation-runbook.md`
- participant: `NOV-001。実装者・教材authorではない完全初心者として匿名記録`
- facilitatorPolicy: `口頭補助、正解誘導、実装者による代理回答を禁止する`
- bindingPolicy: `部分観察をproduct source commitへ固定した。Starter Reset後の最終source binding、canonical dist結合、全Checkpoint、Project、Teach-backは未承認・未完了`

## 現在の観察範囲

NOV-001から、Chapter 00の実習と導入Slide 3枚目まで自力で進行できたとの報告を得た。一方、観察時点では、HTMLとCSSを全消去した場合にStarterコードへ戻す製品内手段がないFindingを得た。現在は、Exerciseの全fileを確認付きでStarterへ戻すResetを実装し、取消、Starter Preview、IndexedDBへの全file byte一致とreload後の永続化、Keyboard／Focus、4 desktop viewport、低Heightを含む自動Gateに合格している。所要時間、環境詳細、Teach-back、残りCheckpoint、Guided、Capstoneは未記録のため、導入Checkpointを含めて合格扱いにしない。NOV-001または別の完全初心者による同範囲の再観察と全Checkpointの観察が完了するまでRelease承認を保留する。

## 対象Lessonと現行Source hash（観察候補）

以下のhashは、51 Lesson独立レビューと公式`content:review`で一致を確認した現行候補です。観察中に教材を修正した場合は失効します。

| Checkpoint           | 対象Lesson                                                 | Source hash                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 導入とHTML基礎       | `ch00-l01`、`ch00-l02`、`ch01-l01`、`ch01-l02`、`ch01-l03` | `d3b084f315c7570d55bdc9c2a1a82bd06c7d278bea3cea6f4fcdfc35f6670f2e`、`7dc0da980be6349bf76b3deeaf1fcdb5d4b83f5a5835f5604d7e34fa73c1d03e`、`17713b38f2a33dacaabb92647425fd4d16e39c27ba69ad095d07e35bb8712e68`、`c39fa82630f978f00c888c3a6b142527df49b996c76c2dcf7378b861c3174acb`、`fb855e254bcc9fae7c8880dac5388b798dbf586dc6e55f9942d3316fd1ce7bc7` |
| Phase 02終端         | `ch07-l01`                                                 | `c3a8bda339f7f88b17d34c8d1cfe7d2b84809ccedcf2d95644a7718c5668f344`                                                                                                                                                                                                                                                                                 |
| Phase 03終端         | `ch11-l04`                                                 | `b11470e01f7cc4d367d6c637e022695dc4abef8c0e223ba8b7fae92c7ed82f28`                                                                                                                                                                                                                                                                                 |
| Guided Profile 5工程 | `ch12-l01`、`ch12-l02`、`ch12-l03`、`ch12-l04`、`ch12-l05` | `21ffe93cd75a5004787894e17e82f90a51354540ab43587455be51730723a2b3`、`a78b401fb872571af81905f6dbdde437257f11f2d30b8ee06258e02be9f0de36`、`bcb7be5015862ecceca32252888fefcafc32519c56b265e1bad895a7ae26d89c`、`c81c00d07bcd0ef2a7f92a5e64bb7aaa4c76ab43a8df44372c2897aa3e0fa6c1`、`3fa1018612d4a49bcae9a59dd1b35c5e6e9c70428454dd2db8ad40c4d2bb9e31` |
| STACK DAY Capstone   | `ch13-l01`                                                 | `cbdf1c47bfa534d690b9def34367eb9b97cdc833dc7cb4acba9a27f6289470a2`                                                                                                                                                                                                                                                                                 |

## 実施条件

実施担当者は、開始URL、許可する声かけ、禁止支援、Finding分類、合格条件を固定した[完全初心者Observation Runbook](./novice-observation-runbook.md)に従います。

- 氏名、メールアドレス、実データはRepositoryへ記録しない。参加者IDは匿名の連番にする。
- 初回利用の端末とブラウザ、Viewport、支援技術の有無を記録する。
- Chapter 00–01、Chapter 07、Chapter 11、Guided Profile 5工程、Capstoneを口頭補助なしで進める。
- 各Checkpointで「何を学んだか」「なぜそのHTML/CSSを選んだか」「次に何をすると思うか」を参加者自身の言葉で説明してもらう。
- CapstoneはSolution、DOM Tree、CSS Property、完成手順を見せず、Briefだけから完成させる。
- 迷った画面、誤解した用語、進行不能、誤操作、ヒント利用箇所を時刻とともに記録する。
- 教材またはUIを修正した場合はLesson source hashと独立教育レビューを更新し、同じ参加者または別の完全初心者で再確認する。

## 観察記録

| Checkpoint           | 実施日     | 環境                  | 所要時間 | 迷った画面                                   | 誤解した用語 | 次操作の認識                            | Teach-back | Project結果 | 修正                                      | 再確認                           | 判定   |
| -------------------- | ---------- | --------------------- | -------- | -------------------------------------------- | ------------ | --------------------------------------- | ---------- | ----------- | ----------------------------------------- | -------------------------------- | ------ |
| 導入とHTML基礎       | 2026-07-20 | PC／Browser詳細未記録 | 未記録   | 観察時点でHTML／CSS全消去後にStarterへ戻せず | 未記録       | Chapter 00実習とSlide 3枚目まで自力進行 | 未記録     | 対象外      | `OBS-RESET-001`（実装・自動Gate合格済み） | 完全初心者による同範囲再観察待ち | 再観察 |
| Phase 02終端         | 未実施     | —                     | —        | —                                            | —            | —                                       | —          | 対象外      | —                                         | —                                | 保留   |
| Phase 03終端         | 未実施     | —                     | —        | —                                            | —            | —                                       | —          | 対象外      | —                                         | —                                | 保留   |
| Guided Profile 5工程 | 未実施     | —                     | —        | —                                            | —            | —                                       | —          | 未実施      | —                                         | —                                | 保留   |
| STACK DAY Capstone   | 未実施     | —                     | —        | —                                            | —            | —                                       | —          | 未実施      | —                                         | —                                | 保留   |

## Finding

| ID              | 区分      | 事実                                                                     | 影響                                                                    | 対応                                                         | 復帰条件／現在状態                                                    |
| --------------- | --------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `OBS-RESET-001` | Important | 観察時点では、HTMLとCSSを全消去した後にStarterへ戻す製品内操作がなかった | 初心者が誤操作から自力復帰できず、直前Slideと実習をやり直す可能性がある | 現在Exerciseの全fileを確認付きでStarterへ戻すResetを実装済み | 自動Gate合格済み。NOV-001または別の完全初心者による同範囲の再観察待ち |

## Release判定

- 進行不能: `製品内のStarter復旧経路は自動Gate合格済み。完全初心者による同範囲の再観察は未完了`
- 説明不能: `未確認`
- 未解決Finding: `OBS-RESET-001（製品対応済み、完全初心者による再観察待ち）`
- 2 Project完了: `未確認`
- 総合判定: `保留`
