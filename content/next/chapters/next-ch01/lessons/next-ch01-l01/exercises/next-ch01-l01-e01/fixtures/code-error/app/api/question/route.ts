/** 実行エラーを観測する負の作者Fixture。 */
export function GET(): Response {
  throw new Error('Route Handlerの失敗例');
}
