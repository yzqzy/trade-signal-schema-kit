/** 生成可粘贴 shell 的 token（含空格或特殊字符时加双引号） */
export function shellQuoteArg(s: string): string {
  const t = s.trim();
  if (!t) return '""';
  if (/^[A-Za-z0-9._/@:-]+$/.test(t)) return t;
  return `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
