---
id: html-css-ch03-l04-s02
title: 公開練習には役割が伝わる架空情報を使う
kind: comparison
concept: safe-placeholder-content
layout: code-preview
teachesConceptIds: [contact-card-composition]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 2, maxVisuals: 1 }
assets:
  - id: preview-safe-contact
    source: assets/contact-card-preview.svg
    mediaType: image
    alt: 架空名とexample.comのhttps Linkを使った公開用Contact Card
    provenanceId: ch03-contact-card-original
---

GitHub Pagesへ公開する練習では、本名、個人のEmail Address、電話番号、居住地を書きません。教材用の名前と予約Domainの`example.com`を使います。

```html
<img src="asset:avatar-contact-card" alt="Tsumu LearnerのProfile Avatar" />
<a href="https://example.com/contact">学習用Contact Pageを見る</a>
```

![公開用の安全なContact Card](asset:preview-safe-contact)

実習では空のaltへAvatarの目的を書き、Linkのhrefだけを`#contact`から指定のhttps URLへ直します。Link Textは用意済みです。

:::practice
prompt: 本物のEmail Addressとexample.comの練習用Contact URLを公開教材で比べます。
expectedAction: 個人情報を含まない練習用URLを選び、その理由を述べる
estimatedMinutes: 2
:::

次の実習では3か所だけを直し、既習の部品を1枚のCardへ統合します。
