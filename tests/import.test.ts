import { expect, it } from "vitest";
import { parseBills, prepareImport, validateBackup } from "../src/lib/import";
it("parses BOM, quoted commas, escaped quotes and Chinese headers", () => {
  const rows = parseBills(
    '\ufeff交易时间,交易类型,交易对方,商品,收/支,金额(元),交易状态,交易单号\r\n2026-10-16 12:00:00,餐饮,小店,"午餐,饮料",支出,25.50,支付成功,WX123\r\n2026-10-16 13:00:00,餐饮,小店,退款,收入,25,已退款,WX124',
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    amount: 2550,
    kind: "expense",
    date: "2026-10-16",
    externalId: "WX123",
    note: "午餐,饮料",
  });
});
it("deduplicates within a file and against saved source ids", () => {
  const rows = parseBills(
    "日期,类型,金额,备注,交易单号\n2026-10-16,支出,25,午餐,123\n2026-10-16,支出,25,午餐,123",
  );
  const first = prepareImport(rows, [], "wechat", "a", "p");
  expect(first.entries).toHaveLength(1);
  expect(first.duplicates).toBe(1);
  expect(
    prepareImport(rows, first.entries, "wechat", "a", "p").entries,
  ).toHaveLength(0);
});
it("rejects invalid dates and amounts and missing columns", () => {
  expect(() => parseBills("日期,类型,金额\n2026-02-30,支出,25")).toThrow();
  expect(() => parseBills("日期,类型,金额\n2026-10-16,支出,-25")).toThrow();
  expect(() => parseBills("x,y\na,b")).toThrow();
});
it("rejects backups with orphan accounts or invalid money", () => {
  expect(() =>
    validateBackup({
      version: 1,
      people: [],
      accounts: [{ id: "a", personId: "missing", name: "x", kind: "cash" }],
      transactions: [],
      valuations: [],
    }),
  ).toThrow();
  expect(() =>
    validateBackup({
      version: 1,
      people: [{ id: "p", name: "我", color: "#000000" }],
      accounts: [],
      transactions: [{ amount: NaN }],
      valuations: [],
    }),
  ).toThrow();
});
it("does not turn WeChat transfers or Alipay refunds into household expenses", () => {
  expect(
    parseBills(
      "交易时间,交易类型,收/支,金额(元),当前状态,交易单号\n2026-10-16 12:00:00,转账,支出,100,支付成功,A1\n2026-10-16 12:00:00,商户消费,支出,25,支付成功,A2",
    ),
  ).toHaveLength(1);
});
it("reports skipped transfers and refunds separately from valid transactions", async () => {
  const { readBills } = await import("../src/lib/import");
  const preview = readBills(
    "日期,类型,金额,分类\n2026-10-16,支出,25,餐饮\n2026-10-16,支出,100,转账\n2026-10-16,收入,25,退款",
  );
  expect(preview.rows).toHaveLength(1);
  expect(preview.skipped).toBe(2);
});
it("rejects CSV rows that would exceed database limits before showing a saveable preview", () => {
  expect(() =>
    parseBills("日期,类型,金额,备注\n2026-10-16,支出,25," + "x".repeat(2001)),
  ).toThrow();
  expect(() =>
    parseBills("日期,类型,金额,备注\n2026-10-16,支出,25," + "x".repeat(501)),
  ).toThrow();
});
