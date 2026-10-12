## 例外: 呼び出し元でValueErrorを受け止める

目標は、helperの整数変換で起きたValueErrorがmainへ伝わり、限定したexceptで案内を出して、その後へ進めると説明することです。前提は事前入力・int・Function・Moduleです。

## 最小例・結果・理由

lesson_tools.py:

```python
def parse_number(text):
    return int(text)
```

main.py:

```python
from lesson_tools import parse_number
text = input()
try:
    number = parse_number(text)
    print(number)
except ValueError:
    print("整数を入力してください")
print("終了")
```

事前入力18では18、終了を表示します。abcや空文字列1行では整数へ変換できず、案内、終了の順です。空文字列1行を渡すことと、入力行を用意しないことは異なります。

tryの中でValueErrorが起きると、残りのtry内処理を飛ばし、対応するexceptへ進みます。helperが捕まえなかった例外は呼び出し元へ伝わります。mainのexcept ValueErrorが処理した後、try/exceptの外の終了表示へ進みます。正常時はexceptを通りません。

inputはtryの前です。行が尽きるEOFErrorを、整数の文字列が不正なValueErrorと同じ案内へ変えません。Browser版は事前入力を使い、入力不足は非採点です。Local CPython版は事前入力のプレビューと、実行途中に行を送る未採点の「練習実行」を分けます。「判定する」は整数と不正文字列の固定入力を別実行し、両ケースとコード条件を確認します。

## 予測・修正

予測: parse_number(text)をtryの前へ移したら、abcで終了まで表示されますか。表示されません。tryが扱う処理から外れ、ValueErrorが未処理のまま終了します。

修正: starterの変換呼び出しをtryの中へ移し、ValueErrorの場合だけ案内を出してください。except:だけで全例外を捕まえる形は、この課題の対象を区別できません。

説明した別解は変数名の変更、print(parse_number(text))という直接表示です。成功値の直書き、実変換を使わない表示、関係のないtry、EOFErrorやExceptionの捕捉は合格条件を満たしません。課題の条件に沿って判定します。

## Hint・Solution・Reflection

1. abcで失敗する行はどこですか。helperのint(text)です。
2. mainからその関数を呼ぶ行をtryの中へ置きます。
3. except ValueErrorで案内をprintし、終了はtry/exceptの外へ置きます。

Solutionは最小例です。Reflection: helperで起きた例外がmainで処理できる理由と、終了の置き場所を説明してください。入力不足を同じ例外として扱わないのはなぜですか。

## 操作と範囲

参照ケースは正常な18・負数・符号/前後空白、abc・空文字列、未処理ValueError、構文エラー、入力不足を分けます。コードエラー後もSourceを残して修正・再試行できることを、確かめてください。
