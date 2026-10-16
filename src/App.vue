<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import AppIcon from "./components/AppIcon.vue";
import TrendChart from "./components/TrendChart.vue";
import EntryDialog from "./components/EntryDialog.vue";
import ImportDialog from "./components/ImportDialog.vue";
import ModalShell from "./components/ModalShell.vue";
import {
  accountValue,
  dateRange,
  investmentReturn,
  isoDate,
  money,
  selectedAccounts,
  selectedEntries,
  shiftDate,
  summary,
  toCents,
  trend,
  validDate,
} from "./lib/finance";
import {
  accountLabels,
  type AccountKind,
  type Draft,
  type Period,
} from "./lib/types";
import { parseText } from "./lib/parser";
import { validateBackup } from "./lib/import";
import { aiParse, cloud, cloudConfigured, webhookUrl } from "./lib/cloud";
import {
  addRows,
  errorMessage,
  init,
  openCloud,
  persistDemo,
  refreshCloud,
  removeEntry,
  saveValuation,
  signOut,
  state,
  useDemo,
} from "./lib/store";
void init();
const nav = [
  { id: "overview", label: "家庭总览", icon: "dashboard" },
  { id: "ledger", label: "收支账本", icon: "book" },
  { id: "assets", label: "资产配置", icon: "pie" },
  { id: "returns", label: "收益分析", icon: "trend" },
  { id: "connections", label: "数据连接", icon: "link" },
];
const page = ref("overview"),
  person = ref(""),
  period = ref<Period>("month"),
  anchor = ref(isoDate()),
  customStart = ref(isoDate().slice(0, 7) + "-01"),
  customEnd = ref(isoDate()),
  search = ref(""),
  kindFilter = ref("");
const title = computed(() => nav.find((n) => n.id === page.value)?.label || "");
const range = computed(() =>
  period.value === "custom"
    ? { start: customStart.value, end: customEnd.value }
    : dateRange(period.value, anchor.value || isoDate()),
);
const invalidRange = computed(
  () =>
    !validDate(range.value.start) ||
    !validDate(range.value.end) ||
    range.value.start > range.value.end ||
    range.value.start > isoDate(),
);
const rangeStart = computed(() =>
    invalidRange.value ? isoDate() : range.value.start,
  ),
  rangeEnd = computed(() =>
    invalidRange.value
      ? isoDate()
      : range.value.end > isoDate()
        ? isoDate()
        : range.value.end,
  );
const totals = computed(() =>
  summary(state.data, rangeStart.value, rangeEnd.value, person.value),
);
const returns = computed(() =>
  investmentReturn(state.data, rangeStart.value, rangeEnd.value, person.value),
);
const chart = computed(() =>
  trend(
    state.data,
    rangeStart.value,
    rangeEnd.value > isoDate() ? isoDate() : rangeEnd.value,
    person.value,
  ),
);
const tx = computed(() =>
  selectedEntries(
    state.data,
    rangeStart.value,
    rangeEnd.value,
    person.value,
  ).filter(
    (t) =>
      (!kindFilter.value || t.kind === kindFilter.value) &&
      `${t.note} ${t.category} ${personName(t.personId)}`.includes(
        search.value,
      ),
  ),
);
const selectedName = computed(
  () => state.data.people.find((p) => p.id === person.value)?.name || "全家",
);
const palette = ["#406b52", "#82a17b", "#bdca9c", "#d8b18a", "#b8b7ad"];
const allocations = computed(() =>
  Object.entries(accountLabels)
    .filter(([k]) => k !== "liability")
    .map(([kind, label], i) => ({
      kind,
      label,
      color: palette[i]!,
      value: selectedAccounts(state.data, person.value)
        .filter((a) => a.kind === kind)
        .reduce(
          (n, a) =>
            n +
            Math.max(0, accountValue(state.data, a.id, rangeEnd.value) ?? 0),
          0,
        ),
    }))
    .filter((x) => x.value > 0),
);
const allocationTotal = computed(() =>
  allocations.value.reduce((n, a) => n + a.value, 0),
);
const donut = computed(() => {
  let offset = 0;
  return allocations.value.length
    ? `conic-gradient(${allocations.value
        .map((a) => {
          const start = offset;
          offset += (a.value / allocationTotal.value) * 100;
          return `${a.color} ${start}% ${offset}%`;
        })
        .join(",")})`
    : "#edf0e9";
});
const expenseCategories = computed(() => {
  const groups = new Map<string, number>();
  for (const t of selectedEntries(
    state.data,
    rangeStart.value,
    rangeEnd.value,
    person.value,
  ).filter((t) => t.kind === "expense"))
    groups.set(t.category, (groups.get(t.category) || 0) + t.amount);
  return [...groups].sort((a, b) => b[1] - a[1]).slice(0, 5);
});
const memberStats = computed(() =>
  state.data.people.map((p) => ({
    ...p,
    ...summary(state.data, rangeStart.value, rangeEnd.value, p.id),
  })),
);
const shownAccounts = computed(() =>
  selectedAccounts(state.data, person.value),
);
const quickText = ref(""),
  parserMode = ref("local"),
  parsing = ref(false),
  entryOpen = ref(false),
  importOpen = ref(false),
  draft = ref<Draft>(),
  toast = ref("");
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function notify(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = "";
  }, 3500);
}
function personName(id: string) {
  return state.data.people.find((p) => p.id === id)?.name || "成员";
}
function accountName(id?: string) {
  return state.data.accounts.find((a) => a.id === id)?.name || "—";
}
function newEntry() {
  draft.value = undefined;
  entryOpen.value = true;
}
async function parse() {
  parsing.value = true;
  try {
    draft.value =
      parserMode.value === "ai"
        ? await aiParse(quickText.value, isoDate())
        : parseText(quickText.value, isoDate());
    entryOpen.value = true;
  } catch (e) {
    state.error = errorMessage(e);
  } finally {
    parsing.value = false;
  }
}
function saved() {
  quickText.value = "";
  notify(state.mode === "demo" ? "已保存到本机演示账本" : "已保存到家庭账本");
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        results: { [key: number]: { [key: number]: { transcript: string } } };
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
const Speech =
  (
    window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    }
  ).SpeechRecognition ||
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition })
    .webkitSpeechRecognition;
