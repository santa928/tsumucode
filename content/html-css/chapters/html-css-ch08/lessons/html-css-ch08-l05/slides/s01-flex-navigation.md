---
id: html-css-ch08-l05-s01
title: NavigationのLinkを横並びに統合する
kind: concept
concept: accessible-flex-navigation
layout: code-preview
teachesConceptIds: [flex-navigation]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: navigation-card-integration
    source: assets/navigation-card-integration.svg
    mediaType: image
    alt: NavigationとCard Rowを別々のFlex Containerとして組み立てる図
    provenanceId: ch08-navigation-card-integration-original
---

NavigationのHTMLはそのままで、`nav`をFlex Containerにすると直接のLinkが横並びになります。見た目のためにLinkの順序や文字を変える必要はありません。

![NavigationとCard Rowの2つのContainer](asset:navigation-card-integration)

```css
[data-profile-nav] {
  display: flex;
  gap: 12px;
}
```

:::practice
prompt: NavigationのどのElementへdisplay flexを書くか答えます。
expectedAction: 3つのLinkを直接包むnavへ書くと答える
estimatedMinutes: 2
:::

次は、別のContainerとしてCard Rowも組み立てます。
