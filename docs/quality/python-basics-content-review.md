# Python基礎の追加9教材の内容レビュー

Issue #147の公開前照合で、既存台帳には最初の1教材だけがあり、後続9教材のレビューが欠落していました。既存Gateで欠落9件を確認した後、2026-10-13にCodex `/root` が教材作者とは別のレビュー担当として、基準Source `e18b2975743558c6f67ef511469382990684f278` の後続9教材を実際に確認しました。人の初心者受講や公開承認を代行した記録ではありません。

対象は各Lessonの目標・前提・振り返り、全18Slideの本文・予測・コード・図の説明、演習指示・段階・Rule・Hint・Starter・Solution、および小ConsoleのBrief／Guideです。Python実践5教材の既存レビューは、今回変更していません。

## 教材別の判断

| Lesson   | 目標・説明と課題の照合                                                                                                                      | 結果      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| ch01-l02 | inputが返す文字列、引用符と変数、空の1行とEOF、固定採点と未採点練習を分ける。Sora・空文字列・日本語の実出力を確認。                         | 必須修正0 |
| ch01-l03 | int変換とValueError、if／elseの字下げ、18を含む境界を説明。17・18・19の出力と修正対象を照合。                                               | 必須修正0 |
| ch01-l04 | rangeの終了値を含まないこと、0／1／3回の反復、for内の表示を説明。観察後に課題の3回へ戻す案内がある。                                        | 必須修正0 |
| ch01-l05 | aliasの参照共有と再代入を分け、更新後4と合計9を照合。空List観察では更新・先頭表示を除く条件も説明する。                                     | 必須修正0 |
| ch01-l06 | Dictのkey／value、keyによる更新とforのkeyからの読出しを分ける。空Dictの観察範囲と加算の省略形も説明済み。                                   | 必須修正0 |
| ch01-l07 | 引数と外側の同名変数、returnとprint、定義と呼出しを区別。8／10／100およびreturnをprintへ変えたNoneを実行。                                  | 必須修正0 |
| ch01-l08 | 固定2fileのimportと呼出しを区別し、helper変更の次runへの反映を説明。任意moduleと一般のPythonの機能は課題範囲と分ける。                      | 必須修正0 |
| ch01-l09 | helperのValueError伝播、mainの限定except、try後の終了とtry前のinputを分ける。不正文字列・空文字列・符号／空白・EOFを照合。                  | 必須修正0 |
| ch02-l01 | 2行取得、helper、for集計、完成値の表示、ValueErrorだけの案内を既習概念へ接続。負数・不正1／2行目・入力不足と保存／JSON／ZIPの役割を分ける。 | 必須修正0 |

Hintは1→2→3で具体化し、解答を示す段階と最初の手掛かりを区別します。標準課題の説明済み別解と、直書き・使われない正しい構文を拒否する既存Ruleの目的が一致しています。静的図の説明を実行証拠には使っていません。実人の理解・学習時間・誤操作を観測したとは主張しません。

## 実行と内容hashの原本

固定CPython 3.14.2を非root・network none・read-only rootfs・CPU1／RAM256 MiB／PID64／tmp8 MiB・case期限5秒で実行し、通常stdin、実stdout、終了code、例外を保存しました。Solutionの入力・境界ケース、実Slideコードと継続文脈、振り返りの例を合わせて41ケース確認しています。これは作者の説明例の観測であり、学習者の提出に対する全採点Fixtureの再実行ではありません。採点／保存／移行の入力は未変更で、基準mainのRuntime CI [38360069214](https://github.com/santa928/tsumucode/actions/runs/38360069214) の有効な成功を再利用します。

初回の40ケースは成功しました。ch01-l09の第2Slideは第1Slideのimportを継続する例ですが、観測器が新規processでimportなしに単独実行してNameErrorを出しました。その初回原本を保持し、観測器へ第1Slideのimportだけを引き継ぎ、該当1ケースのみ再確認しました。教材のSource・期待出力・Ruleは変更していません。

私有原本は専用worktreeの `.release-issue147-checks/` に保存します。`review-examples-initial-result.json`、`review-slide-continuation-result.json`、観測器 `review-examples.py`、`python-basics-current-hashes.json`、初回と修正後のReview Gateログを対応付けます。生Source・入力・実行ログは公開pushへ含めません。公開用の品質bindingと全原本の独立照合は別途必要です。

| 私有原本                              | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| review-examples-initial-result.json   | `2bb0c71c6129ed5246d0ed1c689774923769ec42f93434863d0f9fd96055dd17` |
| review-slide-continuation-result.json | `58cae83dea5945dc50d209a41bd88105b0f3eaf04c072fac2047c1bc020a3913` |
| review-examples.py                    | `0ad5b9f11c7a01cea80021e970f087d4d5190d9f181146014d9ae09ee0bd0f4a` |
| python-basics-current-hashes.json     | `c71e331ccfe3af25912d5c7c4f70000a2e171be67e7b2e54422db8f841cd69ee` |

`content-review-python-basics.yaml` には実レビューした9件の現Lesson directory hashを追加します。最初の1件は現hash一致を確認して既存レビューを保持します。台帳全体をdraftに戻し、旧1教材の公開承認Source／distを新しい10教材の公開許可へ流用しません。既存 `python-release-approval.yaml` と承認履歴は変更しません。新公開候補のSource／tree／dist／品質・本人許可とのbindingが完了するまで公開Gateの承認は未完です。

## 残る受入

初心者の実受講、物理低性能端末、Python実践の性能予算と測定方法の受入、blocking findingの是正、公開候補の最終原本照合、専用公開契約と承認、Home／Path追加、配信後の主要操作は未完です。エージェントレビューと自動検証を実人の受講完了へ読み替えません。
