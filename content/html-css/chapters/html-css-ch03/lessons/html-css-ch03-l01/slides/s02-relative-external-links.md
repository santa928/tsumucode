---
id: html-css-ch03-l01-s02
title: 行き先に合わせてFragmentとhttpsを選ぶ
kind: comparison
concept: safe-link-destinations
layout: code-preview
teachesConceptIds: [fragment-link, external-link]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: preview-fragment-external
    source: assets/link-destinations-preview.svg
    mediaType: image
    alt: Fragment Linkとhttpsの外部Linkが異なる行き先へつながる比較
    provenanceId: ch03-link-destinations-original
---

同じページ内へ移動するhrefは`#`と到着点のid、外部Webページへ移動するhrefはhttps Schemeで始めます。

```html
<nav>
  <a href="#practice">練習内容を見る</a>
  <a href="https://example.com/">外部の練習用Siteを見る</a>
</nav>
```

![ページ内Linkと外部Link](asset:preview-fragment-external)

Link Textは「ここ」ではなく、移動先で分かることを書きます。TsumuCodeは`javascript:`などCodeを実行するURLを除去します。

実習の2つ目はLink Textが用意済みです。hrefだけを`#external`から直前のCode例にある外部URLへ変更します。

:::practice
prompt: ページ内のProfileと外部の練習用Siteに、どちらのhref形式を使うか選びます。
expectedAction: ProfileはFragment、外部Siteはhttpsと分類する
estimatedMinutes: 2
:::

次の実習では、2つのa要素のhrefだけを行き先に合わせて直します。
