---
id: html-css-ch04-l02-s02
title: DeclarationはPropertyとValueを正しい記号で結ぶ
kind: comparison
concept: declaration-syntax
layout: code-preview
teachesConceptIds: [css-property-value, colon-semicolon]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: css-declaration-map
    source: assets/stylesheet-connection.svg
    mediaType: image
    alt: CSS DeclarationのProperty、Colon、Value、Semicolonを順に示す図
    provenanceId: ch04-stylesheet-connection-original
---

Declarationは`Property: Value;`の順です。Colon、Semicolon、波括弧が欠けるとParserは意図を読めず、Code Errorになります。

```css
.card {
  background-color: #ffffff;
  color: #24323d;
}
```

![Declarationを読む順序](asset:css-declaration-map)

実習では`color: #24323d;`は完成済みです。`background-color`のValueだけを`#fffaf0`から`#ffffff`へ直し、正しい文字色は残します。Diagnosticがあれば記号を先に確認します。

:::practice
prompt: Colon不足と#fffaf0というValue違いを、Code Errorと未達へ分類します。
expectedAction: 構文とComputed結果を別々に確認する
estimatedMinutes: 2
:::

次の実習ではStylesheet接続とDeclarationの両方を修正します。
