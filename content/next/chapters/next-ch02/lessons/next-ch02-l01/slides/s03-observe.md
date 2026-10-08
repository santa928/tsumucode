---
id: next-ch02-l01-s03
title: aで文書を読み直して移動する
kind: concept
concept: aで文書を読み直して移動する
layout: comparison
teachesConceptIds: [next-navigation]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

今回のaはブラウザが移動先の文書を取り直すリンクです。直接アクセスや再読込でも、Nextが同じURLに対応するpageとlayoutを返します。独自Routerは作りません。

```tsx
<a href="./trips/forest">森の旅へ</a>
<a href="./trips/sea">海の旅へ</a>
```

この相対URLは旅行一覧のURLから使います。詳細の「../trips」は一覧へ戻ります。runの接頭辞を含めず、同じPreview内に移動します。

NextのLinkはClient側の遷移や、遷移前に必要なデータを先読みするprefetchを提供します。共有layoutを保持するsoft navigationと、今回のaによる文書遷移は区別します。今回の実測でLinkの状態保持まで確認したとは扱いません。

:::prediction
prompt: "海リンクがforestを指していたら、移動後のslugは何になりますか。"
answer: "slugはforestになります。"
explanation: "リンクの名前ではなく、hrefのURLが詳細pageのparamsを決めます。"
:::
