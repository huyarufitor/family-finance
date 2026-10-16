<script setup lang="ts">
import { ref } from "vue";
import ModalShell from "./ModalShell.vue";
import AppIcon from "./AppIcon.vue";
import { errorMessage, personRemovalBlocker, removePerson, state } from "../lib/store";
import type { Person } from "../lib/types";

const emit = defineEmits<{ close: []; removed: [id: string] }>();
const busy = ref(""), error = ref("");
async function remove(member: Person) {
  if (busy.value || state.loading) return;
  error.value = "";
  const blocker = personRemovalBlocker(member.id);
  if (blocker) { error.value = blocker; return; }
  if (!window.confirm(`确定删除成员“${member.name}”？此操作无法撤销。仅删除资产归属成员，不会移除家人的登录权限。`)) return;
  busy.value = member.id;
  try {
    await removePerson(member.id);
    emit("removed", member.id);
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = ""; }
}
</script>

<template>
  <ModalShell title="管理家庭成员" @close="emit('close')">
    <div class="dialog-form">
    <p class="small muted">可删除尚未关联账户或账单的资产归属成员。已有财务记录的成员会保留历史数据。</p>
    <p class="small muted">这里管理资产归属，不会更改家人的登录权限。</p>
    <ul class="member-list">
      <li v-for="member in state.data.people" :key="member.id" class="member-row">
        <span class="avatar" :style="{ background: member.color + '1b', color: member.color }">{{ member.name.slice(0, 1) }}</span>
        <div class="member-detail">
          <strong>{{ member.name }}</strong>
          <p class="small muted">{{ personRemovalBlocker(member.id) || "尚无账户或账单，可以删除" }}</p>
        </div>
        <button
          type="button"
          class="button secondary remove-member"
          :aria-label="`删除成员${member.name}`"
          :disabled="!!busy || state.loading || !!personRemovalBlocker(member.id)"
          @click="remove(member)"
        >
          <AppIcon name="trash" :size="15" />{{ busy === member.id ? "删除中…" : "删除" }}
        </button>
      </li>
    </ul>
    <p v-if="!state.data.people.length" class="empty-state">暂无成员，可以关闭弹窗后添加成员。</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <footer class="dialog-footer">
      <button type="button" class="button secondary" @click="emit('close')">关闭</button>
    </footer>
    </div>
  </ModalShell>
</template>

<style scoped>
.member-list { list-style: none; margin: 20px 0 0; padding: 0; }
.member-row { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-bottom: 1px solid var(--border); }
.member-row .avatar { flex-shrink: 0; }
.member-detail { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.member-detail p { margin: 6px 0 0; line-height: 1.6; }
.remove-member { flex-shrink: 0; color: #9b5547; }
@media (max-width: 480px) {
  .member-row { flex-wrap: wrap; gap: 10px; }
  .member-detail { flex-basis: calc(100% - 60px); }
  .remove-member { margin-left: auto; }
}
</style>
