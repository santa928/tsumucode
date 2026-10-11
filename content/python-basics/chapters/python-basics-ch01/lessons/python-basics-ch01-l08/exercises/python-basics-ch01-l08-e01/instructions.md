## Module: 別ファイルの関数を呼ぶ

目標は、関数の定義を別ファイルへ分け、呼び出した結果に変更が反映されると説明することです。前提は#141のFunctionです。新しく使うのは`from ... import ...`です。

## 最小例・結果・理由

lesson_tools.py:

```python
def add(left, right):
    return left + right
```

main.py:

```python
from lesson_tools import add
print(add(3, 5))
print(add(4, 6))
```

表示は8、10の順です。lesson_tools.pyの拡張子.pyを除いた名前がimportのmodule名です。この形ではaddという関数名をmain.pyで使えます。importは定義を使えるようにする操作であり、add(3, 5)の呼び出しが計算を進めます。

moduleは定義以外の文も持てますが、この課題のhelperには関数定義だけを置きます。読み込み時に勝手にprintする形や、helperから別moduleをimportする形は扱いません。一般のPythonで使える構文と、この教材が採点する範囲は区別します。

## 予測・修正

予測: helperのreturnをleft + leftへ変えたら2行は何になりますか。答えは6、8です。mainの呼び出しに同じhelperの変更が届きます。

修正: starterの関数はleftを2回加えています。2つの引数を加えるように直してください。main側の8、10を直書きしても、別ファイルの関数を使う目標は満たしません。

説明した別解はreturn right + left、結果を一時変数へ入れてreturn、呼び出し結果を一時変数へ入れてprintです。変数・引数名を対応させて変更することもできます。star import、相対import、import as、任意moduleは今回の説明・採点範囲に含めません。

## Hint・Solution・Reflection

1. 編集するのはlesson_tools.pyのreturnです。
2. 関数の引数leftとrightを、両方1回ずつ使います。
3. return left + rightで呼び出し元へ値を返します。

Solutionは最小例の2ファイルです。Reflection: main.pyを変えずにhelperを直すと結果が変わるのはなぜですか。importと呼び出しを分けて説明してください。

## 操作と範囲

2つのファイルを切り替え、変更を保存してから再実行します。次のrunでは新しいhelperを読み込み、前のmoduleを使い続けません。変更後の実出力でhelperが更新されたことを確かめてください。

標準libraryの新規importやpackage取得は、この最小案では追加しません。専用Workspaceの固定2ファイルのみを対象にし、ホストのfile、通信、対話入力待機を使いません。
