---
id: next-ch02-l02-s03
title: 境界へ渡すのは直列化できる値
kind: concept
concept: 境界へ渡すのは直列化できる値
layout: comparison
teachesConceptIds: [next-props]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

ServerのpageからClientのCounterへ、numberのinitialとstringのlabelを渡します。直列化とは、値を通信できる形へ表すことです。今回の値はその条件を満たします。

```tsx
<Counter initial={2} label="数を増やす" />
```

普通の関数やclick処理をServerからpropsで渡しません。onClickの関数はCounter内に置きます。Server Actionなど特別な仕組みは今回扱いません。

use clientなしのHookや、node:fsによるファイル操作をClientへ入れると固定環境の診断で失敗します。basenameの文字列処理とは別です。普通の関数propsは、型検査とdevの境界診断を区別します。

:::prediction
prompt: "labelへ文字列ではなく普通の関数を渡すと、どちらの種類の問題ですか。"
answer: "表示の不一致ではなく、型やServer/Client境界の診断です。"
explanation: "labelはstring型です。buildは型不一致、devは関数propsの境界診断です。"
:::
