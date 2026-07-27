---
id: html-css-ch02-l03-s03
title: sectionとarticleは内容の独立性で選ぶ
kind: comparison
concept: section-and-article
layout: code-preview
teachesConceptIds: [section-article]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: preview-section-article
    source: assets/landmark-map-preview.svg
    mediaType: image
    alt: mainの中に見出し付きsectionが入ったページ構造
    provenanceId: ch02-landmark-map-original
---

`section`は、見出しを持つページ内の話題です。`article`は投稿のように、その部分だけを取り出しても独立して読める内容です。

```html
<main>
  <section>
    <h2>今日の発見</h2>
  </section>
</main>
```

![main内のsection](asset:preview-section-article)

実習の「今日の発見」はページ内の1話題なのでsectionを選びます。topicクラスを残し、内側のdivの開始Tagと終了Tagだけを変更します。

:::practice
prompt: 学習記録ページ内の「次の目標」をsectionとarticleのどちらで表すか考えます。
expectedAction: ページ内の1話題なのでsectionを選び、独立記事との違いを述べる
estimatedMinutes: 2
:::

次の実習では外側3領域を直した後、main直下のtopicをsectionへ直します。
