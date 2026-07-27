---
id: html-css-ch03-l02-s01
title: imgは画像Sourceと代替Textを持つ
kind: code
concept: image-source-alt
layout: code-preview
teachesConceptIds: [image-element, src-attribute, alt-attribute]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: preview-image-alt
    source: assets/image-alt-preview.svg
    mediaType: image
    alt: srcが画像を表示しaltが画像の目的を言葉で伝える比較
    provenanceId: ch03-image-alt-original
---

`img`は画像を置く要素です。`src`で表示する画像を指定し、`alt`でその画像が担う情報を言葉でも伝えます。

TsumuCodeでは、教材へ登録済みの画像を`asset:ID`で参照します。この実習で使う値は`asset:avatar-html-basics`です。

```html
<img src="asset:avatar-html-basics" alt="Codeを学ぶCharacterのProfile Avatar" />
```

![srcとaltの役割](asset:preview-image-alt)

imgには終了Tagがありません。実習では空のsrcへ登録済みIDを書き、その後に同じimgの空のaltへ説明を書きます。

:::practice
prompt: Code例で画像の場所を示す属性と、言葉で内容を伝える属性を指します。
expectedAction: srcとaltの役割を区別して説明する
estimatedMinutes: 2
:::

次は、このAvatarに合うaltを決めます。
