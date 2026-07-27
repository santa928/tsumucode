## 内容が崩れる768pxでRowへ切り替える

`styles.css`のMedia Query条件を1か所だけ変更します。

1. `@media (min-width: 900px)`を探します。
2. 数値`900px`だけを`768px`へ変更します。
3. Baseの`flex-direction: column;`と、条件内の`row`は残します。
4. 実行し、390pxでは2枚目が下、768pxと1280pxでは右にあることを確認します。

迷ったら「前のスライド」で`@media (min-width: 768px)`の括弧と単位を見直せます。
