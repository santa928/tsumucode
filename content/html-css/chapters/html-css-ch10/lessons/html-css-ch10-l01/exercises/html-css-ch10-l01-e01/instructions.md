## Viewport MetaとMobile Baseを用意する

`index.html`と`styles.css`を1か所ずつ変更します。

1. Viewport Metaの`content="initial-scale=1"`を`content="width=device-width, initial-scale=1"`へ変更します。
2. `[data-page]`の`width: 500px;`を`width: 100%;`へ変更します。
3. 完成済みの`box-sizing`、Padding、背景は残します。
4. 実行し、390pxで横Overflowがなく、Viewport Metaが1件だけあることを確認します。

迷ったら「前のスライド」で、HTMLの完成形とMobile Baseのwidthを見直せます。
