---
id: html-css-ch12-l02-g01
title: NavigationとHeroで入口を明確にする
kind: guide
layout: code-preview
teachesConceptIds: [navigation, hero]
masteryTarget: compose
screenBudget: { maxTextCharacters: 390, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: navigation-hero-map
    source: assets/navigation-hero-map.svg
    mediaType: image
    alt: NavigationからHeroの名前、画像、主要リンクへ視線が進む図
    provenanceId: ch12-navigation-hero-map-original
---

Navigationはページ内の道案内、Heroは「誰のページで、次に何ができるか」を伝える入口です。見た目より先に名前とDOM順を整えます。

![NavigationとHeroの情報順序](asset:navigation-hero-map)

```html
<nav aria-label="プロフィール内"><a href="#about">About</a><a href="#works">Works</a></nav>
<section class="hero">
  <img src="profile.svg" alt="Code Cardを持つつむぎ" />
  <h1>つむぎの学習プロフィール</h1>
  <a href="#works">つむぎの作品を見る</a>
</section>
```

:::practice
prompt: Primary Linkを「見る」ではなく「つむぎの作品を見る」と書く理由を答えます。
expectedAction: Linkだけを読んでも移動先を予測できるためと説明する
estimatedMinutes: 2
:::

実習では工程1のLandmarkを残し、Header内のNavigationとHeroの4要素を追加します。
