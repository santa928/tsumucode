---
id: html-css-ch03-l02-s02
title: altは画像がその場で担う情報を書く
kind: comparison
concept: meaningful-alt
layout: code-preview
teachesConceptIds: [alt-attribute]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 2, maxVisuals: 1 }
assets:
  - id: preview-meaningful-alt
    source: assets/image-alt-preview.svg
    mediaType: image
    alt: Profile Avatarへ目的が分かるaltを付ける例
    provenanceId: ch03-image-alt-original
---

altには、画像の色や形をすべて列挙せず、その場所で何を伝える画像かを書きます。Profile画像なら、誰または何を表すAvatarかが分かる短い説明にします。

```html
<img src="asset:avatar-html-basics" alt="Codeを学ぶCharacterのProfile Avatar" />
```

![Profile Avatarの表示と説明](asset:preview-meaningful-alt)

ファイル名や「画像」だけでは目的が伝わりません。装飾だけの画像には空altを使う場合がありますが、このAvatarはProfile情報なので空にしません。

:::practice
prompt: Profileを表すAvatarと、見出し横の飾り模様に必要なaltを比べます。
expectedAction: Avatarには説明、重複する飾りには空altを選ぶ
estimatedMinutes: 2
:::

次の実習では、空のsrcとaltをこの順に埋めます。
