export async function preserveFailureWithDiagnostics<T>(
  assertion: () => Promise<void>,
  capture: () => Promise<T>,
  attach: (evidence: T) => void,
  timeoutMs = 2000,
): Promise<void> {
  try {
    await assertion();
  } catch (error) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const expired = Symbol('expired');
      const deadline = new Promise<typeof expired>((resolve) => {
        timer = setTimeout(() => {
          resolve(expired);
        }, timeoutMs);
      });
      const evidence = await Promise.race([capture(), deadline]);
      if (evidence !== expired) attach(evidence);
    } catch {
      // 診断の失敗で元の判定エラーを置き換えない。
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    throw error;
  }
}
