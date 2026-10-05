---
id: typescript-ch02-l01-s04
title: 型が通っても位置を確かめる
kind: checklist
concept: 型の形と値の正しさを分ける
layout: checkpoint
teachesConceptIds: [typescript-question-interface]
masteryTarget: transform
codeReferenceSlideId: typescript-ch02-l01-s01
screenBudget:
  maxTextCharacters: 420
  maxCodeLines: 11
  maxVisuals: 0
assets: []
---

numberは「この配列の中にある位置」までは保証しません。Questionの形は1枚目と同じです。次の10もnumberなので型検査は通ります。

```ts
const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
  correctIndex: 10,
};
console.log(question.choices.at(question.correctIndex));
```

配列の`.at(位置)`で要素を読みます。位置は0と1で、10には要素がなく値はundefinedになります。クイズの正しいデータではありません。この演習は0から数える整数の位置を使います。

type aliasも同じ形を表せます。これは型の定義だけで、問題の値を作りません。

```ts
type QuestionShape = {
  prompt: string;
  choices: string[];
  correctIndex: number;
};
```

演習ではinterfaceの注釈を残して位置を数値0へ直し、「プレビューを更新」→「判定する」で型と動作を確かめます。type aliasや推論が一般に不正という意味ではありません。

:::practice
prompt: 型が通ることと、正答の位置や内容が正しいことは同じ確認ですか。
expectedAction: 型の形と実行の値は別に確認し、interfaceとtype aliasはどちらも型に名前を付けると説明する
estimatedMinutes: 1
:::
