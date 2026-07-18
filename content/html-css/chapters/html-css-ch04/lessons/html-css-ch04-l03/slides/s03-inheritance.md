---
id: html-css-ch04-l03-s03
title: 一部のPropertyはParentからChildへ継承される
kind: concept
concept: css-inheritance
assets: []
---

`color`や`font-family`など一部のPropertyは、Childに直接ValueがなければParentのComputed Valueを受け取ります。これをInheritanceと呼びます。

```css
.card {
  color: #2d5d62;
}
```

cardの中のpへcolorを直接書かなくても、そのpはParentの色を継承します。一方、marginのように通常は継承されないPropertyもあります。

:::practice
prompt: card内のpにcolor指定がないとき、どこから色を受け取るか探します。
expectedAction: 最も近いParentのComputed Colorをたどる
estimatedMinutes: 2
:::

次の実習ではSource OrderとInheritanceを使い、importantなしで目標色を作ります。
