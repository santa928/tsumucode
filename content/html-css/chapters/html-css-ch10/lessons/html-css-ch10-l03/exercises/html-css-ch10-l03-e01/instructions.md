## Fluid Containerを中央へ収める

`styles.css`の`[data-container]` Ruleで2つのValueだけを変更します。

1. `width: 900px;`を`width: calc(100% - 32px);`へ変更します。
2. `max-width: 900px;`を`max-width: 720px;`へ変更します。
3. 完成済みの`margin-inline: auto;`は残します。
4. 実行し、Mobileで幅358px、Desktopで幅720px・x 280pxになることを確認します。

迷ったら「前のスライド」で、widthが縮め、max-widthが止める役割を見直せます。
