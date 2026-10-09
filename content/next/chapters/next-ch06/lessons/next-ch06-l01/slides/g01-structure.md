---
id: next-ch06-l01-g01
title: 別の条件をBriefから設計する
kind: guide
layout: explanation
teachesConceptIds:
  - next-project-transfer
masteryTarget: compose
screenBudget:
  maxTextCharacters: 420
  maxCodeLines: 12
  maxVisuals: 0
assets: []
---

残席3は受付中、残席0は受付終了です。一覧の選択と詳細の案内が同じ条件を使うかを予測します。旅行のareaをコピーするだけでは条件が変わりません。

:::prediction
prompt: "残席0の夕方は、屋内だから受付中ですか。"
answer: "いいえ。受付可否はseatsで判断します。"
explanation: "Briefの条件と実測した結果を対応させます。"
:::
