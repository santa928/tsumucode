# HTML/CSS 正式受入の照合（#108・#7）

初回照合節は準備時点の原文を保持しています。当時の未回収・未実施・公開前という記述と、後の実施結果は時点を分けて読みます。2026-11-06 16:26 JSTの現v2配信との対応は、末尾の[公開後追補](#v2-post-deploy-2026-11-06)を参照してください。

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

今回、独立レビュー担当が#106の未達と限定再観察、#107の制作と保存コピー診断、5219制作、Profile後日説明を原文照合し、必須指摘0とした。上表の原報告3件と後日説明＋LF、5219の成果物4件のhash一致を確認し、作品画像も見た。回収原本・成果物32件と担当参照、候補の教材tree、独立レビュー要旨を新しい非公開manifestへ固定した。SHA-256は`f71af14d99f91519b83818efaa607a2d8cb7cb72f2c58ffef39dd8f6f1d23983`。これは回収済み証拠の再照合であり、未回収の旧集約manifestの復元、新規の学習操作、現候補の正式approvalではない。

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

## 追記: 統合準備時点の再照合

2026-11-06、PR #303のhead `8a6f04d3b2d4c21ee1c04849d5e0c2ce59c24c38`を、統合準備の基点main `f9985f9a3e519b05a6991278697845f5ce5d998f`へ別worktreeで競合なく適用した。旧branchと旧成果は変更していない。上記の固定候補・原本照合・公開記録は当時の記録として保持し、最新Sourceへ付け替えない。

- PR #303の[Pages CI 42051835211](https://github.com/santa928/tsumucode/actions/runs/42051835211)はsuccess。head `8a6f04d3`に対するCodexレビューは指摘なし、未解決review threadは0件。これを統合後SourceのCIや正式公開Gate成功へ広げない。
- 上記で進行中だった[Runtime 42047993357](https://github.com/santa928/tsumucode/actions/runs/42047993357)はsuccessで終端した。代表production UI・保存等の通常検証は成功したが、same-run candidateの取得・Native receipt結合など公開用の条件付きstepはskippedだった。
- `af211f47`、`9821a4eb`、`f9985f9a`の`content/html-css`はGit tree `6da58d0e9a2fec0b69dabbf5b1cdd6aa1e04e5b0`で一致する。`9821a4eb`から`f9985f9a`は`src`も差分0。通常CIの全件化・静的Artifact検査の修正・Python受入文書の追加は教材再観察を要求する変更ではないが、最終Sourceのrecipe・Artifact・品質結果は別に固定する。
- deployment APIを再確認し、最新deployment `7522091460`のsuccess、公開URL、Source `16bbf55442a3166193c3e7de07c06d644126968d`を確認した。新しい候補の配信や今回の公開UI操作を意味しない。基点mainのHTML/CSS approval/candidateは引き続きdraftで、ここでは更新していない。

### 今回回収できた原本

初回の統合準備では、旧worktreeと私有handoff、32エントリの照合manifest `f71af14d…`は未回収だった。その後の独立所在調査で、旧セッションの生成コマンドと現存原本からmanifestを再構成し、7,030 bytesのSHA-256が上記の`f71af14d99f91519b83818efaa607a2d8cb7cb72f2c58ffef39dd8f6f1d23983`と完全一致した。旧manifest実ファイルを発見したものではない。旧handoff実ファイルは依然未回収で、セッションから復元した状態記録のbyte同一性も未確認。

別の私有保管先に残る原報告・作品・担当参照等28ファイルを読み取り、別の私有証拠Directoryへコピーした。上表の原報告3件と後日説明＋LFの4 hashは公開記録と一致した。5219のHTML/CSS・画像2件の4 hashは回収時の参照台帳と一致したが、その台帳自体が旧per-file hash未提供と明記しており、それ以前の旧集約manifestとの一致は未確認。28ファイルの回収manifestのSHA-256は`b211e6b7167fefc32addcb8925edc18618b44dcc6662106cc0fbd3624c4de05c`のまま保持する。

再構成した32エントリは、この28ファイルと、同じHTML/CSS・画像2件の`capstone-artifacts/`配下への4重複コピーだった。全32参照先のbytes/hash、28件の回収集合との対応、旧セッションの生成時hashを再照合した。固有内容hashは28件で、新たな4原本や学習観察が見つかった意味ではない。この照合manifestのbyte同一再構成と、それ以前から未回収の別の旧集約manifestを区別する。正式候補の承認や公開Gate成功は発行していない。

### 他の固定候補への影響

本差分は受入文書だけで、共有gate・content原本・schema・movement・他Courseのreceiptを変更しない。並行のPython #300（`d21b1150`）、JavaScript #310（`3c7a42f6`）、表示修正（`d94ac53f`）、PR早期gate（`c3ff770d`）は各担当が所有する。この4候補と基点mainを比較してHTML/CSS教材の差分0を確認したが、そのCIや受入をHTML/CSS正式公開の成功へ流用しない。文書だけの統合でも全Sourceのrecipeは変わるため、固定候補のSHAや既存receiptの入力条件を機械的に書き換えない。最終統合で共有UI/runtimeが変われば、影響する操作の検証を別に確認する。

### 正式公開後に補完する限定確認

全行未実施。既存の`public-operations`は公開inventoryからruntime/capabilityごとに代表を選ぶため、全行がHTML/CSSで実施されるとは限らない。正式runのplan・receiptと実操作を照合し、同じ配信・同じ操作で満たされた分は再利用する。残る操作だけを専用の空Browser状態で補完する。作者のSolutionを使う自動Gateは初見学習の受入と区別する。

| 対象           | 確認と記録                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 配信と表示     | Source・run/attempt・candidate/artifact・deployment・URLを固定し、承認Artifactとの一致、HTML/CSSの公開状態とβ/正式版表示を確認する。入口200や画像だけで全配布物一致を代用しない |
| 入口と開始     | Home→HTML/CSS Path→代表Lessonの解説→演習へ進む。キーボード操作・見出し・操作名・フォーカスを確認し、PC/390pxの代表画像を実見する                                                |
| 判定と完了保存 | 対象Lesson/Exercise IDを固定し、未達→教材の案内で修正→通常判定→完了保存→reloadを確認する。実行成功・採点合格・保存成功を分ける                                                  |
| 途中保存と再開 | 編集途中のHTML/CSSを保存→Homeの続きから再開→reloadし、ファイル内容と過去の完了状態を比較する。URL直行や完成後reloadだけをHome再開の証拠にしない                                 |

この補完は公開後の代表操作確認であり、既存の独立受入・全教材観察・実人の理解や学習時間の測定をやり直すものではない。正式公開前の今回はBrowserを起動せず、公開・merge・main変更・Issue closeを行っていない。

<a id="v2-post-deploy-2026-11-06"></a>

## 追記: 現v2配信と公開後確認（2026-11-06 16:26 JST）

これは配信済みSourceへの照合追補であり、この文書を含む新しいcommitの配信・承認記録ではない。上の初回照合・未完表と各観察の旧Sourceは変更しない。[観察記録](novice-observation.md)と[Checklist](release-checklist.md)の最新導線は、この表と同じ現v2実体を参照する。

| 対応                  | 確認した実体と範囲                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 既存教材受入          | #106/#107の5 Checkpoint・Guided5工程・5219 Capstoneと操作復帰は、当時のSource・独立照合・限定再観察の範囲で再利用。AI/CUA・実人部分観察・撤回/未達/後日補足の区別を保持。HTML/CSS教材全体のGit tree一致を確認したのは、5219 Source `af211f47`→`9821a4eb`→現配信`eb2fe6f8`の範囲で、値は`6da58d0e9a2fec0b69dabbf5b1cdd6aa1e04e5b0`                                                                                                    |
| 原本照合              | `f71af14d99f91519b83818efaa607a2d8cb7cb72f2c58ffef39dd8f6f1d23983`の7,030 bytesを同一に再構成。32エントリは28原本＋4重複で、全参照先を照合。旧実ファイルの発見・新しい学習観察ではなく、旧handoff実ファイルと、それ以前の別集約manifestは未回収                                                                                                                                                                                      |
| 配信Source/実体       | Source `eb2fe6f8e06409569f173efb2fe6275c46a535cf`、source tree `4f1343b855ca451a38d9f08509065e1f80afb846`。[run 42154759825](https://github.com/santa928/tsumucode/actions/runs/42154759825)、build/qualification attempt1、公開report attempt2、deployment `7593230441`、[公開URL](https://santa928.github.io/tsumucode/)                                                                                                           |
| v2 candidate/artifact | candidateDigest `304d43b7d86b8a28d05be7ca9f9cb56e2192c2283f6097ce8da3ca7668e9c4ed`、artifactDigest `d6185d990afb389ff7cf7e2564ff93a53e5521e514e1ade0a61fd29ea893ad39`、Artifact `13474665254`。既存receiptと同一で、新文書commitへ付け替えない                                                                                                                                                                                       |
| qualification/content | `qualified`、content `approved`。HTML51 Lessonは`carriedLessons`で、新規HTML receiptは0件。現在のcontent資格の継承であり、旧手動義務の新規承認や実人受入を自動的に意味しない                                                                                                                                                                                                                                                         |
| 公開成功receipt       | `public-report-42154759825-2`（Artifact `13481819583`）のpublic-smokeは588ファイルpassed、public-operationsは18 target passed。candidate/artifact/actualが一致。HTML ch00-l01のHomeからの開始・読書再開、ch00-l01-e01の未達→合格とreload保存、JSON移送を確認。公開操作planDigest `9186bee37527305218028a064d4a7c8811bd883e85c33318cfb88182fc9d0602`、reportDigest `c30a2ef97cfa2b4e7e1944f50b0b9749e2f9d62e622ffaf7b95223ce88fc3a8c` |
| tagと失敗の区別       | `tsumucode-app-42154759825-7593230441`のannotated tag object `77c7a56aa3c4c54144fe44ecccd31775623aaf32`が実在し、target/messageはrecord planと完全一致、埋込recordは`verified`。一方、record jobとrun全体の結論はfailureのまま。実tag照合をjob成功へ読み替えず、再作成・公開再実行もしない                                                                                                                                           |
| 不足操作の補完        | 16:25:51–16:26:02 JSTにChromium1件、1CPU/1536MiB/worker1/retry0で成功（全体9.820秒、fail/skip/flaky/retry0）。実UIで非合格draft2fileを保存→Homeの続きから→同じ演習→reloadでfile byte一致、空履歴・空passing snapshot・未完了状態を保持。採点・DB注入・JSON移送を繰り返していない                                                                                                                                                     |
| 実配信/表示の確認     | 16:25:30/16:26:59 JSTにSource/deployment/status/tagの前後一致を確認。PC1280/390pxのHomeと再開後の4画像を実見し、サイトのβ表示と保存済み表示を確認。HTML/CSSの`published`とサイトのβ表示は別の事実で、正式badgeへ切替済みとはしない                                                                                                                                                                                                   |

公開後の対象操作は既存18操作と補完1件で確認できた。補完1件を新しい正式receiptや過去合格履歴の全復帰、初見受入・実人の理解へ広げない。#153は同じHome再開証拠、#154は同じHome画像を必要範囲で共用できる。原本・画像・個人pathは私有保管のままで、再観察や全Browser再試験を追加しない。

**残るのは、Rootが既存の教材受入・原本照合・現v2公開実体・公開後結果を結合し、HTML/CSSの手動義務を含む全条件の最終受入判断と記録統合を行うこと。** 本追補はその判断を代行せず、#108/#7は現時点でopenを維持する。旧v1 approval/historyのdraft・旧hashは保持する。β表示の変更、タグ再作成、公開run再実行を新しい条件として追加しない。
