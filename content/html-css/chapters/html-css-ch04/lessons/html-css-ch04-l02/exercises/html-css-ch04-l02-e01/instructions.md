## Stylesheet接続とDeclarationを直す

CardのStyleが届かない原因をHTMLで直し、背景色のValueをCSSで直します。

1. headのlinkで`href="theme.css"`を`href="styles.css"`へ変更します。
2. `.card`の`background-color`を`#fffaf0`から`#ffffff`へ変更します。
3. 完成済みの`color: #24323d;`は残します。
4. Previewで白背景と濃紺文字を確認し、判定を実行します。

変更するのはhrefと背景色Valueの2か所です。Code Errorが出たらColon、Semicolon、波括弧を確認しましょう。
