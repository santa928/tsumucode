/** 期待文が指定した区切り位置だけ、正規化済みDOM textの半角空白を省略できる。 */
export function matchesDomText(actual: string, expected: string, optionalSpaces = false): boolean {
  if (!optionalSpaces) return actual === expected;
  let offset = 0;
  for (const [index, part] of expected.split(' ').entries()) {
    if (index > 0) {
      while (actual[offset] === ' ') offset++;
    }
    if (!actual.startsWith(part, offset)) return false;
    offset += part.length;
  }
  return offset === actual.length;
}
