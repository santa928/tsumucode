---
id: javascript-ch05-l04-s01
title: 元の状態を残して次の状態を作る
kind: concept
concept: immutable updateの役割
layout: explanation
teachesConceptIds: [immutable-update-purpose]
masteryTarget: read
screenBudget: { maxTextCharacters: 310, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

回答前の問題と回答後の問題を両方比べたいとき、元のObjectを直接書き換えると「回答前」が失われます。

元データを変更せず、変更を反映した新しいデータを作る方法をimmutable updateと呼びます。状態の前後が混ざらず、どの処理で変わったか追いやすくなります。

:::practice
prompt: immutable updateで残すものを答えます。
expectedAction: 更新前の元データと答える
estimatedMinutes: 1
:::
