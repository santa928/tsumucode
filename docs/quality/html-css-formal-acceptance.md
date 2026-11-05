# HTML/CSS 正式受入の照合（#108・#7）

確認日: 2026-11-06（日本時間）。この文書は受入条件の照合であり、Release Approval、正式公開、公開後操作の成功記録ではありません。

## 候補と権限

- 固定候補Source: `9821a4eb16b7395ccf94bfbb59f467507bca97b3`。
- 対象: HTML/CSSの5 Checkpoint、Guided Profile 5工程、STACK DAY Capstoneと、その操作・保存復帰の既存証拠。
- 共有main、merge、dispatch、公開、共通movement本文・release schemaは統合担当が所有する。本照合では変更しない。
- 後の本人指示により独立ペルソナのサブエージェント検証を適用する。新規教材・影響箇所だけを評価し、受入済み教材を一律に再観察しない。AIの役割評価を実人の理解・学習時間・実機性能の観察と記録しない。

## 既存受入と再利用の範囲

[観察記録](novice-observation.md)の日付付き集約節と[runbook](novice-observation-runbook.md)を正とする。NOV-001の実人部分観察、撤回済み判定、未達観察も保持する。

| 対象                                | 有効な証拠                                                                    | 判断と限界                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Checkpoint 1: Chapter 00–01         | CUA-HTML-01、Source `4d52039dc8cf1e3af7ef9bda8dcec56d9019b53f`                | 5 Lessonの制作・理由説明、Hint・Reset等の実利用を#106で受入済み。後の導入予測は#23の別観察で受入済み                                     |
| Checkpoint 2: `ch07-l01`            | CUA-HTML-02、Source `ac6eea5c587d1645d45a714916ce6102da2c7898`                | 旧r09未達を修正し、教材だけで自己修正・合格・保存復帰。初回未達は履歴として保持                                                          |
| Checkpoint 3: `ch11-l04`            | CUA-HTML-01、上記初回Source                                                   | 合格・理由説明と390/1280px確認。物理端末や全Browser検証へ広げない                                                                        |
| Checkpoint 4: Guided Profile全5工程 | 5212、Source `dc3720d229db6ebc35234c23e14762a650b231b5`、元担当の後日理由補足 | 単一担当の自作・工程間引継ぎ・合格・reload。Brief/Guide/工程/Hint1の支援を明記。後日説明を制作時の理解へ読み替えない                     |
| Profile保存・再開・Reset            | 5212–5213の独立読取・保存コピー診断                                           | Home/reload、Reset取消・確定等を確認。保存コピーを新規制作へ数えない。Reset後全CSS byte一致・再採点、長期保存は未確認                    |
| Checkpoint 5: Capstone              | 5219、Source `af211f471fa5ac67ffda5a153e79d06b024d94ae`                       | 新しい担当が空body・TokenからBrief/Posterだけで制作、通常判定・保存/reload・選択理由を確認。旧5207制作＋5214修正の合成を受入根拠にしない |
| 見直し・誤答修正・下書き復帰        | #106の実利用表、#107の保存表                                                  | 対象ごとの報告範囲を維持。全Lessonで各操作を再実施したとはしない                                                                         |

#106・#107はGitHub上でclosed/completedを確認した。ただし#107本文にはP1による撤回履歴が残り、その後の5219受入は観察記録へ追記されている。closedという状態や撤回前PR #243の成功だけを受入根拠にしない。

`git diff --exit-code af211f471fa5ac67ffda5a153e79d06b024d94ae 9821a4eb16b7395ccf94bfbb59f467507bca97b3 -- content/html-css`は差分0。教材・採点定義・Starter・素材はこの2 Source間で一致する。これは教材再観察を省く根拠であり、変更された共有UI/runtime、canonical dist、現公開の動作が同一という証明ではない。

観察記録上の未解消Blocking/Importantは0件。#107のMAP/RESUME/REVIEW/FEEDBACK/MEASURE/IMPORTの6件は非blocking改善候補として保持する。#23/#24の独立受入を5 Checkpointへ重複計上しない。

## 原報告と未回収の区別

既存記録には#106集約、#107初期、5219、Profile補足の原本manifest hashがある。回収済みのアプリ原報告・担当thread/turn参照と、旧集約manifestのbytesは区別する。旧manifestを再構成した、またはhashを照合済みとはしない。

