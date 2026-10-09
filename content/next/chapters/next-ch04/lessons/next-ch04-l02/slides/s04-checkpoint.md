---
id: next-ch04-l02-s04
title: 入力・失敗・再試行を確かめる
kind: reflection
concept: 同じメモの再試行
layout: checkpoint
teachesConceptIds: [next-action-pending]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

空白3文字は検証エラー、通常のメモの初回は一時失敗、同じ内容の再送は保存1回です。HTTP200だけで成功と判断せず、Previewでstatusに対応した案内・入力・保存回数を観察します。TabとEnterでも操作し、待機中は入力と送信が無効になることを確認します。

別のメモへ入力を変えたら、以前の保存結果が消えることも確かめます。修正したSourceを保存・反映して判定してください。停止後もコードの下書きは残り、練習用の保存履歴は起動し直すと初期化されます。

:::prediction
prompt: "合格後にServerの検証を書き換えました。以前の合格は新しい版の証拠ですか。"
answer: "いいえ。保存・反映後にもう一度判定します。"
explanation: "合格記録は判定したSource版に対応します。"
:::
