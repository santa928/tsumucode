# 名前が同じでも型を合わせる

必要な名前がそろっても、値の型が合わなければ型誤りになります。数値の0と、引用符で囲った文字列の`'0'`を比べます。

```ts
interface Question {
  prompt: string;
  choices: string[];
  correctIndex: number;
}
const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
  correctIndex: '0',
};
```

`correctIndex`の型はnumberですが、ここで渡した値はstringです。文字列の`'0'`を数値の0へ直すと、Questionの形と型が合います。値を直す代わりに型の確認をなくすのは、今回の練習の解決になりません。

予測の練習: どこの引用符を外しますか。問題文や選択肢の引用符も外す必要がありますか。

作者が確かめる説明: 正答位置の`'0'`だけ。問題文と選択肢は文字列なので、そのままにする。
