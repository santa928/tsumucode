---
id: html-css-ch06-l02-s02
title: ContrastとTextの2つで状態を伝える
kind: concept
concept: text-contrast
layout: code-preview
teachesConceptIds: [contrast-ratio, non-color-cue]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: contrast-non-color-cue
    source: assets/contrast-and-cue.svg
    mediaType: image
    alt: 緑の丸だけの状態表示と公開中というTextを併記した状態表示の比較
    provenanceId: ch06-contrast-and-cue-original
---

Contrast Ratioは前景色と背景色の明るさの差です。通常サイズの本文は`4.5:1`以上を基準にします。

![Contrastと色以外の手がかり](asset:contrast-non-color-cue)

色だけの緑の丸では、意味を区別できない場合があります。実習では`Portfolio`の前へ、`data-status-text`を持つstrong要素と区切り線を追加し、言葉でも状態を伝えます。

```html
<strong data-status-text>公開中</strong> — Portfolio
```

:::practice
prompt: 緑の丸だけで示した公開状態へ、色以外の手がかりを追加します。
expectedAction: 公開中という状態Textを加える
estimatedMinutes: 2
:::

次の実習では、文字色1箇所と状態Text 1箇所を変更します。
