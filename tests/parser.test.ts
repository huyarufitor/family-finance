import { expect, it } from "vitest";
import { parseText } from "../src/lib/parser";
it("extracts expense, category and local date", () => {
  expect(parseText("中午吃快餐花了25元", "2026-10-16")).toMatchObject({
    kind: "expense",
    amount: 2500,
    category: "餐饮",
    date: "2026-10-16",
  });
  expect(parseText("昨天打车花了32.50元", "2026-10-16")).toMatchObject({
    amount: 3250,
    date: "2026-10-15",
    category: "交通",
  });
});
it("recognizes income without mistaking investment or transfers", () => {
  expect(parseText("今天工资到账12000元", "2026-10-16")).toMatchObject({
    kind: "income",
    amount: 1200000,
    category: "工资",
  });
  expect(parseText("给家人转账500元", "2026-10-16").kind).toBe("transfer");
});
it("requires clarification for ambiguous or missing amounts", () => {
  expect(() => parseText("吃饭", "2026-10-16")).toThrow();
  expect(() => parseText("午餐25元晚餐30元", "2026-10-16")).toThrow();
  expect(() => parseText("退款25元", "2026-10-16")).toThrow();
});
it("never extracts a valid numeric suffix from a malformed amount", () => {
  expect(() => parseText("午餐花了25.999元", "2026-10-16")).toThrow();
  expect(parseText("买东西花了1,025元", "2026-10-16").amount).toBe(102500);
  expect(() => parseText("支出-25元", "2026-10-16")).toThrow();
  expect(() => parseText("午饭25元，晚饭30", "2026-10-16")).toThrow();
});
