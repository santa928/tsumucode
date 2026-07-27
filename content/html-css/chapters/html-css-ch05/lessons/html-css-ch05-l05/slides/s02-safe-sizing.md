---
id: html-css-ch05-l05-s02
title: 100%とborder-boxで親の内側へ収める
kind: concept
concept: safe-container-sizing
layout: code-preview
teachesConceptIds: [safe-sizing]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: safe-sizing-contained
    source: assets/safe-sizing.svg
    mediaType: image
    alt: width 100%とborder-boxで320pxのFrame内へ収まるCardの図
    provenanceId: ch05-safe-sizing-original
---

`width: 100%;`は親のContent幅を使います。さらに`box-sizing: border-box;`を先に書くと、PaddingとBorderを100%の内側へ含められます。

![Frame内へ収まる安全なSizing](asset:safe-sizing-contained)

実習では`.safe-card`の先頭へ`box-sizing`を加え、Widthを360pxから100%へ変えます。さらに固定された`height: 240px;`を削除すると、Heightは初期値の`auto`へ戻り、Contentに必要な高さへ縮みます。

```css
.safe-card {
  box-sizing: border-box;
  width: 100%;
}
```

:::practice
prompt: CardのrightとbottomをFrame内へ戻す3つの操作を答えます。
expectedAction: box-sizing border-box、width 100%、固定heightの削除を答える
estimatedMinutes: 2
:::

次の実習では、Sourceを3箇所直し、横Overflowとright／bottomの実寸で確認します。
