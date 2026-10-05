---
id: typescript-ch02-l01-s01
title: オブジェクトの形に名前を付ける
kind: concept
concept: オブジェクトの形と値を分ける
layout: code-preview
teachesConceptIds: [typescript-question-interface, typescript-type-alias-role]
masteryTarget: read
screenBudget:
  maxTextCharacters: 420
  maxCodeLines: 10
  maxVisuals: 1
assets:
  - id: typescript-ch02-l01-shape-value
    source: assets/shape-value.svg
    mediaType: image
    alt: interfaceは3項目の型を定義し、別に用意したオブジェクトの値へ型注釈を付ける。型は値を作らない。
    provenanceId: typescript-ch02-l01-shape-value-original
---

問題文・選択肢・正答位置を1つのオブジェクトへまとめます。interface（インターフェース）は、プロパティ（項目）の名前と型を書き、形に名前を付ける書き方です。

```ts
interface Question {
  prompt: string;
  choices: string[];
  correctIndex: number;
}
const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
  correctIndex: 0,
};
```

`string[]`は文字列を要素に持つ配列の型です。`question: Question`の注釈で、値が形に合うかを確認します。上は型、下は値です。interfaceだけでは問題の値は作られません。

![形の定義と値の用意](asset:typescript-ch02-l01-shape-value)

type alias（型エイリアス）も型に名前を付け、同じ形を表せます。どちらも実行する値を作りません。今回はinterfaceを練習します。

:::practice
prompt: promptの型と値はそれぞれどこですか。interfaceとtype aliasは値を作りますか。
expectedAction: 上はstringの型、下は実際の問題文の値で、形の名前を定義するだけでは値を作らないと説明する
estimatedMinutes: 1
:::
