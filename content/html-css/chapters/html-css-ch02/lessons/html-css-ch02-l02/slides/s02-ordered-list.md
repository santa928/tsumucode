---
id: html-css-ch02-l02-s02
title: 順番どおりに進める手順はolで表す
kind: comparison
concept: ordered-list
assets: []
---

`ol`は、項目の順番に意味がある一覧を表します。「編集する、保存する、Previewする」のように、入れ替えると結果が変わる手順に使います。

```html
<ol>
  <li>Codeを編集する</li>
  <li>変更を保存する</li>
  <li>Previewで確認する</li>
</ol>
```

番号をTextとして書くより、olとliで構造化すると項目を追加しても番号が自動で更新されます。ulとの違いは見た目のBulletではなく、順序が意味を持つかどうかです。

:::practice
prompt: 「好きな色」と「Webページを確認する手順」をulとolへ分類します。
expectedAction: 入れ替え可能性を根拠に、色はul、手順はolと答える
estimatedMinutes: 2
:::

次の実習ではSkill一覧をul、制作手順をolに分けて書きます。
