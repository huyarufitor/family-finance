import type { Ledger } from "./types";
import { isoDate, shiftDate } from "./finance";
const id = () => crypto.randomUUID();
export function demoLedger(): Ledger {
  const today = isoDate(),
    year = Number(today.slice(0, 4));
  const p1 = id(),
    p2 = id(),
    p3 = id(),
    a1 = id(),
    a2 = id(),
    a3 = id(),
    a4 = id(),
    a5 = id(),
    a6 = id(),
    a7 = id();
  const data: Ledger = {
    people: [
      { id: p1, name: "林予", color: "#48745c" },
      { id: p2, name: "陈一", color: "#d8a16e" },
      { id: p3, name: "安安", color: "#879abd" },
    ],
    accounts: [
      { id: a1, personId: p1, name: "日常钱包", kind: "cash" },
      { id: a2, personId: p1, name: "长期投资", kind: "investment" },
      { id: a3, personId: p2, name: "工资账户", kind: "cash" },
      { id: a4, personId: p2, name: "稳健理财", kind: "investment" },
      { id: a5, personId: p3, name: "成长储蓄", kind: "deposit" },
      { id: a6, personId: p1, name: "家庭住房", kind: "property" },
      { id: a7, personId: p1, name: "住房贷款", kind: "liability" },
    ],
    transactions: [],
    valuations: [],
  };
  const initial = [
    5300000, 32500000, 3800000, 21800000, 12000000, 180000000, 62000000,
  ];
  for (let month = -1; month < 12; month++) {
    const day = isoDate(new Date(year, month + 1, 0));
    if (day > today) continue;
    data.accounts.forEach((a, index) => {
      const base = initial[index]!;
      const growth =
        a.kind === "investment"
          ? (month + 1) * 0.011 + Math.sin(month * 1.9) * 0.008
          : a.kind === "deposit"
            ? (month + 1) * 0.0015
            : a.kind === "liability"
              ? -(month + 1) * 0.002
              : 0;
      data.valuations.push({
        id: id(),
        accountId: a.id,
        date: day,
        value: Math.round(base * (1 + growth)),
      });
    });
  }
  const past = isoDate(new Date(year, -1, 31));
  data.accounts.forEach((a, index) => {
    if (!data.valuations.some((v) => v.accountId === a.id && v.date === past))
      data.valuations.push({
        id: id(),
        accountId: a.id,
        date: past,
        value: initial[index]!,
      });
  });
  const entries: [
    number,
    string,
    string,
    "income" | "expense",
    number,
    string,
    string,
  ][] = [
    [0, p1, a1, "expense", 2500, "餐饮", "午间的一份小确幸"],
    [1, p2, a3, "expense", 16800, "日用", "一周的蔬菜与水果"],
    [2, p1, a1, "expense", 3200, "交通", "下班打车回家"],
    [3, p2, a3, "expense", 12800, "娱乐", "周末家庭电影"],
    [5, p1, a1, "income", 1850000, "工资", "本月工资到账"],
    [6, p2, a3, "income", 1520000, "工资", "本月工资到账"],
    [7, p1, a1, "expense", 68000, "教育", "安安的绘本与课程"],
    [9, p2, a3, "expense", 26800, "购物", "换季添一件新衣"],
    [11, p1, a1, "expense", 8600, "餐饮", "和家人一起吃晚饭"],
    [13, p2, a3, "expense", 42000, "住房", "本月水电物业费"],
  ];
  for (const [
    offset,
    personId,
    accountId,
    kind,
    amount,
    category,
    note,
  ] of entries)
    data.transactions.push({
      id: id(),
      personId,
      accountId,
      kind,
      amount,
      category,
      note,
      date: shiftDate(today, -offset),
      source: "demo",
    });
  for (const a of data.accounts.filter((a) => a.kind === "investment")) {
    const latest = data.valuations
      .filter((v) => v.accountId === a.id)
      .sort((x, y) => y.date.localeCompare(x.date))[0]!;
    if (latest.date !== today)
      data.valuations.push({
        id: id(),
        accountId: a.id,
        date: today,
        value: Math.round(latest.value * 1.0062),
      });
  }
  return data;
}
