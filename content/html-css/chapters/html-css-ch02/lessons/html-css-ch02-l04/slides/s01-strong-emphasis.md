---
id: html-css-ch02-l04-s01
title: strongは見逃せない重要事項を表す
kind: concept
concept: strong-importance
assets: []
---

`strong`は、文の中で重要性、深刻さ、緊急性が高い部分を表します。たとえば「保存前にTabを閉じない」のように、読み飛ばすと困る注意へ使えます。

Browserの既定表示では太字になることが多いものの、太字にしたいだけならCSSを使います。strongを選ぶ根拠は見た目ではなく、その言葉が文脈上重要かどうかです。

```html
<p><strong>保存してから</strong>Previewを更新してください。</p>
```

:::practice
prompt: 操作案内の中で、見逃すと作業を失う部分を探します。
expectedAction: 文脈上の重要事項だけをstrongの候補として選ぶ
estimatedMinutes: 2
:::

次は、emが声の調子で意味を変える強調を表すことを比べます。
