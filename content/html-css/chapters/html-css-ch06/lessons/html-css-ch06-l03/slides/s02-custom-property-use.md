---
id: html-css-ch06-l03-s02
title: var関数で共有値を読み出す
kind: concept
concept: custom-property-use
layout: code-preview
teachesConceptIds: [var-function]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: custom-property-var
    source: assets/custom-property-flow.svg
    mediaType: image
    alt: var color-primaryをActionの背景とTagの文字から参照する図
    provenanceId: ch06-custom-property-flow-original
---

宣言したCustom Propertyは`var(--color-primary)`で読み出します。同じ参照を使えば、元の値を1箇所変えるだけで複数の部品が更新されます。

![var関数で共有する流れ](asset:custom-property-var)

実習ではActionの`background-color`とTagの`color`を、それぞれ既存の色から同じ`var()`へ変更します。

```css
[data-action] {
  background-color: var(--color-primary);
}
[data-tag] {
  color: var(--color-primary);
}
```

:::practice
prompt: --color-primaryを書き換えたときに変化する2つの部品を答えます。
expectedAction: Actionの背景とTagの文字が一緒に変わると説明する
estimatedMinutes: 2
:::

次の実習では、宣言1行と参照2箇所を順に編集します。
