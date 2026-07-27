---
id: html-css-ch11-l03-s01
title: 本文TextはContrast 4.5対1を基準にする
kind: concept
concept: text-contrast-audit
layout: code-preview
teachesConceptIds: [contrast-45]
masteryTarget: read
screenBudget: { maxTextCharacters: 380, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: contrast-status
    source: assets/contrast-status.svg
    mediaType: image
    alt: 同じ明るい背景で低Contrastと4.5対1以上のTextを比較する図
    provenanceId: ch11-contrast-status-original
---

通常サイズの本文では、前景色と背景色のContrast Ratioを4.5対1以上にします。色コードを片方だけ見るのではなく、実際に重なるComputed Colorの組み合わせを測ります。

![低Contrastと4.5対1以上のText比較](asset:contrast-status)

```css
[data-status] {
  color: #172a3a;
  background: #fffdf8;
}
```

実習では背景を残し、薄いText Colorだけをこの濃い色へ変更します。

:::practice
prompt: 明るい背景でContrastが不足したときの直し方を答える
expectedAction: Textを十分に暗くするなど明るさの差を広げる
estimatedMinutes: 2
:::

次は、読みやすい色だけでなく、状態の意味が言葉でも届くかを確認します。
