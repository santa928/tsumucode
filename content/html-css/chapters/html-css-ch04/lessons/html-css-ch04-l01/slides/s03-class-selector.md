---
id: html-css-ch04-l01-s03
title: Class Selectorは役割を共有するElementを選ぶ
kind: comparison
concept: class-selector
layout: code-preview
teachesConceptIds: [class-selector]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: css-class-selector-map
    source: assets/css-rule-map.svg
    mediaType: image
    alt: accent Class Selectorだけが2つ目のParagraphを橙色へ上書きする図
    provenanceId: ch04-css-rule-map-original
---

Class Selectorは、HTMLの`class`属性へ付けた名前をCSSでPeriodから始めて選びます。

```html
<p class="accent">今日の発見</p>
```

```css
.accent {
  color: #9a3f25;
}
```

![共通色とAccentの上書き](asset:css-class-selector-map)

実習では`p`の青緑が2つへ届いた後、`.accent`だけを橙へ上書きします。Class名は`orange`ではなく`accent`のような役割にすると、色を変えても意味が残ります。

:::practice
prompt: 2つへ共通のpと、2つ目だけの.accentを図で指します。
expectedAction: Type SelectorとClass Selectorの届く範囲を比べる
estimatedMinutes: 2
:::

次の実習ではType SelectorとClass Selectorを別の色へ設定します。
