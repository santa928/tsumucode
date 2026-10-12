## Iteratorの消費位置と作り直し

同じiteratorのnextが消費位置を進め、復帰には元Listから新しく作る理由を説明できる。

先に各printの値と順序を予測し、freshを元のnumbersから作り、先頭の3へ戻します。 その後でConsoleと予測を比べてください。

表示の期待値:

```text
3
5
END
END
3
END
```

この課題は提示したデータ・表示順・コードの構成を保ち、指定箇所を修正します。変数・Functionの名前は変更できます。別の構成の同値プログラムを総合判定する課題ではありません。許容構文は0〜8個の小さい整数List、一段内包表記、iter/next/list、単純なyieldです。合格には今回の変換・同じobjectの消費・作り直し等の比較をSourceと実出力で満たします。import、属性アクセス、入れ子内包表記、任意packageは対象外です。inputは使いません。

Browserは固定Pyodide314.0.7、Localは固定CPython3.14.2で実行します。Local採点は練習とは独立した固定ケースです。エラーや中止でもSourceを保持して修正できます。制作途中のCourseであり、公開Pathへは追加していません。
