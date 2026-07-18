---
id: html-css-ch06-l03-s02
title: var関数で1つの値を複数箇所へ届ける
kind: concept
concept: custom-property-use
assets: []
---

Custom Propertyは`var(--name)`で利用します。Buttonの背景とTagの文字へ同じPrimary Colorを使えば、宣言を1箇所変えるだけで両方へ反映できます。

```css
.action {
  background-color: var(--color-primary);
}
.tag {
  color: var(--color-primary);
}
```

正しく届いたかは、最終的なComputed Colorを見て確かめます。Sourceの書き方を丸暗記せず、共有した結果を観察します。

:::practice
prompt: --color-primaryを書き換えたときに変化する2つの部品を確認します。
expectedAction: actionの背景とtagの文字が一緒に変わると説明する
estimatedMinutes: 2
:::

次の実習では1つの値を2箇所へ再利用します。
