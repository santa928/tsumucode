/** URLのmodeを読んで、条件ごとに実JSONを返す別解。 */
export function GET(request: Request): Response {
  if (new URL(request.url).searchParams.get('mode') === 'second') {
    return Response.json({ message: '2つ目の実リクエスト' });
  }
  return Response.json({ message: '最初の実リクエスト' });
}
