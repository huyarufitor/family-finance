<script setup lang="ts">
import { onMounted, ref } from "vue";
import { cloud } from "../lib/cloud";
import { state, errorMessage } from "../lib/store";
const domain = import.meta.env.VITE_MAIL_RECEIVING_DOMAIN?.trim() || "";
const emit = defineEmits<{ changed: [] }>();
const name = ref("邮件账单"), account = ref(state.data.accounts[0]?.id || ""), sender = ref("");
const busy = ref(false), error = ref("");
const routes = ref<{channel_id:string;recipient:string;allowed_sender:string;last_status:string|null}[]>([]);
async function load() {
  if (!cloud || !state.householdId) return;
  const result = await cloud.from("email_routes").select("channel_id,recipient,allowed_sender,last_status").eq("household_id",state.householdId);
  if (result.error) error.value = errorMessage(result.error);
  else routes.value = result.data || [];
}
onMounted(() => { void load(); });
async function create() {
  if (!cloud || busy.value) return;
  busy.value = true; error.value = "";
  try {
    const result = await cloud.rpc("create_email_channel",{h:state.householdId,a:account.value,channel_name:name.value.trim(),sender:sender.value.trim()});
    if (result.error) throw result.error;
    await load();
    emit("changed");
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="email-channels">
    <h3>邮件账单接收</h3>
    <p v-if="!domain" class="small muted">邮件收件服务待配置。配置完成后，可为每个账户生成独立收件地址。</p>
    <template v-else>
      <p class="small muted">将含原始交易号的未加密 CSV 账单附件转发到专用地址，验证发件邮箱后自动导入。缺少交易号时请使用手动导入并核对预览。每封最多 5 个附件、合计 5MB。暂不支持 PDF、Excel、ZIP 和正文解析。</p>
      <form @submit.prevent="create">
        <label>渠道名称<input v-model="name" required maxlength="80" /></label>
        <label>绑定账户<select v-model="account" required><option v-for="a in state.data.accounts" :key="a.id" :value="a.id">{{ a.name }}</option></select></label>
        <label>允许转发的邮箱<input v-model="sender" type="email" required maxlength="254" placeholder="你的账单转发邮箱" /></label>
        <p class="small muted">你转发的账单及附件会经过 Resend，并存入本家庭的 Supabase 账本。收件地址是写入凭证，请妥善保存。</p>
        <button class="button secondary" :disabled="busy || !account">{{ busy ? "正在创建…" : "创建邮件接收地址" }}</button>
      </form>
      <div v-for="route in routes" :key="route.channel_id" class="soft-note email-route">
        <label>专用收件地址<input :value="`${route.recipient}@${domain}`" readonly /></label>
        <span class="small">仅接收来自 {{ route.allowed_sender }} 的转发</span>
        <p class="small">{{ route.last_status || "等待第一封 CSV 账单。新建渠道可在上方渠道列表中撤销。" }}</p>
      </div>
      <button class="text-button" @click="load">刷新接收状态</button>
    </template>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.email-channels { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border, #e8e9e2); }
form { display: grid; gap: 12px; margin: 16px 0; }
label { display: grid; gap: 7px; font-size: 13px; }
.email-route { margin-top: 12px; overflow-wrap: anywhere; }
</style>
