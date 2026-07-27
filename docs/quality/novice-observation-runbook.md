# 完全初心者Observation Runbook

- status: `ready`
- productSourceCommit: `a9c2553a8e0b654ff2dc11ee04b9db16ab8b4978`
- canonicalDistSha256: `draft`
- resultRecord: `docs/quality/novice-observation.md`
- participantPolicy: `実装者・教材authorではないHTML/CSS完全初心者を匿名IDで記録する`
- facilitatorPolicy: `口頭補助、正解誘導、指差し、代理操作を禁止する`

この手順書は、TsumuCodeを初めて使うHTML/CSS完全初心者が、画面内の説明だけで学習を進められるかを観察するためのものです。テスト担当者が教材の不足を補ってしまわないように、開始条件、許可する声かけ、記録方法、合格条件を固定します。

## 1. 実施前の準備

1. 参加者へ目的と所要時間を説明し、匿名ID（例: `NOV-001`）を割り当てる。氏名、メールアドレス、実データはRepositoryへ記録しない。
2. PC幅`1024 CSS px`以上、マウスまたはトラックパッド、Chromeのゲストモードまたは観察専用ブラウザプロファイルを用意する。既存の学習履歴を持ち込まない。
3. 公開前は担当者が提示した`{BASE_URL}`を開く。`{BASE_URL}`は末尾の`/`を除いたアプリのルートURLとする。
4. ストップウォッチと、この文書末尾の観察票を用意する。画面録画や音声録音は参加者の明示同意がある場合だけ行い、個人情報が映らないことを確認する。
5. 参加者へ「考えていることを声に出しながら、画面に書かれている内容だけで進めてください」とだけ伝える。

同じブラウザを再利用せざるを得ない場合は、先にホームの「全コースの進捗を書き出す」で既存データを退避し、「この端末の学習データを削除」から「削除を確定する」を実行します。開発者ツールによるStorageの手動削除は、実利用と異なるため観察手順に含めません。

## 2. Facilitatorのルール

### 許可する中立的な声かけ

- 「画面に書かれている内容だけで進めてください」
- 「今、何をしようとしていますか」
- 「考えていることを声に出してください」
- 「今の画面で、次にできそうなことは何ですか」

### 禁止する支援

- 用語、タグ、属性、セレクタ、プロパティ、コードの意味を説明する。
- 正しいボタン、入力位置、スライド、ヒント、解答を指差す。
- 正解のHTML/CSS、DOM Tree、CSS Property、完成手順を口頭または別画面で見せる。
- 参加者の代わりにクリック、入力、修正、提出する。
- 「惜しい」「そこではない」など、正誤を推測できる反応を返す。

参加者から質問された場合は、答えを補足せず「画面に書かれている内容だけで、どう考えますか」と返します。安全上または端末不具合で介入した場合は、そのCheckpointを合格扱いにせず、介入内容と時刻を記録します。

## 3. Checkpoint

Course MapにはLessonの強制ロックがないため、各Checkpointは下記URLから個別に開始できます。`{BASE_URL}`を実際のアプリURLへ置き換えてください。

| #   | Checkpoint           | 開始URL                                                                                   | 完了条件                                                                  | Teach-backで確認すること                                                                  |
| --- | -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | 導入とHTML基礎       | `{BASE_URL}/#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01`    | `ch00-l01`、`ch00-l02`、`ch01-l01`、`ch01-l02`、`ch01-l03`を順に完了する  | ブラウザ・HTML・CSSの役割、開始タグと終了タグ、入れ子、属性を自分の言葉で説明できる       |
| 2   | Phase 02終端         | `{BASE_URL}/#/courses/html-css/lessons/html-css-ch07-l01/slides/html-css-ch07-l01-r01`    | `html-css-ch07-l01-e01`のProfile Card統合実習を完了する                   | Semanticな構造、`alt`、余白、Typography、Contrastをなぜ選んだか説明できる                 |
| 3   | Phase 03終端         | `{BASE_URL}/#/courses/html-css/lessons/html-css-ch11-l04/slides/html-css-ch11-l04-s01`    | `html-css-ch11-l04-e01`の最終Auditを完了する                              | User preference、reduced motion、overflow、複数Viewport確認の理由を説明できる             |
| 4   | Guided Profile 5工程 | `{BASE_URL}/#/courses/html-css/lessons/html-css-ch12-l01/exercises/html-css-ch12-l01-e01` | 下記5工程を同じWorkspaceで順に完了し、Profile SiteのProject結果を表示する | 対象者とSemantic Outline、再利用Style、2 Viewport、Focus表示、最終Auditの判断を説明できる |
| 5   | STACK DAY Capstone   | `{BASE_URL}/#/courses/html-css/lessons/html-css-ch13-l01/exercises/html-css-ch13-l01-e01` | BriefだけからSTACK DAY Landing Pageを完成し、実習判定を通過する           | Briefをどの構造とStyleへ変換したか、ViewportとAccessibilityをどう確認したか説明できる     |