const listening = ref(false);
let recognition: Recognition | undefined;
function dictate() {
  if (listening.value) {
    recognition?.stop();
    return;
  }
  if (!Speech) {
    state.error = "当前浏览器不支持语音识别，请尝试 Chrome 或使用文字输入";
    return;
  }
  recognition = new Speech();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    quickText.value = e.results[0]![0]!.transcript;
    notify("语音已转为文字，请核对后解析");
  };
  recognition.onerror = (e) => {
    state.error =
      e.error === "not-allowed"
        ? "麦克风权限未开启，请在浏览器设置中允许使用"
        : "语音识别失败，请检查网络或改用文字输入";
    listening.value = false;
  };
  recognition.onend = () => {
    listening.value = false;
  };
  try {
    recognition.start();
    listening.value = true;
  } catch {
    state.error = "无法启动麦克风";
    listening.value = false;
  }
}
onBeforeUnmount(() => {
  recognition?.stop();
  clearTimeout(toastTimer);
});
function movePeriod(step: number) {
  const d = new Date(`${anchor.value}T12:00:00`);
  if (period.value === "week") anchor.value = shiftDate(anchor.value, 7 * step);
  else {
    d.setDate(1);
    d.setMonth(
      d.getMonth() +
        step *
          (period.value === "quarter" ? 3 : period.value === "year" ? 12 : 1),
    );
    anchor.value = isoDate(d);
  }
}
const modal = ref(""),
  formName = ref(""),
  formPerson = ref(""),
  formKind = ref<AccountKind>("cash"),
  formAmount = ref(""),
  formDate = ref(isoDate()),
  formAccount = ref(""),
  modalError = ref(""),
  modalBusy = ref(false),
  secret = ref(""),
  backupData = ref<ReturnType<typeof validateBackup>>();
