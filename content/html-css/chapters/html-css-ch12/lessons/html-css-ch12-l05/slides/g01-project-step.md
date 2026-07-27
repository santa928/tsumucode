---
id: html-css-ch12-l05-g01
title: 5観点を測ってProfileをPolishする
kind: guide
layout: code-preview
teachesConceptIds: [polish]
masteryTarget: compose
screenBudget: { maxTextCharacters: 410, maxCodeLines: 8, maxVisuals: 1 }
assets:
  - id: profile-polish-loop
    source: assets/profile-polish-loop.svg
    mediaType: image
    alt: Heading、Keyboard Focus、Contrast、画像alt、Viewportを順に測る最終確認ループ
    provenanceId: ch12-profile-polish-loop-original
---

Polishは装飾の追加ではなく、利用条件を変えても内容と操作が保たれるか測る工程です。1項目ずつ直し、合格済みの項目を壊していないか再判定します。

![Profile Siteの最終確認ループ](asset:profile-polish-loop)

```css
a:focus-visible {
  outline: 3px solid #ef7d4f;
  outline-offset: 4px;
}
```

`h1`は1つ、主要Sectionは`h2`、意味のある画像は説明的な`alt`にします。最後に390・768・1280・1440pxで横Overflowを測ります。

:::practice
prompt: 見た目が完成していてもKeyboard Focusを別に測る理由を答えます。
expectedAction: Mouseで見える状態だけではKeyboard操作可能性を確認できないためと説明する
estimatedMinutes: 2
:::

実習ではHeading、Keyboard Focus、Contrast、alt、4 Viewportの判定を順に通し、すべてが合格した時点を完成とします。
