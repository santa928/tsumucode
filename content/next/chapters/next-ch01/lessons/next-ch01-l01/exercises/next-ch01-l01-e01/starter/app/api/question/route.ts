/** queryを受け取りJSONを返す。外部APIや秘密情報は使わない。 */
export function GET(request: Request): Response {
  const second = new URL(request.url).searchParams.get('mode') === 'second';
  return Response.json({
    message: second ? '最初の実リクエスト' : '最初の実リクエスト',
  });
}
