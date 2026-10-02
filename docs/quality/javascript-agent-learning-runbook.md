# JavaScriptエージェント模擬学習runbook

- 状態: `手順初版。全52の実施記録は未取得`
- 適用: [JS通常公開基準](javascript-normal-release-policy.md)、[実装計画](2026-10-02-javascript-agent-release-plan.md)のTask 4 / 5
- モデル: GPT-6.1 Sol、推論high以上。今回xhigh
- 条件: 3独立役、各自Chapter 00から全52 Lesson、別保存状態、同じ固定source / build
- 証拠: `/private/tmp`または本計画のgitignored workspaceに役別に保存。教材Source・正解はこのrunbookへ転載しない

## ペルソナの復元と今回の採用

2026-10-02の元本人発言は「異なるペルソナを持ったサブエージェント3人に触ってもらってフィードバック」の指定で、属性の正確指定はなかった。元session `01a0e0df-7a8f-7140-95d7-766685f9e757`の00:30〜00:38 UTCにrootのassistantが「完全初心者 / HTML・CSS経験者でJS初学者 / 中断しながら学ぶ人」を選んだ。属性と年齢は本人指定とは扱わない。

旧実施はA:30代完全未経験・エラー不安、B:HTML/CSSとJS基礎既習・Promise初学者、C:40代少しHTML・中断 / 保存不安の3役。旧証拠は`/private/tmp/tsumucode-persona-20261002/{summary.md,a/report.md,b/report.md,c/report.md}`と継続noteの2026-10-02 00:49 UTC節にある。105はUI操作数で、A/CのHTML初回、BのPromise限定などの部分試用。全52通しの代わりには使わず保持する。

今回は本人が明示した代案を採用する。旧BはJS完全初心者ではなくPromiseだけの試用なので、今回の全JS学習要件に適合する次の3役に置き換える。正確な過去本人属性指定が未発見であることを根拠として残す。

| 役   | 前提                                             | 主な観察視点                                                                          |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| JS-A | HTML/CSS修了直後、JS初心者                       | 前提 / 用語 / 説明飛躍 / Hint。可視教材だけで次の操作を決める                         |
| JS-B | HTML/CSSを知る、うっかりミス・中断が多いJS初学者 | 誤入力 / 誤答 / Hint / 保存 / reload / resume / Reset。意図的誤りは自然発生と区別する |
| JS-C | HTML/CSSを知り、自力作品を作りたいJS初学者       | 応用 / 概念の制作接続 / 別解 / GuidedからCapstoneへ自力統合できるか                   |

全役が全52を担当する。Aだけ読書、Bだけ保存、Cだけ制作の分担にはしない。視点が違っても必須操作は各役が実施する。

## 準備と独立性

rootは教材・採点・保存入力を凍結し、source SHA、Course revision、Lesson source hash一覧、production build hash、URL / subpath、Browser / viewport、開始時刻を記録する。52LessonのID / 順序と公開画面の入口だけを渡し、作者のinstructions Source / Solution / Fixture / Validator / 実装 / hidden expected / 他役報告を渡さない。

3役は新しい独立BrowserContextと保存領域から開始する。途中セーブを共有・複製しない。Browser操作は実UIで行い、CodeMirror入力・click・keyboard・iframe内操作を使用する。内部DB / progress / 合格状態の注入は禁止。運用担当がControllerを補助しても、回答や修正内容を教えない。

初回学習操作では正解の先読みをしない。表示教材とHintは利用できる。結果を予測する設問は予測と理由を記録してから可視の解説を開く。作者専用解答や他役の正答は閲覧しない。AIの既存知識で教材の不足を補った場合はその箇所を報告し、教材だけでできたとは主張しない。

## 各Lessonの進め方

1. Lesson ID、開始時刻、入口URLを記録し、可視説明を順番に読む。用語、図、Hintを開いた位置と根拠を残す。
2. 画面の課題から期待動作と変更方針を自分の言葉で先に記録し、UIでコードを入力する。
3. Preview / Consoleを実行し、操作と可視結果を記録する。採点を行い、期待と実際、未達rule / checklist ID、エラー分類を残す。
4. 誤答や説明不足があれば、教材見直しと段階Hintから修正する。Hint level、Retry、可視解説利用、既存知識の補完を区別する。
5. 保存表示、完了/途中状態、次の学習への移動、終了時刻を記録する。system errorを不正解回数へ勝手に含めない。

