<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const el = ref<HTMLDialogElement>();
let previous: Element | null = null;
onMounted(() => {
  previous = document.activeElement;
  el.value?.showModal();
});
function close() {
  emit("close");
  if (previous instanceof HTMLElement) previous.focus();
}
</script>
<template>
  <dialog
    ref="el"
    :class="{ wide }"
    aria-labelledby="modal-title"
    @cancel.prevent="close"
  >
    <header class="dialog-header">
      <div>
        <span class="eyebrow">有数 · 家庭财务手账</span>
        <h2 id="modal-title">{{ title }}</h2>
      </div>
      <button class="icon-button" aria-label="关闭弹窗" @click="close">
        <AppIcon name="close" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
