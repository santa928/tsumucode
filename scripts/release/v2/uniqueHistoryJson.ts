type Frame = { kind: 'array' } | { kind: 'object'; expectKey: boolean; keys: Set<string> };

/**
 * Native JSON.parse remains the grammar validator. The iterative pass rejects decoded duplicate
 * object keys without imposing a new encoding or format. This is not an origin or authorization check.
 */
export function parseUniqueHistoryJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    const stack: Frame[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        let end = i + 1;
        while (end < text.length) {
          if (text[end] === '\\') { end += 2; continue; }
          if (text[end] === '"') break;
          end++;
        }
        const frame = stack.at(-1);
        if (frame?.kind === 'object' && frame.expectKey) {
          const key: unknown = JSON.parse(text.slice(i, end + 1));
          if (typeof key !== 'string' || frame.keys.has(key)) throw Error('Invalid key');
          frame.keys.add(key);
        }
        i = end;
      } else if (ch === '{') {
        stack.push({ kind: 'object', expectKey: true, keys: new Set() });
      } else if (ch === '[') {
        stack.push({ kind: 'array' });
      } else if (ch === '}' || ch === ']') {
        stack.pop();
      } else if (ch === ':' && stack.at(-1)?.kind === 'object') {
        (stack.at(-1) as Extract<Frame, { kind: 'object' }>).expectKey = false;
      } else if (ch === ',' && stack.at(-1)?.kind === 'object') {
        (stack.at(-1) as Extract<Frame, { kind: 'object' }>).expectKey = true;
      }
    }
    return value;
  } catch {
    throw Error('Invalid or duplicate JSON');
  }
}
