# Browser Console実行（Issue #29）

[#29](https://github.com/santa928/tsumucode/issues/29)のConsole側を既存の実行・採点・保存へ接続する。DOM側は別評価とし、`currentTarget`を含む未達条件をこの変更だけで完了にしない。

## 対象と利用契約

`javascript-ch03-l05-e01`〜`e03`の単一classic `script.js`、primaryOutput=console、workspace全体のルールがsource/consoleのみ、interactionなしの場合だけ、実行器と採点器を一組で選ぶ。Local Node学習版では従来のNodeを選び、このBrowser実装へ切り替えない。他の演習は既存DOM Runnerを使う。初期化失敗時の別方式への自動切替はない。

配列/オブジェクトの変数添字、new Promise、有限のPromise連鎖・queueMicrotaskを実行する。非同期I/Oやタイマーは提供せず、「全Promiseがsettledになるまで待つ」とは定義しない。解決されないPromiseを作るだけなら実行終了できる。未処理rejection・microtask内例外はコードエラーになる。

教材ID、3ファイルの下書き、採点ルール、進捗、Import/Export形式は維持する。Console方式ではHTML/CSSを描画しないことを画面に表示する。初期コード・編集・Preview・Resetの後も同じControllerを利用し、実行ごとにWorkerを作り直す。

## 実行境界

- 親画面は`allow-scripts`のみの非表示opaque iframeを作る。iframe内の信頼bootstrapがBlob Workerと専用MessageChannelを作成する。親originのWorkerに学習コードを渡さない。
- CSPは既定拒否、nonce付きbootstrapのみ、Workerはblobのみ、connectは禁止。Workerのglobalとprototype chainから固定allowlist外の能力を除去し、除去不能な値があれば失敗とする。BrowserのTEMPORARY=0/PERSISTENT=1だけは既知の値を持つdata propertyとして検査する。通信・保存・下位Worker・共有メモリ・公開メッセージAPIを提供しない。
- 学習コードはtrusted IIFEの外のstrict arrowで実行し、port・終了用Promise・native参照を閉包に渡さない。CSPによりFunction constructor等の文字列実行も拒否する。
- 完了用の秘密Promiseには拒否前に捕捉済みnative Promise.thenを登録し、その閉包callbackが置くnative次taskで一度だけ結果を送る。学習者の未処理拒否を受け取るlistenerは維持し、内部通知をeventから扱う場合も秘密Promiseのidentityを照合する。Firefox/WebKitではrejection eventのisTrustedを認証に使わない。通信portの受渡しはtrusted MessageEventだけを受け取る。
- 内部markerは事前にhandledへし、FirefoxのBrowser Consoleへ内部のnull拒否を漏らさない。markerのconstructorは固定し、学習者のconstructor/species getterを呼ばない。学習者のnullを含む未処理拒否・例外は従来どおりコードエラーとする。有限microtaskと拒否通知の先後は対象3ブラウザで実測し、ECMAScriptだけから全task sourceの順序を保証するとは定義しない。
- iframe側の1500ms timerがWorkerをterminateする。同期/無限microtaskでWorkerが応答しなくても停止し、port・Blob URLを片付けてから結果を返す。親側にも2500msの準備・応答期限を設ける。OOMやブラウザプロセス障害の完全な資源隔離は保証しない。
- Consoleは100件、1件4KiB、合計64KiB、深さ3・要素50に制限し、上限到達をstoppedとする。
- 親はeventのsource・opaque origin・isTrusted、schema・byte数を検証する。run/session/revisionとSHA-256は親が付け、Workerが送ったidentityを信用しない。結果は一度だけ採用する。
- stopはまず世代を失効させ、準備中のhash待ちも解除する。遅い準備から新frameを作らず、各runが所有する資源だけを解放する。stop後は再利用可能、dispose後は最終停止。

ASTは構文診断・非提供能力の説明・教材source factsに使う。入力を診断で拒否したことだけを通信/保存隔離の証拠にはしない。学習用の変数名が非提供globalと同名でも、正当なローカルbindingなら拒否しない。解析は100KiB/20,000 nodesを上限とし、解析限界は学習者の不正解にしない。

## 採点・失敗・保存

成功実行は合格を意味しない。Consoleの採点器だけがDOM snapshot不要の契約を選び、browser/browser-js/script/console identity、操作なし、source/consoleルール、信頼側source hashとevidenceを照合する。既定のDOM採点器とLocal Nodeの契約は維持する。空snapshotやNode identityを偽造しない。

unsupported・system-error・stoppedは採点履歴を追加しない。以前の成功Consoleには「前回成功時」を表示する。構文・実行時エラーは既存のコード診断として扱う。編集直後の同一URL再検証は既存initialization chainを維持し、旧保存の完了後に新下書きを読む。

## 検証と残件

Docker内の製品Vite buildで、ClosureのReset→再編集→Preview→判定、添字/Promiseの実出力、未対応/停止時の履歴保持、下書き再読込をChromium・Firefox・WebKitで確認する。任意練習3件とImport/Export、HTML導入の回帰も対象にする。製品dynamic entryを使う境界テストで旧run、手動停止、無限microtask、停止後の再試行、private scope、動的実行拒否を確認する。

別の診断fixtureでは製品と同じbootstrapを使い、入力policyを通さず実能力の除去・CSP・外部通信0件・親Storage canary保持を3ブラウザで実測した。このfixtureのbundlerは製品Vite buildとは異なるため、製品UIの証拠と区別する。実行結果の詳細、失敗からの修正、未実行項目はPRへ記録する。

DOM profileのcurrentTarget・変数添字・同期暴走は本変更で解決したと扱わない。Pages配信後操作、実機、人による初心者試用もローカル自動テストで代用しない。全Course×全Browser・新しい固定テスト件数・万能JavaScript VMは目標にしない。既存公開Gateと性能予算は維持する。
