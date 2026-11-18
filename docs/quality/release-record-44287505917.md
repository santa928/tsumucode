# 44287505917 の公開記録復旧

## 確認済みの状態

- 対象 Source: `820f572c29d6477b722394c29349d57611931855`
- 正式 run: [44287505917](https://github.com/santa928/tsumucode/actions/runs/44287505917)
- 実 Deployment: `7883955817`、2026-11-18 13:00:23 UTC 作成
- 公開先: <https://santa928.github.io/tsumucode/>

同 run の必須検証は成功した。attempt 1 の最終集約は GitHub API の上限で停止し、公開は未実行だった。通知された解除時刻を過ぎてから集約 job だけを一度再実行した。attempt 2 は元の build と検証結果を保持して資格を確定し、同じ候補を配信した。公開後の全 604 ファイルの bytes と 18 の代表操作 target の観測も成功した。

最後の immutable record は `Missing or ambiguous prior record job` で停止した。過去 attempt に `publish / record` 子 job が必ず存在するという前提が原因だった。実際の attempt 1 は、完全な 21 件の履歴内に一意の `publish` 親 job が `completed/skipped`、steps 空で存在し、子 job は生成されていない。attempt 2 の完全な 23 件の履歴、固定された旧 workflow と原ログから、失敗箇所が POST 分岐より前だったことを確認した。対象 ref の 404 だけを未書込みの証明にはしていない。

配信成功・公開後確認成功・正式記録完了は別々の状態として扱う。この文書の追加自体は記録復旧の成功を意味しない。

## 再発防止

通常 writer は、完全で一意な同 run/attempt/Source 履歴から、skipped の親と子 job 不存在を正証できる場合だけ未実行と認める。単なる子 job の欠落、重複、異なる Source、未完了や非 skipped の親、公開子 job との矛盾は引き続き拒否する。過去の別 attempt に書込み可能性があれば取り消さない。

## 今回だけの記録復旧

`release-v2-record-recovery.yml` はこの run、Source、Deployment、成果物と原証拠に固定した、任意入力のない記録専用の手順である。旧 candidate を新しい復旧 run の成果物へ付け替えず、元の qualification、公開観測、record plan を保持する。再配信、force update、既存 tag の削除、内容 receipt の新規生成は行わない。

書込み可能なのは、この復旧 workflow 自体の最初の run・最初の attempt だけである。確認用の試し起動は行わない。以後の実行は exact record の読み取り照合に限定し、以前の run を削除しても書込み許可を復活させない。元 run の成果物・原ログの取得には、同じ repository の一時的な `GITHUB_TOKEN` に `actions: read` を付ける。通常 writer と同じ `contents: write` は増やさず、Deployment の読取は匿名のままとし、追加資格情報や認証の切替による再試行はしない。

既存の正しい record は読み取り照合だけで扱う。競合する ref、証拠の不一致、不完全な履歴、後続の元 run attempt、別 Deployment、結果が不明な書込みは停止条件である。POST の応答が不明な場合は同じ書込みを繰り返さず、exact annotation の読み取り照合に限定する。

完了判定は予定 tag `tsumucode-app-44287505917-7883955817` の ref と annotation が元の検証済み record plan に一致すること。実施結果は復旧 run の outcome と実 ref を照合して報告する。今回の記録を React 全体の新しい受入や全 Issue の完了に読み替えない。
