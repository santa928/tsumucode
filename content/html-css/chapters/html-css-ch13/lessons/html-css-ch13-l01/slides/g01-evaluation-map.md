---
id: html-css-ch13-l01-g01
title: Briefを計測できる要件へTraceする
kind: checklist
layout: code-preview
teachesConceptIds: [capstone-requirement-trace]
masteryTarget: compose
screenBudget: { maxTextCharacters: 420, maxCodeLines: 7, maxVisuals: 1 }
assets:
  - id: capstone-requirement-trace
    source: assets/capstone-requirement-trace.svg
    mediaType: image
    alt: Briefの目的を計測フック、独立Rule、4 Viewportの確認へつなぐ流れ
    provenanceId: ch13-capstone-requirement-trace-original
---

Briefの各文を「作るもの」「計測用の目印」「合格条件」へ分けます。`data-*`は採点対象を見つける目印であり、見た目やDOM配置の正解ではありません。

![Capstone Requirement Trace](asset:capstone-requirement-trace)

```html
<body data-capstone-page>
  <!-- Poster: data-event-poster + alt -->
  <!-- Cards: data-event-grid > 3件以上のdata-event-card -->
  <!-- Actions: data-capstone-action -->
</body>
```

Semantic Structure、Accessible Name、Grid/Flexの別解、Responsive境界、Keyboard、Contrastを独立したRuleで測ります。完成Sourceとの文字列一致や特定Class名では評価しません。

:::practice
prompt: 「3件の展示Themeを4 Viewportで見せる」を、作るもの・目印・合格条件へ分けて説明する
expectedAction: Card群、data-event-gridとdata-event-card、GridまたはFlex・Card幅・Overflowを挙げる
estimatedMinutes: 3
:::

最初に要件とRuleの対応を決め、構造→Layout→最終Auditの3段階で実装します。
