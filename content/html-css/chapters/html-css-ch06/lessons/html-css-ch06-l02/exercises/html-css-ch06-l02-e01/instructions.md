## 読めて伝わる状態Messageを作る

1. `styles.css`で、`[data-message]`の`color: #9a9a9a;`を`color: #24323d;`へ変更します。
2. `index.html`で、`Portfolio`の前へ次の要素と区切り線を追加します。

```html
<strong data-status-text>公開中</strong> — Portfolio
```

白い背景と緑の丸は完成済みです。実行後にContrast 4.5:1以上と、色以外の状態Textを確認します。
