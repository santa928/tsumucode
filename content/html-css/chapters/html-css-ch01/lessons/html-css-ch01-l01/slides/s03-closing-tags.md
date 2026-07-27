---
id: html-css-ch01-l01-s03
title: 開いたTagを同じ名前で閉じる
kind: comparison
concept: closing-tags
layout: comparison
teachesConceptIds: [opening-closing-tag]
masteryTarget: read
screenBudget: { maxTextCharacters: 350, maxCodeLines: 4, maxVisuals: 0 }
assets: []
---

開始Tagを見つけたら、同じ名前の終了Tagまでを1組として読みます。右の正しい例は`h1`と`p`がそれぞれ閉じています。終了Tagを忘れると、Browserが後ろの内容まで同じ箱として補うことがあります。

```html
<h1>わたしのプロフィール</h1>
<p>小さな一歩を積み上げます。</p>
```

:::practice
prompt: h1とpの開始Tagから、対応する終了Tagへ視線を動かします。
expectedAction: 終了側のslashと、開始・終了で同じTag名を確認する
estimatedMinutes: 2
:::

次は、用意されたh1とpの中身を埋めます。
