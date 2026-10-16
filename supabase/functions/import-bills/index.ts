import { body, json, rest } from "../_shared/http.ts";
import { validBill } from "../_shared/validation.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, {});
  if (req.method !== "POST") return json(req, { error: "仅支持 POST" }, 405);
  try {
    const token = req.headers.get("x-channel-token") || "";
    if (!/^[a-f0-9]{64}$/.test(token))
      return json(req, { error: "渠道未授权" }, 401);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const hash = [...new Uint8Array(digest)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const lookup = await rest(
      `import_channels?token_hash=eq.${hash}&select=id,household_id,account_id`,
    );
    if (!lookup.ok) throw new Error("channel lookup failed");
    const channel = (await lookup.json())[0];
    if (!channel) return json(req, { error: "渠道未授权或已撤销" }, 401);
    const input = await body(req, 250000);
    if (
      !Array.isArray(input.entries) ||
      input.entries.length < 1 ||
      input.entries.length > 200
    )
      return json(req, { error: "每批应包含 1—200 笔记录" }, 400);
    const accountRes = await rest(
      `accounts?id=eq.${channel.account_id}&household_id=eq.${channel.household_id}&select=person_id`,
    );
    const account = accountRes.ok ? (await accountRes.json())[0] : null;
    if (!account) throw new Error("account missing");
    const records = [];
    for (const e of input.entries) {
      if (!validBill(e))
        return json(
          req,
          { error: "交易字段无效；转账请在网页中核对双方账户后录入" },
          400,
        );
      records.push({
        id: crypto.randomUUID(),
        household_id: channel.household_id,
        account_id: channel.account_id,
        person_id: account.person_id,
        kind: e.kind,
        amount: e.amount,
        date: e.date,
        category: e.category,
        note: e.note,
        source: `channel:${channel.id}`,
        external_id: e.externalId.trim(),
      });
    }
    const unique = [
      ...new Map(records.map((r) => [r.external_id, r])).values(),
    ];
    const result = await rest(
      "transactions?on_conflict=household_id,source,account_id,external_id&select=id",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify(unique),
      },
    );
    if (!result.ok) throw new Error("insert failed");
    const inserted = (await result.json()).length;
    await rest(`import_channels?id=eq.${channel.id}`, {
      method: "PATCH",
      body: JSON.stringify({ last_received_at: new Date().toISOString() }),
    });
    return json(req, {
      received: records.length,
      inserted,
      duplicates: records.length - inserted,
    });
  } catch {
    return json(
      req,
      { error: "导入失败，请检查渠道配置和账单格式后重试" },
      400,
    );
  }
});
