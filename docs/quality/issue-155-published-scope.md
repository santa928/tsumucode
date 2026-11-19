# 公開済み9 Courseの証拠集約（#155）

確認日: 2026-11-19 UTC。既存の受入・公開記録と限定した公開後確認の対応表です。新しい教材承認、実人観察、全件QA、資格、配信、Issue closeを行った記録ではありません。#155/#18/#5の全体完了は未判定で、追加React改訂#260を完了に含めません。

## 固定対象

- 配信Source: `820f572c29d6477b722394c29349d57611931855`。
- 照合時main: `49d28e584ad63f3c23451fe66445c45ebdf7d418`。配信Sourceとの差は記録復旧のworkflow・文書・unit testの5ファイルで、教材・製品UI・Runtime・保存実装は同じです。main全体を別途配信したとは扱いません。
- 公開先: <https://santa928.github.io/tsumucode/>。
- 正式[run 44287505917](https://github.com/santa928/tsumucode/actions/runs/44287505917)、deployment `7883955817`。candidateDigestは`da721c9a59aabab3573a48a758fa8663833ab54f0461d05c8f146551a3ce040a`、artifactDigestは`a03b44390e8c75094e39e171bae60387444b8fd67389c65fb77a926288458843`。
- 同候補の資格、配信後604ファイルのbytes照合、18代表操作は成功。record失敗をrun全体の成功へ変更していません。[復旧方針](release-record-44287505917.md)に従う記録専用[run 44326610812](https://github.com/santa928/tsumucode/actions/runs/44326610812)は成功し、tag `tsumucode-app-44287505917-7883955817` のref/annotationと元record planの一致を別途確認しました。再配信や元証拠の付替えはありません。

## Course別の受入参照

以下は承認済み方式での既存受入への参照です。閉鎖状態だけを証拠にせず、旧Source・観察対象・支援・限界を各記録のまま保持します。

- **HTML/CSS:** [#7の最終判断](https://github.com/santa928/tsumucode/issues/7)、[正式受入照合](html-css-formal-acceptance.md)。5 Checkpoint、Guided、Capstoneの承認済み独立画面操作と原本照合。旧未達・撤回、実人の部分観察、非blocking改善6件を保持します。文書末尾の当時のopen記録は、その後の#7最終判断と区別します。
- **JavaScript:** [#10](https://github.com/santa928/tsumucode/issues/10)、[教材別台帳](javascript-agent-learning.yaml)。必須の新Guided5＋Capstone1を独立3役で受入。共通確認済み21／旧31未確認の区別と承認済み性能基準を維持し、旧31を全員再評価する条件へ戻しません。
- **TypeScript:** [#11の完了記録](https://github.com/santa928/tsumucode/issues/11)、[受入台帳](typescript-release-acceptance.yaml)。15 Lessonの3独立初心者役による模擬評価、既存品質・保存・公開後確認。実人・低速物理端末の証明ではありません。
- **React:** [#12](https://github.com/santa928/tsumucode/issues/12)、[Course受入](react-course-acceptance.md)、[内容receipt](content-v2-receipts.json)。公開済みCourseと初回案内改訂の受入を保持します。未統合の#260/Draft #302と、そのMaker 2件の未承認・自然停止原因未確定は別です。
- **Tailwind:** [#13の完了記録](https://github.com/santa928/tsumucode/issues/13#issuecomment-6678950121)、[旧受入の限定移行](tailwind-historical-acceptance.md)。旧5教材・AI観測者1名の範囲を保持し、3役へ水増ししません。recommended導線、JSON/Reset、持ち出しproduction buildの後続確認を旧観察と分けます。
- **Next:** [#14の完了記録](https://github.com/santa928/tsumucode/issues/14)、[受入台帳](next-release-acceptance.yaml)。9教材の実サーバー/制作と承認された観察。Pagesは説明・読書、実行はLocalです。現在のNext Local UIにはStarter Reset操作がなく、確認成功とは記録しません。
- **Python基礎:** [#15](https://github.com/santa928/tsumucode/issues/15)、[#143](https://github.com/santa928/tsumucode/issues/143)、[#196の入力受入](https://github.com/santa928/tsumucode/issues/196#issuecomment-6678905570)、[#259の関数/List改訂](https://github.com/santa928/tsumucode/issues/259#issuecomment-6886815570)。Courseは16 Lesson・revision `2026-11-03.1`。[Course受入準備表](python-basics-course-acceptance.md)に対する後続の#143の5条件・#15の8条件の独立照合を回収し、未完だったPages→Local移送は下記の実runで確認しました。子のcloseだけで親の完了を推定しません。
- **Python実践:** [#147の最終照合](https://github.com/santa928/tsumucode/issues/147#issuecomment-6996373858)、[#16](https://github.com/santa928/tsumucode/issues/16#issuecomment-6996398822)、[旧受入照合](python-historical-acceptance.md)。5教材の内容レビュー、承認済みの限定CUA受入と、下記の公開後代表1教材を結合します。
- **Python OOP:** [#152の最終照合](https://github.com/santa928/tsumucode/issues/152#issuecomment-6996382907)、[#17](https://github.com/santa928/tsumucode/issues/17#issuecomment-6996415990)、[旧受入照合](python-historical-acceptance.md)。9教材の内容レビュー、承認済みの限定CUA受入と、下記の公開後代表1教材を結合します。

Python基礎の後続[run 43690926724](https://github.com/santa928/tsumucode/actions/runs/43690926724) / [job 132741227722](https://github.com/santa928/tsumucode/actions/runs/43690926724/job/132741227722)は、観測HEAD `7058607fcf3f752cf2ef0df1708eb9abd3aa9e8b`、製品Source `b9306eb3414e69a2068603cfdbf2706ebe4e9284`を別々に固定しています。公開Pagesで合成2ファイルを編集・採点・JSON書出しする1件、HomeのCourse/Path再開2件、同じJSONを別originのLocal通常UIへ読み込み実CPython 3.14.2で再採点する1件が成功し、skip/retryは0でした。入力SHA-256 `99f8fa2388e952ca58d4ae36466dec9d5aebe54bf0c98318a87c5fc451a62f7f`と前後の公開3ファイル照合を確認しました。結果JSONは非公開で、固定workflow/spec/checker・jobログと保存済み独立照合に基づく限定結果です。旧P6のbuild失敗、P5の初回失敗、旧P1/P4の開始時spec hash未固定は保持します。この旧Sourceの成功を現配信での新規実操作や全配布物再検査へ付け替えません。現配信のPython基礎教材は旧Sourceと同treeで、後続の共有Runtime等の差分は現在候補の技術検証と区別します。

Python実践/OOPの公開後補完は2026-11-19 00:51:43.979〜00:52:32.689 UTC、各初回演習1件です。空の独立Browser contextで開始→実Pythonの未達判定→編集→Home再開→合格→reload保存→非空JSON書出し→別の空contextへの読込みと保存内容一致を確認しました。対象時間内のpageerror、console error、requestfailed、HTTP 400以上は各0件。これは作者のPlaywright QAで、既存の独立初心者観察の代替ではありません。Import後は復元Sourceと保存履歴を確認し、再実行成功までは主張しません。直近の再hashはcatalogと2教材の3ファイルだけで、604ファイルの再確認ではありません。私有原本・画像・個人データはここへ転載しません。

## 横断要件と残る判断

- [#153の完了記録](https://github.com/santa928/tsumucode/issues/153#issuecomment-6996506432): 同じ候補の9 Course/Path、CourseProgress導出、非空の合成データによる9 CourseのJSON往復、適用される移行・保存・失敗復帰。共通BrowserのStarter Resetは8 Course、Next Localは非対応という区別を維持します。全旧revision×全Workspace×全障害や実利用者データの検証ではありません。
- [#154の完了記録](https://github.com/santa928/tsumucode/issues/154#issuecomment-6996515647): 同候補の配信/初期chunk境界と既存のa11y・Security・承認済みPerformance・subpath検証、正式公開後観測に上記2代表操作を補完。全route/全Browserの無故障や、実人・物理実機・VoiceOver全操作を保証しません。
- [#127](https://github.com/santa928/tsumucode/issues/127)は現教材にアプリ内Shell/PTYが不要という条件分岐でnot_planned。Terminal実装済みとは扱いません。#26の必要な単元改訂の実測は[完了記録](https://github.com/santa928/tsumucode/issues/26#issuecomment-6658855329)を参照します。
- #155の残りは、この集約の独立確認と記録統合、既存要件/Issueの現在地同期、原9 Courseと追加改訂の範囲を分けた最終判断です。本表を新しい包括的な承認台帳やgateの代わりにはしません。古いapproval/receipt/hash・日付付き失敗記録は変更しません。
- [#260](https://github.com/santa928/tsumucode/issues/260)は#12の完了を取り消さない追加改訂ですが、未完のままです。#18は#5の全体完了条件にも言及するため、原9 Courseの確認を無限定な全ロードマップ完了へ広げません。#155/#18の完了範囲の判断と記録、#5の追加未完追跡は別に残します。
