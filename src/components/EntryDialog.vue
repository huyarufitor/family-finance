<script setup lang="ts">
import { computed, ref } from "vue";
import ModalShell from "./ModalShell.vue";
import { state, addEntries, errorMessage } from "../lib/store";
import { isoDate, toCents, validDate } from "../lib/finance";
import { categories, type Draft, type EntryKind } from "../lib/types";
const props = defineProps<{ draft?: Draft; preferredPerson?: string }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const personId = ref(props.preferredPerson || state.data.people[0]?.id || "");
const accountId = ref(
  state.data.accounts.find((a) => a.personId === personId.value)?.id || "",
);
const destination = ref(""),
  kind = ref<EntryKind>(props.draft?.kind || "expense"),
  amount = ref(props.draft ? (props.draft.amount / 100).toFixed(2) : ""),
  date = ref(props.draft?.date || isoDate()),
  category = ref(props.draft?.category || "餐饮"),
  note = ref(props.draft?.note || ""),
  error = ref(""),
  saving = ref(false);
const accounts = computed(() =>
  state.data.accounts.filter((a) => a.personId === personId.value),
);
function changePerson() {
  accountId.value = accounts.value[0]?.id || "";
}
async function save() {
  if (saving.value) return;
  error.value = "";
  saving.value = true;
  try {
    const cents = toCents(amount.value);
    if (!cents || !validDate(date.value))
      throw new Error("请填写有效金额和日期");
    if (!accountId.value || !personId.value)
      throw new Error("请先在资产配置中添加成员与账户");
    if (
      kind.value === "transfer" &&
      (!destination.value || destination.value === accountId.value)
    )
      throw new Error("请选择不同的转入账户");
    await addEntries([
      {
        id: crypto.randomUUID(),
        kind: kind.value,
        amount: cents,
        date: date.value,
        category: kind.value === "transfer" ? "转账" : category.value,
        note: note.value.trim(),
        personId: personId.value,
        accountId: accountId.value,
        ...(kind.value === "transfer"
          ? { toAccountId: destination.value }
          : {}),
        source: "manual",
      },
    ]);
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
  <ModalShell title="记下这一笔" @close="emit('close')"
    >
<form class="dialog-form" @submit.prevent="save">
      <p v-if="draft" class="soft-note">
        已生成记账草稿，请核对金额、成员和账户后确认。
      </p>
      <div class="kind-tabs">
        <button
          v-for="(label, key) in {
            expense: '支出',
            income: '收入',
            transfer: '转账',
          }"
          :key="key"
          type="button"
          :class="{ active: kind === key }"
          @click="kind = key as EntryKind"
        >
          {{ label }}
        </button>
      </div>
      <div class="form-grid">
        <label
          >金额（元）<input
            v-model="amount"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            required
            autofocus /></label
        ><label>日期<input v-model="date" type="date" required /></label
        ><label
          >家庭成员<select v-model="personId" required @change="changePerson">
            <option v-for="p in state.data.people" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select></label
        ><label
          >{{ kind === "transfer" ? "转出账户" : "记账账户"
          }}<select v-model="accountId" required>
            <option v-for="a in accounts" :key="a.id" :value="a.id">
              {{ a.name }}
            </option>
          </select></label
        ><label v-if="kind === 'transfer'" class="span-2"
          >转入账户<select v-model="destination" required>
            <option value="" disabled>选择转入账户</option>
            <option
              v-for="a in state.data.accounts.filter((a) => a.id !== accountId)"
              :key="a.id"
              :value="a.id"
            >
              {{ state.data.people.find((p) => p.id === a.personId)?.name }} ·
              {{ a.name }}
            </option>
          </select></label
        ><label v-else class="span-2"
          >分类<select v-model="category">
            <option v-if="!categories.includes(category)" :value="category">
              {{ category }}
            </option>
            <option v-for="c in categories" :key="c">{{ c }}</option>
          </select></label
        ><label class="span-2"
          >备注<input
            v-model="note"
            maxlength="2000"
            placeholder="给这笔账留一点生活的注脚"
        /></label>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <footer class="dialog-footer">
        <button type="button" class="button secondary" @click="emit('close')">
          取消
</button
        ><button class="button primary" :disabled="saving">
          {{ saving ? "正在保存…" : "确认入账" }}
        </button>
      </footer>
    </form>
</ModalShell
  >
</template>
