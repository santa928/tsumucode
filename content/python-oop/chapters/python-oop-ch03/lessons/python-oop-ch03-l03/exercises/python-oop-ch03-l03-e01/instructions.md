## 設定と回数の持ち主を分ける

trace_calls(label)は表示用の設定を受け取り、decorateを返します。decorate(function)が別々のcallsを持つwrapperを作り、wrapperの呼出しで元のFunctionへ引数・戻り値・例外を渡します。wrapsによるmetadataの保持も必要です。

starterではcallsが設定Functionの側にあり、同じconfiguredを再利用すると回数を共有します。callsの初期化をdecorateの中へ移し、wrapperのreturn 0を元のFunctionの中継へ直してください。@trace_calls("倍算")はdouble = trace_calls("倍算")(double)に対応します。

同じconfiguredから作ったdecoratedとagainでも回数は別です。decoratedは1、2、例外時3、再開時4。againは1、2。doubleも1、2です。

元のFunction/Class名、設定値、入力と末尾の観察行を保ちます。出力の固定印字だけは目標達成にしません。妥当な別名・途中値・加算順・明示適用・wrapsのimport別表現を扱う限定課題です。任意のPython表現を採点できるわけではなく、教材外構文は未採点です。元のTypeErrorやAttributeErrorは実行時エラーとして表示します。

入力欄は使いません。判定後はSourceが保存され、再読込で再開できます。最初に戻すとstarterへ戻ります。Browser/Local間の移動には既存のJSON転送を使います。
