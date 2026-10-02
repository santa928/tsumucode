# オブジェクトの形に名前を付ける

問題文・選択肢・正答の位置を1つのオブジェクトへまとめます。interface（インターフェース）は、そのオブジェクトが持つプロパティ（項目）の名前と型を書き、形に名前を付ける書き方です。ここでは形の名前をQuestionにします。

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

`string[]`は、文字列を要素に持つ配列の型です。`question: Question`という注釈で、この値がQuestionの形に合うかを確認します。interfaceの中は型、下のオブジェクトの中は値です。interfaceを書いても、それだけで問題の値は作られません。

読む練習: `prompt: string`と`prompt: 'HTMLが受け持つものは？'`は、それぞれ何を書いていますか。

作者が確かめる説明: 上は問題文の型、下は実際の問題文の値。形の定義と値の用意を分けて言えること。
