# Python入力L2の独立AI受入

2026-11-04に、`python-basics/python-basics-ch01-l02` の途中入力に関する説明を独立AIで確認した。既存のSourceレビューを新しいUI受入に付け替えず、変更された1教材の不足する4役だけを補った。実人の受講や理解を観測した記録ではない。

## 固定した対象

- Source: `fca28b5e6854640bfae4ad03366ff6c6853ce727`
- Git tree: `915124622053ffcb847053aa1189571d6bfa5e07`
- learnerDigest: `dc31eff6b1d6104e2968f9915c33aa4b3d0ac1131134e7387a51a3bf237a00c1`
- 実際のCI run: [41816630544](https://github.com/santa928/tsumucode/actions/runs/41816630544)、artifact `13314399795`
- ZIPの実測SHA-256: `4e3fb04cd297d93f088a95a43063f782bab0ccb53a882fe0292af47fa5a0e3d4`

ZIPの実測値とAPIのdigest、成果物のSource/tree表示を照合した。展開した589ファイルの全bytesと、配信したindex・catalog・Python index・L2 JSONのHTTP応答も元ZIPと一致した。UI観測は読み取り専用の固定配信物で、3役それぞれ別agentと専用in-memory Chromeを使い、ブラウザを順次操作した。

## 確認した範囲

| 役       | 独立担当                     | 実施した確認                                                                                                            |
| -------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| content  | `l2-content-review-20261104` | 全15ファイル、目標・前提・全Slide/Hint/Rule/Fixtureを照合。CPython 3.14.3で掲載例等18ケースを実行した。                 |
| novice   | `l2-novice-20261104`         | 全2Slide、Sora/空行、未採点の対話練習、通常判定、reload後のコード保持と入力非保存。後からL1の前提説明を実UIで確認した。 |
| recovery | `l2-recovery-20261104`       | 不一致・誤編集、保存とコースからの再開、修正、練習のEOF/空行/中止、通常判定、全3段階Hint。                              |
| maker    | `l2-maker-20261104`          | `food`への変更、日本語等の別入力、判定、保存と再開、練習の文字/空行/EOF、reload後の保存境界、全3段階Hint。              |

初回観測を閉じるまで、各UI担当へ作者のSource・Solution・Fixture・Validatorや他役の結果を渡していない。非閲覧や操作時刻の一部は担当自身の記録に基づく。実際のDOM、操作log、閲覧した画像と対応付けて保持する。

初学者役のL2単独での未説明語2件は削除していない。別時刻のL1実UI確認で変数・代入の明示説明を確認し、L2の既定の前提を含めた判断を別記録にした。Hintは作例と段階的な解答提示を区別し、独力で構成できる能力の証明へ広げていない。

用語補助、構文エラーの日本語補足、Consoleへのスクロール、説明力をUIが自動評価しない点は、任意改善または評価限界として原本に残す。maker原本の実行例の対応誤記は本人が訂正し、訂正前の原本と実画面の証拠も保持した。

## 原本と公開ゲート

原本の公開用bindingには[既存v2のreceipt](content-v2-receipts.json)を使う。作者と4役の担当とは別の `l2-original-inspector-20261104` が原本・証拠のbytes/hash・版と判定範囲を照合し、既存の `inspect-content` でGit archiveの実Source inventoryと照合する。生の観測原本や入力は公開pushに含めない。

この受入は対象教材と各役の実観測範囲に限る。Local CPython、他ブラウザ、全上限・性能、正式候補の技術検証、実サイトの配信確認はそれぞれの検証記録で扱う。[#196](https://github.com/santa928/tsumucode/issues/196) と [#140](https://github.com/santa928/tsumucode/issues/140) の完了は、必要CI・公開・公開後確認が揃ってから判断する。
