---
id: html-css-ch03-l03-s02
title: labelのforとControlのidを一致させる
kind: code
concept: label-association
layout: code-preview
teachesConceptIds: [label-control-relation]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: preview-label-relation
    source: assets/form-relations-preview.svg
    mediaType: image
    alt: labelのforとinputのidをdisplay-nameへ一致させる図
    provenanceId: ch03-form-relations-original
---

見える`label`は、何を入力する欄かを伝えます。labelの`for`とinputの`id`を同じ値にすると、2つが1組になります。

```html
<form>
  <label for="display-name">表示名</label>
  <input id="display-name" name="displayName" type="text" />
</form>
```

![forとidの一致](asset:preview-label-relation)

関連付けるとLabelを選んでもInputへFocusし、読み上げでも目的が伝わります。実習ではinputのidは`display-name`で完成済みです。labelのforだけを`nickname`から同じ値へ直します。

:::practice
prompt: forとidの値を見比べ、一致しない場合にどちらを直すか考えます。
expectedAction: 同じ空でないIDにそろえる必要を説明する
estimatedMinutes: 2
:::

次は確認Buttonへ送信しないtypeを加えます。
