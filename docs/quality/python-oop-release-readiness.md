# Python OOPの既存受入と正式公開の残条件

Issue [#152](https://github.com/santa928/tsumucode/issues/152) と親 [#17](https://github.com/santa928/tsumucode/issues/17) の完了判定に使う。公開前の教材受入、候補の技術検証、配信後確認を区別する。現時点ではCourseはdraft、Python Pathへ未登録であり、両Issueを閉じる条件は揃っていない。

## 評価方法と再利用の範囲

2026-11-03の本人指示では、旧Issue本文の実人テスター条件をペルソナsubagent評価で代替する。続く指示では、3名の評価は新規教材の理解・操作に必要な範囲だけとし、一度受入済みの教材を毎回再評価しない。以下の既存AI観測を実人・物理端末の実測とは記録しない。

[PR220の受入記録](python-computer-use-acceptance.md#pr220で完了した影響再操作) は、Source `6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931`、tree `85b143b26b35aaeb68ce11df1b8b16729a6ab966`、固定dist SHA-256 `285276bd94e3a32dcc4ef81914fa2a50500e34dc1aafe02d34773e2b5062ef4f` に対応する。記録は親担当の受入報告であり、この文書の作成担当が子の原画像を閲覧した証拠にはしない。

| 要件                                               | 既存証拠と維持する範囲                                                                                     | 残る確認                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Class／Instance、共有・遮蔽、identity、3method比較 | #148、PR211／212。2教材、24 Fixture、直接object観測2件、Slide例7件を両engineで確認                         | 原稿・採点入力が変わらない限り教材受入のやり直しは不要                                    |
| 継承／Composition、Property、dunder／copy          | #149、PR213。3教材、46 Fixture。#148との累計は70 Fixture・object観測5件・Slide例19件                       | 固定値だけの解、共有状態、不正更新等の負例と妥当な別解を保持                              |
| Function変換、Closure、引数・戻り値・例外、wraps   | #150、PR214／215。2教材、40 Fixture、Function観測2件、Slide例8件を両engineで確認                           | `@`の暗記やmetadataの直書きだけを合格にしない既存条件を保持                               |
| 設定付きdecoratorとLedger Project                  | #151、PR216／217。2教材、56 Fixture、直接観測2件、Slide例7件を両engineで確認                               | 設定／装飾／呼出時、別Function／Instanceの状態分離、例外と負値拒否を保持                  |
| 内容review・図・読書・配信境界                     | 9教材の内容台帳、PR218の34 Slide両幅読書・axe／overflow／core遅延取得・出典再生成確認                      | 現候補の共有画面・配信基盤変更に関する技術確認を別に対応付ける                            |
| 初心者向け理解・操作                               | PR220の履歴なし3名。初回演習の具体出力・全体判定、保存再開／停止直後の再試行、Projectの390px読書・Keyboard | 受入済みの限定範囲を保持する。9教材全体の3役実操作、全Project実装能力へ拡張しない         |
| 保存・Reset・再試行                                | #148〜151の実行／保存検査、PR220の初回演習の再開・reload・以前の達成と再判定案内                           | 現候補のSource全文・履歴・Reset・再開とExport／fresh Importを、共有変更の影響に応じて確認 |

上表は作者検査とAI役割評価を別の証拠として扱う。作者による実object観測を、提出ごとの採点能力や初心者の自力制作の証拠へ置き換えない。有限の許容構文・別解を一般Pythonの自由採点と説明しない。過去の失敗・未確認事項は元文書と私有原本へ保持する。

## 固定候補で確認できたこと

2026-11-06 JSTにSource `9821a4eb16b7395ccf94bfbb59f467507bca97b3`、tree `031169e0eac90cfde8fe5974fc894345d0bc6dd4` をDocker内で照合した。これは新しいRuntime実行やペルソナ評価ではない。

- `content/python-oop` と `content-review-python-oop.yaml` は上記PR220の受入SourceからGit差分0。revisionは `2026-10-14.5`、4 Chapter・9 Lesson・34 Slide・8標準演習とProject1件を維持する。
- OOP単体compile、9教材の内容hash照合（stale 0／rejected 0）、概念coverage complete、出典289 files／289 itemsが成功した。
- 作者Fixtureは計166件。教材順の件数は10／14／13／17／16／18／22／25／31で、正例、未達、実コードエラー、未対応を含む。今回は実engineで再実行していない。
- 固定lockfileのSHA-256は `191461e31bb2d50d9be7b6fd91e2a63e14e7eee00634461bb4bc32bac0b7f0c8`。検査imageと一致し、Node 24.18.0／tsx 4.23.0を用いた。通信なし、Browserなし、640MiB／0.5 CPUで監査本体は約6.9秒だった。

`hashDraftQualityInputs` による旧Sourceと候補の保守的な入力指紋は、runtime／usability／accessibility／persistence／deliveryのすべてで異なる。共有Compiler・画面・実行・配信の変更を含むためであり、教材そのものが変わったという意味ではない。旧distを候補のdistと同一扱いしたり、元の観測Sourceを現候補へ付け替えたりしない。教材受入の再実施と、変更された共有基盤の技術検証を分けて扱う。

## 公開Gateへ接続するときの条件

`docs/quality/python-oop-release-preparation.yaml` はcandidate／observations／codeReviews／originalsReviewが空のdraftである。[草稿公開前契約](draft-course-publication-contracts.md)の品質検証成功や公開許可は、今回のSource照合から導けない。原本が欠ける項目を合成receiptで埋めない。

正式release v2の `scripts/release/v2/content.ts` は、未公開のLessonへcontent／novice／recovery／makerの4 receiptを要求し、既存の限定した旧受入移行はTailwind専用である。OOPのpublicationStatusだけをpublishedへ変えると、受入済み教材にも9教材×3役の新規観測を要求する。この未接続を理由に受入済みの3名評価を一律にやり直さない。

共有Gate担当は、まず既存 `inspect-content` が本当に表現できる原本だけを正しいrole／method／Lessonへ対応付ける。親CUA報告や作者の正解実行を、未実施の9教材×3役の操作原本へ変換してはならない。既存の仕組みで表現できない承認済みの限定受入は、次の条件を維持する固定の移行契約として接続する必要がある。

1. 旧Source／Git原本／Lesson集合／内容指紋／元報告hashと、独立した照合者・受入範囲を固定する。元の失敗・未確認・部分的な観測範囲を保持する。
2. 同じ教材入力だけを再利用し、本文・Fixture・採点・対応Lessonの変更、欠落・重複・余分なLesson、元原本の改変、別Courseへの流用を拒否する。
3. 保存・Runtime・画面・配信基盤の変更は対応する技術確認へ分ける。公開候補全体の独立code review・型／関連test・必要CI・安全／配信境界を省略しない。
4. 既存原本が検証していない能力や実人の理解を承認しない。現在の内容を新たに変更した場合だけ、その変更教材に必要な独立役割評価を行う。

接続の確認対象は `scripts/release/v2/content.ts`、`contentOriginals.ts`、`plan.ts`、`cli.ts`、`qualify.ts` と、検証する原本を読み込む専用処理・関連unit testである。CLIと最終公開判定の両経路で同じ固定記録を検証する。必ずしもすべてを編集する必要はない。OOP教材担当は共有schema／Runtime／movement Bodyを重複編集しない。OOPの固定記録だけで成立する部分と共有変更の責務を統合担当が分ける。

## 公開後確認とIssueの完了判定

公開候補のmain更新・merge・dispatch・配信は統合担当が行う。Source `9821a4eb` は既存の公開候補であり、この草稿Courseの公開を含む候補だとは解釈しない。学習前提のPython基礎 #15／実践 #16の到達点・Path順と整合し、上記残条件を満たしたOOPだけをPathへ追加する。

OOPの正式公開後、次の確認を正確な配信Source／artifact／run／観測時刻へ結び付ける。今回の調査では公開版OOPの操作を確認していない。

1. Home／Python Path／読書の入口とsubpathでの開始。初期画面・読書でcoreを先読みせず、作者専用Solution／Fixtureを配信しない。
2. Class／3method比較とdecorator／Projectの代表実判定。対応表示したPyodide／CPythonを区別し、実行エラー・未達・system errorを混同しない。
3. 編集したSource全文と履歴を保つ保存・reload／再開・Reset／再試行。別origin間は既存Export／fresh Importを用い、Runtimeごとの進捗二重保存を作らない。
4. Keyboard／focus／状態・エラー案内と必要な小画面読書。新しい共有変更が影響する操作を検証し、過去の全Lesson×全Browser検査を一律に増やさない。

必須findingが未解決、対応Runtimeの実動作や必要CIが未確認、OOPがまだdraft、配信版の上記確認がない場合は #152 と #17をOpenに保つ。#148〜151は既にClosedであり、OOPの公開未完を理由に再開しない。#147／#16、Python基礎 #259、共通品質 #153〜155の範囲をこのIssueへ重複実装しない。
