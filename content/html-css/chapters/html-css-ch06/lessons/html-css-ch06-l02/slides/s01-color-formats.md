---
id: html-css-ch06-l02-s01
title: 色の形式が違っても表示結果を比較できる
kind: comparison
concept: css-color-formats
assets: []
---

CSSではHex、`rgb()`、`hsl()`などで色を表せます。同じ表示色を違う形式で書けるため、正解判定ではSource TextではなくComputed Colorを見ます。

```css
/* どちらも同じ濃い青緑 */
.a {
  color: #2d5d62;
}
.b {
  color: rgb(45 93 98);
}
```

形式は目的に合わせて選び、Project内で読みやすい方針を保ちます。透明度を加えると背景との合成結果が変わる点にも注意します。

:::practice
prompt: "#2d5d62をRGBの各Channelへ読み替えます。"
expectedAction: rgb(45 93 98)と対応づける
estimatedMinutes: 2
:::

次は前景色と背景色の差を比率で確認します。
