# JavaScriptの計算関係と共有Workspaceの現在完了

初級の計算・比較・Function returnの演習では、指定対象を直さず表示行だけで正答を作るコードを合格にしない。`computed-output` factは指定bindingの初期化式、または指定Functionの単一・無条件returnの二項計算と、同じlexical bindingを無条件top-levelのbuiltin `console.log`へ直接渡す関係を記録する。対象bindingは宣言が一意で、Console出力までの再代入・更新がないことを確認する。Function内の関連writeは呼出順を推測せず採用しない。別lexical bindingへのwriteや出力後のtop-level writeは除外しない。

Operandは名前またはprimitive literalに限定する。掛け算と厳密等価比較は両端の逆順を受理し、文字列連結は順序を保持する。括弧、空白、引用符の違い、既存のFunction外形の別解はSource全文一致で制限しない。未使用Function、同名shadow binding、別の計算式、固定値だけの表示を指定対象の計算結果と扱わない。汎用の別名追跡やdata flow解析を追加する契約ではない。

対象は`javascript-ch01-l03-e01`、`javascript-ch02-l01-e01`、`javascript-ch03-l02-e01`、`javascript-ch03-l04-e01`、`javascript-ch06-l04-e01`。教材revision `2026-10-02.1`から`2026-10-02.2`へ進む際、この5演習だけ旧合格を失効する。旧Draft全文と過去成功Sourceは既存の隔離・復旧backupへ保持し、他演習の合格やSlide閲覧を保つ。

共有Workspaceの採点対象は現在工程までのprefixを維持する。編集・Resetの失効対象はCourse Indexの全Workspace所有Exerciseとし、未読込の未来Lessonの本文を読む必要はない。編集は現在の採点evidenceだけを取り消し、過去passing snapshot、初回完了日時、閲覧位置を保つ。確定Resetは既存互換としてStarterへ戻し、開示Hint・判定履歴・passing snapshotを消去して全Workspaceの現在完了を取り消す。Reset取消はすべて保持する。保存・Map・再読込・Export/Importはこの同じ現在完了状態を使用する。

`project` capability profileでは、既習の同じ画面のElementに登録したEventの`currentTarget`と既存asyncを組み合わせられる。既存native getter guardを使用し、Documentなどの非Element currentTargetはcatchしても非採点のunsupported診断にする。Form送信取消の採点は既存`dom-form`契約を維持する。
