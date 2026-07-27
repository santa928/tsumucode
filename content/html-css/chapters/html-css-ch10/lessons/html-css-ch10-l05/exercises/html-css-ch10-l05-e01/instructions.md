## 4 ViewportでOverflowとCTAを確認する

`styles.css`で幅と高さを1か所ずつ変更します。

1. `[data-wide]`の`width: 1100px;`を`width: 100%;`へ変更します。
2. `[data-cta]`の`min-height: 24px;`を`min-height: 44px;`へ変更します。
3. Focus可能な`a`要素と完成済みのPaddingは残します。
4. 実行し、390・768・1280・1440pxのすべてでOverflow false、Focus可能、高さ44px以上を確認します。

迷ったら「前のスライド」で3つの監査条件を見直せます。
