## remで余白と文字を調整する

Root Font Sizeを基準にしたUnitと、固定したい細さのUnitを使い分けます。

1. .measureのpaddingを2remにします。
2. font-sizeは1.25remのまま、Computed 20pxを確認します。
3. borderは固定したい細さとして1pxを使います。
4. Previewと判定でComputed Valueを読みます。

Rootが16pxなら2remは32pxです。判定は小さな計算差を許容します。
