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

```css
body {
  background-color: #fffaf0;
}
```

![CSSの色がページ背景へ反映された結果](asset:preview-first-page-css)

:::practice
prompt: CSSの#fffaf0とPreviewの生成り色の背景を見比べます。
expectedAction: 言葉は同じままCSSが背景の見た目を変えたと説明する
estimatedMinutes: 2
:::

次は、HTMLとCSSのどちらを直すか選びます。
