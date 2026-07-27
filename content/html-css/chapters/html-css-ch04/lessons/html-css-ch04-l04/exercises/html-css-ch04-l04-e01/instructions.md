## remで余白と文字を調整する

`padding`のValueを1か所だけ直し、SourceとComputed Valueを見比べます。

1. .measureのpaddingを2remにします。
2. 完成済みの`font-size: 1.25rem;`と`border: 1px`は残します。
3. Previewを更新し、Paddingが広がったことを確認します。
4. 判定でSourceの2remとComputed Paddingの32pxを確認します。

変更するのは`1.5rem`から`2rem`の1か所だけです。Rootが16pxなので、2remは32pxになります。
