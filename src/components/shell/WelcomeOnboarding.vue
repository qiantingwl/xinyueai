<template>
  <div class="studio-modal-backdrop welcome-onboarding-layer">
    <section class="welcome-onboarding" role="dialog" aria-modal="true" aria-labelledby="welcome-onboarding-title">
      <header>
        <p>欢迎来到 {{ siteName }}</p>
        <h2 id="welcome-onboarding-title">{{ stepTitle }}</h2>
        <small>{{ stepHint }}</small>
      </header>
      <div class="welcome-onboarding__body">
        <label v-if="step === 'appearance'" class="settings-option-row">
          <span><strong>外观</strong><small>浅色、深色，或跟随系统。</small></span>
          <select v-model="settings.appearance" aria-label="外观">
            <option value="深色">深色</option>
            <option value="浅色">浅色</option>
            <option value="跟随系统">跟随系统</option>
          </select>
        </label>
        <label v-else-if="step === 'language'" class="settings-option-row">
          <span><strong>语言</strong><small>选择界面语言，之后可随时修改。</small></span>
          <select v-model="settings.language" aria-label="语言">
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </label>
        <div v-else-if="step === 'memory'" class="settings-memory">
          <div>
            <span><strong>使用记忆</strong><small>跨对话记住你确认过的称呼和稳定偏好。</small></span>
            <button class="switch-control" :class="{ 'is-on': settings.useMemory }" type="button" role="switch" :aria-checked="settings.useMemory" @click="settings.useMemory = !settings.useMemory"><i /></button>
          </div>
        </div>
        <div v-else class="settings-memory">
          <div>
            <span><strong>保存聊天记录</strong><small>关闭后新对话会作为临时聊天，不会出现在历史里。</small></span>
            <button class="switch-control" :class="{ 'is-on': settings.chatHistoryEnabled }" type="button" role="switch" :aria-checked="settings.chatHistoryEnabled" @click="settings.chatHistoryEnabled = !settings.chatHistoryEnabled"><i /></button>
          </div>
        </div>
      </div>
      <nav class="welcome-onboarding__dots" aria-label="引导步骤">
        <button v-for="item in steps" :key="item" type="button" :class="{ 'is-active': item === step }" :aria-label="item" @click="step = item" />
      </nav>
      <footer>
        <button type="button" :disabled="saving" @click="skip">暂时跳过</button>
        <div>
          <button v-if="stepIndex > 0" type="button" @click="step = steps[stepIndex - 1]">上一步</button>
          <button class="welcome-onboarding__primary" type="button" :disabled="saving" @click="advance">{{ isLast ? (saving ? '保存中' : '开始使用') : '下一步' }}</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WorkspaceSettings } from './types'

const props = defineProps<{
  settings: WorkspaceSettings
  siteName: string
  saveSettings: (showFeedback?: boolean) => Promise<void>
}>()

const emit = defineEmits<{ complete: [] }>()

const steps = ['appearance', 'language', 'memory', 'history'] as const
type Step = typeof steps[number]
const step = ref<Step>('appearance')
const saving = ref(false)
const stepIndex = computed(() => steps.indexOf(step.value))
const isLast = computed(() => stepIndex.value === steps.length - 1)
const stepTitle = computed(() => ({
  appearance: '先选一个舒适的外观',
  language: '选择界面语言',
  memory: '是否记住你的偏好',
  history: '聊天记录怎么处理',
}[step.value]))
const stepHint = computed(() => `这些都可以稍后在设置中修改。${props.siteName} 已准备好开始第一次对话。`)

async function finish() {
  if (saving.value) return
  saving.value = true
  try {
    props.settings.onboarded = true
    await props.saveSettings(false)
    emit('complete')
  } finally {
    saving.value = false
  }
}

function advance() {
  if (isLast.value) {
    void finish()
    return
  }
  step.value = steps[stepIndex.value + 1]
}

function skip() {
  void finish()
}
</script>
