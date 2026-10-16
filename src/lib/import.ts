import { validDate } from "./finance";
import type { Entry, Ledger } from "./types";
import { readBills, type BillRow } from "../../supabase/functions/_shared/csv";
export { csvRows, readBills, type BillRow } from "../../supabase/functions/_shared/csv";
export function parseBills(text: string): BillRow[] {
  return readBills(text).rows;
}
export function prepareImport(
  rows: BillRow[],
  existing: Entry[],
  source: string,
  accountId: string,
  personId: string,
) {
  const seen = new Set(
    existing
      .filter((t) => t.source === source && t.accountId === accountId)
      .map((t) => t.externalId),
  );
  const entries: Entry[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const externalId =
      row.externalId ||
      `fallback:${row.date}|${row.kind}|${row.amount}|${row.note}`;
    if (seen.has(externalId)) {
      duplicates++;
      continue;
    }
    seen.add(externalId);
    entries.push({
      ...row,
      externalId,
      source,
      accountId,
      personId,
      id: crypto.randomUUID(),
    });
  }
  return { entries, duplicates };
}
export function validateBackup(value: unknown): Ledger {
  if (!value || typeof value !== "object") throw new Error("备份格式无效");
  const d = value as Record<string, unknown>;
  if (
    d.version !== 1 ||
    !["people", "accounts", "valuations", "transactions"].every((k) =>
      Array.isArray(d[k]),
    )
  )
    throw new Error("不支持的备份版本");
  const data = d as unknown as Ledger;
  const text = (s: unknown) =>
    typeof s === "string" && s.length > 0 && s.length < 2000;
  const cents = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 1e14;
  for (const list of [
    data.people,
    data.accounts,
    data.valuations,
    data.transactions,
  ]) {
    if (
      list.length > 100000 ||
      list.some((x) => !text(x.id)) ||
      new Set(list.map((x) => x.id)).size !== list.length
    )
      throw new Error("备份记录 ID 无效或重复");
  }
  const people = new Set(data.people.map((p) => p.id)),
    accounts = new Map(data.accounts.map((a) => [a.id, a]));
  if (data.people.some((p) => !text(p.name) || !/^#[\da-f]{6}$/i.test(p.color)))
    throw new Error("备份成员无效");
  if (
    data.accounts.some(
      (a) =>
        !people.has(a.personId) ||
        !text(a.name) ||
        !["cash", "deposit", "investment", "property", "liability"].includes(
          a.kind,
        ),
    )
  )
    throw new Error("备份账户无效");
  if (
    data.valuations.some(
      (v) =>
        !accounts.has(v.accountId) || !validDate(v.date) || !cents(v.value),
    )
  )
    throw new Error("备份估值无效");
  if (
    new Set(data.valuations.map((v) => `${v.accountId}:${v.date}`)).size !==
    data.valuations.length
  )
    throw new Error("同一账户同一天只能有一条估值");
  for (const t of data.transactions) {
    if (
      !accounts.has(t.accountId) ||
      accounts.get(t.accountId)!.personId !== t.personId ||
      !people.has(t.personId) ||
      !["income", "expense", "transfer"].includes(t.kind) ||
      !cents(t.amount) ||
      t.amount <= 0 ||
      !validDate(t.date) ||
      !text(t.category) ||
      typeof t.note !== "string" ||
      t.note.length > 2000 ||
      !text(t.source) ||
      (t.externalId !== undefined && !text(t.externalId))
    )
      throw new Error("备份交易无效");
    if (
      t.kind === "transfer" &&
      (!t.toAccountId ||
        !accounts.has(t.toAccountId) ||
        t.toAccountId === t.accountId)
    )
      throw new Error("备份转账账户无效");
  }
  return JSON.parse(
    JSON.stringify({
      people: data.people,
      accounts: data.accounts,
      valuations: data.valuations,
      transactions: data.transactions,
    }),
  ) as Ledger;
}
