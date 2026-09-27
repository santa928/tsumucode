---
id: javascript-ch03-l05-s03
title: 同じ係の2回目と別の係を比べる
kind: concept
concept: 外側の変数を覚える
layout: comparison
teachesConceptIds: [captured-binding]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 8, maxVisuals: 0 }
assets: []
codeReferenceSlideId: javascript-ch03-l05-s02
---

前の完成例で定義したcreateScoreCounterを使います。「前提のコードを確認」を開けば定義も読めます。aとbは別々に作った得点係です。

```js {"label":"定義の後へ続ける呼出例", "role":"input", "highlightedLines":[3,4,5]}
const a = createScoreCounter();
const b = createScoreCounter();
console.log(a());
console.log(a());
console.log(b());
```

```text {"label":"Console・呼出順", "role":"output"}
10
20
10
```

| 呼ぶ順 | aのscore | bのscore | 戻る値 |
| --- | --- | --- | --- |
| a() 1回目 | 0→10 | 0のまま | 10 |
| a() 2回目 | 10→20 | 0のまま | 20 |
| b() 1回目 | 20のまま | 0→10 | 10 |

scoreは外側の関数の中だけで使う変数（local variable）です。内側の関数が同じ変数を使い続けます。全得点係が1つのscoreを共有するわけではありません。

:::practice
prompt: この後a()、b()を1回ずつ呼ぶと何を返すか予想します。
expectedAction: aは30、bは20と理由も添えて答える
estimatedMinutes: 1
:::
