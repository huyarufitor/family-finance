import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { verifyEmailWebhook, decodeCsvAttachment, emailBills } from "../supabase/functions/_shared/email";

const secret = "whsec_" + Buffer.from("a-test-secret-that-is-not-production").toString("base64");
function signed(payload: string, time: number) {
  const id = "msg_test";
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${time}.${payload}`).digest("base64");
  return new Headers({ "svix-id": id, "svix-timestamp": String(time), "svix-signature": `v1,${signature}` });
}
it("accepts a valid provider signature and rejects forged, changed and expired email events", async () => {
  const payload = '{"type":"email.received"}', now = 1800000000;
  const headers = signed(payload, now);
  expect(await verifyEmailWebhook(payload, headers, secret, now)).toBe(true);
  expect(await verifyEmailWebhook(payload + " ", headers, secret, now)).toBe(false);
  expect(await verifyEmailWebhook(payload, headers, secret, now + 301)).toBe(false);
  headers.set("svix-signature", "v1,not-a-signature");
  expect(await verifyEmailWebhook(payload, headers, secret, now)).toBe(false);
});
it("preserves source transaction IDs across repeated mail delivery and skips non-success rows", () => {
  const text = "日期,金额,收支,交易单号,备注,交易状态\n2026-10-16,25,支出,T1,午餐,支付成功\n2026-10-16,30,支出,T2,取消,已关闭";
  const first = emailBills(text), retry = emailBills(text);
  expect(first).toEqual(retry);
  expect(first.skipped).toBe(1);
  expect(first.rows).toEqual([{date:"2026-10-16", amount:2500, kind:"expense", externalId:"T1",note:"午餐",category:"其他"}]);
});
it("refuses unattended imports without source IDs so identical real purchases cannot silently collapse", () => {
  expect(() => emailBills("日期,金额,收支,备注\n2026-10-16,25,支出,午餐\n2026-10-16,25,支出,午餐"))
    .toThrow(/交易号/);
  expect(emailBills("日期,金额,收支,备注,交易单号\n2026-10-16,25,支出,午餐,T1\n2026-10-16,25,支出,午餐,T2").rows)
    .toHaveLength(2);
});
it("decodes UTF-8 and GB18030 Chinese CSV and refuses unsupported attachments", () => {
  const text = "日期,金额,收支\n2026-10-16,25,支出";
  expect(decodeCsvAttachment("账单.csv", new TextEncoder().encode(text))).toBe(text);
  expect(decodeCsvAttachment("账单.csv", new Uint8Array([0xc8,0xd5,0xc6,0xda]))).toBe("日期");
  expect(() => decodeCsvAttachment("账单.pdf", new TextEncoder().encode(text))).toThrow();
  expect(() => decodeCsvAttachment("账单.csv", new Uint8Array(5_000_001))).toThrow();
});
