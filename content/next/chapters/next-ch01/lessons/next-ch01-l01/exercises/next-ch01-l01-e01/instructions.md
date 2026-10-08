pageの見出しと、queryで異なるJSON応答を作ります。

- app/page.tsxのh1を「こんにちは、Next.js！」へ変更します。
- app/api/question/route.tsはqueryなしで「最初の実リクエスト」、mode=secondで「2つ目の実リクエスト」をmessageに返します。
- 環境へ接続し、保存して起動します。編集したら保存して実行へ反映し、実サーバーで判定します。
- Previewの下の「JSON応答」で2種類のGETを比べられます。実際のレスポンスであり、固定の出力例ではありません。
- 停止後も下書きは残ります。再起動して同じSourceを確認します。

layoutとCSSは読み取り用です。Nextの設定・依存・任意commandは変更しません。Pagesでは実行できないため、JSONを書き出してLocalへ移行してください。
