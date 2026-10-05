---
id: typescript-ch02-l01-s02
title: 書いたプロパティをそろえる
kind: concept
concept: interfaceの項目をすべて用意する
layout: comparison
teachesConceptIds: [typescript-question-interface]
masteryTarget: read
screenBudget:
  maxTextCharacters: 400
  maxCodeLines: 9
  maxVisuals: 0
assets: []
---

このQuestionでは3つのプロパティをすべて必要としています。`correctIndex`は、正しい選択肢の位置を表す数値です。次の値には何が足りないでしょうか。

```ts
interface Question {
  prompt: string;
  choices: string[];
  correctIndex: number;
}
const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
};
```

型検査は、値をQuestionの形へ当てはめるところで、必要な`correctIndex`がないと知らせます。これはコードを動かした後の失敗ではありません。型誤りを直すまでは実行へ進みません。

:::practice
prompt: 足りない名前と、そのプロパティへ渡す値の型を答えてください。
expectedAction: correctIndexが足りず、数値のnumberを渡すと答える
estimatedMinutes: 1
:::
