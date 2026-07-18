## Stylesheet接続とDeclarationを直す

CardのStyleが届かない原因を、HTMLとCSSの両方から順に直します。

1. headのlinkをhref="styles.css"へ変更します。
2. styles.cssのbackground-colorを#ffffffへ変更します。
3. 波括弧とSemicolonを確認します。
4. Diagnosticが消えた後、Computed Colorを判定します。

Parser Diagnosticと、構文は正しいがValueが違う未達を区別して確認しましょう。
