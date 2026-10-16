<script setup lang="ts">
import { computed, ref } from "vue";
import ModalShell from "./ModalShell.vue";
import AppIcon from "./AppIcon.vue";
import { readBills, prepareImport, type BillRow } from "../lib/import";
import { addEntries, errorMessage, state } from "../lib/store";
import { money } from "../lib/finance";
const baseUrl = import.meta.env.BASE_URL;
const emit = defineEmits<{ close: []; saved: [] }>();
const rows = ref<BillRow[]>([]),
  skipped = ref(0),
  accountId = ref(
    state.data.accounts.find((a) => a.kind === "cash")?.id ||
      state.data.accounts[0]?.id ||
      "",
  ),
  source = ref("wechat"),
  error = ref(""),
  filename = ref(""),
  saving = ref(false);
const preview = computed(() =>
  prepareImport(
    rows.value,
    state.data.transactions,
    source.value,
    accountId.value,
    state.data.accounts.find((a) => a.id === accountId.value)?.personId || "",
  ),
);
async function fileChanged(event: Event) {
  rows.value = [];
  skipped.value = 0;
  error.value = "";
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  filename.value = file.name;
  try {
    if (file.size > 5_000_000) throw new Error("文件不能超过 5MB");
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("\uFFFD")) text = new TextDecoder("gb18030").decode(buf);
    const result = readBills(text);
    rows.value = result.rows;
    skipped.value = result.skipped;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    if (!accountId.value || !preview.value.entries.length) return;
    await addEntries(preview.value.entries);
    emit("saved");
    emit("close");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <ModalShell title="把账单整理到一起" wide @close="emit('close')">
    <div class="dialog-form">
      <p class="muted">
        支持微信、支付宝、银行 CSV
        账单。跳过非成功交易；转账请手动核对双方账户。
      </p>
      <div class="form-grid">
        <label
          >账单来源<select v-model="source">
            <option value="wechat">微信支付</option>
            <option value="alipay">支付宝</option>
            <option value="bank">银行卡</option>
            <option value="csv">通用 CSV</option>
          </select></label
        ><label
          >导入到账户<select v-model="accountId">
            <option v-for="a in state.data.accounts" :key="a.id" :value="a.id">
              {{ state.data.people.find((p) => p.id === a.personId)?.name }} ·
              {{ a.name }}
            </option>
          </select></label
        >
      </div>
      <label class="upload-zone"
        ><AppIcon name="upload" :size="30" /><strong>{{
          filename || "选择 CSV 文件"
        }}</strong
        ><span>支持 UTF-8 / GB18030 · 最大 5MB</span
        ><input
          aria-label="选择 CSV 文件"
          type="file"
          accept=".csv,text/csv"
          @change="fileChanged" /></label
      ><a class="text-link" :href="`${baseUrl}samples/bills.csv`" download
        >下载通用账单模板 ↗</a
      ><template v-if="rows.length">
        <div class="import-summary">
          <strong>可导入 {{ preview.entries.length }} 笔</strong
          ><span>重复 {{ preview.duplicates }} 笔</span>
        </div>
        <p v-if="rows.some((r) => !r.externalId)" class="soft-note">
          部分记录无交易单号，将按日期、金额和备注去重；请核对同日同额消费是否为不同交易。
        </p>
        <div class="table-scroll preview-table">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>备注</th>
                <th>类型</th>
                <th class="num">金额</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in preview.entries.slice(0, 5)" :key="e.id">
                <td>{{ e.date }}</td>
                <td>{{ e.note }}</td>
                <td>{{ e.kind === "income" ? "收入" : "支出" }}</td>
                <td class="num">¥{{ money(e.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted small">显示前 5 笔；确认后批量写入所选账户。</p>
      </template>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <footer class="dialog-footer">
        <button class="button secondary" @click="emit('close')">取消</button
        ><button
          class="button primary"
          :disabled="!preview.entries.length || !accountId || saving"
          @click="save"
        >
          {{ saving ? "正在导入…" : "确认导入" }}
        </button>
      </footer>
    </div>
  </ModalShell>
</template>
