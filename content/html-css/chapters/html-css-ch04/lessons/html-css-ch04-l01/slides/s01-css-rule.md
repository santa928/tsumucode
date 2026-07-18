---
id: html-css-ch04-l01-s01
title: CSS Ruleは対象と変更内容を1組にする
kind: concept
concept: css-rule-anatomy
assets: []
---

CSS Ruleは、Styleを適用する対象を示すSelectorと、波括弧の中のDeclaration Blockでできています。

```css
p {
  color: #24323d;
}
```

`p`がSelector、`color`がProperty、`#24323d`がValueです。ColonはPropertyとValueを分け、Semicolonは1つのDeclarationを閉じます。

:::practice
prompt: Code例でSelector、Property、Value、Semicolonを順に指します。
expectedAction: 4つの役割を区別し、Rule全体を自分の言葉で説明する
estimatedMinutes: 2
:::

次は、Tag名をそのまま使うType Selectorの届く範囲を確認します。