Guided Profileは次の5工程です。各工程の完了後、画面内の導線だけで次工程へ進めるかも観察します。

1. `ch12-l01-e01` — AudienceとSemantic Outlineを作る
2. `ch12-l02-e01` — HeaderとHeroでProfileの入口を作る
3. `ch12-l03-e01` — AboutとSkillsを再利用Styleで育てる
4. `ch12-l04-e01` — WorksとContactを2 Viewportへ収める
5. `ch12-l05-e01` — Profile Siteの最終Auditを完了する

CapstoneではSolution、DOM Tree、CSS Property、完成手順を見せません。参加者が使用できる情報は、実習画面に表示されるBriefと通常の製品内機能だけです。

## 4. 観察方法

各Checkpointで開始・終了時刻を記録し、次の事実を参加者の言葉と操作に沿って残します。

- 最初に迷った画面と、その時点で選ぼうとしていた操作。
- 誤解した用語と、参加者が述べた意味。
- スライドへ戻る、ヒントを開く、Previewを確認するなど、製品内救済を自力で使えたか。
- 次の操作を自力で認識できたか。認識できない状態が続いた時間。
- 実習の最終結果と、Teach-backの発言要旨。
- Facilitatorの介入有無。中立的な声かけも時刻とともに記録する。

観察中に合否を伝えたり、原因を断定したりしません。発話と事実を先に記録し、Session終了後に判定します。

## 5. Findingの分類

| 区分      | 判定基準                                                                                                           | Release前の扱い                    |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Blocking  | スライドや製品内ヒントを使っても3分以上進行不能、次操作を誤認して復帰不能、Editor・Preview・保存の不具合で完了不能 | 修正と同Checkpointの再観察が必須   |
| Important | 同じ用語や指示を繰り返し誤解、直前スライドと実習要求が噛み合わない、禁止支援なしではTeach-backできない             | 修正と影響Checkpointの再観察が必須 |
| Note      | 学習完了や理解へ影響しない好み、軽微な言い換え提案                                                                 | Release判断時に記録して評価        |

3分は「自動失格」ではなく、Blocking候補を記録する観察基準です。参加者が製品内のスライド、ヒント、エラー表示を自力で使って復帰した場合は、その経路と時間を記録してSession後に評価します。

## 6. 合格条件

Checkpointは、次の全条件を満たした場合だけ`合格`とします。

- 禁止する支援や代理操作なしで完了した。
- 次の操作を画面内の案内から認識し、製品内救済を必要に応じて自力で使えた。
- Teach-backで、暗記した語句ではなく選択理由を自分の言葉で説明できた。
- Guided Profileは5工程が同じWorkspaceで完了し、Project結果を確認できた。
- CapstoneはBriefだけから完了し、実習判定を通過した。
- 未解決のBlockingまたはImportant findingが残っていない。

Release Gateを通過するには、匿名参加者1名以上、5 Checkpoint合格、Guided Profile合格、Capstone合格、未解決Finding `0`が必要です。ひとつでも未達なら`docs/quality/novice-observation.md`の`releaseStatus`は`draft`のままにします。

## 7. 観察票

Checkpointごとに次のBlockを複製して記録します。氏名や連絡先は書きません。

```text
Participant ID:
Checkpoint:
実施日・Timezone:
Browser / OS / Viewport:
支援技術:
開始時刻:
終了時刻:
所要時間:

迷った画面・時刻:
参加者の発言要旨:
誤解した用語:
使用した製品内救済:
次操作の認識:
Facilitatorの声かけ・介入:
Teach-back:
Project結果:
Finding ID / 区分:
判定: 合格 / 要修正 / 再観察
判定理由:
```

## 8. Session後の処理

1. 観察事実を`docs/quality/novice-observation.md`へ転記し、Participant数、Checkpoint判定、Project結果、Findingを更新する。
2. 教材またはUIを修正した場合は、製品source commit、canonical dist hash、Lesson source hash、独立教育レビューを更新する。
3. 修正後はProduct QAと品質記録の結合を再実行し、影響するCheckpointを完全初心者で再観察する。
4. 5 Checkpointと2 Projectの合格後に限り、`release-approval.yaml`へ全手動記録hashを固定し、ユーザーへ正確なcommit SHAと公開予定URLを提示して公開承認を求める。

観察結果が揃っても、この手順書だけでGitHub Pages公開を実行してはいけません。公開はユーザーの明示承認後に行います。
