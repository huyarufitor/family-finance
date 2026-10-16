import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyLedger } from "../src/lib/types";

const member = { id: "p", name: "空成员", color: "#49745b" };
const saved = new Map<string, string>();
beforeEach(() => {
  saved.clear();
  vi.stubGlobal("localStorage", { setItem: (k: string, v: string) => saved.set(k, v) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock("../src/lib/cloud"); vi.resetModules(); });

async function setup(result?: { data: { id: string }[] | null; error: { code: string; message: string } | null }) {
  const query = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue(result) };
  const readLedger = vi.fn().mockResolvedValue(emptyLedger());
  vi.doMock("../src/lib/cloud", () => ({ cloud: result ? { from: vi.fn(() => query) } : null, readLedger, saveRows: vi.fn() }));
  const store = await import("../src/lib/store");
  store.state.mode = result ? "cloud" : "demo";
  store.state.householdId = result ? "family" : "";
  store.state.data = { ...emptyLedger(), people: [{ ...member }] };
  return { ...store, query, readLedger };
}

it("deletes an empty local member and persists the updated ledger", async () => {
  const { state, removePerson, personRemovalBlocker } = await setup();
  expect(personRemovalBlocker(member.id)).toBe("");
  await removePerson(member.id);
  expect(state.data.people).toEqual([]);
  expect(JSON.parse(saved.get("family-finance-demo-v1")!).people).toEqual([]);
});

it("keeps a member with even a zero-balance account and explains the blocked deletion", async () => {
  const { state, removePerson, personRemovalBlocker } = await setup();
  state.data.accounts.push({ id: "a", personId: member.id, name: "余额为零的账户", kind: "cash" });
  const before = JSON.stringify(state.data);
  expect(personRemovalBlocker(member.id)).toMatch(/账户/);
  await expect(removePerson(member.id)).rejects.toThrow(/账户/);
  expect(JSON.stringify(state.data)).toBe(before);
  expect(saved.size).toBe(0);
});

it("refuses a member with historical transactions even if no account is present locally", async () => {
  const { state, removePerson } = await setup();
  state.data.transactions.push({ id: "t", personId: member.id, accountId: "missing", kind: "expense", amount: 2500, date: "2026-10-16", category: "餐饮", note: "历史记录", source: "manual" });
  await expect(removePerson(member.id)).rejects.toThrow(/账单/);
  expect(state.data.people).toHaveLength(1);
});

it("limits a cloud deletion to its household and refreshes the shared ledger", async () => {
  const { removePerson, query, readLedger, state } = await setup({ data: [{ id: member.id }], error: null });
  await removePerson(member.id);
  expect(query.eq.mock.calls).toEqual([["id", member.id], ["household_id", "family"]]);
  expect(query.select).toHaveBeenCalledWith("id");
  expect(readLedger).toHaveBeenCalledWith("family");
  expect(state.data.people).toEqual([]);
  expect(saved.size).toBe(0);
});

it("turns a concurrent account creation foreign-key conflict into a readable refusal", async () => {
  const { state, removePerson, readLedger } = await setup({ data: null, error: { code: "23503", message: "foreign key constraint" } });
  await expect(removePerson(member.id)).rejects.toThrow(/账户或账单.*无法删除/);
  expect(state.data.people).toHaveLength(1);
  expect(readLedger).not.toHaveBeenCalled();
});

it("does not report success for an inaccessible or already removed cloud member", async () => {
  const { removePerson, state, readLedger } = await setup({ data: [], error: null });
  await expect(removePerson(member.id)).rejects.toThrow(/不存在或没有删除权限/);
  expect(state.data.people).toHaveLength(1);
  expect(readLedger).not.toHaveBeenCalled();
});

it("fails closed without a cloud client instead of changing the local ledger", async () => {
  const { state, removePerson } = await setup();
  state.mode = "cloud";
  await expect(removePerson(member.id)).rejects.toThrow(/创建或加入家庭/);
  expect(state.data.people).toHaveLength(1);
  expect(saved.size).toBe(0);
});
