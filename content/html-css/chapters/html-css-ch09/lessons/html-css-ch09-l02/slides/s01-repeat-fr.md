---
id: html-css-ch09-l02-s01
title: repeatは同じTrack定義をまとめる
kind: code
concept: repeat-fr-tracks
layout: code-preview
teachesConceptIds: [repeat-function, fr-unit]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: repeat-three-tracks
    source: assets/repeat-fr-calculation.svg
    mediaType: image
    alt: 3つの等幅Trackをrepeat関数でまとめる対応図
    provenanceId: ch09-repeat-fr-calculation-original
---

同じ列幅を繰り返すときは`repeat(回数, Track幅)`でまとめられます。`1fr 1fr 1fr`なら`repeat(3, 1fr)`です。

![3つのTrackとrepeatの対応](asset:repeat-three-tracks)

```css
.gallery {
  grid-template-columns: repeat(3, 1fr);
}
```

1つ目の引数`3`が列数、2つ目の`1fr`が繰り返す幅です。`fr`の詳しい幅計算は次のスライドで確認します。

:::practice
prompt: 160pxの列を4本作るrepeatを答えます。
expectedAction: repeat(4, 160px)と答える
estimatedMinutes: 2
:::

次は固定pxを、残り幅を分ける`fr`へ置き換えます。
