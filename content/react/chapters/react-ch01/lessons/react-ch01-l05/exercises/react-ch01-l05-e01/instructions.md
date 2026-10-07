## 修正と操作

addで元のStateを変えず新しい配列にJSを追加し、liのkeyを並び位置から項目IDへ変えます。HTML・CSSの初期順序を保ちます。

JSを2回追加、HTML削除、逆順、JS削除、JS再追加の順に操作します。JSは重複させません。残った項目のIDは変えず、Stateと表示の順序を一致させます。

## 用意済みの型と判定

Topic型のidとlabelはreadonly（直接書き換えない）です。useStateのreadonly Topic[]は読み取り専用配列の型指定。Hookと更新関数は前の単元と同じです。JSの追加は既存のjsをfilterで除いてから追加できます。

型、初期表示、実操作後の順序、元配列を変えない更新、項目ID由来のKeyを合わせて判定します。関数名・整形や、新配列を作ってreverseする別解も許容します。Form・Effect・複数ComponentへのState配置は後続単元です。
