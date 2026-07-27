## 読めて意味が伝わる公開状態を作る

`styles.css`と`index.html`を1箇所ずつ変更します。

1. `[data-status]`の`color: #aaa097;`を`color: #172a3a;`へ変更します。
2. `status-dot`の`span`直後へ、`data-status-text`を持つ`strong`で「公開中」を追加します。
3. PreviewでTextが読みやすく、緑の丸を隠しても状態が分かることを確認します。
4. 判定結果でContrast 4.5:1以上と状態Textを別々に確認します。

状態の文言は、公開可否が分かれば別案でも合格します。
