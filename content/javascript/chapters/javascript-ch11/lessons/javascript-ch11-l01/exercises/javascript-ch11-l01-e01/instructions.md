## Escapeだけを選んで閉じる

keydown handlerのcloseHint();を、event.keyがEscapeか調べるifで囲みます。

- 最初は「ヒントは閉じています」です。
- 標準buttonのEnterまたはSpaceで「配列のlengthで問題数が分かります」と開きます。
- ボタンにFocusがある間、右矢印では開いたまま、Escapeで閉じます。
- 何度でも開き直せます。

Editor内ならEsc→Tabで抜け、PreviewへTabで入り、枠線が「ヒントを開く」に来てからキーを押します。判定はclickとキーEventへの反応を調べます。Tab移動と標準buttonのEnter・Space操作も、自分でPreview上で試してください。
