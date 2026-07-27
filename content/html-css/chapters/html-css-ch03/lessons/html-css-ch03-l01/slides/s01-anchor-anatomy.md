---
id: html-css-ch03-l01-s01
title: a要素は行き先と説明を1組にする
kind: concept
concept: anchor-anatomy
layout: code-preview
teachesConceptIds: [anchor-element, href-attribute]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: preview-link-destinations
    source: assets/link-destinations-preview.svg
    mediaType: image
    alt: hrefの値がLink Textと同じページ内の到着点を結ぶ図
    provenanceId: ch03-link-destinations-original
---

Linkは`a`要素で作ります。`href`属性へ行き先、開始Tagと終了Tagの間へLink Textを書き、1組にします。

```html
<a href="#practice">練習内容を見る</a>
<section id="practice">
  <h2>練習内容</h2>
</section>
```

`#practice`は、同じページ内で`id="practice"`を持つ場所を示します。`#`の後ろとidの値を一致させます。

![hrefとページ内の到着点](asset:preview-link-destinations)

実習ではa要素も到着点も用意済みです。「練習内容を見る」のhrefだけを`#overview`から`#practice`へ直します。Link Textとsection idは残します。

:::practice
prompt: 「ここをClick」と「練習内容を見る」のどちらが行き先を予測できるか比べます。
expectedAction: 文脈から切り離しても目的が分かるLink Textを選ぶ
estimatedMinutes: 2
:::

次は2つ目のa要素を、外部Siteへ結びます。
