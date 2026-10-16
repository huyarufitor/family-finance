import { toCents, validDate } from "./finance";
import type { Draft, Entry, Ledger } from "./types";
export interface BillRow extends Draft {
  externalId: string;
}
export function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += ch;
  }
  if (quoted) throw new Error("CSV 引号未闭合");
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function readBills(text: string): { rows: BillRow[]; skipped: number } {
  if (text.length > 5_000_000) throw new Error("文件不得超过 5MB");
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex(
    (r) =>
      r.some((c) => /^(交易时间|日期|时间|记账日期)$/.test(c)) &&
      r.some((c) => /金额/.test(c)),
  );
  if (headerIndex < 0)
    throw new Error("未找到日期和金额表头，请使用 CSV 模板或官方导出的账单");
  const header = rows[headerIndex]!;
  const col = (patterns: RegExp) => header.findIndex((v) => patterns.test(v));
  const date = col(/^(交易时间|日期|时间|记账日期)$/),
    amount = col(/^(金额|交易金额)/),
    type = col(/^(收\/支|收支|类型|资金方向)$/),
    note = col(/^(商品|商品说明|备注|交易摘要)$/),
    id = col(/^(交易单号|交易订单号|订单号|流水号)$/),
    status = col(/^(交易状态|当前状态)$/),
    cat = col(/^(分类|交易类型|交易分类)$/);
  if (type < 0) throw new Error("缺少收支类型列");
  const result: BillRow[] = [];
  let skipped = 0;
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const r = rows[index]!;
    if (r[0]?.startsWith("---")) break;
    if (
      status >= 0 &&
      r[status] &&
      !/^(支付成功|交易成功|已支付|成功|对方已收钱|已收钱)$/.test(r[status]!)
    ) {
      skipped++;
      continue;
    }
    const dir = r[type] || "";
    if (
      /不计收支|中性|转账/.test(dir) ||
      (cat >= 0 && /转账|充值|提现|还款|退款/.test(r[cat] || ""))
    ) {
      skipped++;
      continue;
    }
    if (!/收入|支出/.test(dir))
      throw new Error(`第 ${index + 1} 行收支类型无法识别`);
    const day = (r[date] || "").slice(0, 10).replace(/\//g, "-");
    if (!validDate(day)) throw new Error(`第 ${index + 1} 行日期无效`);
    const cents = toCents((r[amount] || "").replace(/[¥￥\s]/g, ""));
    if (cents <= 0) throw new Error(`第 ${index + 1} 行金额必须大于零`);
    const recordNote = r[note] || "导入账单";
    const recordCategory = r[cat] || "其他";
    const recordId = id >= 0 ? r[id] || "" : "";
    if (
      recordNote.length > 2000 ||
      recordCategory.length > 80 ||
      recordId.length > 500
    )
      throw new Error(`第 ${index + 1} 行文本字段过长，请缩短备注或检查表头`);
    if (
      !recordId &&
      `fallback:${day}|expense|${cents}|${recordNote}`.length > 500
    )
      throw new Error(
        `第 ${index + 1} 行缺少交易单号且备注过长，请补充交易单号后重试`,
      );
    result.push({
      date: day,
      amount: cents,
      kind: dir.includes("收入") ? "income" : "expense",
      category: recordCategory,
      note: recordNote,
      externalId: recordId,
    });
  }
  if (result.length > 5000) throw new Error("单次最多导入 5000 笔");
  return { rows: result, skipped };
}
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
