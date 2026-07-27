---
id: html-css-ch11-l04-s02
title: 最終Auditは操作、理解、表示を分けて行う
kind: comparison
concept: final-accessibility-audit
layout: code-preview
teachesConceptIds: [final-a11y-audit]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: final-audit-board
    source: assets/final-audit.svg
    mediaType: image
    alt: Keyboard、名前、Contrast、Motion、Overflowを順番に確認する最終監査ボード
    provenanceId: ch11-final-audit-original
---

完成後は、KeyboardとFocus、Accessible Name、Contrastと状態Text、Reduced Motion、複数ViewportのOverflowを順に確認します。

![5領域の最終Accessibility監査](asset:final-audit-board)

Screenshotだけで判断せず、Focusability、Accessible Name、Computed Style、Container実寸をそれぞれ測ります。

```css
[data-page] {
  width: min(100%, 44rem);
}
```

`100%`で小さい親へ縮み、`44rem`でDesktop上の広がりを止めます。実習では900px固定幅をこのValueへ変更します。

:::practice
prompt: 最終Auditで確認する5領域を挙げる
expectedAction: Keyboard、Name、Contrastと状態、Motion、Overflowを挙げる
estimatedMinutes: 2
:::

次の実習では、完成済みのName・Focus・状態を監査しながら、未完成のDurationとContainer幅だけを直します。
