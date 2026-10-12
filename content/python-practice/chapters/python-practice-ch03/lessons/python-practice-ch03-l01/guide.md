## Generator式をsumへ渡す

`sum`は反復できる値を受け取り、順に足します。`(number for number in numbers)`はGenerator式です。List内包表記の`[number for number in numbers]`がList全体を作るのに対し、Generator式は消費されるときに1つずつ値を渡します。Functionのyieldで作ったGeneratorとは作り方が異なりますが、どちらも反復して消費できます。

```python
numbers = [2, 4]
print(sum(number for number in numbers))
print(sum(number for number in []))
```

単一の引数として渡すときはGenerator式自身の丸括弧を省けます。上の表示は6と0です。Projectでは各Recordから読むamountを値の式にし、read_recordsの反復結果から1件ずつsumへ渡します。

## 予測してから3箇所を修正する

1. Recordのamountへintの型注釈を書いても、Record("型注釈だけ", "4")の値は文字列のままです。最初のTrueを予測してください。
2. read_recordsのint変換は文字列を整数へ変換します。変換に失敗するとValueErrorです。負値の拒否をpassから明示的なValueErrorへ直します。
3. totalの0を、read_recordsがyieldする各Recordのamountをsumで消費する処理へ直します。空の反復のsumは0です。

固定Testの不正値を試すtry/except/elseでは、ValueErrorが出ればexcept、例外なしでtryを終えた場合だけelseへ進みます。elseのAssertionErrorは、本来拒否する値を受け入れてしまったことをTest失敗として示します。

固定Testの入力・期待値・表示・Function/Class名は保ちます。Test成功は正常/空/不正文字列/負値の4値ケースを通った結果です。amountの注釈の正しさなどは別のSource条件です。Test成功でも注釈がstrのままなら判定は未達になります。assertの失敗はこのdriverがAssertionErrorだけを捕捉し、ConsoleへTest失敗、判定へ未達を表示します。未捕捉のTypeError等はRuntime Errorです。教材外構文や環境障害は未採点(system error)です。

assertは開発中のTestに使う確認で、実行時の値検証を代行しません。Pythonの最適化実行ではassertが省略されます。本教材の固定実行には最適化を指定しません。負値はifとraiseで拒否します。

Sourceは保存して再開できます。最初に戻すとstarterへ戻ります。Browser/Local間は既存JSON転送を使います。入力欄は使わず、文字列データは固定Test内で指定します。
