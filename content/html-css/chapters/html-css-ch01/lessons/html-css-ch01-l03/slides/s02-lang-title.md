---
id: html-css-ch01-l03-s02
title: langは言語、titleはTabの題名を伝える
kind: code
concept: document-language-and-title
layout: code-preview
teachesConceptIds: [lang-attribute, title-element]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: preview-document-settings
    source: assets/document-settings-preview.svg
    mediaType: image
    alt: Browser TabにHTML学習プロフィールと表示され、ページ言語が日本語に設定されたPreview
    provenanceId: ch01-document-settings-preview-original
---

`html`の`lang="ja"`は文書の基本言語を日本語にします。`head`内の`title`は本文ではなくBrowser Tabの名前です。完成例では、開始Tagのlang値とtitleの内容だけを変更します。

```html
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>HTML学習プロフィール</title>
  </head>
</html>
```

![langとtitleを設定したBrowserの結果](asset:preview-document-settings)

:::practice
prompt: コードのjaとBrowserの言語、titleの内容とTab名をそれぞれ結びます。
expectedAction: langは言語、titleはTab名を伝えると説明する
estimatedMinutes: 2
:::

`meta charset`は固定済みなので、今回は触りません。次の演習ではlangの値とtitleの内容だけを変更します。
