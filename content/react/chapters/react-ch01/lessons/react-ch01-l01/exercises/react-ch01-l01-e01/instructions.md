## 問題データをPropsへ渡す

main.tsxの問題文promptを文字列「HTMLが受け持つものは？」へ直します。選択肢「内容」「見た目」とcorrectIndex: 0、Questionの型注釈、QuestionCardへ渡すコードは残します。

「プレビューを更新」で型の案内が消え、実Reactが作った見出し・2つの選択肢・個数を確認し、「判定する」で指定の表示を確かめます。QuestionCard.tsxとindex.htmlは読み取り専用の足場です。起動処理やmap/keyを書き直す課題ではありません。

このPreviewは表示専用です。型検査の成功だけでは合格にしません。型エラー・描画の例外・実行環境の読込失敗を分けて案内し、コードは保持します。修正後は再実行できます。停止で古い結果を破棄し、Resetは確認後に初期コードへ戻します。

この最初の課題で使うタグと属性は固定です。任意npm/外部通信、URL・イベント・ref・spread・dangerouslySetInnerHTML、型検査の無効化は扱いません。State/Event/Effect等は後の教材へ残しています。
