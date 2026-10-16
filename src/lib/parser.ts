import { shiftDate, toCents, validDate } from "./finance";
import type { Draft } from "./types";
export function parseText(text: string, today: string): Draft {
  if (/退款|退回|没花|没买|没有|取消/.test(text))
    throw new Error("这笔记录需要确认收支类型，请手动填写或使用 AI 解析");
  const input = text
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\d{1,2}[:：]\d{2}/g, "")
    .replace(/\d+(?:点|杯|份|人|个|次|瓶)/g, "");
  const pattern = /([+-]?\s*[¥￥]?\s*\d[\d,.]*)\s*(?:元|块(?:钱)?|人民币)/g;
  const amounts = [...input.matchAll(pattern)];
  if (amounts.length !== 1 || /\d/.test(input.replace(pattern, "")))
    throw new Error("请一次描述一笔账，并带上金额单位，例如“午餐花了25元”");
  const kind = /转账|转入|转出|转给/.test(text)
    ? "transfer"
    : /工资|奖金|收入|到账|收到了|分红|利息/.test(text)
      ? "income"
      : "expense";
  let date = today;
  if (text.includes("前天")) date = shiftDate(today, -2);
  else if (text.includes("昨天")) date = shiftDate(today, -1);
  const explicit = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (explicit) {
    if (!validDate(explicit)) throw new Error("日期无效");
    date = explicit;
  }
  let category =
    kind === "transfer" ? "转账" : kind === "income" ? "其他收入" : "其他";
  const groups: [RegExp, string][] = [
    [/饭|餐|吃|咖啡|奶茶|外卖|饮料/, "餐饮"],
    [/打车|地铁|公交|加油|交通|车票/, "交通"],
    [/买衣|购物|淘宝|京东/, "购物"],
    [/房租|物业|水电/, "住房"],
    [/看病|药|医院/, "医疗"],
    [/学费|课|书/, "教育"],
    [/电影|游戏|娱乐/, "娱乐"],
    [/超市|日用/, "日用"],
    [/工资|奖金/, "工资"],
    [/利息|分红|股息/, "投资收益"],
  ];
  for (const [pattern, label] of groups)
    if (pattern.test(text)) {
      category = label;
      break;
    }
  if (kind === "transfer") category = "转账";
  const amount = toCents(amounts[0]![1]!.replace(/[¥￥\s]/g, ""));
  if (amount <= 0) throw new Error("金额必须大于零");
  return { kind, amount, category, date, note: text.trim() };
}
