---
id: html-css-ch01-l02-s02
title: Childを2文字右へ下げて親子を見せる
kind: code
concept: html-indentation
layout: code-preview
teachesConceptIds: [nesting, indentation]
masteryTarget: read
screenBudget: { maxTextCharacters: 360, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: diagram-dom-tree-code
    source: assets/dom-tree.svg
    mediaType: image
    alt: コードの字下げと対応するbody、main、h1、pの親子関係
    provenanceId: ch01-dom-tree-original
---

Childの行をParentより2文字右へ下げると、どの箱の中にいるか読みやすくなります。同じParentを持つ`h1`と`p`は同じ深さへそろえ、終了Tagは開始Tagと同じ位置へ戻します。

```html
<main>
  <h1>学習プロフィール</h1>
  <p>親子関係を練習しています。</p>
</main>
```

![コードの字下げと同じ親子関係を表すTree](asset:diagram-dom-tree-code)

:::practice
prompt: mainを0段、h1とpを1段として、各行の深さを数えます。
expectedAction: 同じParentを持つh1とpを同じ位置へそろえる
estimatedMinutes: 2
:::

次は、Parentの外にあるpを内側へ移す手順を確認します。