function showModal(type: string, accountId = "") {
  modal.value = type;
  modalError.value = "";
  formName.value = "";
  formAmount.value = "";
  formDate.value = isoDate();
  formPerson.value = person.value || state.data.people[0]?.id || "";
  formAccount.value = accountId || state.data.accounts[0]?.id || "";
  secret.value = "";
  backupData.value = undefined;
}
async function submitModal() {
  if (modalBusy.value) return;
  modalBusy.value = true;
  modalError.value = "";
  try {
    if (modal.value === "person") {
      if (!formName.value.trim()) throw new Error("成员称呼不能为空");
      await addRows("people", [
        {
          id: crypto.randomUUID(),
          name: formName.value.trim(),
          color: palette[state.data.people.length % palette.length]!,
        },
      ]);
    }
    if (modal.value === "account") {
      const a = {
        id: crypto.randomUUID(),
        personId: formPerson.value,
        name: formName.value.trim(),
        kind: formKind.value,
      };
      const value = toCents(formAmount.value);
      if (!a.name || !a.personId || !validDate(formDate.value))
        throw new Error("请完整填写账户信息");
      if (state.mode === "cloud" && cloud) {
        const { error } = await cloud.rpc("create_account", {
          h: state.householdId,
          p: a.personId,
          account_name: a.name,
          account_kind: a.kind,
          initial_value: value,
          initial_date: formDate.value,
        });
        if (error) throw error;
        await refreshCloud();
      } else {
        await addRows("accounts", [a]);
        await saveValuation({
          id: crypto.randomUUID(),
          accountId: a.id,
          date: formDate.value,
          value,
        });
      }
    }
    if (modal.value === "valuation") {
      if (!formAccount.value || !validDate(formDate.value))
        throw new Error("请选择账户与日期");
      await saveValuation({
        id: crypto.randomUUID(),
        accountId: formAccount.value,
        date: formDate.value,
        value: toCents(formAmount.value),
      });
    }
    if (modal.value === "invite" && cloud) {
      const { data, error } = await cloud.rpc("create_invitation", {
        h: state.householdId,
      });
      if (error) throw error;
      secret.value = data;
      return;
    }
    if (modal.value === "channel" && cloud) {
      const { data, error } = await cloud.rpc("create_import_channel", {
        h: state.householdId,
        a: formAccount.value,
        channel_name: formName.value.trim(),
      });
      if (error) throw error;
      secret.value = data;
      await loadChannels();
      return;
    }
    if (modal.value === "restore" && backupData.value) {
      if (state.mode !== "demo")
        throw new Error("请先切换到本机演示，再恢复备份");
      state.data = backupData.value;
      persistDemo();
      person.value = "";
    }
    modal.value = "";
    notify("已保存");
  } catch (e) {
    modalError.value = errorMessage(e);
  } finally {
    modalBusy.value = false;
  }
}
async function deleteEntry(id: string) {
  if (!window.confirm("删除这笔交易？历史余额和报表将随之重新计算。")) return;
  try {
    await removeEntry(id);
    notify("交易已删除");
  } catch (e) {
    state.error = errorMessage(e);
  }
}
function downloadBackup() {
  const blob = new Blob(
    [
      JSON.stringify(
        { version: 1, exportedAt: new Date().toISOString(), ...state.data },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const link = document.createElement("a"),
    url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `有数-家庭账本-${isoDate()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readBackup(event: Event) {
  try {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 20_000_000) throw new Error("备份不能超过20MB");
    backupData.value = validateBackup(JSON.parse(await file.text()));
    modalError.value = "";
  } catch (e) {
    backupData.value = undefined;
    modalError.value = errorMessage(e);
  }
}
const email = ref(""),
  otp = ref(""),
  authMessage = ref(""),
  authBusy = ref(false),
  familyName = ref("我的家庭"),
  myName = ref("我"),
  inviteToken = ref("");
async function authAction(action: string) {
  if (!cloud) return;
  authBusy.value = true;
  state.error = "";
  try {
    if (action === "send") {
      const { error } = await cloud.auth.signInWithOtp({
        email: email.value.trim(),
        options: {
          emailRedirectTo: new URL(
            import.meta.env.BASE_URL,
            window.location.origin,
          ).href,
        },
      });
      if (error) throw error;
      authMessage.value =
        "登录邮件已发送，请点击邮件中的链接；若邮件含验证码，也可以在下方填写。";
    }
    if (action === "verify") {
      const { error } = await cloud.auth.verifyOtp({
        email: email.value.trim(),
        token: otp.value.trim(),
        type: "email",
      });
      if (error) throw error;
      await openCloud();
    }
    if (action === "create") {
      const { error } = await cloud.rpc("create_household", {
        family_name: familyName.value.trim(),
        person_name: myName.value.trim(),
      });
      if (error) throw error;
      await openCloud();
      person.value = "";
    }
    if (action === "join") {
      const { error } = await cloud.rpc("accept_invitation", {
        token: inviteToken.value.trim(),
      });
      if (error) throw error;
      await openCloud();
      person.value = "";
    }
    if (action === "cloud") {
      await openCloud();
      person.value = "";
    }
    if (action === "out") {
      await signOut();
      person.value = "";
    }
  } catch (e) {
    state.error = errorMessage(e);
  } finally {
    authBusy.value = false;
  }
}
const channels = ref<
  {
    id: string;
    name: string;
    account_id: string;
    last_received_at: string | null;
  }[]
>([]);
async function loadChannels() {
  if (!cloud || state.mode !== "cloud" || state.role !== "owner") {
    channels.value = [];
    return;
  }
  const { data, error } = await cloud
    .from("import_channels")
    .select("id,name,account_id,last_received_at")
    .eq("household_id", state.householdId);
  if (error) {
    state.error = errorMessage(error);
    return;
  }
  channels.value = data || [];
}
async function revokeChannel(id: string) {
  if (
    !cloud ||
    !window.confirm("撤销后，此渠道的密钥将立即失效，停止接收新账单。")
  )
    return;
  const { error } = await cloud
    .from("import_channels")
    .delete()
    .eq("id", id)
    .eq("household_id", state.householdId);
  if (error) state.error = errorMessage(error);
  else await loadChannels();
}
function navigate(id: string) {
  page.value = id;
  if (id === "connections") void loadChannels();
}
async function copySecret() {
  try {
    await navigator.clipboard.writeText(secret.value);
    notify("已复制，请妥善保存");
  } catch {
    modalError.value = "无法自动复制，请手动选择并复制";
  }
}
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <a
        class="brand"
        href="#"
        aria-label="有数首页"
        @click.prevent="navigate('overview')"
        ><span class="brand-mark"><i></i><i></i><i></i></span
        ><span>有数<small>生活有度，心里有数</small></span></a
      >
      <div class="nav-caption">我的家庭财务</div>
      <nav>
        <button
          v-for="item in nav"
          :key="item.id"
          :class="['nav-item', { active: page === item.id }]"
          @click="navigate(item.id)"
        >
          <AppIcon :name="item.icon" /><span>{{ item.label }}</span
          ><span
            v-if="item.id === 'connections'"
            class="nav-dot"
            :class="{ connected: state.realtime }"
          ></span>
        </button>
      </nav>
      <div class="sidebar-note">
        <span class="seed-decoration">✳</span
        ><strong>每一笔，都在靠近理想生活。</strong>
        <p>从今天的小记录，<br />到明天的大计划。</p>
      </div>
      <div class="sidebar-family">
        <span class="family-avatar"><AppIcon name="family" /></span>
        <div>
          <strong>{{ state.familyName || "我的家庭" }}</strong
          ><small>{{
            state.mode === "demo"
              ? "本机演示账本"
              : `${state.data.people.length} 位家庭成员`
          }}</small>
        </div>
        <button
          class="icon-button"
          aria-label="家庭设置"
          @click="navigate('connections')"
        >
          <AppIcon name="down" :size="16" />
        </button>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb">
          我的家庭 <span>/</span> <strong>{{ title }}</strong>
        </div>
        <div class="topbar-right">
          <span class="sync-label"
            ><i :class="{ live: state.realtime }"></i
            >{{
              state.mode === "demo"
                ? "演示模式 · 本机保存"
                : state.realtime
                  ? "家庭数据实时同步"
                  : state.syncMessage || "云端账本"
            }}</span
          ><button
            class="profile-button"
            aria-label="查看家庭设置"
            @click="navigate('connections')"
          >
            {{
              state.mode === "demo"
                ? "林"
                : (state.email[0] || "我").toUpperCase()
            }}
          </button>
        </div>
      </header>
      <main>
        <div v-if="state.mode === 'demo'" class="demo-banner">
          <span
            ><AppIcon
              name="info"
              :size="16"
            />你正在浏览示例家庭，修改仅保存在当前浏览器。</span
          ><button @click="navigate('connections')">
            连接我的家庭 <span>↗</span>
          </button>
        </div>
        <div v-if="state.error" class="error-banner" role="alert">
          <span>{{ state.error }}</span
          ><button
            class="icon-button"
            aria-label="关闭错误提示"
            @click="state.error = ''"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div class="page-heading">
          <div>
            <div class="eyebrow">
              {{
                page === "overview"
                  ? "A LITTLE EVERY DAY"
                  : "YOUR FAMILY, IN BALANCE"
              }}
            </div>
            <h1>{{ title }}</h1>
            <p>
              {{
                page === "overview"
                  ? "把生活的每一份积累，看得更清楚。"
                  : page === "ledger"
                    ? "记下日常的来与往，让每一笔钱都有迹可循。"
                    : page === "assets"
                      ? "每个人的积累，都是这个家的底气。"
                      : page === "returns"
                        ? "分清投入与回报，看见时间带来的变化。"
                        : "让分散的数据，慢慢汇成完整的家庭账本。"
              }}
            </p>
          </div>
          <div class="heading-actions">
            <button class="button secondary" @click="importOpen = true">
              <AppIcon name="upload" :size="17" />导入账单
</button
            ><button class="button primary" @click="newEntry">
              <AppIcon name="plus" :size="18" />记一笔
            </button>
          </div>
        </div>
        <template v-if="page !== 'connections'">
          <section class="filter-bar" aria-label="报表筛选">
            <div class="member-tabs">
              <button :class="{ active: !person }" @click="person = ''">
                <AppIcon name="family" :size="16" />全部成员
</button
              ><button
                v-for="p in state.data.people"
                :key="p.id"
                :class="{ active: person === p.id }"
                @click="person = p.id"
              >
                <span
                  class="tiny-avatar"
                  aria-hidden="true"
                  :style="{ background: p.color + '20', color: p.color }"
                  >{{ p.name.slice(0, 1) }}</span
                >{{ p.name }}
              </button>
            </div>
            <div class="date-controls">
              <div class="period-tabs">
                <button
                  v-for="(label, key) in {
                    week: '周',
                    month: '月',
                    quarter: '季',
                    year: '年',
                    custom: '自定义',
                  }"
                  :key="key"
                  :class="{ active: period === key }"
                  @click="period = key as Period"
                >
                  {{ label }}
                </button>
              </div>
              <div v-if="period !== 'custom'" class="date-picker">
                <button aria-label="上一时段" @click="movePeriod(-1)">‹</button
                ><label
                  ><AppIcon name="calendar" :size="15" /><input
                    v-model="anchor"
                    type="date"
                    aria-label="报表参考日期" /></label
                ><button aria-label="下一时段" @click="movePeriod(1)">›</button>
              </div>
            </div>
            <div v-if="period === 'custom'" class="custom-dates">
              <label>开始日期<input v-model="customStart" type="date" /></label
              ><span>至</span
              ><label>结束日期<input v-model="customEnd" type="date" /></label>
            </div>
          </section>
          <p v-if="invalidRange" class="form-error" role="alert">
            请选择有效日期，结束日期不能早于开始日期，开始日期不能晚于今天。
          </p>
          <div class="context-line">
            <span>{{ selectedName }}的财务概况</span
            ><span>{{ rangeStart }} — {{ rangeEnd }} · 人民币 CNY</span>
          </div>
        </template>
        <template v-if="page === 'overview'">
          <section class="stats-grid">
            <article class="stat-card featured">
              <div class="stat-label">
                家庭净资产 <AppIcon name="wallet" :size="18" />
              </div>
              <div class="stat-value">
                <span>¥</span>{{ money(totals.netAssets) }}
              </div>
              <div class="stat-foot">
                <span class="small-badge">资产 − 负债</span
                ><span>{{
                  totals.missing
                    ? `${totals.missing} 个账户缺少估值`
                    : "每一份积累，都算数"
                }}</span>
              </div>
              <svg class="stat-spark" viewBox="0 0 100 50">
                <path
                  d="M0 48L15 36L29 38L44 24L58 27L72 12L85 17L100 2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
              </svg>
            </article>
            <article class="stat-card">
              <div class="stat-label">
                期间收入
                <span class="stat-symbol income"
                  ><AppIcon name="income" :size="17"
                /></span>
              </div>
              <div class="stat-value">
                <span>¥</span>{{ money(totals.income) }}
              </div>
              <div class="stat-foot">记录努力，也记录收获</div>
            </article>
            <article class="stat-card">
              <div class="stat-label">
                期间支出
                <span class="stat-symbol expense"
                  ><AppIcon name="expense" :size="17"
                /></span>
              </div>
              <div class="stat-value">
                <span>¥</span>{{ money(totals.expense) }}
              </div>
              <div class="stat-foot">
                {{
                  totals.income > 0
                    ? `收入的 ${((totals.expense / totals.income) * 100).toFixed(1)}% 用于生活`
                    : "每一笔消费，都有去处"
                }}
              </div>
            </article>
            <article class="stat-card">
              <div class="stat-label">
                投资估值收益
                <span class="stat-symbol neutral"
                  ><AppIcon name="trend" :size="17"
                /></span>
              </div>
              <div
                class="stat-value"
                :class="{ positive: (returns.gain || 0) > 0 }"
              >
                <span v-if="returns.gain !== null">¥</span
                >{{ returns.gain === null ? "—" : money(returns.gain) }}
              </div>
              <div class="stat-foot">
                <span v-if="returns.rate !== null" class="positive"
                  >{{ returns.rate >= 0 ? "+" : ""
                  }}{{ (returns.rate * 100).toFixed(2) }}%</span
                ><span>{{
                  returns.rate === null
                    ? "补录期初与期末估值后计算"
                    : "期间收益率 · 非年化"
                }}</span>
              </div>
            </article>
          </section>
          <section class="quick-entry">
            <div class="quick-icon"><AppIcon name="sparkle" :size="24" /></div>
            <div class="quick-copy">
              <strong>一句话，记下生活</strong
              ><span>把琐碎交给有数，把时间留给生活。</span>
            </div>
            <form class="quick-form" @submit.prevent="parse">
              <input
                v-model="quickText"
                aria-label="自然语言记账"
                placeholder="例如：中午吃快餐花了25元"
                maxlength="2000"
                required
              /><button
                type="button"
                :class="['mic-button', { listening }]"
                :aria-label="listening ? '停止语音输入' : '开始语音输入'"
                :title="
                  Speech
                    ? '语音可能使用浏览器提供的在线识别服务'
                    : '当前浏览器不支持语音识别'
                "
                @click="dictate"
              >
                <AppIcon name="mic" :size="18" />
</button
              ><select v-model="parserMode" aria-label="解析方式">
                <option value="local">本地解析</option>
                <option value="ai" :disabled="state.mode !== 'cloud'">
                  AI 解析
                </option>
</select
              ><button
                class="quick-submit"
                :disabled="parsing"
                aria-label="解析记账"
              >
                <AppIcon :name="parsing ? 'sparkle' : 'arrow'" :size="20" />
              </button>
            </form>
          </section>
          <section class="charts-grid">
            <article class="panel trend-panel">
              <div class="panel-heading">
                <div>
                  <h2>净资产趋势<span class="subtle-dot"></span></h2>
                  <p>看见积累的轨迹</p>
                </div>
                <span class="chart-key"><i></i>家庭净资产</span>
              </div>
              <TrendChart :points="chart" />
              <div class="chart-bottom">
                <AppIcon name="info" :size="14" /><span
                  >根据估值快照与账本现金流计算，缺少历史估值时留空。</span
                >
              </div>
            </article>
            <article class="panel allocation-panel">
              <div class="panel-heading">
                <div>
                  <h2>资产分布</h2>
                  <p>让每一份资产各得其所</p>
                </div>
                <button
                  class="icon-button"
                  aria-label="查看资产配置"
                  @click="navigate('assets')"
                >
                  <AppIcon name="arrow" :size="18" />
                </button>
              </div>
              <div class="allocation-content">
                <div
                  class="donut"
                  :style="{ background: donut }"
                  role="img"
                  aria-label="正资产类别占比"
                >
                  <div>
                    <span>资产总额</span
                    ><strong
                      >{{ (allocationTotal / 1000000).toFixed(2)
                      }}<small>万</small></strong
                    >
                  </div>
                </div>
                <div class="allocation-legend">
                  <div v-for="a in allocations" :key="a.kind">
                    <span
                      ><i :style="{ background: a.color }"></i
                      >{{ a.label }}</span
                    ><strong
                      >{{ ((a.value / allocationTotal) * 100).toFixed(1)
                      }}<small>%</small></strong
                    >
                  </div>
                  <p v-if="!allocations.length" class="muted">
                    添加账户后查看资产配比
                  </p>
                </div>
              </div>
            </article>
          </section>
          <section class="panel members-panel">
            <div class="panel-heading">
              <div>
                <h2>
                  一家人的小金库
                  <span class="count-badge"
                    >{{ state.data.people.length }} 位成员</span
                  >
                </h2>
                <p>各自的努力，共同的未来</p>
              </div>
              <button class="text-button" @click="showModal('person')">
                添加成员 <AppIcon name="plus" :size="15" />
              </button>
            </div>
            <div class="member-grid">
              <button
                v-for="p in memberStats"
                :key="p.id"
                class="member-card"
                @click="
                  person = p.id;
                  navigate('assets');
                "
              >
                <div class="member-card-head">
                  <span
                    class="avatar"
                    :style="{ background: p.color + '1b', color: p.color }"
                    >{{ p.name.slice(0, 1) }}</span
                  >
                  <div>
                    <strong>{{ p.name }}</strong
                    ><span
                      >{{
                        state.data.accounts.filter((a) => a.personId === p.id)
                          .length
                      }}
                      个资产账户</span
                    >
                  </div>
                  <AppIcon name="chevron" :size="16" />
                </div>
                <div class="member-amount">
                  <span>净资产</span><strong>¥ {{ money(p.netAssets) }}</strong>
                </div>
                <div class="progress-track">
                  <span
                    :style="{
                      width: totals.assets
                        ? Math.min(
                            100,
                            Math.max(0, (p.assets / totals.assets) * 100),
                          ) + '%'
                        : '0%',
                      background: p.color,
                    }"
                  ></span>
                </div>
                <div class="member-share">
                  正资产 ¥{{ money(p.assets, 0) }}
                  <span>负债 ¥{{ money(p.liabilities, 0) }}</span>
                </div>
              </button>
              <p v-if="!memberStats.length" class="empty-state">
                先添加一位家庭成员，开启你们的财务记录。
              </p>
            </div>
          </section>
        </template>
        <template v-if="page === 'overview' || page === 'ledger'"
          >
<section class="panel ledger-panel">
            <div class="panel-heading">
              <div>
                <h2>
                  {{ page === "overview" ? "最近的收支" : "每一笔生活" }}
                  <span class="count-badge">{{ tx.length }} 笔</span>
                </h2>
                <p>有迹可循，心中有数</p>
              </div>
              <button
                v-if="page === 'overview'"
                class="text-button"
                @click="navigate('ledger')"
              >
                查看全部 <AppIcon name="arrow" :size="16" />
              </button>
              <div v-else class="ledger-tools">
                <label class="search-box"
                  ><AppIcon name="search" :size="16" /><input
                    v-model="search"
                    aria-label="搜索账单"
                    placeholder="搜索备注或分类" /></label
                ><select v-model="kindFilter" aria-label="收支筛选">
                  <option value="">全部收支</option>
                  <option value="income">收入</option>
                  <option value="expense">支出</option>
                  <option value="transfer">转账</option>
                </select>
              </div>
            </div>
            <div v-if="page === 'ledger'" class="ledger-quick">
              <input
                v-model="quickText"
                aria-label="自然语言记账"
                placeholder="例如：中午吃快餐花了25元"
              /><button
                class="icon-button"
                aria-label="开始语音输入"
                @click="dictate"
              >
                <AppIcon name="mic" />
</button
              ><select v-model="parserMode" aria-label="解析方式">
                <option value="local">本地解析</option>
                <option value="ai" :disabled="state.mode !== 'cloud'">
                  AI 解析
                </option>
</select
              ><button
                class="button primary"
                :disabled="parsing || !quickText.trim()"
                @click="parse"
              >
                解析记账
              </button>
            </div>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>收支事项</th>
                    <th>分类</th>
                    <th>成员 / 账户</th>
                    <th>日期</th>
                    <th class="num">金额</th>
                    <th v-if="page === 'ledger'">
                      <span class="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="t in page === 'overview' ? tx.slice(0, 5) : tx"
                    :key="t.id"
                  >
                    <td>
                      <div class="transaction-note">
                        <span class="transaction-icon" :class="t.kind"
                          ><AppIcon
                            :name="
                              t.kind === 'income'
                                ? 'income'
                                : t.kind === 'transfer'
                                  ? 'link'
                                  : t.category === '餐饮'
                                    ? 'food'
                                    : t.category === '购物' ||
                                        t.category === '日用'
                                      ? 'cart'
                                      : 'wallet'
                            "
                            :size="18" /></span
                        ><span :title="t.note">{{ t.note || t.category }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="category-tag">{{ t.category }}</span>
                    </td>
                    <td>
                      <div class="table-person">
                        {{ personName(t.personId)
                        }}<small
                          >{{ accountName(t.accountId)
                          }}{{
                            t.toAccountId
                              ? " → " + accountName(t.toAccountId)
                              : ""
                          }}</small
                        >
                      </div>
                    </td>
                    <td class="muted">
                      {{ t.date.slice(5).replace("-", " / ") }}
                    </td>
                    <td
                      class="num amount"
                      :class="{ positive: t.kind === 'income' }"
                    >
                      {{
                        t.kind === "income"
                          ? "+"
                          : t.kind === "expense"
                            ? "−"
                            : ""
                      }}{{ money(t.amount) }}
                    </td>
                    <td v-if="page === 'ledger'">
                      <button
                        class="icon-button delete-button"
                        aria-label="删除交易"
                        @click="deleteEntry(t.id)"
                      >
                        <AppIcon name="trash" :size="15" />
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!tx.length">
                    <td colspan="6" class="empty-state">
                      这个时段还没有收支，记下第一笔生活吧。
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="table-foot">
              <span>内部转账不计入收入与支出</span
              ><span v-if="page === 'overview'">让每一笔钱，都花得明白。</span
              ><span v-else
                >收入 ¥{{ money(totals.income) }} · 支出 ¥{{
                  money(totals.expense)
                }}</span
              >
            </div>
          </section>
</template
        >
        <template v-if="page === 'assets'"
          >
<section class="asset-summary">
            <article class="panel">
              <span class="muted">正资产合计</span>
              <h2>¥ {{ money(totals.assets) }}</h2>
            </article>
            <article class="panel">
              <span class="muted">负债合计</span>
              <h2>¥ {{ money(totals.liabilities) }}</h2>
            </article>
            <article class="panel">
              <span class="muted">净资产</span>
              <h2 class="positive">¥ {{ money(totals.netAssets) }}</h2>
            </article>
          </section>
          <section class="panel">
            <div class="panel-heading">
              <div>
                <h2>家庭资产账户</h2>
                <p>估值按当日结束的价值记录，之后的收支会自动计入余额。</p>
              </div>
              <div class="heading-actions">
                <button class="button secondary" @click="showModal('person')">
                  <AppIcon name="plus" :size="16" />添加成员
</button
                ><button class="button primary" @click="showModal('account')">
                  <AppIcon name="plus" :size="16" />添加账户
                </button>
              </div>
            </div>
            <div class="account-grid">
              <article
                v-for="a in shownAccounts"
                :key="a.id"
                class="account-card"
              >
                <div class="account-top">
                  <span class="account-symbol" :class="a.kind"
                    ><AppIcon
                      :name="
                        a.kind === 'investment' ? 'trend' : 'wallet'
                      " /></span
                  ><span class="category-tag">{{ accountLabels[a.kind] }}</span>
                </div>
                <h3>{{ a.name }}</h3>
                <p>{{ personName(a.personId) }}的账户</p>
                <strong class="account-balance">{{
                  accountValue(state.data, a.id, rangeEnd) === null
                    ? "暂无估值"
                    : "¥ " + money(accountValue(state.data, a.id, rangeEnd)!)
                }}</strong>
                <div class="account-bottom">
                  <span>截至 {{ rangeEnd }}</span
                  ><button
                    class="text-button"
                    @click="showModal('valuation', a.id)"
                  >
                    更新估值 ↗
                  </button>
                </div>
              </article>
              <div v-if="!shownAccounts.length" class="empty-state">
                添加你的第一个账户，清楚掌握每一份资产。
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-heading">
              <div>
                <h2>成员资产配比</h2>
                <p>资产归属清楚，家庭规划更从容。</p>
              </div>
            </div>
            <div class="member-allocation">
              <div
                v-for="p in memberStats.filter(
                  (p) => !person || p.id === person,
                )"
                :key="p.id"
                class="member-allocation-row"
              >
                <span
                  class="avatar"
                  :style="{ background: p.color + '20', color: p.color }"
                  >{{ p.name[0] }}</span
                >
                <div class="member-allocation-name">
                  <strong>{{ p.name }}</strong
                  ><span>净资产 ¥{{ money(p.netAssets) }}</span>
                </div>
                <div class="allocation-bars">
                  <template v-for="(label, kind) in accountLabels" :key="kind"
                    >
<span
                      v-if="kind !== 'liability'"
                      :style="{
                        background:
                          palette[Object.keys(accountLabels).indexOf(kind)],
                        flex: state.data.accounts
                          .filter((a) => a.personId === p.id && a.kind === kind)
                          .reduce(
                            (n, a) =>
                              n +
                              Math.max(
                                0,
                                accountValue(state.data, a.id, rangeEnd) ?? 0,
                              ),
                            0,
                          ),
                      }"
                      :title="label"
                    ></span
                  >
</template>
                </div>
                <span class="muted small"
                  >负债 ¥{{ money(p.liabilities) }}</span
                >
              </div>
            </div>
            <div class="inline-legend">
              <span
                v-for="(a, i) in Object.values(accountLabels).slice(0, 4)"
                :key="a"
                ><i :style="{ background: palette[i] }"></i>{{ a }}</span
              >
            </div>
          </section>
</template
        >
        <template v-if="page === 'returns'"
          >
<section class="stats-grid returns-stats">
            <article class="stat-card featured">
              <div class="stat-label">投资估值收益<AppIcon name="trend" /></div>
              <div class="stat-value">
                {{ returns.gain === null ? "—" : "¥ " + money(returns.gain) }}
              </div>
              <div class="stat-foot">
                {{
                  returns.missing
                    ? "需要开始日前一天与截止日估值"
                    : "已扣除外部资金净流入"
                }}
              </div>
            </article>
            <article class="stat-card">
              <div class="stat-label">期间收益率</div>
              <div class="stat-value">
                {{
                  returns.rate === null
                    ? "—"
                    : (returns.rate * 100).toFixed(2) + "%"
                }}
              </div>
              <div class="stat-foot">Modified Dietz · 非年化</div>
            </article>
            <article class="stat-card">
              <div class="stat-label">期间收支结余</div>
              <div class="stat-value">¥ {{ money(totals.savings) }}</div>
              <div class="stat-foot">收入 − 支出，不等同投资收益</div>
            </article>
            <article class="stat-card">
              <div class="stat-label">投资净入金</div>
              <div class="stat-value">¥ {{ money(returns.netFlow) }}</div>
              <div class="stat-foot">投资账户外部流入 − 流出</div>
            </article>
          </section>
          <div class="charts-grid">
            <section class="panel">
              <div class="panel-heading">
                <div>
                  <h2>净资产变化</h2>
                  <p>{{ selectedName }} · {{ rangeStart }} 至 {{ rangeEnd }}</p>
                </div>
              </div>
              <TrendChart :points="chart" />
            </section>
            <section class="panel">
              <div class="panel-heading">
                <div>
                  <h2>生活花在哪里</h2>
                  <p>期间支出分类</p>
                </div>
              </div>
              <div class="expense-breakdown">
                <div
                  v-for="([category, value], i) in expenseCategories"
                  :key="category"
                >
                  <div>
                    <span>{{ category }}</span
                    ><strong>¥{{ money(value) }}</strong>
                  </div>
                  <div class="progress-track">
                    <span
                      :style="{
                        width: totals.expense
                          ? (value / totals.expense) * 100 + '%'
                          : '0%',
                        background: palette[i % palette.length],
                      }"
                    ></span>
                  </div>
                </div>
                <p v-if="!expenseCategories.length" class="empty-state">
                  这个时段还没有支出记录
                </p>
              </div>
            </section>
          </div>
          <section class="panel method-panel">
            <AppIcon name="info" :size="22" />
            <div>
              <h2>读懂你的回报</h2>
              <p>
                估值收益 = 投资期末价值 − 期初价值 −
                外部资金净流入。投资账户内、分类为投资收益的收入计入收益；家庭内部的投资账户互转会抵销。按成员筛选时，来自其他成员的转入视为该成员的入金。
              </p>
              <p>
                收益率使用 Modified
                Dietz，按资金在区间内停留的天数加权，非年化。缺少开始日前一天或截止日的投资估值、无投资账户或加权本金不大于零时不计算收益率。快照为当日结束价值，已包含当天交易。
              </p>
            </div>
          </section>
</template
        >
        <template v-if="page === 'connections'">
          <div class="connection-grid">
            <section class="panel connection-card">
              <span class="connection-icon"
                ><AppIcon name="family" :size="25"
              /></span>
              <div class="connection-title">
                <h2>连接家庭云账本</h2>
                <span
                  :class="[
                    'status-pill',
                    { live: state.mode === 'cloud' && !!state.householdId },
                  ]"
                  >{{
                    state.mode === "cloud" && state.householdId
                      ? "已连接"
                      : "尚未连接"
                  }}</span
                >
              </div>
              <p class="muted">家人各自登录，共享一份清楚的家庭账本。</p>
              <template v-if="!cloudConfigured"
                >
<div class="soft-note">
                  当前网站尚未配置云服务，演示数据只保存在当前浏览器。完成部署指南中的
                  Supabase 配置后即可开启家庭共享。
                </div>
                <p class="small muted">
                  无需购买服务器，使用托管数据库、身份验证和云函数。
                </p>
</template
              ><template v-else-if="!state.email"
                >
<form
                  class="stacked-form"
                  @submit.prevent="authAction('send')"
                >
                  <label
                    >登录邮箱<input
                      v-model="email"
                      type="email"
                      required
                      placeholder="you@example.com" /></label
                  ><button class="button primary" :disabled="authBusy">
                    发送登录邮件
                  </button>
                </form>
                <p v-if="authMessage" class="soft-note">{{ authMessage }}</p>
                <form
                  v-if="authMessage"
                  class="stacked-form"
                  @submit.prevent="authAction('verify')"
                >
                  <label
                    >邮件验证码<input
                      v-model="otp"
                      autocomplete="one-time-code"
                      required /></label
                  ><button class="button secondary" :disabled="authBusy">
                    验证并登录
                  </button>
                </form>
</template
              ><template v-else
                >
<div class="signed-in">
                  <span>{{ state.email }}</span
                  ><button
                    class="text-button"
                    :disabled="authBusy"
                    @click="authAction('out')"
                  >
                    退出登录
                  </button>
                </div>
                <button
                  v-if="state.mode === 'demo'"
                  class="button primary"
                  :disabled="authBusy"
                  @click="authAction('cloud')"
                >
                  打开我的云端账本
</button
                ><template v-else-if="!state.householdId"
                  >
<form
                    class="stacked-form"
                    @submit.prevent="authAction('create')"
                  >
                    <label
                      >家庭名称<input
                        v-model="familyName"
                        required
                        maxlength="80" /></label
                    ><label
                      >你的称呼<input
                        v-model="myName"
                        required
                        maxlength="60" /></label
                    ><button class="button primary" :disabled="authBusy">
                      创建家庭账本
                    </button>
                  </form>
                  <div class="form-divider">或加入已有家庭</div>
                  <form
                    class="stacked-form"
                    @submit.prevent="authAction('join')"
                  >
                    <label
                      >家庭邀请码<input
                        v-model="inviteToken"
                        required
                        placeholder="由家庭创建者分享" /></label
                    ><button class="button secondary" :disabled="authBusy">
                      加入家庭
                    </button>
                  </form>
</template
                ><template v-else
                  >
<h3>{{ state.familyName }}</h3>
                  <p>
                    {{ state.data.people.length }} 位资产归属成员 ·
                    {{ state.role === "owner" ? "家庭创建者" : "家庭协作者" }}
                  </p>
                  <button
                    v-if="state.role === 'owner'"
                    class="button primary"
                    @click="showModal('invite')"
                  >
                    邀请家人加入
                  </button>
                  <p class="small muted">
                    家庭协作者可查看和维护共享账本。资产归属成员与登录账号分别管理。
                  </p>
                  <button
                    class="text-button"
                    @click="
                      useDemo();
                      person = '';
                    "
                  >
                    切换到本机演示
                  </button>
</template
                >
</template
              >
            </section>
            <section class="panel connection-card">
              <span class="connection-icon peach"
                ><AppIcon name="sparkle" :size="25"
              /></span>
              <div class="connection-title">
                <h2>智能记账助手</h2>
                <span class="status-pill">{{
                  state.mode === "cloud" ? "可请求云端 AI" : "本地解析可用"
                }}</span>
              </div>
              <p class="muted">说一句、写一句，把账记得简单一点。</p>
              <ul class="feature-list">
                <li>
                  <AppIcon name="check" />本地解析金额、日期、收支与常见分类
                </li>
                <li><AppIcon name="check" />识别后生成草稿，由你确认入账</li>
                <li>
                  <AppIcon :name="Speech ? 'check' : 'info'" />{{
                    Speech
                      ? "当前浏览器可尝试语音转文字"
                      : "当前浏览器暂不支持语音识别"
                  }}
                </li>
                <li>
                  <AppIcon name="shield" />模型密钥保存在云端，网页不暴露密钥
                </li>
              </ul>
              <div class="soft-note">
                AI
                需要部署云函数并配置模型服务；语音可能使用浏览器提供的在线识别。你可以始终选择本地解析或手动记账。
              </div>
            </section>
            <section class="panel connection-card">
              <span class="connection-icon sand"
                ><AppIcon name="link" :size="25"
              /></span>
              <div class="connection-title">
                <h2>账单自动同步</h2>
                <span class="status-pill">{{
                  channels.length
                    ? `${channels.length} 个授权渠道`
                    : "待接入渠道"
                }}</span>
              </div>
              <p class="muted">通过已授权的账单来源持续接收记录，自动去重。</p>
              <div class="provider-list">
                <div>
                  <span class="provider-icon wechat">微</span
                  ><span
                    >微信 / 支付宝账单<small
                      >官方导出 CSV · 手动导入可用</small
                    ></span
                  ><button class="text-button" @click="importOpen = true">
                    导入 ↗
                  </button>
                </div>
                <div>
                  <span class="provider-icon bank">银</span
                  ><span
                    >银行卡 / 邮件账单<small
                      >需授权 API 或邮件服务转发适配</small
                    ></span
                  ><span class="small muted">待配置</span>
                </div>
              </div>
              <template
                v-if="
                  state.mode === 'cloud' &&
                  state.householdId &&
                  state.role === 'owner'
                "
                >
<button
                  class="button secondary"
                  :disabled="!state.data.accounts.length"
                  @click="showModal('channel')"
                >
                  创建授权接收渠道
                </button>
                <div v-for="c in channels" :key="c.id" class="channel-row">
                  <div>
                    <strong>{{ c.name }}</strong
                    ><small
                      >{{ accountName(c.account_id) }} ·
                      {{
                        c.last_received_at
                          ? "最近接收 " +
                            new Date(c.last_received_at).toLocaleString("zh-CN")
                          : "尚未接收账单"
                      }}</small
                    >
                  </div>
                  <button
                    class="text-button danger"
                    @click="revokeChannel(c.id)"
                  >
                    撤销
                  </button>
                </div>
</template
              >
              <p class="small muted">
                浏览器不能直接读取手机短信。只有配置真实授权渠道后才会开始自动接收账单。
              </p>
            </section>
            <section class="panel connection-card">
              <span class="connection-icon lavender"
                ><AppIcon name="shield" :size="25"
              /></span>
              <div class="connection-title">
                <h2>数据备份与迁移</h2>
                <span class="status-pill">由你掌握</span>
              </div>
              <p class="muted">把每一份记录，妥善留在自己手里。</p>
              <div class="backup-illustration">
                <AppIcon name="book" :size="34" />
                <div>
                  <strong
                    >{{ state.data.transactions.length }} 笔生活记录</strong
                  ><span
                    >{{ state.data.accounts.length }} 个账户 ·
                    {{ state.data.valuations.length }} 条估值快照</span
                  >
                </div>
              </div>
              <div class="backup-actions">
                <button class="button primary" @click="downloadBackup">
                  <AppIcon name="download" :size="17" />导出完整备份
</button
                ><button
                  class="button secondary"
                  :disabled="state.mode !== 'demo'"
                  @click="showModal('restore')"
                >
                  恢复本机备份
                </button>
              </div>
              <p class="small muted">
                备份包含账本、成员、账户和估值，请妥善保存。恢复会替换本机演示账本；云端数据不会被覆盖。
              </p>
            </section>
          </div>
        </template>
        <div v-if="state.loading" class="loading-indicator" role="status">
          正在读取家庭账本…
        </div>
        <footer class="page-footer">
          <span class="footer-brand"
            ><span>有数</span> 认真生活，从容理财。</span
          ><span
            >一点一滴，都是家的未来 <span class="footer-flower">✳</span></span
          >
        </footer>
      </main>
    </div>
    <EntryDialog
      v-if="entryOpen"
      :draft="draft"
      :preferred-person="person"
      @close="entryOpen = false"
      @saved="saved"
    />
    <ImportDialog
      v-if="importOpen"
      @close="importOpen = false"
      @saved="saved"
    />
    <ModalShell
      v-if="modal"
      :title="
        (
          {
            person: '添加家庭成员',
            account: '添加资产账户',
            valuation: '更新账户估值',
            invite: '邀请家人一起记账',
            channel: '创建授权接收渠道',
            restore: '恢复本机备份',
          } as Record<string, string>
        )[modal]
      "
      @close="modal = ''"
    >
      <form class="dialog-form" @submit.prevent="submitModal">
        <template v-if="modal === 'person'"
          >
<label
            >成员称呼<input
              v-model="formName"
              required
              maxlength="60"
              placeholder="例如：爸爸、妈妈、我"
          /></label>
          <p class="soft-note">
            此处添加资产归属成员。邀请家人登录，请前往数据连接。
          </p>
</template
        >
        <template v-if="modal === 'account'"
          >
<div class="form-grid">
            <label
              >账户名称<input
                v-model="formName"
                required
                maxlength="80"
                placeholder="例如：日常钱包" /></label
            ><label
              >所属成员<select v-model="formPerson" required>
                <option
                  v-for="p in state.data.people"
                  :key="p.id"
                  :value="p.id"
                >
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >资产类型<select v-model="formKind">
                <option
                  v-for="(label, key) in accountLabels"
                  :key="key"
                  :value="key"
                >
                  {{ label }}
                </option>
              </select></label
            ><label
              >初始估值（元）<input
                v-model="formAmount"
                inputmode="decimal"
                required
                placeholder="0.00" /></label
            ><label class="span-2"
              >估值日期<input v-model="formDate" type="date" required
            /></label>
          </div>
          <p class="soft-note">
            初始估值为当天结束时的余额，已包含当天收支。负债请填写尚未偿还的正数金额。
          </p>
</template
        >
        <template v-if="modal === 'valuation'"
          >
<label
            >估值账户<select v-model="formAccount" required>
              <option
                v-for="a in state.data.accounts"
                :key="a.id"
                :value="a.id"
              >
                {{ personName(a.personId) }} · {{ a.name }}
              </option>
            </select></label
          >
          <div class="form-grid">
            <label
              >估值金额（元）<input
                v-model="formAmount"
                inputmode="decimal"
                required
                placeholder="0.00" /></label
            ><label
              >估值日期<input v-model="formDate" type="date" required
            /></label>
          </div>
          <p class="soft-note">
            请填写当日结束价值。同一账户同日的估值将被更新；后续交易在此基础上计算。
          </p>
</template
        >
        <template v-if="modal === 'invite'"
          >
<p class="muted">
            生成一次性邀请码，家人登录后即可加入。有效期 7
            天，加入后可共同维护家庭账本。
          </p>
          <label v-if="secret"
            >家庭邀请码<textarea
              :value="secret"
              readonly
              rows="3"
            ></textarea></label
        >
</template>
        <template v-if="modal === 'channel'"
          >
<template v-if="!secret"
            >
<label
              >渠道名称<input
                v-model="formName"
                required
                maxlength="80"
                placeholder="例如：我的银行账单邮件" /></label
            ><label
              >绑定记账账户<select v-model="formAccount" required>
                <option
                  v-for="a in state.data.accounts"
                  :key="a.id"
                  :value="a.id"
                >
                  {{ personName(a.personId) }} · {{ a.name }}
                </option>
              </select></label
            >
            <p class="soft-note">
              授权密钥仅显示一次。请交给你信任的服务端账单适配器，不要放入网页或公开仓库。创建渠道不会自动连接银行。
            </p>
</template
          ><template v-else
            >
<label>接收地址<input :value="webhookUrl" readonly /></label
            ><label
              >渠道密钥<textarea :value="secret" readonly rows="3"></textarea>
            </label>
            <p class="soft-note">
              密钥仅显示一次，请立即保存。账单来源需按部署文档中的协议发送记录。
            </p>
</template
          >
</template
        >
        <template v-if="modal === 'restore'"
          >
<p class="soft-note">
            恢复将替换当前浏览器中的演示账本。建议先导出已有数据备份。
          </p>
          <label
            >选择 JSON 备份<input
              type="file"
              accept=".json,application/json"
              required
              @change="readBackup"
          /></label>
          <p v-if="backupData" class="positive">
            已验证：{{ backupData.people.length }} 位成员、{{
              backupData.accounts.length
            }}
            个账户、{{ backupData.transactions.length }} 笔记录。
          </p>
</template
        >
        <p v-if="modalError" class="form-error" role="alert">
          {{ modalError }}
        </p>
        <footer class="dialog-footer">
          <button type="button" class="button secondary" @click="modal = ''">
            {{ secret ? "关闭" : "取消" }}
</button
          ><button
            v-if="secret"
            type="button"
            class="button primary"
            @click="copySecret"
          >
            复制{{ modal === "invite" ? "邀请码" : "密钥" }}
</button
          ><button
            v-else
            class="button primary"
            :disabled="modalBusy || (modal === 'restore' && !backupData)"
          >
            {{
              modalBusy
                ? "正在保存…"
                : modal === "account"
                  ? "保存账户"
                  : modal === "invite"
                    ? "生成邀请码"
                    : modal === "channel"
                      ? "生成授权密钥"
                      : modal === "restore"
                        ? "确认替换并恢复"
                        : "保存"
            }}
          </button>
        </footer>
      </form>
    </ModalShell>
    <Transition name="toast"
      >
<div v-if="toast" class="toast-message" role="status">
        <AppIcon name="check" :size="18" />{{ toast }}
      </div>
</Transition
    >
  </div>
</template>
