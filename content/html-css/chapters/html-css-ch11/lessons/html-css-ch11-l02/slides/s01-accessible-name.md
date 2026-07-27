---
id: html-css-ch11-l02-s01
title: Accessible Nameは要素の目的を伝える
kind: concept
concept: accessible-name-purpose
layout: comparison
teachesConceptIds: [accessible-name]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 0, maxVisuals: 1 }
assets:
  - id: accessible-name-map
    source: assets/accessible-name-map.svg
    mediaType: image
    alt: Input、画像、Linkの見た目と支援技術へ伝わる名前を対応させた図
    provenanceId: ch11-accessible-name-map-original
---

Accessible Nameは、支援技術がInput、画像、Linkなどの目的を伝えるときに使う名前です。見た目に文字があっても、対象との関係がHTMLで伝わらなければ名前にならない場合があります。

![3種類の要素へ名前を届ける対応図](asset:accessible-name-map)

:::practice
prompt: 名前が空のInputを読み上げた利用者が困る理由を答える
expectedAction: 入力目的を判断できないと答える
estimatedMinutes: 2
:::

次は、要素ごとに名前を届けるHTMLを見比べます。
