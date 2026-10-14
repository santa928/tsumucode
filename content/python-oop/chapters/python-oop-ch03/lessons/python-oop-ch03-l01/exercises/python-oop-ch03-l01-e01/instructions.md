## 先に予測する

同じdecoratedの呼出しと別のdoubleで、回数はどのように変わりますか。例外の前に増えた状態は残りますか。

## 修復する

wrapperの状態を増やし、受け取った位置引数と名前付き引数を元のFunctionへ渡し、その戻り値を返します。 count_callsはFunction objectを受け取り、Function objectを返します。@記法のdoubleと明示適用のdecoratedの両方を確かめます。

元のaddとdouble、最後の観察行は維持してwrapperを修復します。呼出回数は元のFunctionを呼ぶ前に増やす設計で、負の値のValueErrorも呼出し元まで届けます。

## 確認と別解

位置引数と名前付き引数、異なる値、複数の装飾Function、繰り返しと例外を確認します。関数・内部変数の別名、加算の左右交換、途中値を返す形、明示的なcountの加算と2つ目のFunctionへの明示適用も対応します。 この教材は記載した限定構文を判定し、任意のPython表現を採点するものではありません。
