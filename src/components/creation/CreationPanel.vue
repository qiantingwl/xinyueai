<template>
    <section class="studio-create-page">
      <div class="create-page-inner">
        <div class="creation-heading">
          <h1>{{ activeMode === 'commerce' ? t('studio.commerce') : t('workspace.creation') }}</h1>
          <p>{{ activeMode === 'commerce' ? '从商品参考图到成套营销素材' : '让创作随灵感而生' }}</p>
        </div>
        <div v-if="store.lastError" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>
        <div v-if="modelCatalogError && !activeCreationModels.length" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ modelCatalogError }}</span><button type="button" aria-label="重新加载模型目录" title="重新加载模型目录" @click="refreshModelCatalog"><RefreshCw :size="15" /></button></div>
        <form ref="creationComposer" class="creation-composer" :class="{ 'is-commerce': activeMode === 'commerce', 'is-video': activeMode === 'videos' }" @submit.prevent="submitGeneration">
          <div class="creation-prompt-row" :class="{ 'is-video': activeMode === 'videos' }">
            <div v-if="activeMode === 'videos'" class="video-frame-inline" aria-label="首帧与尾帧">
              <div class="video-frame-tile" :class="{ 'is-filled': firstFrameAttachment }">
                <button type="button" class="video-frame-tile__slot" :aria-label="firstFrameAttachment ? '预览首帧' : '上传首帧图片'" :title="firstFrameAttachment ? '点击预览首帧' : '上传首帧图片（可选）'" @click="firstFrameAttachment ? previewFrameAsset(firstFrameAttachment) : openFilePicker('first-frame')">
                  <span v-if="!firstFrameAttachment" class="video-frame-tile__plus"><Plus :size="16" /></span>
                  <img v-else :src="firstFrameAttachment.contentUrl" :alt="`首帧：${firstFrameAttachment.title}`" />
                </button>
                <span class="video-frame-tile__badge">首</span>
                <button v-if="firstFrameAttachment" type="button" class="video-frame-tile__remove" aria-label="移除首帧图片" title="移除首帧图片" @click="firstFrameAttachment = null"><X :size="11" /></button>
              </div>
              <div class="video-frame-tile" :class="{ 'is-filled': lastFrameAttachment }">
                <button type="button" class="video-frame-tile__slot" :aria-label="lastFrameAttachment ? '预览尾帧' : '上传尾帧图片'" :title="lastFrameAttachment ? '点击预览尾帧' : '上传尾帧图片（可选）'" @click="lastFrameAttachment ? previewFrameAsset(lastFrameAttachment) : openFilePicker('last-frame')">
                  <span v-if="!lastFrameAttachment" class="video-frame-tile__plus"><Plus :size="16" /></span>
                  <img v-else :src="lastFrameAttachment.contentUrl" :alt="`尾帧：${lastFrameAttachment.title}`" />
                </button>
                <span class="video-frame-tile__badge">尾</span>
                <button v-if="lastFrameAttachment" type="button" class="video-frame-tile__remove" aria-label="移除尾帧图片" title="移除尾帧图片" @click="lastFrameAttachment = null"><X :size="11" /></button>
              </div>
            </div>
            <textarea ref="generationInput" v-model="generationPrompt" rows="2" aria-label="创作描述" :placeholder="creationPromptPlaceholder" @focus="collapseWorkspacePopovers" @input="resizeGenerationInput" />
          </div>
          <div v-if="creationAttachments.length || maskAttachment" class="creation-attachments" aria-label="参考素材">
            <article v-for="(asset, index) in creationAttachments" :key="asset.id" class="attachment-card" :class="hasImagePreview(asset) ? 'attachment-card--image' : 'attachment-card--file'">
              <img v-if="hasImagePreview(asset)" :src="asset.contentUrl" :alt="asset.title" />
              <div v-else class="attachment-file-copy">
                <span class="attachment-file-icon"><FileText :size="18" /></span>
                <span><strong :title="asset.title">{{ asset.title }}</strong><small>{{ attachmentMeta(asset) }}</small></span>
              </div>
              <button class="attachment-remove" type="button" :aria-label="`移除参考图片 ${asset.title}`" title="移除参考图片" @click="creationAttachments.splice(index, 1)"><X :size="13" /></button>
            </article>
            <article v-if="maskAttachment" class="attachment-card attachment-card--image attachment-card--mask">
              <img :src="maskAttachment.contentUrl" :alt="`蒙版：${maskAttachment.title}`" />
              <span class="attachment-mask-label">蒙版</span>
              <button class="attachment-remove" type="button" :aria-label="`移除蒙版 ${maskAttachment.title}`" title="移除蒙版" @click="maskAttachment = null"><X :size="13" /></button>
            </article>
          </div>
          <div class="creation-controls">
            <div class="creation-control-track">
              <button class="creation-add" type="button" aria-label="添加参考素材" title="添加参考素材" :disabled="uploading" @click="openFilePicker('creation')"><Plus :size="20" /></button>
              <i class="creation-control-divider" aria-hidden="true" />
              <div v-if="showCreationModeSwitch" class="creation-mode-switch" role="group" aria-label="创作类型">
                <button v-for="item in creationModeTabs" :key="item.key" type="button" :class="{ 'is-active': props.activeMode === item.mode }" :aria-pressed="props.activeMode === item.mode" @click="switchCreationMode(item.mode === 'videos' ? 'videos' : 'images')">{{ item.label }}</button>
              </div>
              <div class="creation-option-buttons">
                <button type="button" :class="{ 'is-open': creationMenu === 'model' }" :aria-label="`模型 ${activeCreationModelLabel}`" :title="activeCreationModels.length ? '选择模型' : '暂无可用模型'" @click.stop="toggleCreationMenu('model', $event)"><ModelBadge v-if="activeCreationModelOption" :model="activeCreationModelOption" size="sm" /><Sparkles v-else :size="16" />{{ activeCreationModelLabel }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button v-if="activeMode === 'commerce'" type="button" :class="{ 'is-open': creationMenu === 'type' }" @click.stop="toggleCreationMenu('type', $event)"><Images :size="16" /><span class="creation-control-label">类型</span>{{ creationType }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button v-if="activeMode !== 'videos'" type="button" :class="{ 'is-open': creationMenu === (activeMode === 'images' ? 'size' : 'platform') }" @click.stop="toggleCreationMenu(activeMode === 'images' ? 'size' : 'platform', $event)"><SlidersHorizontal :size="16" /><span class="creation-control-label">{{ activeMode === 'commerce' ? '平台' : '比例' }}</span>{{ activeMode === 'commerce' ? commercePlatform : autoMode }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button v-if="activeMode !== 'videos'" type="button" :class="{ 'is-open': creationMenu === (activeMode === 'images' ? 'style' : 'modules') }" @click.stop="toggleCreationMenu(activeMode === 'images' ? 'style' : 'modules', $event)"><Blend :size="16" /><span class="creation-control-label">风格</span><template v-if="activeMode === 'images'">{{ imageStyle }}</template><template v-else>{{ commerceModules }} 模块</template><ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button v-if="activeMode === 'videos'" type="button" :class="{ 'is-open': creationMenu === 'videoSettings' }" :aria-label="`视频设置：${videoResolution}，${videoAspectRatio}，${videoDuration} 秒`" @click.stop="toggleCreationMenu('videoSettings', $event)"><SlidersHorizontal :size="16" />{{ videoResolution }} · {{ videoAspectRatio }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
              </div>
              <PluginSelector v-model="creationPluginId" v-model:open="creationPluginOpen" :capability="creationPluginCapability" compact />
              <div v-if="activeMode !== 'videos'" class="creation-more-wrap">
                <button ref="creationMoreTrigger" class="creation-more-button" :class="{ 'is-active': creationOptionsOpen }" type="button" aria-label="更多生成设置" title="更多设置" :aria-expanded="creationOptionsOpen" @click.stop="toggleMoreOptions"><Settings2 :size="17" /><span>更多</span><ChevronDown class="creation-control-chevron" :size="13" /></button>
                <Teleport to="body">
                <div v-if="creationOptionsOpen" ref="creationMorePanel" class="creation-more-panel creation-more-panel--floating" :style="creationMorePanelStyle" aria-label="更多生成设置">
                  <button v-if="activeMode === 'images' && activeImageCapabilities.supportsMask" type="button" :disabled="uploading" @click="openFilePicker('mask')"><Blend :size="16" />添加蒙版</button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('quality', $event)"><BadgeCheck :size="16" />{{ quality }}画质<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('count', $event)"><Layers3 :size="16" />{{ imageCount }} 张<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('format', $event)"><FileType2 :size="16" />{{ outputFormat }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('background', $event)"><ImageIcon :size="16" />{{ imageBackground }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'commerce'" type="button" @click.stop="toggleCreationMenu('format', $event)"><FileType2 :size="16" />{{ outputFormat }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'commerce'" type="button" @click.stop="toggleCreationMenu('background', $event)"><ImageIcon :size="16" />{{ imageBackground }}<ChevronDown :size="13" /></button>
                </div>
                </Teleport>
              </div>
              <span class="creation-cost" :title="`本次预计扣除 ${currentGenerationCost} 创作点`"><Sparkles :size="13" />{{ currentGenerationCost }} 点</span>
            </div>
            <button class="creation-submit composer-send" :class="{ 'is-listening': voiceListening && voiceTarget === 'creation' }" :type="canSubmitCreation ? 'submit' : 'button'" :disabled="hasCreationInput && !activeCreationModelAvailable" :aria-label="canSubmitCreation ? '开始生成' : hasCreationInput ? activeCreationModelUnavailableMessage : voiceListening && voiceTarget === 'creation' ? '停止语音输入' : '语音输入'" :title="hasCreationInput && !activeCreationModelAvailable ? activeCreationModelUnavailableMessage : undefined" @click="!hasCreationInput && toggleVoice('creation')"><ArrowUp v-if="hasCreationInput" :size="20" /><AudioLines v-else :size="18" /></button>
          </div>
          <Teleport to="body">
            <div v-if="creationMenu" ref="creationOptionsMenu" class="creation-options-menu creation-options-menu--floating" :class="`creation-options-menu--${creationMenu}`" :style="creationMenuStyle">
              <ModelCatalogPicker v-if="creationMenu === 'model'" :models="activeCreationModels" :model-value="activeCreationModel" :title="creationMenuTitle" @select="selectCreationOption" @close="collapseWorkspacePopovers" />
              <div v-else-if="creationMenu === 'videoSettings'" class="creation-video-settings">
                <section>
                  <strong>比例</strong>
                  <div class="creation-ratio-grid">
                    <button v-for="ratio in activeVideoCapabilities.aspectRatios" :key="ratio" type="button" :class="{ 'is-active': videoAspectRatio === ratio }" @click.stop="selectVideoSetting('aspect', ratio)"><span class="creation-ratio-shape" :class="ratioShapeClass(ratio)"><i /><i v-if="ratio === '自动'" /></span><span>{{ ratio }}</span></button>
                  </div>
                </section>
                <section>
                  <strong>画质</strong>
                  <div class="creation-segment">
                    <button v-for="item in activeVideoCapabilities.resolutions" :key="item" type="button" :class="{ 'is-active': videoResolution === item }" @click.stop="selectVideoSetting('resolution', item)">{{ item }}</button>
                  </div>
                </section>
                <section>
                  <strong>时长</strong>
                  <div class="creation-segment">
                    <button v-for="item in activeVideoCapabilities.durations" :key="item" type="button" :class="{ 'is-active': videoDuration === item }" @click.stop="selectVideoSetting('duration', String(item))">{{ item }} 秒</button>
                  </div>
                </section>
                <footer><Sparkles :size="13" />按模型计费，本次约 {{ currentGenerationCost }} 点</footer>
              </div>
              <strong v-else>{{ creationMenuTitle }}</strong>
              <div v-if="creationMenu === 'size'" class="creation-ratio-grid">
                <button v-for="option in creationMenuOptions" :key="option" type="button" :class="{ 'is-active': isCreationOptionActive(option) }" @click="selectCreationOption(option)"><span class="creation-ratio-shape" :class="ratioShapeClass(option)"><i /><i v-if="option === '自动'" /></span><span>{{ option }}</span></button>
              </div>
              <button v-else-if="creationMenu !== 'model' && creationMenu !== 'videoSettings'" v-for="option in creationMenuOptions" :key="option" type="button" :class="{ 'is-active': isCreationOptionActive(option) }" @click="selectCreationOption(option)"><img v-if="creationMenu === 'style'" class="creation-style-thumb" :src="styleThumbnail(option)" alt="" /><span>{{ creationOptionLabel(option) }}<small v-if="creationOptionPrice(option)">{{ creationOptionPrice(option) }} 点</small></span><Check v-if="isCreationOptionActive(option)" :size="15" /></button>
            </div>
          </Teleport>
        </form>

        <section v-if="activeMode === 'images'" class="creation-tools" aria-label="图片快捷工具">
          <button v-for="tool in imageTools" :key="tool.id" type="button" :class="{ 'is-active': selectedImageToolId === tool.id }" :aria-pressed="selectedImageToolId === tool.id" @click="selectImageTool(tool)">
            <span>{{ tool.title }}</span><img v-if="tool.imageUrl" :src="tool.imageUrl" :alt="`${tool.title}示例`" /><span v-else class="creation-tool-fallback-icon" aria-hidden="true"><component :is="imageToolIcon(tool)" :size="22" /></span>
          </button>
        </section>

        <section class="inspiration-section">
          <header>
            <h2>{{ activeMode === 'images' || activeMode === 'videos' ? '灵感中心' : t('studio.inspiration') }}</h2>
            <div class="inspiration-header-actions">
              <nav class="inspiration-navigation" aria-label="浏览生成灵感">
                <button class="inspiration-arrow inspiration-arrow--previous" type="button" aria-label="上一组" title="上一组" :disabled="!canScrollInspirationPrevious" @click="scrollInspiration(-1)"><ChevronLeft :size="20" /></button>
                <button class="inspiration-arrow inspiration-arrow--next" type="button" aria-label="下一组" title="下一组" :disabled="!canScrollInspirationNext" @click="scrollInspiration(1)"><ChevronRight :size="20" /></button>
              </nav>
              <button v-if="activeMode === 'images' || activeMode === 'videos'" class="inspiration-more" type="button" @click="openPromptLibrary(activeMode === 'videos' ? 'VIDEO' : 'IMAGE')">更多灵感<ArrowRight :size="16" /></button>
            </div>
          </header>
          <div v-if="inspirationError" class="inspiration-error" role="alert"><span><RefreshCw :size="16" />{{ inspirationError }}</span><button type="button" @click="retryInspirations"><RefreshCw :size="15" />重新加载</button></div>
          <div class="inspiration-browser">
            <div ref="inspirationRail" class="inspiration-rail" :class="{ 'can-scroll-start': canScrollInspirationPrevious, 'can-scroll-end': canScrollInspirationNext }" @scroll="syncInspirationNavigation">
              <div v-if="inspirationLoading" class="inspiration-loading" aria-label="正在加载灵感"><i v-for="index in 5" :key="index" /></div>
              <p v-else-if="!activeInspirations.length && !inspirationError" class="inspiration-empty"><AssistantAvatar state="idle" motion="off" :size="30" /><span>暂无可用灵感</span></p>
              <button v-for="item in activeInspirations" :key="item.id" type="button" class="inspiration-card" :class="{ 'is-selected': selectedInspirationId === item.id, 'is-video': activeMode === 'videos' }" :aria-label="`查看灵感：${item.title}`" @click="openInspiration(item)">
                <video v-if="activeMode === 'videos' && item.videoUrl" :src="item.videoUrl" :poster="item.imageUrl" muted loop playsinline preload="metadata" :aria-label="`${item.title} 视频预览`" @mouseenter="playInspirationVideo" @mouseleave="pauseInspirationVideo" />
                <img v-else :src="item.imageUrl" :alt="item.title" />
                <span v-if="item.badge">{{ item.badge }}</span>
                <i v-if="activeMode === 'videos'" class="inspiration-card__play" aria-hidden="true"><Play :size="18" fill="currentColor" /></i>
                <strong>{{ item.title }}</strong>
              </button>
            </div>
          </div>
        </section>

        <section class="creation-output">
          <h2>{{ activeMode === 'images' ? t('studio.myImages') : activeMode === 'videos' ? t('studio.myVideos') : t('studio.myCommerce') }}</h2>
          <template v-if="activeMode === 'videos'">
            <div v-if="pendingVideoRuns.length" class="video-runs video-runs--pending">
              <article v-for="run in pendingVideoRuns" :key="run.id" class="video-run-card" :class="`is-${run.status.toLowerCase()}`">
                <div class="video-run-card__stage"><LoaderCircle :size="26" /><strong>正在生成视频</strong><small>{{ run.request.resolution || '720p' }} · {{ run.request.duration || 5 }} 秒 · {{ run.request.aspectRatio || '16:9' }}<em v-if="run.request.firstFrameAssetId && run.request.lastFrameAssetId" class="video-run-card__frames">首帧 → 尾帧</em><em v-else-if="run.request.firstFrameAssetId" class="video-run-card__frames">首帧开场</em><em v-else-if="run.request.lastFrameAssetId" class="video-run-card__frames">尾帧收尾</em></small></div>
                <footer><span><strong>{{ run.model }}</strong><small>{{ run.request.creditCost ?? currentVideoCredit }} 点</small></span><nav><button type="button" title="停止生成" :disabled="store.cancelingJobId === run.id" @click="stopGeneration(run)"><Square :size="14" fill="currentColor" /></button></nav></footer>
                <p>{{ run.prompt }}</p>
              </article>
            </div>
            <template v-if="modeAssets.length">
              <AssetGrid :assets="visibleModeAssets" variant="gallery" :deletable="auth.isAuthenticated" reusable regeneratable @delete="deleteAsset" @quote="useAssetPrompt" @regenerate="retryAssetGeneration" />
              <button v-if="visibleModeAssets.length < modeAssets.length" class="creation-output__more" type="button" @click="modeAssetLimit += 12">加载更多视频</button>
            </template>
            <div v-else-if="auth.isAuthenticated && !store.workspaceHydrated" class="creation-gallery-skeleton" aria-label="正在加载视频"><i v-for="index in 6" :key="index" /></div>
            <div v-else-if="!pendingVideoRuns.length" class="creation-empty">
              <span class="creation-empty__icon"><AssistantAvatar state="idle" motion="off" :size="44" /></span>
              <strong>还没有视频作品</strong>
              <p>你创建的视频会显示在这里，输入一段描述开始生成。</p>
            </div>
          </template>
          <div v-else-if="activeMode === 'commerce' && commerceRuns.length" class="commerce-runs">
            <div v-for="run in commerceRuns" :key="run.id" class="commerce-run-card" :class="{ 'is-running': generationState(run).isActive, 'is-clickable': Boolean(run.assets.length) }" :role="run.assets.length ? 'button' : undefined" :tabindex="run.assets.length ? 0 : undefined" @click="run.assets.length && (selectedCommerceRun = run)" @keydown.enter="run.assets.length && (selectedCommerceRun = run)">
              <div class="commerce-run-card__preview">
                <template v-if="run.assets.length"><img v-for="asset in run.assets.slice(0, 4)" :key="asset.id" :src="asset.contentUrl" :alt="asset.moduleLabel || asset.title" /><span><Images :size="14" />{{ run.assets.length }} 张</span></template>
                <span v-else class="commerce-run-card__progress"><LoaderCircle v-if="generationState(run).isActive" :size="22" /><span>{{ generationState(run).isFailed ? run.error || '生成失败' : generationState(run).isCancelled ? '生成已停止' : '正在生成商品图' }}</span><button v-if="generationState(run).canCancel" type="button" class="commerce-run-card__stop" :disabled="store.cancelingJobId === run.id" aria-label="停止商品图生成" title="停止商品图生成" @click.stop="stopGeneration(run)"><LoaderCircle v-if="store.cancelingJobId === run.id" class="generation-stop-spin" :size="14" /><Square v-else :size="14" fill="currentColor" />{{ store.cancelingJobId === run.id ? '停止中' : '停止生成' }}</button></span>
              </div>
              <span class="commerce-run-card__copy"><strong>{{ run.request.creationType || '商品素材包' }}</strong><small>{{ run.prompt }}</small></span>
            </div>
          </div>
          <div v-else-if="auth.isAuthenticated && !store.workspaceHydrated" class="creation-gallery-skeleton" aria-label="正在加载图片"><i v-for="index in 6" :key="index" /></div>
          <template v-else-if="modeAssets.length">
            <AssetGrid :assets="visibleModeAssets" variant="gallery" :deletable="auth.isAuthenticated" :reusable="activeMode === 'images'" :regeneratable="activeMode === 'images'" @delete="deleteAsset" @reuse="useGeneratedAssetAsReference" @quote="useAssetPrompt" @regenerate="retryAssetGeneration" />
            <button v-if="visibleModeAssets.length < modeAssets.length" class="creation-output__more" type="button" @click="modeAssetLimit += 12">加载更多图片</button>
          </template>
          <div v-else class="creation-empty">
            <span class="creation-empty__icon"><AssistantAvatar state="idle" motion="off" :size="44" /></span>
            <strong>{{ activeMode === 'images' ? '还没有图片作品' : '还没有商品素材' }}</strong>
            <p>{{ activeMode === 'images' ? '你创建的图片会显示在这里，输入一段描述开始生成。' : '你制作的商品素材包和详情页会显示在这里。' }}</p>
          </div>
        </section>
      </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowRight, ArrowUp, AudioLines, BadgeCheck, Blend, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, FileType2, Image as ImageIcon, Images, Layers3, LoaderCircle, Play, Plus, RefreshCw, Settings2, SlidersHorizontal, Sparkles, Square, X,
} from 'lucide-vue-next'
import AssetGrid from '../AssetGrid.vue'
import AssistantAvatar from '../chat/AssistantAvatar.vue'
import ModelCatalogPicker from '../ModelCatalogPicker.vue'
import PluginSelector from '../PluginSelector.vue'
import { useAuthStore } from '../../stores/auth'
import { useCatalogStore } from '../../stores/catalog'
import { useStudioStore } from '../../stores/studio'
import type { GenerationRun, PluginCapability, StudioAsset, StudioMode } from '../../types'
import { findCatalogModel, type CatalogModel } from '../../utils/model-catalog'
import { resolveGenerationRunState } from '../../utils/generation-run-state'
import ModelBadge from '../common/ModelBadge.vue'
import { visibleGroupTabs } from '../../utils/sidebar-nav'
import { attachmentMeta, hasImagePreview, type CreationMenu, type ImageTool, type Inspiration } from './creation-shared'

const props = defineProps<{
  activeMode: StudioMode
  modelCatalogError: string
  activeCreationModels: CatalogModel[]
  activeCreationModel: string
  activeCreationModelLabel: string
  activeCreationModelAvailable: boolean
  activeCreationModelUnavailableMessage: string
  activeImageCapabilities: { supportsMask: boolean }
  activeVideoCapabilities: { resolutions: string[]; durations: number[]; aspectRatios: string[] }
  creationPluginCapability: PluginCapability
  currentGenerationCost: number
  canSubmitCreation: boolean
  hasCreationInput: boolean
  creationPromptPlaceholder: string
  uploading: boolean
  voiceListening: boolean
  voiceTarget: 'chat' | 'creation'
  creationMenu: CreationMenu
  creationMenuStyle: Record<string, string>
  creationMenuTitle: string
  creationMenuOptions: string[]
  creationOptionsOpen: boolean
  creationMorePanelStyle: Record<string, string>
  creationType: string
  videoAspectRatio: string
  commercePlatform: string
  autoMode: string
  imageStyle: string
  videoResolution: string
  videoDuration: number
  commerceModules: number
  quality: string
  imageCount: number
  outputFormat: string
  imageBackground: string
  creationAttachments: StudioAsset[]
  imageTools: ImageTool[]
  selectedImageToolId: string
  activeInspirations: Inspiration[]
  inspirationLoading: boolean
  inspirationError: string
  selectedInspirationId: string
  pendingVideoRuns: GenerationRun[]
  currentVideoCredit: number
  modeAssets: StudioAsset[]
  visibleModeAssets: StudioAsset[]
  commerceRuns: GenerationRun[]
  submitGeneration: () => void
  resizeGenerationInput: () => void
  collapseWorkspacePopovers: () => void
  openFilePicker: (purpose: 'chat-file' | 'creation' | 'mask' | 'first-frame' | 'last-frame' | 'library') => void
  switchCreationMode: (mode: 'images' | 'videos') => void
  toggleCreationMenu: (menu: NonNullable<CreationMenu>, event: MouseEvent) => void
  toggleMoreOptions: () => void
  toggleVoice: (target?: 'chat' | 'creation') => void
  selectImageTool: (tool: ImageTool) => void
  openPromptLibrary: (type?: 'IMAGE' | 'VIDEO' | 'TEXT') => void
  openInspiration: (item: Inspiration) => void
  playInspirationVideo: (event: Event) => void
  pauseInspirationVideo: (event: Event) => void
  retryInspirations: () => void
  stopGeneration: (generation: GenerationRun) => void
  deleteAsset: (assetId: string) => void
  useAssetPrompt: (asset: StudioAsset) => void
  retryAssetGeneration: (asset: StudioAsset) => void
  useGeneratedAssetAsReference: (asset: StudioAsset, generation?: GenerationRun) => void
  selectCreationOption: (option: string) => void
  selectVideoSetting: (section: 'aspect' | 'resolution' | 'duration', value: string) => void
  isCreationOptionActive: (option: string) => boolean
  ratioShapeClass: (option: string) => string
  styleThumbnail: (option: string) => string
  creationOptionLabel: (option: string) => string
  creationOptionPrice: (option: string) => number
  imageToolIcon: (tool: ImageTool) => Component
  refreshModelCatalog: () => void
  previewFrameAsset: (asset: StudioAsset) => void
}>()
const generationPrompt = defineModel<string>('generationPrompt', { required: true })
const maskAttachment = defineModel<StudioAsset | null>('maskAttachment', { required: true })
const firstFrameAttachment = defineModel<StudioAsset | null>('firstFrameAttachment', { required: true })
const lastFrameAttachment = defineModel<StudioAsset | null>('lastFrameAttachment', { required: true })
const creationPluginId = defineModel<string>('creationPluginId', { required: true })
const creationPluginOpen = defineModel<boolean>('creationPluginOpen', { required: true })
const modeAssetLimit = defineModel<number>('modeAssetLimit', { required: true })
const selectedCommerceRun = defineModel<GenerationRun | null>('selectedCommerceRun', { required: true })
function generationState(generation: GenerationRun) { return resolveGenerationRunState(generation.status) }

const store = useStudioStore()
const auth = useAuthStore()
const catalog = useCatalogStore()
const creationModeTabs = computed(() => visibleGroupTabs('creation', catalog.settings))
const showCreationModeSwitch = computed(() => props.activeMode !== 'commerce' && creationModeTabs.value.length > 1)
const { t } = useI18n()
const creationComposer = ref<HTMLFormElement | null>(null)
const generationInput = ref<HTMLTextAreaElement | null>(null)
const activeCreationModelOption = computed(() => findCatalogModel(props.activeCreationModels, props.activeCreationModel))
const creationMoreTrigger = ref<HTMLButtonElement | null>(null)
const creationMorePanel = ref<HTMLElement | null>(null)
const creationOptionsMenu = ref<HTMLElement | null>(null)
const inspirationRail = ref<HTMLElement | null>(null)
const canScrollInspirationPrevious = ref(false)
const canScrollInspirationNext = ref(false)

function syncInspirationNavigation() {
  const rail = inspirationRail.value
  if (!rail) { canScrollInspirationPrevious.value = false; canScrollInspirationNext.value = false; return }
  const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth)
  canScrollInspirationPrevious.value = rail.scrollLeft > 2
  canScrollInspirationNext.value = rail.scrollLeft < maximum - 2
}
function scrollInspiration(direction: number) {
  const rail = inspirationRail.value
  if (!rail) return
  rail.scrollBy({ left: direction * Math.max(470, rail.clientWidth * 0.72), behavior: 'smooth' })
}

defineExpose({
  creationComposerEl: () => creationComposer.value,
  generationInputEl: () => generationInput.value,
  creationMoreTriggerEl: () => creationMoreTrigger.value,
  creationMorePanelEl: () => creationMorePanel.value,
  creationOptionsMenuEl: () => creationOptionsMenu.value,
  syncInspirationNavigation,
})
</script>
