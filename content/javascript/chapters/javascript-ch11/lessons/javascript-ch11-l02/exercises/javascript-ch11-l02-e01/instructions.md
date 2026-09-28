## 次に使う場所へFocusをつなぐ

開始handlerの最後へanswer.focus();、戻るhandlerの最後へstart.focus();を追加します。

- 開始すると問題が出て回答欄へFocusが移り、すぐ入力できます。
- 説明へ戻ると開始ボタンへFocusを戻します。
- 開き直すと回答欄は空で、そこへFocusが移ります。

EditorはEsc→Tabで抜け、開始ボタンまでTab、Enterで開始、そのまま回答を入力します。次にTabで戻るボタンへ移り、Enterで戻る操作まで確かめてください。Focusをいつも戻すタイマーやTabの封鎖は不要です。
