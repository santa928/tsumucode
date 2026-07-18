---
id: html-css-ch04-l01-s03
title: Class Selectorは役割を共有するElementを選ぶ
kind: comparison
concept: class-selector
assets: []
---

Class Selectorは、HTMLの`class`属性へ付けた名前を、CSSでPeriodから始めて選びます。Tagの種類が違っても同じ役割へStyleを再利用できます。

```html
<p class="accent">今日の発見</p>
```

```css
.accent {
  color: #9a3f25;
}
```

Class名は色そのものではなく`accent`のような役割で付けると、見た目を変更しても意味が残ります。

:::practice
prompt: すべてのpとaccentだけを変える場合のSelectorをそれぞれ選びます。
expectedAction: pと.accentの適用範囲を比べる
estimatedMinutes: 2
:::

次の実習ではType SelectorとClass Selectorを別の色へ設定します。
