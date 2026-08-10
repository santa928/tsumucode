---
id: javascript-ch06-l03-s01
title: 続けられない値をErrorとして知らせる
kind: concept
concept: Errorの役割
layout: explanation
teachesConceptIds: [error-purpose]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

問題文が空のまま表示処理を続けると、学習者には「何も表示されない」ように見え、原因を探しにくくなります。

処理を続けられない理由をErrorとして明示すると、呼び出した側が理由を受け取り、次の対応を決められます。

今回は空の`text`を見つけたら、問題文がないことを知らせます。

:::practice
prompt: 空の問題文を何として知らせるか答えます。
expectedAction: Errorと答える
estimatedMinutes: 1
:::
