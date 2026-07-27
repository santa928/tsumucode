---
id: html-css-ch11-l01-s02
title: Focus Indicatorを消さず現在地を見せる
kind: concept
concept: focus-visible-indicator
layout: code-preview
teachesConceptIds: [focus-visible]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: focus-outline-parts
    source: assets/focus-outline-parts.svg
    mediaType: image
    alt: Focus対象、3px Outline、3px Offsetの位置関係を示す図
    provenanceId: ch11-focus-outline-parts-original
---

Keyboard操作ではPointerの位置が見えません。`:focus-visible`は「Keyboard操作などでFocusを見せるべき状態」を選びます。

![Focus Indicatorの太さと間隔](asset:focus-outline-parts)

```css
[data-action]:focus-visible {
  outline: 3px solid #ef7d4f;
  outline-offset: 3px;
}
```

`outline`はLayoutの幅を変えずに外側へ線を描き、`outline-offset`は要素との間を空けます。`outline: none`だけで終わらせません。

:::practice
prompt: Starterのoutlineで変更する数値を答えます。
expectedAction: 0を3pxへ変更すると答える
estimatedMinutes: 2
:::

次の実習では、完成済みのActionを保ち、`outline`の太さだけを0から3pxへ変更します。
