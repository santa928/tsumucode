---
id: html-css-ch08-l05-s02
title: Card RowはGeometryで結果を確かめる
kind: comparison
concept: practical-card-row
layout: code-preview
teachesConceptIds: [flex-card-row]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: navigation-card-integration-detail
    source: assets/navigation-card-integration.svg
    mediaType: image
    alt: Navigationの下に16px間隔の2枚のCardを並べる図
    provenanceId: ch08-navigation-card-integration-original
---

Card Rowの正解は特定のClass名ではありません。ContainerがFlex Layoutになり、Card間に意図した距離があり、Containerからはみ出さない最終Geometryが重要です。

![NavigationとCard Rowの統合結果](asset:navigation-card-integration-detail)

```css
[data-card-row] {
  display: flex;
  gap: 16px;
}
```

NavigationとCard Rowは別々の親なので、それぞれへ`display: flex;`と目的に合う`gap`を書きます。これまでのContainer・Gap・Geometryを1画面へ統合する実習です。

:::practice
prompt: Card幅160px、gap16px、開始x32pxなら2枚目のxを計算します。
expectedAction: 32 + 160 + 16で208pxと答える
estimatedMinutes: 2
:::

次の実習では、新しい構文を増やさず2つのLayoutを統合します。
