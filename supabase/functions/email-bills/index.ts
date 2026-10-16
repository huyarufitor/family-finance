import { environment, json, rest } from "../_shared/http.ts";
import { verifyEmailWebhook, senderAddress, decodeCsvAttachment, emailBills, BillFormatError } from "../_shared/email.ts";
import { importEntries, type Channel } from "../_shared/ingest.ts";

async function resend(path: string) {
  const response = await fetch(`https://api.resend.com/${path}`, {
    headers: { Authorization: `Bearer ${environment("RESEND_API_KEY")}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("mail provider unavailable");
  return response.json();
}
async function attachmentBytes(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  // URLs are obtained only from the authenticated Resend API, never from mail text.
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid download URL");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("download failed");
  if (Number(response.headers.get("content-length")) > 5_000_000) throw new BillFormatError("附件超过 5MB，请手动导入");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 5_000_000) { await reader.cancel(); throw new BillFormatError("附件超过 5MB，请手动导入"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(req, { error: "仅支持 POST" }, 405);
  let channelId = "";
  try {
    const payload = await req.text();
    if (payload.length > 100000) return json(req, { error: "事件过大" }, 413);
    if (!await verifyEmailWebhook(payload, req.headers, environment("RESEND_WEBHOOK_SECRET")))
      return json(req, { error: "邮件签名无效或已过期" }, 401);
    const event = JSON.parse(payload);
    if (event.type !== "email.received") return json(req, { ignored: true });
    const emailId = event.data?.email_id;
    if (typeof emailId !== "string" || !/^[\da-f-]{36}$/i.test(emailId)) return json(req, { error: "邮件事件无效" }, 400);
    const domain = environment("RESEND_RECEIVING_DOMAIN").toLowerCase();
    const recipients = Array.isArray(event.data.to) ? event.data.to.map(senderAddress) : [];
    const aliases: string[] = recipients.filter((s: string) => s.endsWith(`@${domain}`)).map((s: string) => s.split("@")[0]);
    const matches = aliases.filter(s => /^bill-[a-f0-9]{48}$/.test(s));
    // Exactly one route per message avoids accidental writes to several accounts.
    if (new Set(matches).size !== 1) return json(req, { ignored: true });
    const routeResponse = await rest(`email_routes?recipient=eq.${matches[0]}&select=channel_id,allowed_sender`);
    if (!routeResponse.ok) throw new Error("route lookup failed");
    const route = (await routeResponse.json())[0];
    if (!route || senderAddress(event.data.from) !== route.allowed_sender) return json(req, { ignored: true });
    channelId = route.channel_id;
    const channelResponse = await rest(`import_channels?id=eq.${channelId}&select=id,household_id,account_id`);
    if (!channelResponse.ok) throw new Error("channel lookup failed");
    const channel: Channel | undefined = (await channelResponse.json())[0];
    if (!channel) return json(req, { ignored: true });
    const attachments = await resend(`emails/receiving/${emailId}/attachments`);
    const files = attachments.data;
    if (!Array.isArray(files) || attachments.has_more || files.length < 1 || files.length > 5 || files.some(f => typeof f.filename !== "string" || !/\.csv$/i.test(f.filename))) {
      await rest(`email_routes?channel_id=eq.${channelId}`, { method: "PATCH", body: JSON.stringify({ last_status: "未导入：仅支持每封 1—5 个未加密 CSV 附件", updated_at: new Date().toISOString() }) });
      return json(req, { skipped: true, reason: "unsupported_attachment" });
    }
    const rows = [];
    let skipped = 0, totalBytes = 0;
    for (const file of files) {
      const bytes = await attachmentBytes(file.download_url);
      totalBytes += bytes.byteLength;
      if (totalBytes > 5_000_000) throw new BillFormatError("附件合计超过 5MB，请手动导入");
      const parsed = emailBills(decodeCsvAttachment(file.filename, bytes));
      rows.push(...parsed.rows); skipped += parsed.skipped;
      if (rows.length > 5000) throw new BillFormatError("记录超过 5000 笔，请分拆后手动导入");
    }
    // All CSVs are parsed before any write. Batches are safe to retry after a transient failure.
    let inserted = 0, duplicates = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const result = await importEntries(channel, rows.slice(i, i + 200));
      inserted += result.inserted; duplicates += result.duplicates;
    }
    const update = await rest(`email_routes?channel_id=eq.${channelId}`, { method: "PATCH", body: JSON.stringify({ last_status: `导入 ${inserted} 笔，重复 ${duplicates} 笔，跳过 ${skipped} 笔`, updated_at: new Date().toISOString() }) });
    if (!update.ok) throw new Error("status update failed");
    return json(req, { received: rows.length, inserted, duplicates, skipped });
  } catch (error) {
    if (channelId && error instanceof BillFormatError) {
      const update = await rest(`email_routes?channel_id=eq.${channelId}`, { method: "PATCH", body: JSON.stringify({ last_status: `未导入：${error.message}`, updated_at: new Date().toISOString() }) }).catch(() => null);
      if (update?.ok) return json(req, { skipped: true, reason: "invalid_bill_csv" });
    }
    if (channelId) await rest(`email_routes?channel_id=eq.${channelId}`, { method: "PATCH", body: JSON.stringify({ last_status: "导入失败：请核对 CSV 格式；服务故障会自动重试", updated_at: new Date().toISOString() }) }).catch(() => {});
    // Never include provider responses, addresses, raw email or secrets in logs or errors.
    return json(req, { error: "邮件导入失败，可安全重试" }, 503);
  }
});
