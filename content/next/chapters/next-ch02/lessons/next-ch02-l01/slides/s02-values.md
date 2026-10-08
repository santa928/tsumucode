---
id: next-ch02-l01-s02
title: 動的な値はparamsをawaitする
kind: concept
concept: 動的な値はparamsをawaitする
layout: comparison
teachesConceptIds: [next-dynamic]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

[slug]はURLのその位置の値を受け取るフォルダー名です。queryの?modeとは別です。固定Next環境ではparamsがPromiseなので、awaitで値を取り出します。

```tsx
export default async function TripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <p>{slug}</p>;
}
```

/trips/forestならforest、/trips/seaならseaになります。演習では、この値をid="trip-slug"のpへ表示します。今回のPreviewで開ける動的値はこの2つだけです。

:::prediction
prompt: "URLをforestからseaへ変えるとslugは何になりますか。"
answer: "slugはseaになります。"
explanation: "[slug]に当たるURLの部分をparamsから受け取り、await後に読みます。"
:::
