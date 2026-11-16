# Python-first 移行の履歴

**この候補は固定 runner での事前検証が合格するまで公開に使用しない。** 配信の成否は、その候補の正式 run と公開後確認で判定する。この履歴は新しい資格や現在の配信親を表さない。

`movement-eb2-v2.json` と `movement-v2.json` は、Python-first の同じ移行をそれぞれ eb2 と以前の親に結び付けた宣言の原本である。両ファイルは内容を変更せず、active な宣言の探索場所からこの履歴へ移した。片方だけを外すと旧宣言へ fallback するため、両方を終了する。

旧 run [42929117936](https://github.com/santa928/tsumucode/actions/runs/42929117936) では、候補 Source `b9306eb3414e69a2068603cfdbf2706ebe4e9284` の qualification と deploy、公開後 report が行われた。固定された公開 tag と旧 qualification・候補・plan の照合、および移行原本・受入の限定された独立照合は `../python-first-anchor-summary-v1.json` と既存の独立検査記録に範囲を分けて保持する。旧原本28件と最終台帳由来の20件は別の原本であり、最終台帳残り8件の原本照合は未確認のままにする。旧 run 全体と record job の failure を成功に変更しない。2026-11-16 08:59 UTC の一回の観測で当時の最新配信親は b930 の成功 deployment `7699435659` だった。この観測を後続 run の fresh parent や新資格には使わない。

今後の公開では、その run の実配信親から現候補への差分を通常の `planRelease` と `verifyContent` で評価する。既公開 Lesson と fixture の削除・負例の合格化、未承認の変更や撤回を拒否し、必要な新受入と同一 run の技術検査・main / parent の再照合・公開後確認を維持する。Python 実践・OOP の既存の限定受入は `../python-historical-acceptance.md` に従い、過去の観察範囲を広げず再利用する。別の新しい移行は、その対象に対応する新しい active 宣言と承認が必要である。

この Source の正式 workflow は `python-first-v1` の退役 policy を明示し、初回は capture した親が固定 b930 record と一致すること、以後は同じ履歴を持つ後続 Source の親を検査する。実配信親の真正性と鮮度は通常の capture・資格時の再取得・配信直前の再照合に依存する。GitHub の制御面、正規 repository writer、同一 Source の workflow を信頼し、Git ancestry や固定 tag 単独を署名・過去の全受入の新たな証明とはしない。明示 policy は汎用 reader の宣言なし動作を変更しない。linked worktree の明示 Git selector は既存 compose mount の形に限るため、別形式の selector は拒否する。

事前テストは公開 b930 Source・tag の bytes とローカルに再生成した内容を使い、deployment 応答・技術 receipt を合成して capture、退役 guard、prepare、`qualifyRelease` の判定を結ぶ。qualification workflow や `qualifyCurrentRelease` による artifact・report 読取、実際の deployment の認証、実行された検査や runner mount、正式資格の成功は証明しない。実配信親が固定条件に合わない・確認できない場合は正式 run を停止する。

宣言終了により、旧 eb2→b930 の固定 28 fixture・10 intent の原本および当時の content tree を**各後続 run で再検算する処理は終了**する。通常 gate は新候補の Source・digest・receipt と実親との差分を検査するが、旧移行の再検算と同一ではない。旧 qualification を新候補の資格として流用せず、過去の私有原本を公開しない。署名付き証明は現行公開の必須条件ではない。
