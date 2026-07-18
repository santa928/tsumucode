---
id: html-css-ch03-l02-s02
title: altは画像がその場で担う情報を書く
kind: comparison
concept: meaningful-alt
assets: []
---

同じ画像でも、ページ内の目的によって適切なaltは変わります。プロフィール画像なら「誰・何を表すAvatarか」が分かる短い説明を書きます。

ファイル名の`avatar.svg`や「画像」の一語だけでは内容が伝わりません。反対に、隣のTextと完全に同じ内容を繰り返す装飾画像なら`alt=""`として読み上げ対象から外す場合があります。

- 情報を持つ画像には目的が伝わるalt
- 装飾だけの画像には空alt
- 「画像」「写真」だけで終わらせない

:::practice
prompt: Profileを表すAvatarと、見出し横の飾り模様に必要なaltを比べます。
expectedAction: Avatarには説明、重複する飾りには空altを選ぶ
estimatedMinutes: 2
:::

次の実習では、Profile Avatarへ空ではない具体的なaltを書きます。
