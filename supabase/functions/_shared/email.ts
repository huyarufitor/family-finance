import { readBills } from "./csv.ts";

export class BillFormatError extends Error {}

export async function verifyEmailWebhook(
  payload: string, headers: Headers, secret: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    const id = headers.get("svix-id"), timestamp = headers.get("svix-timestamp") || "";
    if (!id || !/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300) return false;
    const rawKey = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const message = new TextEncoder().encode(`${id}.${timestamp}.${payload}`);
    for (const item of (headers.get("svix-signature") || "").split(" ")) {
      if (!item.startsWith("v1,")) continue;
      try {
        const bytes = Uint8Array.from(atob(item.slice(3)), c => c.charCodeAt(0));
        if (await crypto.subtle.verify("HMAC", key, bytes, message)) return true;
      } catch { /* A rotated signature can follow a malformed/unknown version. */ }
    }
  } catch { return false; }
  return false;
}

export function decodeCsvAttachment(filename: string, bytes: Uint8Array): string {
  if (!/\.csv$/i.test(filename)) throw new BillFormatError("仅支持 CSV 附件，请手动导入");
  if (bytes.byteLength > 5_000_000) throw new BillFormatError("附件超过 5MB，请手动导入");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch {
    try { return new TextDecoder("gb18030", { fatal: true }).decode(bytes); }
    catch { throw new BillFormatError("无法识别 CSV 编码，请手动导入"); }
  }
}

export function emailBills(text: string) {
  let parsed;
  try { parsed = readBills(text); }
  catch { throw new BillFormatError("CSV 格式无法识别，请核对后手动导入"); }
  if (parsed.rows.some(row => !row.externalId?.trim()))
    throw new BillFormatError("CSV 缺少源交易号，请核对后手动导入");
  return parsed;
}

export function senderAddress(value: unknown): string {
  if (typeof value !== "string") return "";
  const address = (value.match(/<([^<>]+)>\s*$/)?.[1] || value).trim().toLowerCase();
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) ? address : "";
}
