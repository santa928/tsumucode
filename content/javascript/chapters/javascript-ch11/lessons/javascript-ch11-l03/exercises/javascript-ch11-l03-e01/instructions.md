## 操作の名前と状態をそろえる

render内のbutton.textContentとaria-expandedを設定する2行を直します。

- 閉じている時の名前は「ヒントを開く」、aria-expandedはfalseです。
- 開いている時の名前は「ヒントを閉じる」、aria-expandedはtrueです。
- 開く→閉じる→開くを繰り返しても表示・名前・状態がそろいます。

名前はopenedの条件で決め、属性にはString(opened)を渡します。用意済みのhiddenによる表示変更は残します。EditorはEsc→Tabで抜け、Tabでボタンへ移り、EnterとSpaceでも操作して確かめてください。
