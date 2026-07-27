## 内側と外側の余白を分ける

`.card`の`padding: 16px;`を`padding: 24px;`へ変更します。

次に、`.card + .card`の`margin-top: 16px;`を`margin-top: 32px;`へ変更します。

実行すると、Card内側のPaddingと2枚目のCard外側のMarginが、SourceとComputed Styleの両方で確認されます。
