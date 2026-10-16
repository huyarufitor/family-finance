import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const secret = "whsec_" + Buffer.from("test-mail-secret-not-real").toString("base64");
const alias = "bill-" + "a".repeat(48);
const event = { type: "email.received", data: { email_id: "11111111-1111-4111-8111-111111111111", from: "我 <owner@example.test>", to: [`${alias}@test.resend.app`] } };
function request(value: unknown) {
  const payload = JSON.stringify(value), time = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`msg_test.${time}.${payload}`).digest("base64");
  return new Request("https://example.test", {method:"POST",body:payload,headers:{"svix-id":"msg_test","svix-timestamp":time,"svix-signature":`v1,${signature}`}});
}
async function handler() {
  let serve: (r: Request) => Promise<Response>;
  const env: Record<string,string> = { SUPABASE_URL:"https://test.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test",RESEND_API_KEY:"test",RESEND_WEBHOOK_SECRET:secret,RESEND_RECEIVING_DOMAIN:"test.resend.app" };
  vi.stubGlobal("Deno",{ env:{ get:(k:string)=>env[k] },serve:(f:typeof serve)=>{serve=f;} });
  await import("../supabase/functions/email-bills/index");
  return serve!;
}
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it("rejects forged requests before querying any family or email service", async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  const serve=await handler();
  const r=request(event);r.headers.set("svix-signature","v1,forged");
  expect((await serve(r)).status).toBe(401);expect(fetch).not.toHaveBeenCalled();
});
it("ignores the wrong forwarder without fetching financial attachments", async()=>{
  const fetch=vi.fn(async()=>Response.json([{channel_id:"c",allowed_sender:"trusted@example.test"}]));vi.stubGlobal("fetch",fetch);
  const r=await (await handler())(request(event));
  expect(await r.json()).toEqual({ignored:true});expect(fetch).toHaveBeenCalledTimes(1);
});
it("imports signed CSV attachments into the account bound to the route", async()=>{
  const csv="日期,金额,收支,交易单号,备注\n2026-10-16,25,支出,T1,午餐";
  const results=[
    [{channel_id:"channel",allowed_sender:"owner@example.test"}],
    [{id:"channel",household_id:"family",account_id:"account"}],
    {data:[{filename:"账单.csv",download_url:"https://attachments.example.test/file"}],has_more:false},
    csv,[{person_id:"person"}],[{id:"inserted"}],null,null,
  ];
  const fetch=vi.fn(async()=>{const next=results.shift();return typeof next==="string"?new Response(next):Response.json(next);});vi.stubGlobal("fetch",fetch);
  const r=await (await handler())(request(event));
  expect(r.status).toBe(200);expect(await r.json()).toEqual({received:1,inserted:1,duplicates:0,skipped:0});
  const calls=fetch.mock.calls as unknown as [string,RequestInit][];
  const record=JSON.parse(String(calls[5]![1].body))[0];
  expect(record).toMatchObject({household_id:"family",account_id:"account",person_id:"person",amount:2500,external_id:"T1",source:"channel:channel"});
  expect(calls[3]![1].headers).toBeUndefined();
});
it("refuses PDF attachments and records an actionable status without writing transactions",async()=>{
  const results=[ [{channel_id:"c",allowed_sender:"owner@example.test"}], [{id:"c",household_id:"h",account_id:"a"}], {data:[{filename:"账单.pdf"}]},null ];
  const fetch=vi.fn(async()=>Response.json(results.shift()));vi.stubGlobal("fetch",fetch);
  const r=await (await handler())(request(event));expect(await r.json()).toMatchObject({skipped:true});
  expect((fetch.mock.calls as unknown as [string][]).some(([url])=>url.includes("transactions"))).toBe(false);
});
it("rejects the entire email without retries when CSV purchases lack source transaction IDs",async()=>{
  const results=[ [{channel_id:"c",allowed_sender:"owner@example.test"}], [{id:"c",household_id:"h",account_id:"a"}], {data:[{filename:"账单.csv",download_url:"https://attachments.example.test/file"}],has_more:false}, "日期,金额,收支,备注\n2026-10-16,25,支出,午餐\n2026-10-16,25,支出,午餐", null ];
  const fetch=vi.fn(async()=>{const next=results.shift();return typeof next==="string"?new Response(next):Response.json(next);});vi.stubGlobal("fetch",fetch);
  const r=await (await handler())(request(event));
  expect(r.status).toBe(200);expect(await r.json()).toEqual({skipped:true,reason:"invalid_bill_csv"});
  const calls=fetch.mock.calls as unknown as [string,RequestInit][];
  expect(calls.some(([url])=>url.includes("transactions"))).toBe(false);
  expect(JSON.parse(String(calls.at(-1)![1].body)).last_status).toMatch(/交易号.*手动导入/);
});
