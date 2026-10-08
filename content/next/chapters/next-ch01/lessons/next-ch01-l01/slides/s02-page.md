---
id: next-ch01-l01-s02
title: pageは表示を返す
kind: concept
concept: pageは表示を返す
layout: comparison
teachesConceptIds: [next-page]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

`app/page.tsx`のdefault exportは、この場所のpageの表示を返します。JSXはReactで学んだ書き方です。Server Componentはサーバー側で実行されるComponentです。今回はそのpageを固定環境で動かします。

```tsx
export default function Page() {
  return <h1 id="message">こんにちは、Next.js！</h1>;
}
```

この短いコードは役割の説明例です。演習ではmainと説明文を用意済みです。h1の文字を編集し、保存・反映した後に、実際のPreviewで確かめます。

:::practice
prompt: pageを保存しただけで、実行中の表示は更新済みですか。
expectedAction: 実行へ反映してからPreviewで確認すると答える
estimatedMinutes: 1
:::
