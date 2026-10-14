# 継承・Property・dunderの草稿契約

Issue149は既存OOP草稿に、3 Lesson・3 Exercise・12 Slide・想定75分を加える。Course全体は5 Lesson・5 Exercise・19 Slide・想定125分となる。Issue148のClass・属性・3種類のmethod比較を前提とし、正式公開・実人受入・親17/152の完了を意味しない。

## 3つの学習単位

- 継承ではCounterの初期化を使い、子の計算をoverrideする。CounterViewは別objectを保持し、別のread interfaceから計算を委譲する。継承を常に正解とせず、種類としての振る舞いと仕事の委譲から選ぶ。明示した共有参照、別Instance、意図しないClass属性の共有を比較する。
- Propertyは読取りのgetterと代入のsetter、0から100の値検証を扱う。拒否後に値が変わらないこと、初期化も同じsetterを通ること、別Instanceへの状態漏れがないことを確かめる。内部名は秘密保護の仕組みと説明しない。
- 採用dunderは既習の初期化に加え、長さを返す`__len__`と文字列表示の`__str__`に絞る。len/printの実呼出し、返却型の誤り、外部Listの参照と浅いコピー、空の別Instanceを比較する。

## 実行と採点の境界

固定CPython 3.14.2とPyodide 314.0.7、既存のSource bytes・出力・CPU/メモリ/停止・回収・Session/revision照合を再利用する。Runtimeや依存、権限、Shell、外部通信、一般Packageは増やさない。

新しい3 profileだけで、単一継承・限定したProperty・必要なdunder/List操作のASTを扱う。既存17 profileの対応範囲は広げない。ASTは900 node・module本体40文・定数値の上限を持ち、許可確認後にだけfactsを調べる。学習コードは解析内で実行せず、AST検査を隔離の代替にしない。

- 継承と委譲、Propertyの検証、dunderの利用を別の事実とし、同じSourceの実stdoutとANDで照合する。出力だけの直書きは正例にしない。
- 観察行はstarterに固定して定義を修正する。引数やClass/Instance名、乗算順、途中値を返す形、範囲検証のor/2つのif/not連鎖比較・正条件とelse、Listコピーのlist/copy/slice、同じ表示のf文字列など、採用範囲の妥当な別解を確認する。任意のPython表現を採点するとは説明しない。
- 未対応は実行前に非採点で返す。SyntaxErrorはOOPの解析packetで別に識別し、実Pythonのcode-error経路を保つ。旧Courseのpacketは維持する。
- 直接のobject・property・dunder観測は作者の検証だけで行う。提出ごとの採点へ作者probeや解答原稿を流用しない。配信LessonにSolution/Fixtureを含めない。

## 検証と残す条件

両実engineの正負Fixture・作者の直接観測・全12 Slide例を確認する。通常画面の3課題で判定、実エラー、保存全文、旧成功版、Reset、再開と非採点時の履歴保持を確認する。PC/390pxの図画像・Keyboard/a11y、必要なcompile/型/Lint/Unit/build/chunk、3独立最終レビューと内容hash台帳、正確HEAD/merge SHAの両初回CIを記録する。

CourseはdraftのままHome/Pathの公開Courseへ追加しない。Issue147の実人・物理端末・性能受入と公開binding/承認/配信後確認は未完を維持する。一般decoratorは150/151、全体の受入と正式公開は152に残す。多重継承・metaclass・descriptor実装の講義へ広げない。
