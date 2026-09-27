---
id: html-css-ch00-l01-s03
title: CSSは色などの見た目を受け持つ
kind: code
concept: css-visual-rules
layout: code-preview
teachesConceptIds: [css-role]
masteryTarget: read
screenBudget: { maxTextCharacters: 330, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: preview-first-page-css
    source: assets/first-page-preview.svg
    mediaType: image
    alt: 生成り色の背景で学習ノートが表示されたBrowser Preview
    provenanceId: ch00-first-page-preview-original
---

CSSは、HTMLの言葉を変えずに色や余白などの見た目を変えます。記号の詳しい読み方はChapter 04で学びます。今は`background-color:`の右にある`#fffaf0`が背景色の値だと確認します。

```css {"label":"styles.css・背景色の例", "role":"input", "resultAssetId":"preview-first-page-css", "highlightedLines":[2]}
body {
  background-color: #fffaf0;
}
```

![CSSの色がページ背景へ反映された結果](asset:preview-first-page-css)

:::prediction
prompt: HTMLの見出しの言葉だけを変えました。背景色も変わるでしょうか？
answer: 背景色は生成り色のままです。
explanation: 言葉はHTML、背景色はCSSが受け持ちます。styles.cssの色の値を変えていないため、背景色は変わりません。
:::

CSSの色を変えても、HTMLの言葉は変わりません。次はどちらのファイルを直すか選びます。
