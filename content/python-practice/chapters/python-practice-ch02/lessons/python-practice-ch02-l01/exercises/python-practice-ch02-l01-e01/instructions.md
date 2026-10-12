## 途中例外でもstreamを閉じる

最初の正常処理は完成しています。次のtry内では、raise後のbroken.close()へ到達しません。brokenを作る行をwith StringIO("例外") as broken:へ直し、getvalue・closed・raiseをそのblockへ入れます。到達しないmanual closeは取り除きます。

固定の「通常」「例外」「中断」、表示順、正常処理・例外処理・終了後の利用を確認する構成は維持してください。2つのstreamは別の変数を使い、名前は変更できます。この課題では任意の同値programを判定しません。

- 通常処理: 通常、False、True。
- 途中例外: 例外、False、例外を受け止めた、True。
- 終了後のgetvalue: ValueErrorを受け止め、終了後は利用できない。

## 対応環境と範囲

固定Pyodide 314.0.7とLocal CPython 3.14.2で、io.StringIO、with、getvalue()、closed、close()、raise ValueError、try/exceptを扱います。入力は使いません。任意import・属性・Class・decorator・OSファイル・通信は教材に追加しません。streamは各runのメモリ内にあり、別Workerや別containerへ共有しません。

学生の判定はコードの接続と実stdoutを照合します。作者検証は実StringIOのclosedと閉じたgetvalueの失敗も直接観察します。各提出の内部objectを直接観測したとは扱いません。コードを保存して再開し、Preview更新と判定を別々に試してください。
