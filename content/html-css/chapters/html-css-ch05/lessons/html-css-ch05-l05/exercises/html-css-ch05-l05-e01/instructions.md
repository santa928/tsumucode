## CardをContainer境界へ収める

`.safe-card`の先頭へ`box-sizing: border-box;`を追加します。

続いて、`width: 360px;`を`width: 100%;`へ変更します。PaddingとBorderは残します。

最後に`height: 240px;`を削除し、HeightをContentに合わせます。

実行すると、Source、横Overflow、CardのWidth、Frameに対するCardのright／bottomが確認されます。
