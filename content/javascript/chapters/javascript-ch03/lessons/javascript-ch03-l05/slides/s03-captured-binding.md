---
id: javascript-ch03-l05-s03
title: 同じ係の2回目と別の係を比べる
kind: concept
concept: 外側の変数を覚える
layout: comparison
teachesConceptIds: [captured-binding]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 8, maxVisuals: 0 }
assets: []
codeReferenceSlideId: javascript-ch03-l05-s02
---

「前提のコードを確認」の関数定義は残します。末尾のconst counter = createScoreCounter();とconsole.log(counter(), counter());の2行を、次の5行に置き換えます。aとbは別々に作った得点係です。

```js {"label":"完成例の末尾2行と置き換える呼出例", "role":"input", "highlightedLines":[3,4,5]}
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

| 呼ぶ順    | aのscore | bのscore | 戻る値 |
| --------- | -------- | -------- | ------ |
| a() 1回目 | 0→10     | 0のまま  | 10     |
| a() 2回目 | 10→20    | 0のまま  | 20     |
| b() 1回目 | 20のまま | 0→10     | 10     |

scoreは外側の関数内だけの変数です。内側の関数が同じ変数を使い続けます。aとbのscoreは別々です。

:::prediction
prompt: この後a()、b()を1回ずつ呼ぶと何を返すか予想します。
answer: aは30、bは20を返します。
explanation: aが覚えた20、bが覚えた10へ、それぞれ10を加えるためです。別の係を呼んでも、もう一方の値は変わりません。
:::
