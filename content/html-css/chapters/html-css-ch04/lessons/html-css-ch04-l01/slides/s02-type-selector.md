---
id: html-css-ch04-l01-s02
title: Type Selectorは同じ種類のElementへ届く
kind: concept
concept: type-selector
assets: []
---

Type Selectorは、`p`や`h2`のようなTag名でElementを選びます。ページ内の同じ種類すべてに共通Styleを設定したいときに向いています。

```css
p {
  color: #2d5d62;
}
```

このRuleはClass名に関係なくすべてのpへ届きます。1つだけ変えたいのにType Selectorを使うと範囲が広すぎるため、対象の共通点を先に考えます。

:::practice
prompt: 3つのParagraphすべてを同じ色にするSelectorを予測します。
expectedAction: Tag名pを使う理由と適用範囲を説明する
estimatedMinutes: 2
:::

次は、一部だけを選ぶClass Selectorを使います。
