---
id: html-css-ch12-l01-g01
title: 読み手からSemantic Outlineを組み立てる
kind: guide
layout: code-preview
teachesConceptIds: [audience, outline]
masteryTarget: compose
screenBudget: { maxTextCharacters: 380, maxCodeLines: 10, maxVisuals: 1 }
assets:
  - id: audience-outline-flow
    source: assets/audience-outline-flow.svg
    mediaType: image
    alt: 読み手の目的をheader、main、footerの順序へ変換する流れ
    provenanceId: ch12-audience-outline-flow-original
---

最初に「誰へ何を伝えるか」を1文にします。その文を判断軸にすると、導入は`header`、中心内容は`main`、補足は`footer`へ分けられます。

![AudienceからSemantic Outlineを決める流れ](asset:audience-outline-flow)

```html
<header>
  <p data-audience>Web制作を学び始めた友人へ紹介します。</p>
</header>
<main>
  <section><h1>つむぎの学習プロフィール</h1></section>
</main>
<footer>つむぎの学習記録</footer>
```

:::practice
prompt: 作品紹介をページの中心内容として置くなら、どのLandmarkの中へ入れるか答えます。
expectedAction: mainの中へ置くと答え、中心内容だからと説明する
estimatedMinutes: 2
:::

実習では仮の`div`を消し、Audience文と3つのLandmarkを自分で組み立てます。CSSはまだ変更しません。
