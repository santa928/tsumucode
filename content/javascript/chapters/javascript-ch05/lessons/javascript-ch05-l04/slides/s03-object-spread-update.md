---
id: javascript-ch05-l04-s03
title: spreadでObjectの項目を引き継ぐ
kind: code
concept: Object spreadによる更新
layout: comparison
teachesConceptIds: [object-spread-update]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

Objectの中の`...question`は、元Objectのpropertyを新しいObjectへ展開するspread syntaxです。その後ろへ同じproperty名を書くと、新しい値で上書きされます。

```js
return {
  ...question,
  answered: true,
};
```

`text`は引き継ぎ、`answered`だけを`true`にした新しいObjectを返します。

:::practice
prompt: 新しいObjectで変更するpropertyを答えます。
expectedAction: answeredだけをtrueにすると答える
estimatedMinutes: 1
:::
