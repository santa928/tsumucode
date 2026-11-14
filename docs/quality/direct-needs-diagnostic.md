# Direct-needs 診断（公開経路とは独立）

この workflow は GitHub Actions 上で、非機密の乱数と run / attempt / source が producer から直接依存する consumer に届くかを調べる限定実験です。公開・資格・証明書発行・署名・artifact 保存・外部送信には接続しません。権限は `{}`、checkout や外部 action はなく、GitHub-hosted runner 上の Node と GitHub の job output のみを使います。

乱数は認証子ではありません。consumer が同じ形式の偽値を受け取った場合、内容だけでは本物との区別はできません。結果を解釈する前に、レビュー済みの workflow bytes と source commit、producer / consumer の正確な直接 `needs` edge、出力式、branch、変更された step がないことを独立に照合してください。この試験は GitHub の workflow 実行基盤・正しい expression 評価・隔離 runner を信頼します。runner や GitHub サービスの侵害、署名された provenance、公開候補の妥当性、fresh parent、学習者の非干渉、秘密情報の全般的な漏出防止は証明しません。

候補は `workflow_dispatch` と、診断 workflow または test の変更に限定した `pull_request` を受け付けます。いずれも同一 repository の `codex/direct-needs-probe` branch に制限し、PR は main 宛のみです。PR では merge ref / merge commit を使います。実際の `GITHUB_WORKFLOW_REF` と `GITHUB_WORKFLOW_SHA` の値が検査条件に一致するかは実 runner 未確認で、異なれば安全側に失敗します。診断実行に公開の許可や公開成功を推論しません。

`pull_request` は未統合の PR merge branch 上で動けますが、PR が自身の workflow を変更できるため成功表示だけを信頼済み caller の証拠にはできません。レビュー済み bytes と実際の merge commit を別に照合してください。通常の Pages CI は PR 全体を対象とします。`tests/unit/workflows` の test は現在の Local Runtime workflow の `tests/unit/release/**` path に該当しません。

GitHub の [手動実行要件](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) により、`workflow_dispatch` は同 workflow が default branch に存在する前には起動できません。PR 上の動作確認と、レビュー後の固定 workflow による手動実行を別の証拠として扱います。

静的・合成の正負テストでは direct edge / permissions / 追加 step / script 変更、別 run・別 attempt・別 source・欠落・不正値を確認します。実 GitHub runner での結果、PR CI、正式 lint / typecheck はまだ得ていません。
