# Local Workspaceの代表学習課題

`./scripts/learn.sh` で起動し、`http://127.0.0.1:4173` の学習一覧から
「実サーバーで見出しを変更する」を開く。Local専用の代表Projectであり、
正式Course/Catalogへの追加やNext教材固有の採点は行わない。

1. 「環境へ接続」を選ぶ。接続・再接続は明示操作で行う。
2. `message.js` の `message` を `こんにちは、実サーバー！` に変更する。
3. 保存して起動し、実HTTPのPreviewを確認する。
4. 実行中の編集は「保存して実行へ反映」でViteへ渡す。
5. 編集・保存版・反映版が一致したら「実サーバーで判定」を選ぶ。
6. 停止しても下書きと進捗は保持する。画面を離れる時も対象runを停止する。

保存先は二つある。端末の下書き/進捗は既存IndexedDBとLease付き保存、
controllerのSourceはDocker Source volumeを使う。競合時に端末の下書きを
自動で置き換えず、保存版を再取得してから明示保存する。
Pages/Localはoriginが異なる。既存「端末データ」JSONで下書き/進捗を移行できる。
Local専用識別子をJSON移行へ登録するが、PagesにはLocal画面/API探索を含めない。
controllerのSource/runや管理tokenはJSONへ含めず、移行後は明示接続/保存/起動する。

## 採点と実行の境界

`POST /api/workspaces/:id/grade` は管理認証のほか、run ID、保存revision/hashを要求する。
readyの現行runだけを採点し、保存版と反映版を前後に照合する。
実行中の保存変更、停止、別Workspace/旧run、UIの連続編集後の結果は合格へ採用しない。
採点中のapply/重複gradeは拒否する。通信失敗を初期状態へ置き換えない。

固定trusted Chromium sidecarが同じrunのUnix transportをreadonlyでmountし、
実ViteのHTTP/必要なHMR WSだけを自身のloopback Browserへ渡す。
可視の `h1#message` の文字列をPlaywright側で確認し、JavaScriptエラーがあれば合格にしない。
learnerのpostMessage/Console/stdoutやAPI入力の期待文字列を採点結果として信用しない。

graderは非root、readonly rootfs、cap drop、network:none、CPU 1、memory/swap 768 MiB、
PID 128、tmpfs `/tmp` 256 MiB、10秒、stdout 64 KiBに限定する。
Source/control/Docker socket/host repository/home/資格情報をmountしない。
learnerのCPU 1/256 MiB/PID 64/network:none/共有1枠は変えない。
停止・切断はgraderを中断し、graderとlearnerの回収後にtransport/共有枠を解放する。
回収が不明な場合は次の起動前にowner回収barrierを通す。他ownerは保持する。

固定Browser imageは初回build時に取得する。正式Pages公開のdispatchは別の判断で行う。
Preview/Origin/CSPとNextへの条件は [Preview境界](local-preview-boundary.md) を参照する。

## 対象検証

Source/run/API照合、保存・停止・離脱・Lease再検証のUnit、実learner/graderのinspectと
採点中保存/停止/他owner保持、製品UIの編集→起動→HTTP→反映→判定→停止/再開、
連続編集/画面移動/後着/通信障害/再読込、キーボード/小画面/axe、既存JSON移行を確認する。
代表Projectを対象にし、全Course×全Browserの新しいgateは追加しない。
