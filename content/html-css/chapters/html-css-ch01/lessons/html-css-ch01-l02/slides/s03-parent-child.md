---
id: html-css-ch01-l02-s03
title: Parentを選ぶと内容のまとまりが伝わる
kind: comparison
concept: parent-child-structure
assets: []
---

どのParentの中へ置くかで、Element同士の関係が決まります。`section`の見出しと説明を同じsectionのChildにすると、その2つが同じ話題のまとまりだとBrowserや支援技術へ伝わります。

見た目が同じでも、h2やpをmainの外へばらばらに置くと関係が弱くなります。まず内容のまとまりを考え、外側のParentを書いてから、内側へHeadingとParagraphを順に積みます。

- 外側のmainはページ固有の中心内容をまとめる
- sectionは1つの話題をまとめる
- h2とpは同じsectionのChildとして内容を説明する

:::practice
prompt: 「好きなこと」というh2と説明のpを、main直下とsection内のどちらへまとめるか選びます。
expectedAction: 同じ話題なので1つのsectionのChildにすると説明する
estimatedMinutes: 2
:::

次の演習では、main、section、h2、pを正しい親子と順番で組み立てます。
