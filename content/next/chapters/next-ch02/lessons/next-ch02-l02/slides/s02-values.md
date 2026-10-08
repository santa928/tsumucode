---
id: next-ch02-l02-s02
title: 小さいClientに状態とイベントを置く
kind: concept
concept: 小さいClientに状態とイベントを置く
layout: comparison
teachesConceptIds: [next-client]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

use clientをファイル先頭に置くと、Client側との境界になります。そのファイルがimportする処理もClient側へ入るため、Node専用moduleを移さないことが大切です。

```tsx
'use client';
import { useState } from 'react';
const [count, setCount] = useState(initial);
<button onClick={() => setCount(count + 1)}>数を増やす</button>;
```

これはCounter内の抜粋です。HookとonClickはReactで学んだ書き方です。Client Componentも初回のHTMLはサーバーで用意され、その後ブラウザのJavaScriptが操作を結び付けます。Clientだから初回HTMLがない、という意味ではありません。

:::prediction
prompt: "初期2で2回押すと、表示はどの順番で変わりますか。"
answer: "2から3、4へ変わります。"
explanation: "ClientのuseStateで持つ値を、clickのたびに1増やすためです。"
:::
