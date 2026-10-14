# 設定付きdecoratorと記録Projectの草稿契約

Issue151は設定時・装飾時・呼出時を分ける30分の標準演習と、ClassのInstanceへ記録する35分のguided Projectを追加する。追加2Lesson・2Exercise・7Slide・65分、Course全体は9Lesson・8標準Exercise・1guided Project・34Slide・240分。学習前提は150のFunction変換・Closure・中継・wraps。Projectだけは148で学ぶClass・Instance・Instance methodも前提とする。149の継承・Property・dunderを使用せず、未使用の前提を増やさない。

設定値labelはfactoryのClosure、callsは各装飾で作るwrapperのClosure、totalは各LedgerのInstanceが持つ。同じconfiguredの再利用でもcallsを共有しない。異なる設定・複数Function・複数呼出・同じ設定の再利用を比較する。呼出を試みた回数を元のFunctionより先に増やすので、例外でも増加は残る。Ledgerは負値を更新前に拒否する。

引数・戻り値・同じ例外を中継し、wrapsで名前・docstring・元への参照を保つ。作者だけの直接Function観測で未知の引数、別Instance、例外identity、再利用した設定の状態分離を確かめる。これら作者probeと解答Sourceを提出の採点や公開JSONへ持ち込まない。

## 限定採点と実行境界

新configured-decorator-v1 / decorator-ledger-project-v1だけが3層のFunctionと記録ProjectのClassを扱う。既存22profileの許可構文・厳密packetは広げない。新2profileは独自の2boolean packetを要求する。ASTは既存同様1,000node・module本体40文・定数上限と許可構文を確認してから、中継・状態の位置・元の計算・観察行を確認する。解析中に学習コードを実行せず、隔離の代わりにはしない。構造と同じSourceの実stdoutをANDで照合し、固定印字だけの解を合格へ変えない。

妥当な別名、途中値、加算順、明示適用、wrapsのalias/module/明示適用を正例とする。wrapper内のリセット、設定側へ置いた共有回数、固定label、return欠落、名前付き引数の欠落、例外の握り潰し、metadata欠落、Class側へ置いた共有記録、検証前の更新を負例とする。教材外構文は未採点、実TypeError/AttributeErrorとSyntaxErrorは既存code-error経路を維持する。

CPython3.14.2／Pyodide314.0.7、Source bytes・revision/session・停止/回収・保存/Resetと既存Project UI・JSON転送を再利用する。新依存・Runtime・権限・通信・外部サービスを追加しない。

## 検証と保留

両engineの正負Fixture・作者の実Function/Instance観測・全7Slide例、製品解析wrapperを検証する。新2Lessonの通常両Runtime画面で判定・実エラー・Source全文保存・旧成功版・Reload・Reset・未対応時の履歴保持を確認する。Projectはガイド・Brief・チェックリストも確認する。7図のPC/390px画像とKeyboard/a11y、関連Unit・型/Lint・compile/build・配信JSON境界・既存7Lesson hash不変・独立3最終treeレビューを記録する。

Courseはdraftを保ちHome/Path公開追加を行わない。147の実人・物理端末・性能受入と新Pages公開は保留。正式OOP Course受入・公開は152の別判断とし、自動成功やAI内容レビューだけで代行しない。PR正確HEADとmerge SHAの両初回CIが成功してから151を完了扱いにする。
