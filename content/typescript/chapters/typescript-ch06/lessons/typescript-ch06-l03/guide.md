## 今回の作る順序

1. 工程3: unknownを検証し非同期の結果と失敗を区別するの周囲と型の案内を読み、今回変える範囲を決めます。
2. 同梱Promiseのunknownを各問題の項目と選択肢から検証し、実Errorのmessageと再試行を、Event対象確認を保った完成クイズへ接続する。
3. 問題・選択肢・得点を予測してから実操作し、Checklistと保存した原文を確認します。

## 1件の確認結果から配列を作る

`decodeQuestion` は、確認できた1件を `Question` として返し、確認できないときは `undefined` を返します。`readQuestions` は同梱Promiseを `await` した後、全件を順に確認します。1件でも確認できなければ配列全体を `invalid` とし、確認できたものだけを残して成功にはしません。全件を確認できたときだけ、作った配列を `ready` の `questions` へ渡します。最初から用意した `questions` へ置き換えると、読み込んだ値の検証になりません。

別の題材で、ラベルの確認と配列の組み立てを分けてみます。

```ts
interface Label {
  text: string;
}

type LabelsReply = { kind: 'ok'; labels: readonly Label[] } | { kind: 'bad' };

/** 確認できた文字列から新しいラベルを作る。 */
function readLabel(value: unknown): Label | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('text' in value) || typeof value.text !== 'string') return undefined;
  return { text: value.text };
}

/** 1件でも不正なら、途中までの配列を成功として返さない。 */
function collectLabels(values: readonly unknown[]): LabelsReply {
  const labels: Label[] = [];
  for (const value of values) {
    const label = readLabel(value);
    if (label === undefined) return { kind: 'bad' };
    labels.push(label);
  }
  return { kind: 'ok', labels };
}
```

`Label[]` は組み立て中に `push` できる配列です。返した後に読む側には `readonly Label[]` として渡せます。クイズでは `text` だけでなく、カテゴリ・本文・2つの選択肢・正解を確認します。項目があるか、型が合うか、正解が選択肢に含まれるかを分けて考えましょう。

Promiseの拒否は、この「読めた値が不正」とは別です。`catch` の値を `unknown` として受け、`Error` かを確認してから実際の `message` を `failed` へ渡します。失敗後の再試行も、もう一度読み込んだ値を確認します。

条件は連続した `if` のearly returnへ分けても、1つのOR条件へまとめても構いません。単一の `return` を囲むブロックと、`Error` の確認に使う条件式も扱います。いずれも確認項目・確認後に使う値・成功と失敗の区別を保ちます。

公開型名Question・QuizState・Category・LoadMode・LoadResultと関数の窓口、mountQuizの接続は保ちます。引数/ローカル名の変更、括弧、関数宣言/型を明示したarrow、readonly配列表記の有限な別解を扱います。任意のTS構文を採点する仕組みではありません。

提供quiz-ui.tsはHTML要素とfocusを扱い、main.tsのデータ/回答/次問/読み込み/対象確認を呼びます。現在のQuizStateを書き換えず、createState・answer・advanceが返した状態を使います。questions.tsは80ms後に同梱のunknownを返し、拒否後のWebは順序が変わります。通信しません。

型のexport interface/typeとimport typeは実行JSへ残りません。実行する関数のimportは残ります。対応環境は固定TypeScript 6.0.3 / Node 24.18.0のDockerと実Browserです。見積り時間は初心者の実測ではありません。
