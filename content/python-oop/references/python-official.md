# Python公式仕様の確認

確認日: 2026-10-14。採用Runtimeは既存のCPython 3.14.2 / Pyodide 314.0.7を維持します。以下は3.14系列の公式文書であり、表示された文書版をRuntime更新理由にしません。例・課題・図は独自に作成しました。

- [Classes](https://docs.python.org/3.14/tutorial/classes.html): Class/Instance、名前とobject、初期化、Class/Instance属性とmethodの暗黙引数を確認。
- [classmethod](https://docs.python.org/3.14/library/functions.html#classmethod): 呼出先Classが先頭へ渡ることを確認。
- [staticmethod](https://docs.python.org/3.14/library/functions.html#staticmethod): 暗黙の先頭引数を受けないことを確認。

- [Inheritance](https://docs.python.org/3.14/tutorial/classes.html#inheritance): 単一継承・属性探索・overrideと、別objectへの参照を持つ組立ての違いを確認。
- [property](https://docs.python.org/3.14/library/functions.html#property): 属性の読取りと代入がgetter/setterへつながる契約を確認。
- [Data model](https://docs.python.org/3.14/reference/datamodel.html): 長さ用dunderが0以上の整数、文字列表示用dunderが文字列を返し、len/str/printから呼ばれる契約を確認。

一般decorator・多重継承・metaclass・descriptor自体の実装は扱いません。固定教材のAST事実と実出力を照合し、一般Pythonの自由な採点や提出ごとの直接object検査とは説明しません。
