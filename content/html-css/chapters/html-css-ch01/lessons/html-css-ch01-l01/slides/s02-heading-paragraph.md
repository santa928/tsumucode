---
id: html-css-ch01-l01-s02
title: ページの題名はh1、文章はpで表す
kind: code
concept: heading-and-paragraph
layout: code-preview
teachesConceptIds: [heading-h1, paragraph-p]
masteryTarget: read
screenBudget: { maxTextCharacters: 350, maxCodeLines: 2, maxVisuals: 1 }
assets:
  - id: preview-heading-paragraph
    source: assets/heading-paragraph-preview.svg
    mediaType: image
    alt: h1の題名とpの文章が順に表示されたBrowser Preview
    provenanceId: ch01-heading-paragraph-preview-original
---

`h1`はページ全体を代表する題名、`p`はひとまとまりの文章です。開始Tagと終了Tagの間へ内容を書きます。文字の大きさではなく、内容の役割で選びます。

```html
<h1>わたしのプロフィール</h1>
<p>Web制作を学んでいます。</p>
```

![h1とpをBrowserが役割に合わせて表示した結果](asset:preview-heading-paragraph)

:::practice
prompt: コードの2行とPreviewを見比べ、題名と文章を指します。
expectedAction: 題名はh1、説明文はpへ入れると説明する
estimatedMinutes: 2
:::

次は、Tagの閉じ忘れを見つける読み方です。
