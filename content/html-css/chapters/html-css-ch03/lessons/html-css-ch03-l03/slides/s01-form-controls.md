---
id: html-css-ch03-l03-s01
title: Form Controlは情報を入力・選択する部品
kind: concept
concept: form-controls
layout: code-preview
teachesConceptIds: [input-element]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: preview-form-control
    source: assets/form-relations-preview.svg
    mediaType: image
    alt: labelとinputの属性値、送信しないbutton Typeの関係図
    provenanceId: ch03-form-relations-original
---

Form Controlは情報を入力・選択する部品です。このLessonでは、1行の表示名を入力する`input`を使います。

`type="text"`は1行Text、`name="displayName"`は項目名、`id="display-name"`はこのControlを識別する値です。

```html
<input id="display-name" name="displayName" type="text" />
```

![Formの属性関係](asset:preview-form-control)

実習ではinputは完成済みで変更しません。次に、そのidを使って見えるLabelを関連付けます。

:::practice
prompt: Code例からControlを識別するid、送信項目名のname、入力種類のtypeを探します。
expectedAction: 3属性を指し、それぞれの役割を区別する
estimatedMinutes: 2
:::

次はlabelのforをどの値へ直すか確認します。
