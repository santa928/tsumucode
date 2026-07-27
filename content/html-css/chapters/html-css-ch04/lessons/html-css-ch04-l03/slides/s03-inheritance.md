---
id: html-css-ch04-l03-s03
title: 一部のPropertyはParentからChildへ継承される
kind: concept
concept: css-inheritance
layout: code-preview
teachesConceptIds: [inheritance]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: inheritance-cascade
    source: assets/diagram-cascade.svg
    mediaType: image
    alt: ParentのComputed ColorをChildが継承し直接指定が優先される図
    provenanceId: ch04-cascade-slide-original
---

`color`や`font-family`は、Childに直接ValueがなければParentのComputed Valueを受け取ります。これがInheritanceです。

```css
.card {
  color: #2d5d62;
}
```

![ParentからChildへ値が届く順序](asset:inheritance-cascade)

実習の`.message`は直接指定がないため、Cardの最終的な橙を継承します。`.control`には青緑が直接指定されているので、Parentの橙ではなく青緑のままです。marginなど継承されないPropertyもあります。

:::practice
prompt: messageとcontrolのどちらがCardの橙を継承するか選びます。
expectedAction: 直接colorがないmessageを選ぶ
estimatedMinutes: 2
:::

次の実習ではSource OrderとInheritanceを使い、importantなしで目標色を作ります。
