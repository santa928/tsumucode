---
id: html-css-ch11-l03-s02
title: 状態は色とTextの両方で伝える
kind: comparison
concept: color-independent-status
layout: code-preview
teachesConceptIds: [status-text]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: status-text-map
    source: assets/status-text-map.svg
    mediaType: image
    alt: 色の丸だけの表示へ公開中Textを追加して意味を伝える比較図
    provenanceId: ch11-status-text-map-original
---

緑の丸だけで「公開中」を表すと、色を区別しにくい利用者や読み上げ利用者へ意味が届きません。色の印へ「公開中」のTextや理解できるIcon Labelを併記します。

![色だけの状態とText付き状態の比較](asset:status-text-map)

```html
<p class="status-line">
  <span class="status-dot" aria-hidden="true"></span>
  <strong data-status-text>公開中</strong>
</p>
```

装飾の丸は`aria-hidden="true"`で読み上げ対象から外し、意味は見えるTextへ持たせます。

:::practice
prompt: 緑の丸へ追加すべき色以外の手がかりを答える
expectedAction: 公開中などの状態Textを挙げる
estimatedMinutes: 2
:::

次の実習では、Text Colorを1箇所変更し、この`strong`を1つ追加します。
