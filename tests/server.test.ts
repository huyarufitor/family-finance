import { expect, it } from "vitest";
import {
  validBill,
  validDraft,
} from "../supabase/functions/_shared/validation";
it("only accepts safe positive integer cents and real dates from a model", () => {
  expect(
    validDraft({
      kind: "expense",
      amount: 2500,
      date: "2026-10-16",
      category: "餐饮",
      note: "午餐",
    }),
  ).toBe(true);
  expect(
    validDraft({
      kind: "expense",
      amount: 25.5,
      date: "2026-10-16",
      category: "餐饮",
      note: "午餐",
    }),
  ).toBe(false);
  expect(
    validDraft({
      kind: "expense",
      amount: 2500,
      date: "2026-02-30",
      category: "餐饮",
      note: "午餐",
    }),
  ).toBe(false);
  expect(
    validDraft({
      kind: "expense",
      amount: 2500,
      date: "2026-10-16",
      category: "x".repeat(81),
      note: "午餐",
    }),
  ).toBe(false);
});
it("requires provider ids and excludes ambiguous transfer webhook events", () => {
  const base = {
    kind: "expense",
    amount: 2500,
    date: "2026-10-16",
    category: "餐饮",
    note: "午餐",
  };
  expect(validBill({ ...base, externalId: "WX123" })).toBe(true);
  expect(validBill({ ...base, externalId: "" })).toBe(false);
  expect(validBill({ ...base, externalId: "WX123", kind: "transfer" })).toBe(
    false,
  );
});
