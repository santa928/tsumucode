---
id: html-css-ch02-l02-s01
title: 順番を入れ替えられる一覧はulで表す
kind: concept
concept: unordered-list
layout: code-preview
teachesConceptIds: [unordered-list, list-item]
masteryTarget: read
screenBudget: { maxTextCharacters: 370, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: preview-unordered-list
    source: assets/list-choice-preview.svg
    mediaType: image
    alt: 順不同のSkill一覧がBullet、制作手順が番号で表示された比較
    provenanceId: ch02-list-choice-original
---

`ul`は、項目の順番に意味がない一覧を表します。学習中のSkillや持ち物のように、並び替えても内容が変わらない集合に向いています。

```html
<ul>
  <li>HTML</li>
  <li>CSS</li>
  <li>Accessibility</li>
</ul>
```

![ulとolの表示比較](asset:preview-unordered-list)

各項目は`li`へ入れます。実習ではSkillのulへ、文字が「Accessibility」のliを1行追加し、3項目へ増やします。

:::practice
prompt: 「HTML、CSS、Design」の順番を入れ替えても意味が変わらないか考えます。
expectedAction: 順序に依存しないためulが適切だと説明する
estimatedMinutes: 2
:::

次は、順番そのものが情報になる制作手順をolへ直します。
