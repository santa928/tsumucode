---
id: html-css-ch02-l02-s02
title: 順番どおりに進める手順はolで表す
kind: comparison
concept: ordered-list
layout: code-preview
teachesConceptIds: [ordered-list]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: preview-ordered-list
    source: assets/list-choice-preview.svg
    mediaType: image
    alt: ulのBulletとolの番号を順序の意味で比較したPreview
    provenanceId: ch02-list-choice-original
---

`ol`は、項目の順番に意味がある一覧を表します。「編集する、保存する、Previewする」のように、入れ替えると結果が変わる手順に使います。

```html
<ol>
  <li>Codeを編集する</li>
  <li>変更を保存する</li>
  <li>Previewで確認する</li>
</ol>
```

![順不同Listと手順List](asset:preview-ordered-list)

ulとの違いは見た目ではなく、順序が意味を持つかです。実習では制作手順を包む2つ目の`ul`だけを、開始Tagと終了Tagとも`ol`へ変更し、3つのliは残します。

:::practice
prompt: 「好きな色」と「Webページを確認する手順」をulとolへ分類します。
expectedAction: 入れ替え可能性を根拠に、色はul、手順はolと答える
estimatedMinutes: 2
:::

次の実習ではliを1行追加した後、制作手順だけをolへ直します。
