---
id: html-css-ch11-l02-s02
title: label、alt、Link Textを役割に合わせる
kind: comparison
concept: accessible-name-sources
layout: code-preview
teachesConceptIds: [label-text, link-text, alt-text]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 7, maxVisuals: 1 }
assets:
  - id: accessible-name-code-map
    source: assets/accessible-name-code-map.svg
    mediaType: image
    alt: label、alt、Link TextがそれぞれInput、画像、Linkへ名前を届ける図
    provenanceId: ch11-accessible-name-code-map-original
---

Form Controlには`label`、意味のある画像には内容を表す`alt`、Linkには移動先を予測できるTextを使います。

![3種類のAccessible Name Source](asset:accessible-name-code-map)

```html
<label for="display-name">表示名</label>
<input id="display-name" />
<img src="profile.svg" alt="Code Cardを持つ学習者" />
<a href="#works">HTML/CSS作品を見る</a>
```

`for`と`id`は同じ値で結びます。「こちら」だけのLink Textは避け、単独で読んでも行き先が分かる言葉にします。

:::practice
prompt: Starterで未完成のInputと画像へ使う2つの要素・属性を答えます。
expectedAction: labelとaltを使うと答える
estimatedMinutes: 2
:::

次の実習では、完成済みのLink Textを残し、`span`を`label`へ、空の`alt`を説明文へ変更します。
