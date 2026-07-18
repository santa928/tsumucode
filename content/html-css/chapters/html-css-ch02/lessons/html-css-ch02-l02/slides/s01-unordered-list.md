---
id: html-css-ch02-l02-s01
title: 順番を入れ替えられる一覧はulで表す
kind: concept
concept: unordered-list
assets: []
---

`ul`は、項目の順番に意味がない一覧を表します。学習中のSkillや持ち物のように、並び替えても内容が変わらない集合に向いています。

```html
<ul>
  <li>HTML</li>
  <li>CSS</li>
  <li>Accessibility</li>
</ul>
```

各項目は`li`に入れます。記号をTextとして手入力するのではなく、List構造を使うとBrowserや読み上げも項目数とまとまりを理解できます。

:::practice
prompt: 「HTML、CSS、Design」の順番を入れ替えても意味が変わらないか考えます。
expectedAction: 順序に依存しないためulが適切だと説明する
estimatedMinutes: 2
:::

次は、順番そのものが情報になる手順をolで表します。
