---
id: html-css-ch07-l01-r01
title: 5つの観点を1枚のProfile Cardへ統合する
kind: reflection
layout: code-preview
teachesConceptIds: [profile-card-integration]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 1 }
assets:
  - id: profile-assembly-map
    source: assets/profile-assembly.svg
    mediaType: image
    alt: Structure、Image、Sizing、Typography、ContrastをProfile Cardへ統合する手順図
    provenanceId: ch07-profile-assembly-original
---

新しい構文は増えません。既習の5観点を、上から1つずつProfile Cardへ重ねます。実習中も「前のスライド」でこの見本へ戻れます。

![Profile Cardを完成する5つの観点](asset:profile-assembly-map)

HTMLではCardを`article`へ変え、画像へ内容の分かる`alt`を書きます。

```html
<article data-profile-card>
  <img src="avatar.svg" alt="Code Cardを持つAoiのAvatar" />
</article>
```

CSSではSizing、Padding、文字色、行間を順に直します。

```css
[data-profile-card] {
  box-sizing: border-box;
  width: 100%;
  padding: 24px;
  color: #24323d;
}
[data-bio] {
  line-height: 1.5;
}
```

:::practice
prompt: HTMLの2項目とCSSの4項目を、実習で直す順に言います。
expectedAction: article、alt、Sizing、Padding、Color、Line Heightの順に確認する
estimatedMinutes: 3
:::

次の実習では、この6 Stepを判定結果で1つずつ確認します。
