/** Only fixed labels are returned; no response body or header values are exposed. */
export function classifyIdentityResponse(response) {
  const code = response?.status === 403 ? '403' : response?.status === 429 ? '429' : 'other';
  let remaining = 'unknown';
  let retry = 'unknown';
  try {
    const rawRemaining = response.headers.get('x-ratelimit-remaining');
    const rawRetry = response.headers.get('retry-after');
    if (code !== 'other' && rawRemaining === '0') remaining = 'zero';
    else if (code !== 'other' && typeof rawRemaining === 'string' && /^[1-9][0-9]{0,9}$/u.test(rawRemaining)) remaining = 'nonzero';
    retry = rawRetry === null ? 'absent' : typeof rawRetry === 'string' && rawRetry.length > 0 ? 'present' : 'unknown';
  } catch {
    // Missing or invalid headers remain unknown; never return error content.
  }
  return `identity-http status=${code} remaining=${remaining} retry-after=${retry}`;
}
