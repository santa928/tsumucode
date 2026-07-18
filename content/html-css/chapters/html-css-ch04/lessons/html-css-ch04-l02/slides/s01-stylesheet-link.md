---
id: html-css-ch04-l02-s01
title: link要素でHTMLとStylesheetを接続する
kind: code
concept: stylesheet-link
assets: []
---

外部Stylesheetを使うときは、HTMLのhead内で`link`要素からCSS Fileを読み込みます。

```html
<link rel="stylesheet" href="styles.css" />
```

`rel="stylesheet"`は関係、`href="styles.css"`はWorkspace内のFile名を示します。FileがあってもlinkがなければBrowserはそのCSSを適用できません。

:::practice
prompt: relとhrefのどちらがFile名を指し、どちらが関係を示すか答えます。
expectedAction: 2属性の役割を区別し、headへ置く理由を説明する
estimatedMinutes: 2
:::

次は、Stylesheet内のDeclaration構文を直します。
