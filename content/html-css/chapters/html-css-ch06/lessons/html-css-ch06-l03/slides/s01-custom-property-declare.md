---
id: html-css-ch06-l03-s01
title: Custom Propertyへ意味のある名前を付ける
kind: code
concept: custom-property-declaration
assets: []
---

Custom Propertyは`--`から始まる名前で値を保持します。Document全体で共有する値は`:root`へ宣言できます。

```css
:root {
  --color-primary: #2d5d62;
}
```

`--green`のように見た目だけで名付けるより、`--color-primary`のように役割を表すと、色が変わっても名前の意味が残ります。

:::practice
prompt: Brandの主要色を複数部品で共有するCustom Property名を考えます。
expectedAction: --color-primaryのように役割で名付ける
estimatedMinutes: 2
:::

次は`var()`で共有値を読み出します。
