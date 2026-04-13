/** A股/通用：从用户输入提取 6 位代码等规范化形态 */
export function normalizeCodeForFeed(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const sixDigits = trimmed.match(/\d{6}/)?.[0];
  return sixDigits ?? trimmed;
}
