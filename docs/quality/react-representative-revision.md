# React代表教材改訂（#260）

読書リストは、配布した親にBookCardを書く、配布したBookCardを親Stateへ接続する、絞り込みと件数を仕様から追加する、の3段階で制作する。続く温度課題では表示部品とState所有者を選ぶ。既存Form/Effectの導入は残し、新しいcompose課題で本人が変更・送信・リセット処理、購読・依存配列・同じ購読の解除を書く。

型・配列・Props/Stateを既習前提とし、日本語の工程票に本人が書く箇所と有限の採点条件を示す。Hookの網羅利用や、外部同期のないクイズへのEffectは要求しない。HTTP・Server・URLの責務はNext.js側に残す。内容の参照元は既存の独自制作記録を引き継ぎ、他教材の本文や採点をコピーしていない。

既存の導入、共有WorkspaceのGuided 2工程、独立Capstoneは保持する。旧Guidedのreact-ch02-l01/l02はreact-ch03-l01/l02へ、旧Capstoneのreact-ch03-l01はreact-ch04-l01へ移動する。同IDの新目標へ旧達成を付与せず、移行定義による隔離を維持する。旧URLの意味の完全互換は保証しない。

## 検証と受入の境界

読書・温度の構造条件、固定型検査、実DOMと全操作ScenarioのANDで判定する。正当な別名・helper・Keyの記述を許容し、未使用の部品や表示につながらないState・固定表示による迂回は拒否する。通常JavaScriptの安全解析、実行ガード、上限、strict protocol、Source identityは維持する。型定義seedが一致しない場合は従来の完全型検査へ戻る。

既存のAI役割評価は、元Sourceと実際に観測した範囲を保持して再利用する。新6目標の24枠中22枠には受入原本がある。読書のreact-ch02-l03では初回判定の安全停止、Effectのreact-ch01-l11-composeでは初回自動実行の環境エラーがあり、それぞれ同じコードでの回復後成功とは区別する。原因未確定の2件は承認保留であり、この改訂のunit成功だけでは解消としない。

Formのaria-invalid実属性、現候補の保存・Reset・再試行、採点の正負・別解と型検査は技術検証の対象である。AIの操作成功や自動採点は、実人の理解・習得、ヒント未使用、一般設計能力、実務転移を証明しない。

## 公開前の接続

Python先行公開後の認証済みbaseline/predecessorに、後続React25移動と初回React工程票2行の限定差分を接続する。先行段階で消費済みの旧Python10意図を再適用しない。共通movement本文・schemaは統合担当が所有する。この文書は最終Source/Artifactの公開資格、全site gate、公開後確認、Issue closeを承認するものではない。
