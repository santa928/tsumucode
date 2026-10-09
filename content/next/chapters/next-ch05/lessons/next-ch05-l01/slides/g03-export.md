---
id: next-ch05-l01-g03
title: metadataと画像の役割を分ける
kind: guide
layout: comparison
teachesConceptIds:
  - next-project-presentation
masteryTarget: compose
screenBudget:
  maxTextCharacters: 420
  maxCodeLines: 12
  maxVisuals: 0
assets: []
---

Server pageのmetadataは文書のtitle/descriptionを作ります。Imageは固定SVGにaltと320×160を付け、unoptimizedで元画像を使います。altは画像の意味、metadataはサイトの案内です。完成後はSource ZIPを持ち出せます。

```tsx
export const metadata: Metadata = {
  title: '小さな旅の案内',
  description: '屋外と室内から選ぶ小さな旅の案内です。',
};

<Image src={base + '/banner.svg'} width={320} height={160}
  alt="山と太陽のある旅のイラスト" unoptimized />
```

:::prediction
prompt: "画像のaltを変えたら、文書titleも変わりますか。"
answer: "いいえ。別の情報なのでmetadataも設定します。"
explanation: "Briefの条件と実測した結果を対応させます。"
:::
