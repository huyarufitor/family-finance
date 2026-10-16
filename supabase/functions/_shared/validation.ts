export function validDay(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s
  );
}
export function validAmount(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 1e14;
}
export function validDraft(
  d: unknown,
): d is {
  kind: "income" | "expense" | "transfer";
  amount: number;
  date: string;
  category: string;
  note: string;
} {
  if (!d || typeof d !== "object") return false;
  const r = d as Record<string, unknown>;
  return (
    typeof r.kind === "string" &&
    ["income", "expense", "transfer"].includes(r.kind) &&
    validAmount(r.amount) &&
    validDay(r.date) &&
    typeof r.category === "string" &&
    r.category.length > 0 &&
    r.category.length <= 80 &&
    typeof r.note === "string" &&
    r.note.length <= 2000
  );
}

export function validBill(
  d: unknown,
): d is {
  kind: "income" | "expense";
  amount: number;
  date: string;
  category: string;
  note: string;
  externalId: string;
} {
  if (!validDraft(d) || d.kind === "transfer") return false;
  const id = (d as unknown as Record<string, unknown>).externalId;
  return typeof id === "string" && id.trim().length > 0 && id.length <= 500;
}
