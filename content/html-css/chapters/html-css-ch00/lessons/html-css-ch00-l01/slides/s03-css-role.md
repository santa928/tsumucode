---
id: html-css-ch00-l01-s03
title: CSSは見た目の約束をまとめる
kind: code
concept: css-visual-rules
assets: []
---

CSSは、HTMLで意味を付けたElementをどの色や余白で見せるか決めます。波かっこの前で対象を選び、波かっこの中へ変えたい見た目と値を書きます。このひとまとまりをCSS Ruleと呼びます。

次のRuleはページ全体の背景色を生成り色にします。HTMLの題名や文章は変えず、見た目だけを変えられるため、内容と装飾を別々に直せます。

```css
body {
  background-color: #fffaf0;
}
```

:::practice
prompt: 色の値を一度別の色へ変え、Previewの背景だけが変わることを確認してから元へ戻します。
expectedAction: HTMLの文章は同じままCSSが背景色だけを変えることを観察する
estimatedMinutes: 2
:::

次の演習では、HTMLの見出しとCSSの背景色を1箇所ずつ編集して、2つの役割を使い分けます。
