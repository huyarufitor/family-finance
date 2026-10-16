import { rest } from "./http.ts";
import { validBill } from "./validation.ts";
export interface Channel { id: string; household_id: string; account_id: string; }
export async function importEntries(channel: Channel, entries: unknown[]) {
 if (!entries.length || entries.length > 200) throw new Error("每批应为 1—200 笔");
    const accountRes = await rest(
      `accounts?id=eq.${channel.account_id}&household_id=eq.${channel.household_id}&select=person_id`,
    );
    const account = accountRes.ok ? (await accountRes.json())[0] : null;
    if (!account) throw new Error("account missing");
    const records = [];
    for (const e of entries) {
      if (!validBill(e)) throw new Error("交易字段无效");
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
return { received: records.length, inserted, duplicates: records.length - inserted };
}
