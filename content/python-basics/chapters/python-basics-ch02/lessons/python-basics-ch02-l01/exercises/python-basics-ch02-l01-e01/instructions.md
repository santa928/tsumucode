## 小Console制作: 2行の整数を合計する

## Project Brief

入力2行を整数へ変換し、List・for・別moduleの関数を使って合計を表示するConsoleを作ります。不正な文字列の場合は案内を出し、どちらの場合も終了まで進みます。Browser版は事前入力を使います。Local CPython版は事前入力のプレビューと、実行途中に行を送る未採点の「練習実行」を分けます。「判定する」は正常入力・1行目が不正・2行目が不正の固定ケースを別実行し、すべての出力とコード条件を確認します。外部サービス・package取得は使いません。

必要なSourceはmain.pyとlesson_tools.pyです。既習のFunction・Collection・反復・事前入力を、前2単位のModule・ValueErrorに接続します。

## 段階・最小例

段階1: helperへaddとparse_numberを用意します。

```python
def add(left, right):
    return left + right

def parse_number(text):
    return int(text)
```

段階2: mainで入力2行をListにし、forとhelperで集計します。段階3: 整数変換の失敗だけを処理します。

```python
from lesson_tools import add, parse_number
texts = [input(), input()]
total = 0
try:
    for text in texts:
        total = add(total, parse_number(text))
    print(total)
except ValueError:
    print("整数を入力してください")
print("終了")
```

importのカンマは、同じmoduleからaddとparse_numberという2つの名前を取り込む区切りです。[input(), input()]は左から順に呼び出して2行を読み、順番どおりListに入れます。

3、5なら8、終了です。途中の合計を表示せず、2つを集計した後に表示します。3、abcでは案内、終了です。1つ目の集計が進んでいても、完成した合計として表示しません。

tryの前で2行を取得します。1行しかなければ本物のEOFErrorで入力不足として非採点になります。空文字列を1行として渡す場合は、2行を用意したうえで整数変換の失敗を観察できます。負数は整数なので拒否しません。

## 予測・修正・受入

予測: print(total)をforの中へ入れたら3、5で何を表示しますか。3、8、終了となり、途中経過も表示されます。この制作の完成表示とは異なります。

修正: starterは集計でhelperのaddを使わず、毎回parse_number(text)でtotalを置き換えています。合計を引き継ぐように直します。入力3、5だけの8を直書きする解決は、別入力で結果が変わる目標を満たしません。

受入は3/5→8、4/6→10、0/0→0、負数を含む入力、2行中の不正文字列/空文字列の案内、入力不足の非採点、未処理例外/構文エラーのcode-errorを分けます。出力に加え、mainのimport→helperの定義と呼出し→集計と表示の接続を両fileから確かめてください。

別解は変数名、helperの加算順、一時変数を使うreturnです。printをforの外へ置き、完成したtotalを表示する関係は必要です。両ファイルの構造と実出力を合わせて判定します。

## Hint・Solution・Reflection

1. 各回に読む値と、それまでのtotalは別です。
2. parse_number(text)の整数とtotalをaddへ渡します。
3. total = add(total, parse_number(text))をforの中に置きます。

Solutionは最小例の2ファイルです。Reflection: intのValueErrorはどこからどこへ伝わりますか。totalを更新する場所と完成結果を表示する場所が異なる理由を説明してください。

## 保存・再開・持ち出し

両ファイルを編集して保存、reloadしてhelperを選択、再実行、Resetで両starterへ戻る操作を確かめてください。入力は保存対象外なので、再開時に2行を再入力します。Browser/Localは別originで自動同期せず、既存JSONの差分確認・読み込みを使います。

「制作Sourceを持ち出す」は、クリック時点の2.pyと起動READMEをZIPにします。JSONは学習状態の移送用であり、直接実行する.pyの代わりにしません。ZIPへ入力・token・run・進捗は含めません。クリック時点のSourceを持ち出します。

ローカルで既にPythonを使える人は、同じフォルダーへ2.pyを置き、python main.pyで順番に2行を入力して同じ結果を確かめる手順をREADMEへ記載しています。サイト内の実行にはPythonの導入は不要です。
