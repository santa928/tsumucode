---
id: 'next-ch03-l02-s04'
title: '失敗から戻って確かめる'
kind: 'reflection'
concept: '対象なしは取得失敗と分ける'
layout: 'checkpoint'
teachesConceptIds: [next-not-found]
masteryTarget: 'transform'
screenBudget: { 'maxTextCharacters': 420, 'maxCodeLines': 12, 'maxVisuals': 0 }
assets: []
---

clearの正常表示、slowの待機から結果、flakyの失敗から再試行、missingの対象なしを比べます。表示を同じ文字列へ置き換えるだけでは、状態の切り替えを確認できません。

修正したら保存して反映し、その版を判定します。実行を停止しても下書きは残ります。停止して起動し直すと制御データも初回失敗の条件へ戻ります。接続を再開した後も、保存したコードと新しい応答を対応させて観察します。

:::prediction
prompt: "以前の版で合格した後にerror.tsxを書き換えました。その合格を新しい版の証拠にできますか。"
answer: "できません。保存・反映後にもう一度判定します。"
explanation: "合格記録は判定した保存版に対応しています。"
:::
