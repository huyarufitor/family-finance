<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  dashboard: "M3 3h7v7H3z M14 3h7v11h-7z M3 14h7v7H3z M14 18h7v3h-7z",
  book: "M5 3h14v18H5z M9 7h6 M9 11h6 M9 15h3 M3 7h3 M3 12h3 M3 17h3",
  pie: "M21 13a9 9 0 1 1-10-10v10z M15 3v6h6a9 9 0 0 0-6-6z",
  trend: "M3 20h18 M4 15l5-5 4 3 7-9 M15 4h5v5",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  chevron: "M9 5l7 7-7 7",
  down: "M6 9l6 6 6-6",
  sparkle:
    "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M20 2v4 M18 4h4",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M9 22h6",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
  download: "M12 3v13 M7 11l5 5 5-5 M4 16v5h16v-5",
  wallet: "M3 6h16v14H3z M3 6l13-3v3 M15 11h6v5h-6z",
  check: "M5 12l4 4L19 6",
  close: "M6 6l12 12 M18 6L6 18",
  family:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a7 7 0 0 1 14 0v3 M17 4a4 4 0 0 1 0 7 M19 14a6 6 0 0 1 3 5v2",
  calendar: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16",
  search: "M17 17l5 5 M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6",
  logout: "M9 3H3v18h6 M9 12h12 M16 7l5 5-5 5",
  food: "M5 3v7 M9 3v7 M3 7h8 M7 10v11 M17 21V3c-4 2-4 10 0 10",
  cart: "M3 3h3l3 13h10l3-9H7 M10 21h.01 M18 21h.01",
  income: "M12 3v14 M7 12l5 5 5-5 M4 18v3h16v-3",
  expense: "M12 17V3 M7 8l5-5 5 5 M4 18v3h16v-3",
  info: "M12 8h.01 M12 11v6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  trash: "M3 6h18 M8 6V3h8v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
};
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.wallet" />
  </svg>
</template>
