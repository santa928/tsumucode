## 反復の公式出典

- [内包表記](https://docs.python.org/3.14/tutorial/datastructures.html#list-comprehensions)
- [Iterable・Iterator・Generator](https://docs.python.org/3.14/tutorial/classes.html#iterators)
- [nextとdefault](https://docs.python.org/3.14/library/functions.html#next)
- [Generator状態の作者検証](https://docs.python.org/3.14/library/inspect.html#inspect.getgeneratorstate)

本文・問題・図は独自制作です。公式Webのpatch版と固定実行版の検証は区別します。採点は限定Sourceの使用・値の流れと実出力を確認し、学習者が出すtraceを信頼できる状態packetとは扱いません。作者Fixtureのobject/state観察を、各提出を直接観測した証拠へ拡張しません。

## Resource終了処理の公式出典

- [StringIO・IOBaseのclose/closedとContext manager](https://docs.python.org/3.14/library/io.html#io.StringIO)
- [withの開始・正常終了・例外終了](https://docs.python.org/3.14/reference/compound_stmts.html#the-with-statement)

この教材はメモリ内streamだけを扱います。ファイルpath・OSのfile descriptor・通信・任意標準libraryは学習範囲へ追加しません。closeはbufferを利用不能にする終了処理です。変数の消滅や、物理メモリの上書き・GC時刻を保証する操作ではありません。PyodideとCPythonの固定版で同じStringIO動作を実確認します。
