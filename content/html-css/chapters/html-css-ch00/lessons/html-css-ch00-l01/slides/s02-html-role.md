---
id: html-css-ch00-l01-s02
title: HTMLは画面に載せる内容を受け持つ
kind: code
concept: html-content-and-meaning
layout: code-preview
teachesConceptIds: [html-role]
masteryTarget: read
screenBudget: { maxTextCharacters: 320, maxCodeLines: 2, maxVisuals: 1 }
assets:
  - id: preview-first-page
    source: assets/first-page-preview.svg
    mediaType: image
    alt: 学習ノートという題名と説明文が表示されたBrowser Preview
    provenanceId: ch00-first-page-preview-original
---

HTMLには画面へ載せる言葉を書きます。左の`h1`や`p`という印は次章で学ぶので、今は印の間にある日本語だけを見ます。日本語を書き換えると、右のPreviewも同じ言葉へ変わります。

```html
<h1>わたしの学習ノート</h1>
<p>今日からWeb制作を学びます。</p>
```

![HTMLの2行が題名と説明文として表示された結果](asset:preview-first-page)

:::practice
prompt: コードの「わたしの学習ノート」とPreviewの同じ言葉を指で往復します。
expectedAction: 画面の言葉を変えたいときはHTMLを見ると説明する
estimatedMinutes: 2
:::

次は言葉を変えず、CSSで背景だけを変えます。
