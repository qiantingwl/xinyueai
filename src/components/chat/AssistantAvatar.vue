/* 头像引擎移植自 https://github.com/jeremy-prt/bloub (MIT License) */
<script setup lang="ts">
/**
 * 对话助手头像：把 bloub 形变引擎包装成三态（idle/thinking/responding）。
 *
 * 状态映射（引擎状态见 src/assistant-avatar/states.ts）：
 * - idle       → 常驻氛围循环：球体呼吸眨眼，间或轮换 wink / wide / egg / notify / hexagon / play 等形态
 * - thinking   → `burst`     球体坍缩成粒子再聚合回球（保持在场的小球形象，替代三点脉冲——30px 下三点会被误读成省略号）
 * - responding → `orbit`     圆环轨道 + 眼睛绕球体旋转的活跃形变
 *
 * 动效模式（后台可配）：
 * - ambient 常驻灵动：空闲时也按氛围循环播放（默认）
 * - active  仅生成时：只在思考/回答中动，结束后定格为小球
 * - off     静态：始终定格
 *
 * 颜色：默认跟随 `data-studio-theme`（暗色用浅色形状，浅色用深色形状），
 * 可通过 `tone`（auto 跟随主题 / brand 品牌蓝 / 自定义 hex）或 `ink` / `paper` 覆盖。
 * 形态风格：`variant` 提供 classic（经典轮换）/ lively（活泼多动）/ calm（安静少动）三套氛围循环。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BloubBot from '../../assistant-avatar/BloubBot.vue'
import type { Block } from '../../assistant-avatar/cycles'
import type { StateId } from '../../assistant-avatar/states'

export type AssistantAvatarState = 'idle' | 'thinking' | 'responding'
export type AssistantAvatarMotion = 'ambient' | 'active' | 'off'
export type AssistantAvatarVariant = 'classic' | 'lively' | 'calm' | 'geometric' | 'faces' | 'orbit' | 'comet' | 'thinker' | 'sleepy'

const props = withDefaults(
  defineProps<{
    state: AssistantAvatarState
    size?: number
    /** 动效模式：ambient 常驻轮动 / active 仅生成时 / off 静态 */
    motion?: AssistantAvatarMotion
    /** 形态风格：classic 经典轮换 / lively 活泼多动 / calm 安静少动 */
    variant?: AssistantAvatarVariant
    /** 配色：auto 跟随明暗主题 / brand 品牌蓝 / 自定义 hex（如 #7c5cff） */
    tone?: string
    /** 形状颜色（hex 或引擎调色板 id），不传则按 tone 推导，优先级高于 tone */
    ink?: string
    /** 背景色（hex），用于眼睛镂空与粒子景深，不传则跟随明暗主题 */
    paper?: string
    /** 冻结为静态帧（关闭动画循环），用于历史消息等不需要动效的场景 */
    frozen?: boolean
  }>(),
  { size: 28, motion: 'ambient', variant: 'classic', tone: 'auto', ink: undefined, paper: undefined, frozen: false }
)

/** 经典氛围循环：以球体为主，间或形变成其他形态再回来（bloub 的招牌轮动） */
const CLASSIC_CYCLE: Block[] = [
  { state: 'idle', duration: 3.4 },
  { state: 'wink', duration: 1.6 },
  { state: 'idle', duration: 4.2 },
  { state: 'wide', duration: 1.8 },
  { state: 'idle', duration: 3.6 },
  { state: 'egg', duration: 1.7 },
  { state: 'idle', duration: 3.2 },
  { state: 'notify', duration: 2.2 },
  { state: 'idle', duration: 4.0 },
  { state: 'hexagon', duration: 1.6 },
  { state: 'idle', duration: 3.4 },
  { state: 'play', duration: 2.0 },
]

/** 活泼氛围循环：形变更密集，加入彗星扫尾 */
const LIVELY_CYCLE: Block[] = [
  { state: 'idle', duration: 2.2 },
  { state: 'wink', duration: 1.6 },
  { state: 'wide', duration: 1.8 },
  { state: 'play', duration: 2.0 },
  { state: 'idle', duration: 2.4 },
  { state: 'egg', duration: 1.7 },
  { state: 'notify', duration: 2.2 },
  { state: 'idle', duration: 2.0 },
  { state: 'comet', duration: 2.4 },
  { state: 'hexagon', duration: 1.6 },
]

/** 安静氛围循环：只有呼吸眨眼和偶尔的 wink */
const CALM_CYCLE: Block[] = [
  { state: 'idle', duration: 6.0 },
  { state: 'wink', duration: 1.6 },
  { state: 'idle', duration: 8.0 },
]

