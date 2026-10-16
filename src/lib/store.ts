import { reactive } from "vue";
import { cloud, readLedger, saveRows } from "./cloud";
import { demoLedger } from "./demo";
import {
  emptyLedger,
  type Account,
  type Entry,
  type Ledger,
  type Person,
  type Valuation,
} from "./types";
import { validateBackup } from "./import";
const STORAGE = "family-finance-demo-v1";
export const state = reactive({
  data: emptyLedger(),
  mode: "demo" as "demo" | "cloud",
  email: "",
  userId: "",
  householdId: "",
  familyName: "林予的家",
  role: "",
  loading: false,
  busy: false,
  error: "",
  syncMessage: "",
  realtime: false,
});
let subscription: ReturnType<NonNullable<typeof cloud>["channel"]> | null =
  null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
export function errorMessage(e: unknown): string {
  return e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "操作失败，请稍后重试";
}
export function persistDemo() {
  if (state.mode === "demo") {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({ version: 1, ...state.data }),
      );
    } catch {
      state.error = "浏览器存储不可用或已满，请及时导出备份";
    }
  }
}
function stopRealtime() {
  generation++;
  if (subscription && cloud) void cloud.removeChannel(subscription);
  subscription = null;
  state.realtime = false;
  clearTimeout(refreshTimer);
}
export function useDemo() {
  stopRealtime();
  state.mode = "demo";
  state.householdId = "";
  state.familyName = "林予的家";
  state.role = "";
  state.error = "";
  try {
    const saved = localStorage.getItem(STORAGE);
    state.data = saved ? validateBackup(JSON.parse(saved)) : demoLedger();
  } catch {
    state.data = demoLedger();
    state.error = "本机演示存档无法读取，已加载示例。可通过备份恢复";
  }
}
export async function refreshCloud() {
  if (!state.householdId || state.mode !== "cloud") return;
  const current = generation,
    h = state.householdId;
  const data = await readLedger(h);
  if (current === generation && state.mode === "cloud") {
    state.data = data;
    state.syncMessage = `已同步 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
}
export async function openCloud() {
  if (!cloud) throw new Error("请先配置 Supabase 项目");
  stopRealtime();
  state.loading = true;
  state.mode = "cloud";
  state.error = "";
  state.householdId = "";
  state.data = emptyLedger();
  state.familyName = "";
  try {
    const {
      data: { session },
      error,
    } = await cloud.auth.getSession();
    if (error) throw error;
    state.email = session?.user.email || "";
    state.userId = session?.user.id || "";
    if (!session) return;
    const { data, error: err } = await cloud
      .from("memberships")
      .select("household_id,role,households(name)")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();
    if (err) throw err;
    if (!data) return;
    state.householdId = data.household_id;
    state.role = data.role;
    state.familyName =
      (data.households as unknown as { name: string })?.name || "我的家庭";
    await refreshCloud();
    subscription = cloud.channel(`family:${state.householdId}`);
    for (const table of ["people", "accounts", "valuations", "transactions"])
      subscription.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `household_id=eq.${state.householdId}`,
        },
        () => {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            void refreshCloud().catch((e) => {
              state.error = errorMessage(e);
            });
          }, 350);
        },
      );
    subscription.subscribe((status) => {
      state.realtime = status === "SUBSCRIBED";
    });
  } catch (e) {
    state.error = errorMessage(e);
  } finally {
    state.loading = false;
  }
}
export async function init() {
  useDemo();
  if (!cloud) return;
  const {
    data: { session },
  } = await cloud.auth.getSession();
  if (session) await openCloud();
  cloud.auth.onAuthStateChange((event, session) => {
    state.email = session?.user.email || "";
    state.userId = session?.user.id || "";
    if (event === "SIGNED_OUT") useDemo();
    else if (
      event === "SIGNED_IN" &&
      (state.mode !== "cloud" || !state.householdId)
    )
      setTimeout(() => {
        void openCloud();
      }, 0);
  });
}
export async function run(action: () => Promise<void>) {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  try {
    await action();
  } catch (e) {
    state.error = errorMessage(e);
    throw e;
  } finally {
    state.busy = false;
  }
}
export async function addRows<K extends keyof Ledger>(
  table: K,
  records: Ledger[K],
) {
  if (state.mode === "cloud") {
    if (!state.householdId) throw new Error("请先创建或加入家庭");
    await saveRows(table, records, state.householdId);
    await refreshCloud();
  } else {
    (state.data[table] as (Person | Account | Valuation | Entry)[]).push(
      ...records,
    );
    persistDemo();
  }
}
export async function addEntries(entries: Entry[]) {
  await addRows("transactions", entries);
}
export async function saveValuation(v: Valuation) {
  if (state.mode === "cloud") {
    await saveRows("valuations", [v], state.householdId);
    await refreshCloud();
  } else {
    state.data.valuations = state.data.valuations.filter(
      (x) => x.accountId !== v.accountId || x.date !== v.date,
    );
    state.data.valuations.push(v);
    persistDemo();
  }
}
export async function removeEntry(id: string) {
  if (state.mode === "cloud" && cloud) {
    const { error } = await cloud
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("household_id", state.householdId);
    if (error) throw error;
    await refreshCloud();
  } else {
    state.data.transactions = state.data.transactions.filter(
      (t) => t.id !== id,
    );
    persistDemo();
  }
}
export async function signOut() {
  if (cloud) {
    const { error } = await cloud.auth.signOut();
    if (error) throw error;
  }
  state.email = "";
  state.userId = "";
  useDemo();
}
