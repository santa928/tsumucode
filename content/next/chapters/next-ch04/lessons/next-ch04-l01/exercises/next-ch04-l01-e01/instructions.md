空白3文字、通常のメモの初回送信、同じメモの再試行を順に試してください。予測は「検証エラー → 一時失敗 → 保存1回」です。練習用保存先は内容ごとに初回だけ失敗します。Source反映・停止再開で初期化され、永続DBには保存しません。

app/api/note/route.tsで文字列をtrimし、3〜40文字かを検証してからstoreNoteを呼びます。Clientのrequired/minLength/maxLengthとは別の検証です。保存先の固定helperは読み取り専用です。

app/note-form.tsxではpending中に入力と送信を無効にし、controlled inputを使って失敗後も値を保持します。結果のstate.inputと現在のinputが一致する場合だけstateを表示し、入力を変えたら表示にはinitialStateを使います。

実JSON POSTのHTTPは検証エラー400、一時失敗503、保存200です。

ラベルから入力し、Tab・Enterでも送信してください。案内はlive regionに表示されます。同じ内容で再試行し、「このメモの保存回数: 1」を確認したら、別の内容へ入力を変えて以前の結果が消えることも確かめます。

保存・反映したSource版を判定します。判定は専用のメモを使うため、Previewで試したメモの履歴を消しません。判定中はPreviewの送信を待ってください。停止後もコードの下書きは残ります。
