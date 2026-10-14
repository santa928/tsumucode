# Class・属性・method比較の草稿契約

Issue148はPython OOPの最初の2 Lesson・2 Exercise・7 Slide、目安50分を扱う。Courseはdraftで、Home/Pathの完成Courseに加えず、Pages公開・実人/物理端末の受入・親Issue17/152の完了を意味しない。Python基礎のFunctionとスコープ、Python実践のdataclassを前提とする。

## 学習順と後続の範囲

| 子Issue | 学習単位・判定の焦点                                                                       |
| ------- | ------------------------------------------------------------------------------------------ |
| 148     | Class/Instance、初期化、identity、個別値、Class属性の共有/遮蔽、同じ倍率計算の3 method比較 |
| 149     | 継承とComposition、Property、用途を絞ったdunder。148の初期化を焼き直すだけにしない         |
| 150     | Function object/Closure、明示的な関数適用とdecorator、引数/戻り値/例外とwraps              |
| 151     | 引数付きdecoratorの設定/装飾/呼出しと小Project。状態を不用意に共有しない                   |
| 152     | 上記の全目標、承認された初心者受入、品質/公開Gate/許可と配信後確認                         |

148ではClass/Instanceと属性の参照先を先に説明し、self/clsは予約語でなく慣習名として扱う。classmethod/staticmethodの固定指定を比較に用いるが、一般decoratorのFunction変換は150へ残す。継承・Property・metaclass/descriptorの詳細は混ぜない。

## 実行・採点

既存の固定CPython 3.14.2とPyodide 314.0.7を再利用する。新規依存・権限・外部通信・Shell/PTY・SAB/COOP/COEPは追加しない。

- L01は別Instanceとalias、個別value、Instance独自factor7とClass更新factor4を比較する。
- L02は同じ倍率計算をinstance method、classmethod、staticmethodで行う。Classからの通常methodはInstanceを明示する。Class倍率変更後と明示倍率2を区別する。
- 名前/引数の慣習名変更と乗算順序の入替えは正例。出力直書き、Classへ個別値を書いて共有する誤り、Classへ書いてしまう遮蔽の誤り、固定倍率、staticのClass状態参照や誤ったbindingを正例にしない。
- 固定教材のAST事実と同じSourceの実stdoutをANDで照合する。作者だけがobject、属性dict、bound methodの実引数を直接観察する。提出ごとの直接object観察や一般Pythonの自由採点とは説明しない。
- 固定main.py/100 KiB、既存出力・CPU/メモリ/時間制限、停止/回収、source/session/revision照合を維持する。Class・組込みclassmethod/staticmethodを新profileだけで扱い、bases/metaclass/任意decorator/import/private属性等を採点範囲へ広げない。ASTは隔離の根拠ではない。
- CPythonのcapabilityはpython-oopのcourse revisionを返す。他Courseのrevision・余剰file・未対応profileを受け付けず、同じSourceの固定suiteを要求する。
- 誤呼出しは本物のTypeErrorとして扱い、コードエラー・未達・未対応/環境障害を分ける。Source保持、保存・Reset/再開・既存進捗/過去成功版は既存Sessionを再利用する。

## 検証と未完条件

正負Fixture・作者object観測は実CPython/Pyodideで実行する。通常画面の実行/判定、正解後の誤呼出し、Source/旧成功の保持、Reset/再実行、Keyboard/a11y、代表幅と静的図を確認する。Home初期への重いPython依存・作者Solution/Fixtureの配信非混入、対象compile/型/Lint/Unit、3独立最終レビュー、正確HEAD初回CIとmerge SHA main初回CIを記録する。

Issue147の実人/物理端末/性能受入と公開binding・許可・配信後確認は引き続き未完のまま保持する。新Courseの公開は152で判断する。現在の草稿実装を受入や公開の完了に置き換えない。

Issue149で追加する3学習単位と限定Runtimeの範囲は、[継承・Property・dunderの草稿契約](python-oop-object-contract.md)を参照する。
