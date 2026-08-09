---
id: javascript-ch05-l01-s01
title: 全要素を同じルールで変換する
kind: concept
concept: mapの役割
layout: explanation
teachesConceptIds: [map-purpose]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

問題文が3件あるとき、すべての先頭へ`問題: `を付けたいとします。`for...of`でも書けますが、変換後のArrayを自分で用意して追加する手順が必要です。

`map`は、元Arrayの要素を1つずつ同じルールで変換し、その結果を新しいArrayへまとめるmethodです。「全件を別の形へ変える」ときに使います。

:::practice
prompt: mapを使う目的を答えます。
expectedAction: Arrayの全要素を同じルールで変換すると答える
estimatedMinutes: 1
:::