/** 几何变换：蛋形 / 六边形 / 三角旋涡轮着变 */
const GEOMETRIC_CYCLE: Block[] = [
  { state: 'idle', duration: 2.4 },
  { state: 'egg', duration: 1.7 },
  { state: 'idle', duration: 2.0 },
  { state: 'hexagon', duration: 1.6 },
  { state: 'idle', duration: 2.2 },
  { state: 'play', duration: 2.0 },
]

/** 表情包：wink / 瞪眼 / 消息点轮流上脸 */
const FACES_CYCLE: Block[] = [
  { state: 'idle', duration: 2.6 },
  { state: 'wink', duration: 1.6 },
  { state: 'wide', duration: 1.8 },
  { state: 'idle', duration: 2.4 },
  { state: 'notify', duration: 2.2 },
]

/** 单形态常驻：定格在引擎的招牌动画上循环播放 */
const ORBIT_CYCLE: Block[] = [{ state: 'orbit', duration: 3.4 }]
const COMET_CYCLE: Block[] = [{ state: 'comet', duration: 2.4 }]
const THINKER_CYCLE: Block[] = [{ state: 'thinking', duration: 2.6 }]
const SLEEPY_CYCLE: Block[] = [{ state: 'sleep', duration: 2.4 }]

const AMBIENT_CYCLES: Record<AssistantAvatarVariant, Block[]> = {
  classic: CLASSIC_CYCLE,
  lively: LIVELY_CYCLE,
  calm: CALM_CYCLE,
  geometric: GEOMETRIC_CYCLE,
  faces: FACES_CYCLE,
  orbit: ORBIT_CYCLE,
  comet: COMET_CYCLE,
  thinker: THINKER_CYCLE,
  sleepy: SLEEPY_CYCLE,
}

const STATE_CYCLE: Record<AssistantAvatarState, Block[]> = {
  idle: AMBIENT_CYCLES.classic,
  thinking: [{ state: 'burst', duration: 2.6 }],
  responding: [{ state: 'orbit', duration: 3.4 }],
}

const cycle = computed<Block[]>(() => props.state === 'idle' ? (AMBIENT_CYCLES[props.variant] ?? AMBIENT_CYCLES.classic) : STATE_CYCLE[props.state])

// BloubBot 以 v-model:state 暴露引擎状态：getter 返回循环首块状态，setter 为空操作
//（状态切换由 prop 驱动，氛围循环内的状态轮转由引擎自己管理）。
const engineState = computed<StateId>({
  get: () => cycle.value[0]!.state,
  set: () => {}
})

/* ------------------------------------------------------- 定格策略 */

/** 按动效模式算出的目标冻结态（不含延迟） */
const frozenTarget = computed(
  () => props.frozen || props.motion === 'off' || (props.motion === 'active' && props.state === 'idle')
)

// 结束生成后延迟定格：等 idle 形变（morph ~0.45s）落定再冻结，
// 否则会把头像冻在过渡中间（黑三角残影）。
const frozenNow = ref(frozenTarget.value)
let freezeTimer: number | undefined
watch(frozenTarget, (target) => {
  window.clearTimeout(freezeTimer)
  if (!target) {
    frozenNow.value = false
    return
  }
  freezeTimer = window.setTimeout(() => { frozenNow.value = true }, 800)
}, { immediate: true })
onBeforeUnmount(() => window.clearTimeout(freezeTimer))

const playing = computed({
  get: () => !frozenNow.value,
  set: () => {}
})

/* ------------------------------------------------------- 明暗主题跟随 */

type ThemeName = 'dark' | 'light'

function readTheme(): ThemeName {
  return document.documentElement.dataset.studioTheme === 'light' ? 'light' : 'dark'
}

const theme = ref<ThemeName>('dark')
let themeObserver: MutationObserver | undefined

onMounted(() => {
  theme.value = readTheme()
  themeObserver = new MutationObserver(() => {
    theme.value = readTheme()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-studio-theme']
  })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = undefined
})

const BRAND_INK = '#4d6bfe'

const ink = computed(() => {
  if (props.ink) return props.ink
  if (props.tone === 'brand') return BRAND_INK
  if (props.tone && props.tone !== 'auto' && props.tone.startsWith('#')) return props.tone
  return theme.value === 'dark' ? '#f4f4f5' : '#0a0a0c'
})
const paper = computed(() => props.paper ?? (theme.value === 'dark' ? '#16161a' : '#ffffff'))
</script>

<template>
  <BloubBot
    v-model:state="engineState"
    v-model:playing="playing"
    :size="props.size"
    :cycle="cycle"
    :color="ink"
    :paper="paper"
    :frozen-at="frozenNow ? 0 : undefined"
    class="assistant-avatar"
  />
</template>

<style scoped>
.assistant-avatar {
  display: block;
  flex-shrink: 0;
}
</style>
