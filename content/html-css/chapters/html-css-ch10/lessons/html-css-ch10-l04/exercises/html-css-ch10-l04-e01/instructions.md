## Imageを縮め、Crop Boxへきれいに収める

同じ横長画像を2つのBoxで見比べます。`styles.css`で2つのValueだけを変更します。

1. `[data-responsive-image]`の`max-width: none;`を`max-width: 100%;`へ変更します。
2. `[data-crop-image]`の`object-fit: contain;`を`object-fit: cover;`へ変更します。
3. 完成済みのResponsive Imageの`width: 480px;`と`height: auto;`、Crop Imageの`width: 320px;`と`height: 180px;`は残します。
4. 実行し、上の画像が320×約213pxへ比率のまま縮み、下の画像が320×180pxのBoxを隙間なく埋めることを確認します。

迷ったら「前のスライド」で、境界を決めるmax-widthと見せ方を決めるobject-fitを見直せます。
