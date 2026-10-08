---
id: next-ch02-l02-s01
title: Server側にNodeの処理を残す
kind: concept
concept: Server側にNodeの処理を残す
layout: comparison
teachesConceptIds: [next-server-node]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

App Routerのpageとlayoutは、use clientを置かなければServer Componentです。Serverではasyncで値を待ち、Nodeの処理を使えます。Reactのブラウザ側とは実行場所が違います。

```tsx
import { basename } from 'node:path';
const note = basename('/lesson/server-note.txt');
```

basenameはパスの末尾の名前を取り出すNode関数です。pageではPromise.resolveをawaitする小さい例にし、外部APIや秘密情報は使いません。server-note.txtはパスから作る文字列で、ファイル読込の結果ではありません。

Serverでstate Hookやclickイベントを扱いません。操作する部分だけClientへ分けます。

:::prediction
prompt: "ファイル読込などNode専用の処理を、ブラウザで動かすCounterへ移してよいですか。"
answer: "Serverに残して、必要な値だけをCounterへ渡します。"
explanation: "ブラウザにはNodeのファイル操作がありません。basenameの文字列処理とは区別します。"
:::
