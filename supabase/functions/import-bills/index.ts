import { body, json, rest } from "../_shared/http.ts";
import { importEntries } from "../_shared/ingest.ts";
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
    return json(req, await importEntries(channel, input.entries));
  } catch {
    return json(
      req,
      { error: "导入失败，请检查渠道配置和账单格式后重试" },
      400,
    );
  }
});
