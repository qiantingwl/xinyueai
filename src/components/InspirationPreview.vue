<template>
  <Teleport to="body">
    <div class="inspiration-preview-layer" @mousedown.self="$emit('close')">
      <section class="inspiration-preview" role="dialog" aria-modal="true" aria-labelledby="inspiration-preview-title">
        <header>
          <div><span>{{ inspiration.badge || typeLabel }} · {{ currentIndex + 1 }} / {{ images.length }}</span><h2 id="inspiration-preview-title">{{ inspiration.title }}</h2></div>
          <button type="button" title="关闭" aria-label="关闭灵感预览" @click="$emit('close')"><X :size="20" /></button>
        </header>
        <div class="inspiration-preview__stage">
          <button v-if="images.length > 1" type="button" class="inspiration-preview__arrow is-previous" title="上一张" aria-label="上一张灵感图" @click="previous"><ChevronLeft :size="24" /></button>
          <div class="inspiration-preview__viewport"><video v-if="inspiration.videoUrl" :src="inspiration.videoUrl" :poster="inspiration.imageUrl" controls autoplay muted playsinline preload="metadata" /><img v-else :src="images[currentIndex]" :alt="`${inspiration.title} ${currentIndex + 1}`" /></div>
          <button v-if="images.length > 1" type="button" class="inspiration-preview__arrow is-next" title="下一张" aria-label="下一张灵感图" @click="next"><ChevronRight :size="24" /></button>
        </div>
        <footer>
          <div v-if="images.length > 1" class="inspiration-preview__thumbs"><button v-for="(image, index) in images" :key="`${image}-${index}`" type="button" :class="{ 'is-active': currentIndex === index }" :aria-label="`查看第 ${index + 1} 张灵感图`" @click="currentIndex = index"><img :src="image" :alt="`${inspiration.title} 缩略图 ${index + 1}`" /></button></div>
          <p v-else>{{ inspiration.prompt }}</p>
          <button class="inspiration-preview__use" type="button" @click="$emit('use')"><Sparkles :size="17" />使用此灵感</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-vue-next'
import { useEscapeClose } from '../composables/useEscapeClose'

type PreviewInspiration = { id: string; title: string; prompt: string; badge: string; imageUrl: string; videoUrl?: string; options?: Record<string, unknown> | null }
const props = defineProps<{ inspiration: PreviewInspiration; typeLabel: string }>()
const emit = defineEmits<{ close: []; use: [] }>()
useEscapeClose(() => emit('close'))
const currentIndex = ref(0)
const images = computed(() => {
  const configured = Array.isArray(props.inspiration.options?.previewImages) ? props.inspiration.options.previewImages.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
  return [...new Set(configured.length ? configured : [props.inspiration.imageUrl])].filter(Boolean)
})
function previous() { currentIndex.value = (currentIndex.value - 1 + images.value.length) % images.value.length }
function next() { currentIndex.value = (currentIndex.value + 1) % images.value.length }
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' && images.value.length > 1) previous()
  if (event.key === 'ArrowRight' && images.value.length > 1) next()
  if (event.key === 'Escape') document.querySelector<HTMLButtonElement>('[aria-label="关闭灵感预览"]')?.click()
}
onMounted(() => { document.body.classList.add('has-inspiration-preview'); window.addEventListener('keydown', onKeydown) })
onUnmounted(() => { document.body.classList.remove('has-inspiration-preview'); window.removeEventListener('keydown', onKeydown) })
</script>
