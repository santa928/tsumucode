---
id: html-css-ch01-l02-s02
title: 字下げで親子関係を見える形にする
kind: code
concept: html-indentation
assets: []
---

Indentationは、Child Elementの行をParentより右へ下げる書き方です。Browserの表示結果は空白の数で変わりませんが、人が開始Tagと終了Tagの組、どの箱の中にいるかを早く読めるようになります。

同じ深さの兄弟は同じ位置へそろえ、1段内側へ入るたびに同じ幅だけ下げます。終了Tagは対応する開始Tagと同じ位置へ戻すと、閉じ忘れや入れ違いを見つけやすくなります。

```html
<main>
  <section>
    <h2>学んでいること</h2>
    <p>HTMLの親子関係です。</p>
  </section>
</main>
```

:::practice
prompt: コード例のmain、section、h2とpが何段目かを数えます。
expectedAction: 同じParentを持つh2とpが同じ深さにそろうことを確認する
estimatedMinutes: 2
:::

次は、親子関係そのものがページの意味をどう整理するかを確認します。
