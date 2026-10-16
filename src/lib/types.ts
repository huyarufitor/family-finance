export type AccountKind =
  | "cash"
  | "deposit"
  | "investment"
  | "property"
  | "liability";
export type EntryKind = "income" | "expense" | "transfer";
export interface Person {
  id: string;
  name: string;
  color: string;
}
export interface Account {
  id: string;
  personId: string;
  name: string;
  kind: AccountKind;
}
export interface Valuation {
  id: string;
  accountId: string;
  date: string;
  value: number;
}
export interface Entry {
  id: string;
  personId: string;
  accountId: string;
  toAccountId?: string;
  kind: EntryKind;
  amount: number;
  date: string;
  category: string;
  note: string;
  source: string;
  externalId?: string;
}
export interface Ledger {
  people: Person[];
  accounts: Account[];
  valuations: Valuation[];
  transactions: Entry[];
}
export interface Draft {
  kind: EntryKind;
  amount: number;
  date: string;
  category: string;
  note: string;
}
export type Period = "week" | "month" | "quarter" | "year" | "custom";
export const accountLabels: Record<AccountKind, string> = {
  cash: "现金与活期",
  deposit: "定期存款",
  investment: "投资理财",
  property: "房产与其他",
  liability: "负债",
};
export const categories = [
  "餐饮",
  "交通",
  "购物",
  "日用",
  "住房",
  "娱乐",
  "医疗",
  "教育",
  "工资",
  "投资收益",
  "其他收入",
  "转账",
  "其他",
];
export const emptyLedger = (): Ledger => ({
  people: [],
  accounts: [],
  valuations: [],
  transactions: [],
});
