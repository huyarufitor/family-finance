import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.doUnmock("../src/lib/cloud"); vi.resetModules(); });
it("sets the authenticated Realtime JWT before subscribing to the shared ledger", async () => {
  const events: string[] = [];
  const setAuth = vi.fn(async () => { events.push("auth"); });
  const channel = {
    on() { return this; },
    subscribe() { events.push("subscribe"); return this; },
  };
  const query = {select(){return this;},eq(){return this;},limit(){return this;},async maybeSingle(){return {data:{household_id:"h",role:"member",households:{name:"测试"}},error:null};}};
  vi.doMock("../src/lib/cloud", () => ({
    cloud: {
      auth:{async getSession(){return {data:{session:{user:{id:"u",email:"u@example.test"},access_token:"session-jwt"}},error:null};}},
      realtime:{setAuth},from:()=>query,channel:()=>channel,
    },
    readLedger: async()=>({people:[],accounts:[],valuations:[],transactions:[]}),saveRows:vi.fn(),
  }));
  vi.resetModules();
  const { openCloud } = await import("../src/lib/store");
  await openCloud();
  expect(setAuth).toHaveBeenCalledWith("session-jwt");
  expect(events).toEqual(["auth","subscribe"]);
});
