import { toCents } from "./amount.ts";
import { validDay as validDate } from "./validation.ts";
export interface BillRow { kind: "income" | "expense"; amount: number; date: string; category: string; note: string; externalId: string; }
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
