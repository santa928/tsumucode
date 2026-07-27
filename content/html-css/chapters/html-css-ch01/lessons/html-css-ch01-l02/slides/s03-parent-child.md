---
id: html-css-ch01-l02-s03
title: pをmainのChildへ移して関係を直す
kind: comparison
concept: parent-child-structure
layout: comparison
teachesConceptIds: [html-parent-child, nesting, indentation]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 8, maxVisuals: 0 }
assets: []
---

左の考え方では`p`が`main`の終了Tagより後ろにあり、mainのChildではありません。演習ではpの1行を切り取り、mainを閉じる直前へ2文字下げて置きます。Tagを新しく覚えて書く課題ではありません。

```html
<main>
  <h1>学習プロフィール</h1>
</main>
<p>親子関係を練習しています。</p>
```

:::practice
prompt: pをどの2行の間へ移すとmainのChildになるか指します。
expectedAction: h1の後、mainの終了Tagより前へpを移す
estimatedMinutes: 2
:::

次の演習では、既存のpを移動して字下げします。
