import { afterEach, expect, it, vi } from "vitest";
type Handler = (req: Request) => Promise<Response>;
async function handler(name: string) {
  let serve: Handler | undefined;
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) =>
        ({
          SUPABASE_URL: "https://test.supabase.co",
          SUPABASE_ANON_KEY: "test-public",
          SUPABASE_SERVICE_ROLE_KEY: "test-server",
          AI_API_URL: "https://model.example.test/chat",
          AI_API_KEY: "test-model",
          AI_MODEL: "test",
        })[key as "SUPABASE_URL"],
    },
    serve: (fn: Handler) => {
      serve = fn;
    },
  });
  vi.resetModules();
  if (name === "import-bills")
    await import("../supabase/functions/import-bills/index");
  else await import("../supabase/functions/parse-entry/index");
  return serve!;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("rejects unauthenticated AI and untrusted import requests before any network access", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const ai = await handler("parse-entry");
  expect(
    (
      await ai(
        new Request("https://example.test", { method: "POST", body: "{}" }),
      )
    ).status,
  ).toBe(401);
  const bills = await handler("import-bills");
  expect(
    (
      await bills(
        new Request("https://example.test", {
          method: "POST",
          headers: { "x-channel-token": "bad" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("binds imported records to the authorized channel instead of caller-supplied family or account", async () => {
  const responses = [
    [
      {
        id: "channel",
        household_id: "trusted-family",
        account_id: "trusted-account",
      },
    ],
    [{ person_id: "trusted-person" }],
    [{ id: "inserted" }],
    null,
  ];
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const bills = await handler("import-bills");
  const response = await bills(
    new Request("https://example.test", {
      method: "POST",
      headers: { "x-channel-token": "a".repeat(64) },
      body: JSON.stringify({
        householdId: "other-family",
        entries: [
          {
            kind: "expense",
            amount: 2500,
            date: "2026-10-16",
            category: "餐饮",
            note: "午餐",
            externalId: " E1 ",
            accountId: "other-account",
            personId: "other-person",
          },
        ],
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    received: 1,
    inserted: 1,
    duplicates: 0,
  });
  const insert = JSON.parse(
    String(
      (fetchMock.mock.calls as unknown as [string, RequestInit][])[2][1].body,
    ),
  )[0];
  expect(insert).toMatchObject({
    household_id: "trusted-family",
    account_id: "trusted-account",
    person_id: "trusted-person",
    external_id: "E1",
    source: "channel:channel",
  });
});
it("validates an entire batch before writing any imported records", async () => {
  const responses = [
    [{ id: "c", household_id: "h", account_id: "a" }],
    [{ person_id: "p" }],
  ];
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(responses.shift()), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const bills = await handler("import-bills");
  const response = await bills(
    new Request("https://example.test", {
      method: "POST",
      headers: { "x-channel-token": "a".repeat(64) },
      body: JSON.stringify({
        entries: [
          {
            kind: "expense",
            amount: 2500,
            date: "2026-10-16",
            category: "餐饮",
            note: "午餐",
            externalId: "E1",
          },
          {
            kind: "expense",
            amount: -2500,
            date: "2026-10-16",
            category: "餐饮",
            note: "bad",
            externalId: "E2",
          },
        ],
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("checks AI quota before invoking a paid model", async () => {
  const responses = [{ id: "u" }, false];
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(responses.shift()), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const ai = await handler("parse-entry");
  const response = await ai(
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer user-token" },
      body: JSON.stringify({ text: "午餐25元", today: "2026-10-16" }),
    }),
  );
  expect(response.status).toBe(429);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