| 回収済み原報告                        | 原報告bytesのSHA-256                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| Profile全5工程の初回報告              | `ae71d90cf570f9296ee22bf75c89e4d0f57b74eea542f2cab5c21f28c4cb4ece` |
| 5219の新規Brief-only制作報告          | `cf28c25ab87a12eab194c77fa7d799ffc5d9d513d8bbd186eed9c91dc31de4c4` |
| Profile元担当の後日説明（アプリ本文） | `edf66065c473e6bceb53468233a618454c8b90d583212c166292e91d460eacf4` |

Profile後日説明は末尾LFを加えると公開記録の原文hash `7246a194195bd54d2a7f49bba65b4b80acbba12097cf71ec7cf19ab8ed7f645c`に一致する。これは旧集約manifest `79699fcdc4e55cae3b292b6184e591b040cabc58a5346245d47672200f642800`を回収したという意味ではない。

正式候補へ結合する際は、回収済み本文・成果物・取得できる画像・担当参照を独立照合し、新しい照合manifestとして固定する。旧hashを新しいファイルのhashへ上書きしない。新しい照合は新規の学習操作には数えない。画像だけから保存/reloadの順序を証明しない。原報告・個人path・画像原本は公開pushへ含めない。

今回、独立レビュー担当が#106の未達と限定再観察、#107の制作と保存コピー診断、5219制作、Profile後日説明を原文照合し、必須指摘0とした。上表の原報告3件と後日説明＋LF、5219の成果物4件のhash一致を確認し、作品画像も見た。回収原本・成果物32件と担当参照、候補の教材tree、照合メモ・独立レビュー要旨を新しい非公開manifestへ固定した。SHA-256は`f71af14d99f91519b83818efaa607a2d8cb7cb72f2c58ffef39dd8f6f1d23983`。これは回収済み証拠の再照合であり、未回収の旧集約manifestの復元、新規の学習操作、現候補の正式approvalではない。

## 公開・CIの現在地

- 固定候補の[通常Pages CI 42047994036](https://github.com/santa928/tsumucode/actions/runs/42047994036)は成功。resolve/fastのみ成功し、quality/qualification/deploy/report/record_release/publishはskipped。正式公開Gate成功ではない。
- 固定候補の[Runtime 42047993357](https://github.com/santa928/tsumucode/actions/runs/42047993357)は本照合時点で進行中。終端結果は統合担当が再確認する。
- GitHub Pagesの最新成功deploymentは`7522091460`、Source `16bbf55442a3166193c3e7de07c06d644126968d`、[Run 41624036903](https://github.com/santa928/tsumucode/actions/runs/41624036903)。公開日時は2026-11-03、URLは[公開サイト](https://santa928.github.io/tsumucode/)。これはdeployment APIの照合で、今回の実ブラウザ操作ではない。
- 現在の`release-approval.yaml`とHTML/CSS release-history candidateはdraft。旧手動記録のSource/hashを固定候補へ機械的に付け替えない。共通release flowが既存公開を継承することと、#108/#7の正式受入完了は分ける。

## 残る条件とcloseの順序

1. 回収済み原本と現候補の独立照合を固定し、旧manifest未回収の扱い、5 Checkpoint/両Project/必須問題0、教材差分0を統合担当へ渡す。必要な共有UI/runtimeの関連検証とexact SourceのCIを確認する。
2. 統合担当が現行公開契約に従い、approval/candidate・Source/tree/dist・記録hashと独立レビューを結合する。旧Gateと共通movementへの重複編集はしない。通常CIだけで公開条件を満たしたとはしない。
3. 統合担当が許可された正式公開を実行し、成功deployment・公開Source/Run・公開表示を照合する。候補SHAや配信環境が変われば新しい実体を確認する。
4. 公開URLをDocker内ブラウザの専用保存状態で操作し、入口→開始→通常採点→完了保存、編集途中→Home再開→reload保持を確認する。既存利用者の保存状態を消去せず、必要なら対象専用profileを使う。β/正式版表示、採点と保存の失敗も記録する。
5. 公開後記録の対象Source、Run、URL、操作・保存結果を固定して#108を完了する。#106/#107/#108と親条件が全て揃った時だけ#7をcloseする。不足があれば両Issueを開いたままにする。

再利用できるのは上表の既存教材受入であり、実公開後の開始・再開・採点・保存の確認はまだ未実施。今回、正式公開やIssue closeは行っていない。
