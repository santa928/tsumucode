# 書いたプロパティをそろえる

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

読む練習: 足りない名前と、そのプロパティへ渡す値の型を答えてください。

作者が確かめる説明: `correctIndex`、数値の`number`。今回の問題は「内容」が正答なので、配列の最初の位置0を値へ追加する。
