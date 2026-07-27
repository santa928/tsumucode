---
id: html-css-ch03-l04-s01
title: addressは作者や組織への連絡情報を表す
kind: concept
concept: contact-address
layout: code-preview
teachesConceptIds: [address-element, contact-card-composition]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: preview-contact-card
    source: assets/contact-card-preview.svg
    mediaType: image
    alt: Avatar、名前、説明、address内のLinkを組み合わせたContact Card
    provenanceId: ch03-contact-card-original
---

`address`は、近くにある記事やページの作者・組織への連絡情報を表します。文字を斜体にする目的で選ぶTagではありません。

Profile画像とalt、名前、説明、安全なLinkを1つのsectionへまとめ、連絡Linkだけをaddressへ入れるとContact Cardになります。

```html
<address class="contact">
  <a href="https://example.com/contact">学習用Contact Pageを見る</a>
</address>
```

![Contact Cardの4つの部品](asset:preview-contact-card)

実習ではCard全体が用意済みです。Contact Linkを包むcontactクラスのdivだけを、開始Tagと終了Tagともaddressへ変えます。

:::practice
prompt: 作者へのContactと、旅行先の住所一覧のどちらがaddressの目的に合うか考えます。
expectedAction: 作者への連絡情報を選び、見た目ではなく役割で説明する
estimatedMinutes: 2
:::

次はAvatarのaltとLinkの行き先を安全に整えます。
