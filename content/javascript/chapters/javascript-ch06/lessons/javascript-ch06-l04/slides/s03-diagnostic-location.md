---
id: javascript-ch06-l04-s03
title: Fileと行から原因候補を絞る
kind: diagram
concept: 診断位置
layout: explanation
teachesConceptIds: [diagnostic-location]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

診断のFileと行は「まず確認する場所」です。演習の工程票は`script.js`の1行目にある`questionCount`を示します。

3問あるのに`questionCount`が`2`なら、実際値20の原因と説明できます。`pointsPerQuestion`の10や掛け算は期待どおりです。

確認場所を絞ったら、関係する数値1つだけを直して再実行します。

:::practice
prompt: 今回確認する変数名を答えます。
expectedAction: questionCountと答える
estimatedMinutes: 1
:::
