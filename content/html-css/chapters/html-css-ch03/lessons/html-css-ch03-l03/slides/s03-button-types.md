---
id: html-css-ch03-l03-s03
title: buttonのtypeで操作の目的を固定する
kind: comparison
concept: button-types
assets: []
---

Form内の`button`は、typeを省略すると送信として扱われる場合があります。Previewだけを更新するなど送信しない操作には`type="button"`を明示します。

```html
<button type="button">入力を確認する</button>
```

実際にDataを送るButtonなら`type="submit"`を選びますが、この実習はSandbox内で入力欄を確認するだけなのでbutton Typeが適切です。

:::practice
prompt: 「入力を送る」と「入力内容を画面で確認する」をsubmitとbuttonへ分類します。
expectedAction: 送信の有無を根拠に2つのtypeを使い分ける
estimatedMinutes: 2
:::

次の実習ではLabel関連付けとtype="button"を同時に整えます。
