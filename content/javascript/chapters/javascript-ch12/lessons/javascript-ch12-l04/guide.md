## 制作と確認の順序

前工程で作ったSourceを残し、今回のTODOから変更します。前の工程を壊したら、その工程へ戻って説明を見直せます。

1. 最後の問題への回答と結果表示を分けます。途中は「次の問題」、最後は「結果を見る」。最後のnextで全問の後へ進み、回答操作を閉じます。
2. indexがquestions.length - 1なら最後です。次問がないときはquestions[index]がundefinedです。textやchoicesを読む前に、問題がある場合と結果の分岐を作ります。
3. 今の問題があるかで問題領域と結果の表示を切り替えます。結果は「2問中1問正解」の形です。全問正解/全問誤答も最後まで試します。

## 提供APIと目印

index.html/styles.cssは提供済み、questions.jsは非編集です。main.jsはentryです。named importでloadQuestionsを読み、成功したArrayを使います。失敗はcatch、操作回復はfinallyへつなぎます。

KeyboardではTabで移動しEnter/Spaceでbuttonを押します。標準buttonに同じkeydown処理を重ねると二重発火します。提供CSSのfocus枠を消さないでください。

制作を終えたら保存後に再読み込みし、Sourceが戻ることを確認します。学習データはHomeの書き出しから持ち出せます。別の保存状態へ読み込んでSourceと判定を確認します。HTML用ZIPとは別の学習bundleです。

## 提供データの扱い

questions.jsは編集不要の提供Moduleです。内部でJSON文字列をArrayへ戻しますが、この章でJSONの記述は求めません。loadQuestions(shouldFail)の返すPromiseと、問題Objectのtext/choices/correctを使います。データをコードとして実行する処理はありません。

練習Loaderは「読み込み失敗を試す」の後の再試行で問題順を入れ替えます。固定の文章ではなく、今回受け取ったArrayから問題と選択肢を描画してください。

提供HTMLのcontrolsは開始と練習用の失敗操作をまとめるfieldsetです。disabledで読み込み中の操作を止められます。score内のscore-valueは数値を表示するspanです。状態は複数の変数でもObjectやclosureでも構いません。名前や関数分割より、Checklistの操作と結果を確かめます。
