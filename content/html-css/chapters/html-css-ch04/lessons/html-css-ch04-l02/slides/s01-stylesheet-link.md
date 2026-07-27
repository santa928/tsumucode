---
id: html-css-ch04-l02-s01
title: link要素でHTMLとStylesheetを接続する
kind: code
concept: stylesheet-link
layout: code-preview
teachesConceptIds: [stylesheet-link]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: stylesheet-connection
    source: assets/stylesheet-connection.svg
    mediaType: image
    alt: index.htmlのlinkがstyles.cssへ接続しCardへStyleを届ける図
    provenanceId: ch04-stylesheet-connection-original
---

HTMLとCSSは別Fileです。head内の`link`要素でStylesheetを読み込むと、CSS Ruleがページへ届きます。

```html
<link rel="stylesheet" href="styles.css" />
```

![HTMLからStylesheetへの接続](asset:stylesheet-connection)

`rel="stylesheet"`は関係、`href="styles.css"`は読み込むFile名です。実習のhrefは`theme.css`になっているため、実在する`styles.css`へ直します。

:::practice
prompt: theme.cssを指すhrefと、Workspaceのstyles.cssを見比べます。
expectedAction: hrefだけをstyles.cssへ直せば接続できると説明する
estimatedMinutes: 2
:::

次は、Stylesheet内のDeclaration構文を直します。