48標準Exerciseを含め表示された必須Exerciseをそれぞれ実施し、standard46 / guided5 / capstone1の全Lesson coverageを揃える。選択的な任意練習は実施/未実施と範囲を区別し、必須を任意に変更しない。

## 各役に必須の横断操作

| 操作                     | 期待する確認                                                                                    | 証拠                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 誤入力・誤答→Hint→修正   | 現在不足する内容を特定でき、正常実行 / 採点へ戻れる                                             | 入力前後の実UI、判定 / Hint ID                           |
| 中断・保存→reload→再開   | 未完成Source / file選択と正しい学習位置が保持される                                             | 保存前後URL / 可視Source / 保存表示                      |
| Reset取消→確定→再編集    | 取消は下書きを保持、確定は対象Starterに戻り保存、再編集可能                                     | 確認dialog、前後状態、reload                             |
| Guided全5工程            | 累積Sourceを保持、前工程へ戻って編集すると全Workspaceの現在完了が失効、過去成功は履歴として保持 | 工程ID / 判定 / Map / reload                             |
| Capstone                 | Brief / Checklistから別Workspaceで機能を統合し、理由を説明して完了                              | checklist / rule ID、実操作、模擬説明                    |
| Export→別状態Import→再開 | Sourceを含む学習bundleを実downloadし、新しい独立保存状態へUI Import、保存と採点を再開できる     | ファイルhash、export / import / 再開UI。秘密値は残さない |
| Keyboard / mobile読書    | 必要Focus移動 / 操作が成立し、狭幅では説明を読める。物理端末とは呼ばない                        | 実key操作、viewport、実画像目視                          |

持ち出しは既存の学習bundle Export / Importを対象とする。HTML専用ZIPをJS作品持ち出しとは呼ばない。JS ZIPや新しい実行環境をこの検証のために必須追加しない。

## 記録形式

役別`environment.json`、`operations.jsonl`、`lessons.md`、画像 / 可視DOM / download hash、`report.md`を残す。Lesson行は最低次の項目を持つ。

| 項目     | 内容                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| 対象     | role / Lesson / Exercise / rule / checklist ID、source / revision / Lesson hash |
| 操作     | step ID / timestamp / URL、読書 / 入力 / 実行 / 採点 / Hint / 保存 / Reset等    |
| 期待     | 操作前に可視教材から予測した内容、期待の可視根拠                                |
| 実際     | 画面 / Console / 判定 / 保存 / 再開の実観測、成功・失敗・system error           |
| 証拠     | 画像 / DOM / log / ファイルhashのpath、画像自体の目視有無                       |
| 学習限界 | Hint level、Retry、解説利用、既存知識の補完、Controllerの操作制約               |
| 判定     | 完了 / blocking / 必須未確認、原因仮説、改善案、再検証の証拠                    |

rootは役別52行、標準/制作の必須操作、証拠とReportの一致を照合する。操作数を独立test件数と呼ばない。locator / Controller timeoutを製品不具合と混同せず、実画面を読み直して結果を記録する。

## 是正と完了条件

blockingや必須未確認があればReportを保持したままTask5へ渡す。是正後は対象source / hash / 変更範囲、同役の再操作、期待 / 実際 / 証拠を追加し、必要な独立reviewを受ける。学習順序や制作契約を広く変えた場合は全通しの独立証拠を取り直す。役を途中で別の役へ引き継いで全52の単独完走と呼ばない。

完了は3役それぞれ52/52、全必須操作実証、全blocking0・必須未確認0と、有効な固定sourceへの結合が揃った場合だけである。技術test成功、旧部分試用、他役の合格、模擬理解の自己申告だけでは埋めない。

Reportは「エージェントによる模擬学習検証」と明記する。実人の理解受入・自然な誤解率・物理機器 / 音声支援技術・公開配信の成功はそれぞれ別証拠である。
