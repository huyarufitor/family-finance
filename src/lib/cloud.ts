import { createClient } from "@supabase/supabase-js";
import type { Ledger, Entry, Account, Person, Valuation } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const cloudConfigured = !!url && !!key;
export const githubLoginEnabled = import.meta.env.VITE_GITHUB_LOGIN_ENABLED === "true";
export const cloud = cloudConfigured
  ? createClient(url, key, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
export const webhookUrl = url ? `${url}/functions/v1/import-bills` : "";
export function encodeRow(record: object, householdId: string) {
  return Object.fromEntries([
    ["household_id", householdId],
    ...Object.entries(record)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k.replace(/[A-Z]/g, (s) => `_${s.toLowerCase()}`), v]),
  ]);
}
function decodeRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => !["household_id", "created_at"].includes(k))
      .map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase()),
        v === null ? undefined : v,
      ]),
  );
}
export async function readLedger(householdId: string): Promise<Ledger> {
  if (!cloud) throw new Error("尚未配置云服务");
  const tables = ["people", "accounts", "valuations", "transactions"] as const;
  const responses = await Promise.all(
    tables.map(async (table) => {
      const rows: Record<string, unknown>[] = [];
      // Supabase caps each request; paginate to avoid silently truncating the ledger.
      for (let from = 0; ; from += 1000) {
        const { data, error } = await cloud!
          .from(table)
          .select("*")
          .eq("household_id", householdId)
          .order("id")
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows.map(decodeRow);
    }),
  );
  return {
    people: responses[0] as unknown as Person[],
    accounts: responses[1] as unknown as Account[],
    valuations: responses[2] as unknown as Valuation[],
    transactions: responses[3] as unknown as Entry[],
  };
}
export async function saveRows(
  table: keyof Ledger,
  records: object[],
  householdId: string,
) {
  if (!cloud) throw new Error("尚未配置云服务");
  const conflict =
    table === "valuations"
      ? "account_id,date"
      : table === "transactions"
        ? "household_id,source,account_id,external_id"
        : "id";
  const { error } = await cloud.from(table).upsert(
    records.map((r) => encodeRow(r, householdId)),
    { onConflict: conflict, ignoreDuplicates: table === "transactions" },
  );
  if (error) throw error;
}
export async function aiParse(text: string, today: string) {
  if (!cloud) throw new Error("AI 尚未连接。可以使用本地解析或手动记账");
  const { data, error } = await cloud.functions.invoke("parse-entry", {
    body: { text, today },
  });
  if (error)
    throw new Error(
      "AI 解析失败，请检查云函数与模型配置；你也可以使用本地解析",
    );
  return data as {
    kind: Entry["kind"];
    amount: number;
    category: string;
    date: string;
    note: string;
  };
}
