import type { Entry, Ledger, Period } from "./types";
export const DAY = 86400000;
export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDate(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s
  );
}
export function shiftDate(s: string, days: number): string {
  return new Date(Date.parse(`${s}T12:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
}
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
export const money = (n: number, decimals = 2) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n / 100);
export function dateRange(period: Period, anchor: string) {
  if (!validDate(anchor)) throw new Error("日期无效");
  const d = new Date(`${anchor}T12:00:00`),
    y = d.getFullYear(),
    m = d.getMonth();
  if (period === "week") {
    const start = shiftDate(anchor, -((d.getDay() + 6) % 7));
    return { start, end: shiftDate(start, 6) };
  }
  if (period === "year") return { start: `${y}-01-01`, end: `${y}-12-31` };
  const first = period === "quarter" ? Math.floor(m / 3) * 3 : m;
  return {
    start: isoDate(new Date(y, first, 1)),
    end: isoDate(new Date(y, first + (period === "quarter" ? 3 : 1), 0)),
  };
}
export function delta(e: Entry, accountId: string): number {
  if (e.kind === "transfer")
    return (
      (e.toAccountId === accountId ? e.amount : 0) -
      (e.accountId === accountId ? e.amount : 0)
    );
  return e.accountId === accountId
    ? e.amount * (e.kind === "income" ? 1 : -1)
    : 0;
}
export function accountValue(
  data: Ledger,
  accountId: string,
  date: string,
): number | null {
  const snapshot = data.valuations
    .filter((v) => v.accountId === accountId && v.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!snapshot) return null;
  const kind = data.accounts.find((a) => a.id === accountId)?.kind;
  const changes = data.transactions
    .filter((t) => t.date > snapshot.date && t.date <= date)
    .reduce((n, t) => n + delta(t, accountId), 0);
  return snapshot.value + (kind === "liability" ? -changes : changes);
}
export function selectedAccounts(data: Ledger, personId = "") {
  return data.accounts.filter((a) => !personId || a.personId === personId);
}
export function selectedEntries(
  data: Ledger,
  start: string,
  end: string,
  personId = "",
) {
  return data.transactions
    .filter(
      (t) =>
        t.date >= start &&
        t.date <= end &&
        (!personId ||
          t.personId === personId ||
          data.accounts.find((a) => a.id === t.toAccountId)?.personId ===
            personId),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}
export function summary(
  data: Ledger,
  start: string,
  end: string,
  personId = "",
) {
  const accounts = selectedAccounts(data, personId);
  let assets = 0,
    liabilities = 0,
    missing = 0;
  for (const a of accounts) {
    const v = accountValue(data, a.id, end);
    if (v === null) missing++;
    else if (a.kind === "liability") liabilities += v;
    else assets += v;
  }
  const tx = selectedEntries(data, start, end, personId);
  const income = tx
    .filter((t) => t.kind === "income")
    .reduce((n, t) => n + t.amount, 0);
  const expense = tx
    .filter((t) => t.kind === "expense")
    .reduce((n, t) => n + t.amount, 0);
  return {
    assets,
    liabilities,
    netAssets: assets - liabilities,
    income,
    expense,
    savings: income - expense,
    missing,
  };
}
export function investmentReturn(
  data: Ledger,
  start: string,
  end: string,
  personId = "",
) {
  const accounts = selectedAccounts(data, personId).filter(
    (a) => a.kind === "investment",
  );
  const before = shiftDate(start, -1),
    ids = new Set(accounts.map((a) => a.id));
  let opening = 0,
    closing = 0,
    missing = accounts.length === 0;
  for (const a of accounts) {
    const o = accountValue(data, a.id, before),
      c = accountValue(data, a.id, end);
    if (
      o === null ||
      c === null ||
      !data.valuations.some((v) => v.accountId === a.id && v.date === before) ||
      !data.valuations.some((v) => v.accountId === a.id && v.date === end)
    )
      missing = true;
    opening += o ?? 0;
    closing += c ?? 0;
  }
  const days = Math.max(1, (Date.parse(end) - Date.parse(start)) / DAY + 1);
  let netFlow = 0,
    weightedFlow = 0;
  for (const t of selectedEntries(data, start, end)) {
    if (t.kind === "income" && t.category === "投资收益") continue;
    const flow = [...ids].reduce((n, id) => n + delta(t, id), 0);
    const daysLeft = (Date.parse(end) - Date.parse(t.date)) / DAY;
    netFlow += flow;
    weightedFlow += (flow * daysLeft) / days;
  }
  const gain = closing - opening - netFlow,
    capital = opening + weightedFlow;
  return {
    opening,
    closing,
    netFlow,
    gain: missing ? null : gain,
    rate: !missing && capital > 0 ? gain / capital : null,
    missing,
  };
}
export function trend(data: Ledger, start: string, end: string, personId = "") {
  const days = Math.max(
    0,
    Math.round((Date.parse(end) - Date.parse(start)) / DAY),
  );
  const count = Math.min(days + 1, 24);
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDate(
      start,
      count === 1 ? 0 : Math.round((i * days) / (count - 1)),
    );
    const s = summary(data, date, date, personId);
    return { date, value: s.missing ? null : s.netAssets };
  });
}
