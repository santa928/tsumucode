---
id: html-css-ch04-l01-s01
title: CSS Ruleは対象と変更内容を1組にする
kind: concept
concept: css-rule-anatomy
layout: code-preview
teachesConceptIds: [css-rule, declaration]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: css-rule-map
    source: assets/css-rule-map.svg
    mediaType: image
    alt: p Selectorとcolor PropertyとValueを1つのCSS Ruleとして分解した図
    provenanceId: ch04-css-rule-map-original
---

CSS Ruleは「どれを」「どうする」を1組にします。Selectorが対象、波括弧の中のDeclarationが変更内容です。

```css
p {
  color: #24323d;
}
```

![CSS Ruleの4つの部品](asset:css-rule-map)

`p`がSelector、`color`がProperty、`#24323d`がValueです。ColonはPropertyとValueを結び、SemicolonはDeclarationを閉じます。実習では既にある2つのRuleのValueだけを直します。

:::practice
prompt: 図とCodeでSelector、Property、Value、Semicolonを順に探します。
expectedAction: 4つの役割を指し、Ruleを「どれをどうする」で説明する
estimatedMinutes: 2
:::

次は、Tag名をそのまま使うType Selectorの届く範囲を確認します。
