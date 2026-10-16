import { describe, expect, it } from "vitest";
import {
  accountValue,
  dateRange,
  investmentReturn,
  summary,
  toCents,
} from "../src/lib/finance";
const people = [
  { id: "p1", name: "我", color: "#426b55" },
  { id: "p2", name: "家人", color: "#da9963" },
];
const accounts = [
  { id: "a", personId: "p1", name: "现金", kind: "cash" as const },
  { id: "b", personId: "p2", name: "基金", kind: "investment" as const },
];
const valuations = [
  { id: "v1", accountId: "a", date: "2026-09-30", value: 100000 },
  { id: "v2", accountId: "b", date: "2026-09-30", value: 100000 },
  { id: "v3", accountId: "b", date: "2026-10-31", value: 160000 },
];
const tx = [
  {
    id: "t1",
    personId: "p1",
    accountId: "a",
    toAccountId: "b",
    kind: "transfer" as const,
    amount: 50000,
    date: "2026-10-16",
    category: "转账",
    note: "买基金",
    source: "manual",
  },
];
const data = { people, accounts, valuations, transactions: tx };
describe("financial calculations", () => {
  it("uses integer cents and rejects unsafe amounts", () => {
    expect(toCents("25.12")).toBe(2512);
    expect(() => toCents("25.123")).toThrow();
    expect(() => toCents("-10")).toThrow();
    expect(() => toCents("Infinity")).toThrow();
  });
  it("applies transfers to both accounts without counting income or spending", () => {
    expect(accountValue(data, "a", "2026-10-31")).toBe(50000);
    expect(accountValue(data, "b", "2026-10-20")).toBe(150000);
    expect(summary(data, "2026-10-01", "2026-10-31")).toMatchObject({
      netAssets: 210000,
      income: 0,
      expense: 0,
    });
    expect(summary(data, "2026-10-01", "2026-10-31", "p1").netAssets).toBe(
      50000,
    );
  });
  it("subtracts deposits from investment gain and weights capital by time", () => {
    const r = investmentReturn(data, "2026-10-01", "2026-10-31");
    expect(r.gain).toBe(10000);
    expect(r.netFlow).toBe(50000);
    expect(r.rate).toBeCloseTo(10000 / (100000 + (50000 * 15) / 31), 8);
  });
  it("does not invent a return when opening history is missing", () => {
    expect(investmentReturn(data, "2026-09-01", "2026-10-31").rate).toBeNull();
    expect(accountValue(data, "b", "2026-09-01")).toBeNull();
  });
  it("uses Monday weeks, calendar quarters and inclusive periods", () => {
    expect(dateRange("week", "2026-10-16")).toEqual({
      start: "2026-10-12",
      end: "2026-10-18",
    });
    expect(dateRange("quarter", "2026-10-16")).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(dateRange("month", "2024-02-10").end).toBe("2024-02-29");
  });
});
it("rejects malformed thousands separators instead of silently changing the amount", () => {
  expect(toCents("1,234.56")).toBe(123456);
  expect(() => toCents("1,2")).toThrow();
});
it("leaves returns unknown when closing market valuation has not been recorded", () => {
  const data = {
    people: [{ id: "p", name: "我", color: "#426b55" }],
    accounts: [
      { id: "a", personId: "p", name: "基金", kind: "investment" as const },
    ],
    valuations: [
      { id: "v", accountId: "a", date: "2026-09-30", value: 100000 },
    ],
    transactions: [],
  };
  expect(investmentReturn(data, "2026-10-01", "2026-10-16")).toMatchObject({
    gain: null,
    rate: null,
    missing: true,
  });
});
it("requires an opening boundary valuation instead of silently carrying stale market prices", () => {
  const data = {
    people: [{ id: "p", name: "我", color: "#426b55" }],
    accounts: [
      { id: "a", personId: "p", name: "基金", kind: "investment" as const },
    ],
    valuations: [
      { id: "v1", accountId: "a", date: "2026-09-01", value: 100000 },
      { id: "v2", accountId: "a", date: "2026-10-16", value: 110000 },
    ],
    transactions: [],
  };
  expect(investmentReturn(data, "2026-10-01", "2026-10-16").rate).toBeNull();
});
