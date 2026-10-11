## Dictのkeyからvalueを読み書きする

redのvalueを4へ更新し、更新後のvalueと全valueの合計を表示します。 redのvalueは4、合計は9です。空Dictはstockへ空Dictを代入し、total初期化・for集計・print(total)だけを実行し、redの更新と表示を除いて0を確認します。

「プレビューを更新」で実出力を見て、「判定する」で課題の条件を確認します。入力欄は使いません。表示の直書きや、使われない正しい構文だけでは合格しません。

Dict作成→redの更新→totalの初期化→forでkeyを受けてstock[key]を集計→redとtotalの表示、の順を使います。変数名の変更、加算の左右交換、total += stock[key]も正解です。

空Collectionなどの観察コードは合格用の出力とは異なります。観察後は課題の条件へ戻します。停止・環境障害・教材で説明していない構文は採点しません。コードエラーはSourceを残して直し、再試行できます。

+=は左側の現在値に右側を足して代入する省略形です。total = total + stock[key]とtotal += stock[key]は同じ更新です。
