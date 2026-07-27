## Grid GalleryとFlex Actionを組み合わせる

`styles.css`で外側と内側を1か所ずつ変更します。

1. `[data-feature]`の`grid-column: auto;`を`grid-column: 1 / -1;`へ変更します。
2. `[data-actions]`の`display: block;`を`display: flex;`へ変更します。
3. 既にある2列Gridと2つの`gap`は残します。
4. 実行し、Feature Cardが幅600pxへ広がり、2つのActionが横1列になることを確認します。

迷ったら「前のスライド」で、`data-gallery`と`data-actions`が担当する直接の子を見直せます。
