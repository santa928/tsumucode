# 型が通っても位置を確かめる

numberは数値の型で、「この配列の中にある位置」という意味までは持ちません。次の10もnumberなので、Questionの型検査は通ります。

```ts
interface Question {
  prompt: string;
  choices: string[];
  correctIndex: number;
}
const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
  correctIndex: 10,
};
console.log(question.choices[question.correctIndex]);
```

この配列にある位置は0と1です。10の位置には要素がないため、最後の式の値はundefinedになると予測できます。この例をクイズの正しいデータとして使いません。

説明の練習: 「型が通る」と「正答の位置が配列の範囲内にある」は同じ確認ですか。

作者が確かめる説明: 別の確認。numberの確認で位置の範囲や内容の正しさまでは保証されない。演習では問題文・2つの選択肢を保ち、正答「内容」の位置0を数値で用意する。
