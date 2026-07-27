---
id: html-css-ch03-l03-s03
title: buttonのtypeで操作の目的を固定する
kind: comparison
concept: button-types
layout: code-preview
teachesConceptIds: [button-type]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: preview-button-type
    source: assets/form-relations-preview.svg
    mediaType: image
    alt: 確認Buttonへtype buttonを指定してForm送信を防ぐ図
    provenanceId: ch03-form-relations-original
---

Form内の`button`は、typeを省略すると送信になる場合があります。入力内容を画面で確認するだけなら、`type="button"`を明示します。

```html
<button type="button">入力を確認する</button>
```

![送信しないButton Type](asset:preview-button-type)

実際にDataを送るButtonは`type="submit"`です。この実習は外部へ送らないため、用意されたbuttonの開始Tagへ`type="button"`を追加します。

:::practice
prompt: 「入力を送る」と「入力内容を画面で確認する」をsubmitとbuttonへ分類します。
expectedAction: 送信の有無を根拠に2つのtypeを使い分ける
estimatedMinutes: 2
:::

次の実習ではlabelのforとbuttonのtypeだけを直します。
