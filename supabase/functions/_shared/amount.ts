export function toCents(s: string | number): number {
  const raw = String(s).trim();
  if (raw.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(raw))
    throw new Error("千分位格式无效");
  const str = raw.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(str))
    throw new Error("金额应为非负数字，最多两位小数");
  const n = Math.round(Number(str) * 100);
  if (!Number.isSafeInteger(n) || n > 1e14) throw new Error("金额超出支持范围");
  return n;
}
