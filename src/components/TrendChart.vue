<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{
  points: { date: string; value: number | null }[];
}>();
const valid = computed(() => props.points.filter((p) => p.value !== null));
const max = computed(() => Math.max(...valid.value.map((p) => p.value!), 100));
const min = computed(
  () => Math.min(...valid.value.map((p) => p.value!), max.value) * 0.94,
);
const range = computed(() => Math.max(max.value * 1.025 - min.value, 100));
const x = (i: number) => 58 + (i / Math.max(1, props.points.length - 1)) * 590;
const y = (n: number) => 193 - ((n - min.value) / range.value) * 158;
const segments = computed(() => {
  const result: string[] = [];
  let path = "";
  props.points.forEach((p, i) => {
    if (p.value === null) {
      if (path) result.push(path);
      path = "";
    } else path += `${path ? " L" : "M"}${x(i)},${y(p.value)}`;
  });
  if (path) result.push(path);
  return result;
});
const area = computed(() =>
  segments.value.map((s) => {
    const matches = [...s.matchAll(/[ML]([\d.]+),/g)];
    return `${s} L${matches.at(-1)?.[1]},204 L${matches[0]?.[1]},204 Z`;
  }),
);
</script>
<template>
  <div class="chart-wrap">
    <svg
      viewBox="0 0 680 240"
      role="img"
      aria-label="所选时间范围的净资产变化折线图"
    >
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6f9875" stop-opacity=".22" />
          <stop offset="1" stop-color="#6f9875" stop-opacity=".015" />
        </linearGradient>
      </defs>
      <g v-for="i in 4" :key="i">
        <line
          x1="58"
          x2="650"
          :y1="36 + (i - 1) * 53"
          :y2="36 + (i - 1) * 53"
          stroke="#e9ece7"
          stroke-dasharray="3 5"
        />
        <text x="0" :y="40 + (i - 1) * 53" fill="#92998f" font-size="11">
          {{ ((min + ((4 - i) / 3) * range) / 1000000).toFixed(1) }}万
        </text>
      </g>
      <path
        v-for="(a, i) in area"
        :key="'a' + i"
        :d="a"
        fill="url(#areaFill)"
      />
      <path
        v-for="(s, i) in segments"
        :key="i"
        :d="s"
        fill="none"
        stroke="#49745b"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
      <template v-for="(p, i) in points" :key="p.date">
        <circle
          v-if="p.value !== null && i === points.length - 1"
          :cx="x(i)"
          :cy="y(p.value)"
          r="4"
          fill="#49745b"
          stroke="white"
          stroke-width="3"
        />
        <text
          v-if="
            i === 0 ||
            i === Math.floor(points.length / 2) ||
            i === points.length - 1
          "
          :x="x(i)"
          y="230"
          text-anchor="middle"
          fill="#92998f"
          font-size="11"
        >
          {{ p.date.slice(5).replace("-", "/") }}
        </text>
      </template>
      <text
        v-if="!valid.length"
        x="350"
        y="118"
        text-anchor="middle"
        fill="#92998f"
        font-size="13"
      >
        添加历史估值后，趋势将在这里生长
      </text>
    </svg>
  </div>
</template>
