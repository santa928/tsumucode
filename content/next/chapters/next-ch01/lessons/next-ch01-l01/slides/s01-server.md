---
id: next-ch01-l01-s01
title: 実サーバーと静的な配信
kind: concept
concept: 実サーバーと静的な配信
layout: explanation
teachesConceptIds: [next-server]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

この演習はDocker内の固定Next開発serverで動きます。画面のSourceを保存し、起動が完了すると、別のPreviewに実際のHTTP応答を表示します。停止しても端末の下書きは残ります。

Pagesが配るHTML・JSは静的ファイルです。Pagesの説明用表示を「Route Handlerが動いた」とは判定しません。

本番用のbuildでは、pageをビルド時に事前生成できる場合もあります。今回の開発serverの観察だけで、全pageが毎回serverで処理されるとは結論づけません。

:::prediction
prompt: "この演習をPagesの静的表示だけで採点できますか。"
answer: "LocalのDocker環境で実HTTPを確認します。"
explanation: "Pagesは静的配信で、リクエストを処理するNextサーバーは動かしません。"
:::
