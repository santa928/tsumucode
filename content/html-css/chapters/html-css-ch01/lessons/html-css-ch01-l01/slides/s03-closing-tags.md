---
id: html-css-ch01-l01-s03
title: 開いたTagを同じ名前で閉じる
kind: code
concept: closing-tags
assets: []
---

開始Tagを書いたら、内容の終わりに同じ名前の終了Tagを置きます。終了Tagにはslashが付きます。対が崩れるとBrowserが後ろの内容まで同じElementとして補正し、予想と違う構造になることがあります。

コードを読むときは左から文字だけを追わず、開始Tagを見つけたら対応する終了Tagを探します。字下げは後のレッスンで扱いますが、まず名前の組が一致しているかを確認しましょう。

```html
<h1>わたしのプロフィール</h1>
<p>小さな一歩を積み上げます。</p>
```

:::practice
prompt: コード例のh1とpについて、開始Tagと対応する終了Tagを線で結ぶように視線で追います。
expectedAction: 開始と終了のTag名が一致し、終了側にslashがあると確認する
estimatedMinutes: 2
:::

次の演習では、h1とpを自分で書き、Previewと判定でElementの形を確かめます。
