<template>
  <section class="works-page">
    <WorkspaceSectionTabs active="works" />
    <SectionHeader class="works-page__header" heading-tag="h1" title="作品中心" description="发布创作成果、保留版本，并在审核通过后进入作品广场。">
      <template #actions>
        <button v-if="auth.isAuthenticated" class="works-primary" type="button" @click="openCreate()"><Plus :size="17" />发布作品</button>
      </template>
    </SectionHeader>

    <div class="works-view-switch" role="tablist" aria-label="作品视图">
      <button type="button" role="tab" :aria-selected="activeView === 'gallery'" :class="{ 'is-active': activeView === 'gallery' }" @click="switchView('gallery')"><Compass :size="16" />作品广场</button>
      <button type="button" role="tab" :aria-selected="activeView === 'mine'" :class="{ 'is-active': activeView === 'mine' }" @click="switchView('mine')"><FolderHeart :size="16" />我的作品</button>
    </div>

    <template v-if="activeView === 'gallery'">
      <div v-if="galleryItems.length || galleryQuery || galleryCategory" class="works-toolbar">
        <label><Search :size="16" /><input v-model.trim="galleryQuery" placeholder="搜索标题、描述或标签" @keydown.enter="loadGallery" /></label>
        <select v-model="galleryCategory" aria-label="作品分类" @change="loadGallery"><option value="">全部分类</option><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select>
        <select v-model="gallerySort" aria-label="作品排序" @change="loadGallery"><option value="featured">精选优先</option><option value="latest">最新发布</option><option value="popular">热门作品</option></select>
        <button type="button" aria-label="搜索作品" title="搜索" @click="loadGallery"><Search :size="17" /></button>
      </div>

      <div v-if="galleryError" class="works-load-error" role="alert"><span><CircleAlert :size="18" />{{ galleryError }}</span><button type="button" :disabled="loading" @click="loadGallery"><RefreshCw :size="15" />重新加载</button></div>
      <div v-if="loading" class="works-state"><LoaderCircle class="works-spin" :size="22" />正在加载作品</div>
      <div v-else-if="galleryItems.length" class="works-grid">
        <article v-for="work in galleryItems" :key="work.id" class="work-card">
          <button class="work-card__preview" type="button" :aria-label="`查看作品：${work.version.title}`" @click="openPublicWork(work)">
            <video v-if="cover(work)?.kind === 'VIDEO'" :src="mediaUrl(cover(work)?.contentUrl)" muted playsinline preload="metadata" />
            <img v-else-if="cover(work)" :src="mediaUrl(cover(work)?.contentUrl)" :alt="work.version.title" loading="lazy" />
            <span v-else><ImageIcon :size="30" /></span>
            <em v-if="work.isFeatured">精选</em>
          </button>
          <div class="work-card__copy">
            <button type="button" @click="openPublicWork(work)"><strong>{{ work.version.title }}</strong><small>{{ work.version.description || work.version.category }}</small></button>
            <footer><span>{{ work.author.name }}</span><span><Eye :size="13" />{{ work.viewCount }}<Heart :size="13" />{{ work.likeCount }}</span></footer>
          </div>
        </article>
      </div>
      <EmptyState v-else-if="!galleryError" :icon="Images" title="还没有公开作品" description="从文件库挑一张图或视频发布后，就会出现在这里。">
        <button v-if="auth.isAuthenticated" class="works-primary" type="button" @click="openCreate()"><Plus :size="16" />发布作品</button>
        <RouterLink class="works-secondary" to="/image"><Compass :size="16" />去创作</RouterLink>
      </EmptyState>
      <button v-if="galleryCursor" class="works-load-more" type="button" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? '加载中' : '加载更多' }}</button>
    </template>

    <template v-else>
      <EmptyState v-if="!auth.isAuthenticated" :icon="LockKeyhole" title="登录后管理作品" description="你的草稿、审核记录和已发布版本都会集中保存在这里。">
        <RouterLink class="works-primary" to="/login?redirect=/works?view=mine">登录</RouterLink>
      </EmptyState>
      <div v-else-if="loadingMine" class="works-state"><LoaderCircle class="works-spin" :size="22" />正在加载我的作品</div>
      <div v-else-if="mineError" class="works-load-error works-load-error--center" role="alert"><span><CircleAlert :size="18" />{{ mineError }}</span><button type="button" :disabled="loadingMine" @click="loadMine"><RefreshCw :size="15" />重新加载</button></div>
      <div v-else-if="myWorks.length" class="my-works-list">
        <article v-for="work in myWorks" :key="work.id">
          <button class="my-work-cover" type="button" @click="openEdit(work)">
            <video v-if="cover(work, true)?.kind === 'VIDEO'" :src="mediaUrl(cover(work, true)?.contentUrl)" muted playsinline preload="metadata" />
            <img v-else-if="cover(work, true)" :src="mediaUrl(cover(work, true)?.contentUrl)" :alt="work.currentVersion.title" />
            <ImageIcon v-else :size="24" />
          </button>
          <div><span><strong>{{ work.currentVersion.title }}</strong><StatusPill :tone="statusTone(work.currentVersion.moderationStatus)" :label="statusText(work.currentVersion.moderationStatus)" /></span><p>{{ work.currentVersion.description || '暂未填写作品简介' }}</p><small>v{{ work.currentVersion.versionNumber }} · {{ visibilityText(work.currentVersion.visibility) }} · {{ formatDate(work.updatedAt) }}</small><small v-if="work.currentVersion.rejectionReason" class="is-error">{{ work.currentVersion.rejectionReason }}</small></div>
          <nav>
            <button type="button" title="编辑作品" aria-label="编辑作品" @click="openEdit(work)"><Pencil :size="16" /></button>
            <button v-if="['DRAFT', 'REJECTED'].includes(work.currentVersion.moderationStatus) && work.currentVersion.visibility !== 'PRIVATE'" type="button" title="提交审核" aria-label="提交审核" @click="submitWork(work)"><Send :size="16" /></button>
            <button v-if="work.publishedVersion" type="button" title="查看公开版本" aria-label="查看公开版本" @click="openPublicWork(work)"><ExternalLink :size="16" /></button>
            <button type="button" title="删除作品" aria-label="删除作品" @click="removeWork(work)"><Trash2 :size="16" /></button>
          </nav>
        </article>
      </div>
      <EmptyState v-else :icon="FolderHeart" title="把生成结果发到作品中心" description="文件库里的图片和视频可以直接发布。公开后会出现在作品广场。">
        <button class="works-primary" type="button" @click="openCreate()"><Plus :size="16" />发布作品</button>
      </EmptyState>
    </template>

    <div v-if="editorOpen" class="works-modal-layer" @click.self="closeEditor">
      <form class="works-editor" role="dialog" aria-modal="true" aria-labelledby="work-editor-title" @submit.prevent="saveWork">
        <header><div><h2 id="work-editor-title">{{ editingId ? '编辑作品' : '创建作品' }}</h2><p>已发布作品再次编辑时会自动创建新版本。</p></div><button type="button" aria-label="关闭" @click="closeEditor"><X :size="19" /></button></header>
        <div class="works-editor__body">
          <section class="works-editor__fields">
            <label><span>作品标题</span><input v-model.trim="draft.title" maxlength="120" placeholder="输入清晰、可识别的标题" /></label>
            <label><span>作品简介</span><textarea v-model.trim="draft.description" maxlength="5000" rows="4" placeholder="说明创作思路、内容和适用场景" /></label>
            <div class="works-editor__row"><label><span>分类</span><input v-model.trim="draft.category" maxlength="80" placeholder="例如：品牌视觉" /></label><label><span>可见范围</span><select v-model="draft.visibility"><option value="PUBLIC">公开展示</option><option value="UNLISTED">仅链接可见</option><option value="PRIVATE">私密</option></select></label></div>
            <label><span>标签</span><input v-model="draft.tagsText" placeholder="使用逗号分隔，最多 12 个" /></label>
            <label><span>公开提示词</span><textarea v-model.trim="draft.publicPrompt" maxlength="10000" rows="3" placeholder="选择素材时会带入其生成提示词；留空则不公开提示词" /></label>
            <div class="works-editor__row"><label><span>作者展示</span><select v-model="draft.authorDisplay"><option value="PROFILE">个人资料名称</option><option value="CUSTOM">自定义名称</option><option value="HIDDEN">匿名</option></select></label><label v-if="draft.authorDisplay === 'CUSTOM'"><span>展示名称</span><input v-model.trim="draft.customAuthor" maxlength="80" /></label></div>
          </section>
          <section class="works-asset-picker">
            <header><div><strong>选择作品素材</strong><small>第一项作为封面，当前列表只显示{{ assetKind === 'VIDEO' ? '视频' : '图片' }}，最多 20 个。</small></div><span>{{ draft.assetIds.length }}/20</span></header>
            <div v-if="assetsLoading" class="works-state"><LoaderCircle class="works-spin" :size="18" />加载文件库</div>
            <div v-else-if="assetsError" class="works-editor__empty works-editor__empty--error" role="alert"><CircleAlert :size="22" /><p>{{ assetsError }}</p><button type="button" :disabled="assetsLoading" @click="loadAssets(true)"><RefreshCw :size="15" />重新加载</button></div>
            <template v-else>
              <div class="works-asset-kind" role="tablist" aria-label="素材类型">
                <button type="button" role="tab" :aria-selected="assetKind === 'IMAGE'" :class="{ 'is-active': assetKind === 'IMAGE' }" @click="assetKind = 'IMAGE'">图片<span>{{ imageAssets.length }}</span></button>
                <button type="button" role="tab" :aria-selected="assetKind === 'VIDEO'" :class="{ 'is-active': assetKind === 'VIDEO' }" @click="assetKind = 'VIDEO'">视频<span>{{ videoAssets.length }}</span></button>
              </div>
              <div v-if="visibleAssets.length" ref="assetGrid" class="works-asset-grid">
                <button v-for="asset in visibleAssets" :key="asset.id" type="button" :class="{ 'is-selected': draft.assetIds.includes(asset.id) }" @click="toggleAsset(asset.id)">
                  <video v-if="asset.kind === 'VIDEO'" :src="mediaUrl(asset.contentUrl)" muted playsinline preload="metadata" />
                  <img v-else :src="mediaUrl(asset.contentUrl)" :alt="asset.name" loading="lazy" />
                  <span>{{ selectedAssetIndex(asset.id) || '' }}</span>
                </button>
              </div>
              <div v-else class="works-editor__empty"><ImageIcon :size="22" /><p>{{ assetKind === 'VIDEO' ? '文件库里还没有视频。' : '文件库里还没有图片。' }}</p><RouterLink to="/workspace?tab=files" @click="closeEditor">前往文件库</RouterLink></div>
            </template>
          </section>
        </div>
        <p v-if="editorMessage" class="works-feedback" :class="{ 'is-error': editorError }">{{ editorMessage }}</p>
        <footer><button type="button" @click="closeEditor">取消</button><button class="works-primary" type="submit" :disabled="saving || !draft.title || !draft.assetIds.length">{{ saving ? '发布中' : draft.visibility === 'PRIVATE' ? '保存作品' : '发布到广场' }}</button></footer>
      </form>
    </div>

    <div v-if="detailWork" class="works-modal-layer" @click.self="detailWork = null">
      <section class="work-detail" role="dialog" aria-modal="true" aria-labelledby="work-detail-title">
        <header><div><span>{{ detailWork.version.category }}</span><h2 id="work-detail-title">{{ detailWork.version.title }}</h2></div><button type="button" aria-label="关闭" @click="detailWork = null"><X :size="19" /></button></header>
        <div class="work-detail__media">
          <template v-for="asset in detailWork.version.assets" :key="asset.id"><video v-if="asset.kind === 'VIDEO'" :src="mediaUrl(asset.contentUrl)" controls playsinline /><img v-else :src="mediaUrl(asset.contentUrl)" :alt="asset.caption || detailWork.version.title" /></template>
        </div>
        <aside><div class="work-detail__author"><span>{{ detailWork.author.name.slice(0, 1) }}</span><div><strong>{{ detailWork.author.name }}</strong><small>{{ detailWork.author.followerCount || 0 }} 位关注者</small></div><button v-if="auth.isAuthenticated && detailWork.author.id !== auth.session?.id" type="button" @click="toggleFollow(detailWork.author.id)">{{ followingAuthor ? '已关注' : '关注' }}</button></div><p>{{ detailWork.version.description || '作者暂未填写作品简介。' }}</p><div v-if="detailWork.version.tags.length" class="work-detail__tags"><span v-for="tag in detailWork.version.tags" :key="tag">{{ tag }}</span></div><details v-if="detailWork.version.publicPrompt"><summary>查看公开提示词</summary><pre>{{ detailWork.version.publicPrompt }}</pre></details><footer><button type="button" :disabled="!auth.isAuthenticated" @click="toggleLike(detailWork)"><Heart :size="16" :fill="detailLiked ? 'currentColor' : 'none'" />{{ detailWork.likeCount }}</button><span><Eye :size="15" />{{ detailWork.viewCount }}</span><button v-if="auth.isAuthenticated && detailWork.author.id !== auth.session?.id" type="button" @click="reportOpen = !reportOpen"><Flag :size="15" />举报</button></footer><form v-if="reportOpen" class="work-report" @submit.prevent="submitReport"><select v-model="reportReason"><option value="不当内容">不当内容</option><option value="侵权内容">侵权内容</option><option value="虚假或误导">虚假或误导</option><option value="其他问题">其他问题</option></select><textarea v-model.trim="reportDetails" maxlength="2000" rows="3" placeholder="补充说明（可选）" /><button type="submit">提交举报</button></form></aside>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { CircleAlert, Compass, ExternalLink, Eye, Flag, FolderHeart, Heart, Image as ImageIcon, Images, LoaderCircle, LockKeyhole, Pencil, Plus, RefreshCw, Search, Send, Trash2, X } from 'lucide-vue-next'
import { api, apiUrl } from '../services/api'
import { useEscapeClose } from '../composables/useEscapeClose'
import { formatDayTime as formatDate } from '../utils/datetime'
import { moderationLabel, moderationTone } from '../utils/status-labels'
import EmptyState from '../components/common/EmptyState.vue'
import SectionHeader from '../components/common/SectionHeader.vue'
import StatusPill from '../components/common/StatusPill.vue'
import WorkspaceSectionTabs from '../components/WorkspaceSectionTabs.vue'
import { useAuthStore } from '../stores/auth'

type WorkAsset = { id: string; name: string; kind: 'IMAGE' | 'VIDEO'; mimeType: string; contentUrl: string; caption?: string }
type WorkVersion = { id: string; versionNumber: number; title: string; description: string; category: string; tags: string[]; visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'; authorDisplay: 'PROFILE' | 'CUSTOM' | 'HIDDEN'; customAuthor: string; publicPrompt: string; moderationStatus: string; rejectionReason: string; assets: WorkAsset[] }
type PublicWork = { id: string; slug: string; isFeatured: boolean; viewCount: number; likeCount: number; publishedAt: string; author: { id: string; name: string; avatarUrl?: string | null; followerCount?: number }; version: WorkVersion }
type MyWork = PublicWork & { lifecycleStatus: string; updatedAt: string; currentVersion: WorkVersion; publishedVersion?: WorkVersion | null; _count?: { versions: number; likes: number; reports: number } }
type LibraryAsset = { id: string; name: string; kind: 'IMAGE' | 'VIDEO'; contentUrl: string; metadata?: { prompt?: string } | null }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const activeView = ref<'gallery' | 'mine'>(route.query.view === 'mine' ? 'mine' : 'gallery')
const loading = ref(false)
const loadingMore = ref(false)
const loadingMine = ref(false)
const galleryError = ref('')
const mineError = ref('')
const galleryItems = ref<PublicWork[]>([])
const galleryCursor = ref<string | null>(null)
const galleryQuery = ref('')
const galleryCategory = ref('')
const gallerySort = ref('featured')
const myWorks = ref<MyWork[]>([])
const editorOpen = ref(false)
const editingId = ref('')
const saving = ref(false)
const assetsLoading = ref(false)
const assetsError = ref('')
const availableAssets = ref<LibraryAsset[]>([])
const assetKind = ref<'IMAGE' | 'VIDEO'>('IMAGE')
const assetGrid = ref<HTMLElement | null>(null)
const imageAssets = computed(() => availableAssets.value.filter((item) => item.kind === 'IMAGE'))
const videoAssets = computed(() => availableAssets.value.filter((item) => item.kind === 'VIDEO'))
const visibleAssets = computed(() => assetKind.value === 'VIDEO' ? videoAssets.value : imageAssets.value)
const editorMessage = ref('')
const editorError = ref(false)
const detailWork = ref<PublicWork | null>(null)
const detailLiked = ref(false)
const followingAuthor = ref(false)
const reportOpen = ref(false)
const reportReason = ref('不当内容')
const reportDetails = ref('')
const categories = ['品牌视觉', '商品设计', '人物肖像', '插画艺术', '空间建筑', '影视短片', '创意作品']
const draft = reactive({ title: '', description: '', category: '创意作品', tagsText: '', visibility: 'PUBLIC' as WorkVersion['visibility'], authorDisplay: 'PROFILE' as WorkVersion['authorDisplay'], customAuthor: '', publicPrompt: '', assetIds: [] as string[] })

const galleryParams = computed(() => new URLSearchParams({ ...(galleryQuery.value ? { q: galleryQuery.value } : {}), ...(galleryCategory.value ? { category: galleryCategory.value } : {}), sort: gallerySort.value, limit: '24' }))

onMounted(async () => {
  await loadGallery()
  const publishAsset = typeof route.query.asset === 'string' ? route.query.asset : ''
  const workSlug = typeof route.query.work === 'string' ? route.query.work : ''
  const wantMine = route.query.view === 'mine' || Boolean(publishAsset)
  if (wantMine || (auth.isAuthenticated && !galleryItems.value.length && !galleryError.value)) {
    activeView.value = 'mine'
    if (!wantMine) await router.replace({ path: '/works', query: { view: 'mine' } })
    if (auth.isAuthenticated) await loadMine()
    if (publishAsset && auth.isAuthenticated) {
      await openCreate({
        assetId: publishAsset,
        title: typeof route.query.title === 'string' ? route.query.title : '',
      })
    }
  }
  if (workSlug) await openPublicWork({ slug: workSlug })
})
watch(() => route.query.view, (value) => {
  const nextView = value === 'mine' ? 'mine' : 'gallery'
  if (activeView.value === nextView) return
  activeView.value = nextView
  if (nextView === 'mine' && auth.isAuthenticated && !myWorks.value.length) void loadMine()
  if (nextView === 'gallery' && !galleryItems.value.length) void loadGallery()
})
watch(() => route.query.asset, async (asset, previous) => {
  if (!asset || asset === previous || typeof asset !== 'string' || !auth.isAuthenticated) return
  activeView.value = 'mine'
  await openCreate({ assetId: asset, title: typeof route.query.title === 'string' ? route.query.title : '' })
})
watch(() => route.query.work, (slug, previous) => {
  if (!slug || slug === previous || typeof slug !== 'string') return
  void openPublicWork({ slug })
})

function mediaUrl(value?: string) { return value ? apiUrl(value) : '' }
function cover(work: PublicWork | MyWork, current = false) { return (current && 'currentVersion' in work ? work.currentVersion : work.version || ('publishedVersion' in work ? work.publishedVersion : null))?.assets?.[0] }
const statusText = (value: string) => moderationLabel(value, value)
const statusTone = moderationTone
function visibilityText(value: string) { return ({ PRIVATE: '私密', UNLISTED: '仅链接', PUBLIC: '公开' } as Record<string, string>)[value] || value }

async function switchView(value: 'gallery' | 'mine') {
  activeView.value = value
  await router.replace({ path: '/works', query: value === 'mine' ? { view: 'mine' } : {} })
  if (value === 'mine' && auth.isAuthenticated && !myWorks.value.length) await loadMine()
}

async function loadGallery() {
  loading.value = true
  galleryError.value = ''
  try { const result = await api<{ items: PublicWork[]; nextCursor: string | null }>(`/gallery?${galleryParams.value}`); galleryItems.value = result.items; galleryCursor.value = result.nextCursor }
  catch (reason) { galleryError.value = reason instanceof Error ? reason.message : '作品加载失败，请稍后重试' }
  finally { loading.value = false }
}

async function loadMore() {
  if (!galleryCursor.value) return
  loadingMore.value = true
  galleryError.value = ''
  try { const result = await api<{ items: PublicWork[]; nextCursor: string | null }>(`/gallery?${galleryParams.value}&cursor=${encodeURIComponent(galleryCursor.value)}`); galleryItems.value.push(...result.items); galleryCursor.value = result.nextCursor }
  catch (reason) { galleryError.value = reason instanceof Error ? reason.message : '更多作品加载失败，请稍后重试' }
  finally { loadingMore.value = false }
}

async function loadMine() { loadingMine.value = true; mineError.value = ''; try { myWorks.value = await api<MyWork[]>('/works') } catch (reason) { mineError.value = reason instanceof Error ? reason.message : '我的作品加载失败，请稍后重试' } finally { loadingMine.value = false } }
async function loadAssets(force = false) { if (!force && availableAssets.value.length) return; assetsLoading.value = true; assetsError.value = ''; try { availableAssets.value = (await api<LibraryAsset[]>('/assets')).filter((item) => ['IMAGE', 'VIDEO'].includes(item.kind)) } catch (reason) { assetsError.value = reason instanceof Error ? reason.message : '文件库加载失败，请稍后重试' } finally { assetsLoading.value = false } }

function resetDraft() { Object.assign(draft, { title: '', description: '', category: '创意作品', tagsText: '', visibility: 'PUBLIC', authorDisplay: 'PROFILE', customAuthor: '', publicPrompt: '', assetIds: [] }) }
function focusAssetKind(assetId?: string) {
  const asset = availableAssets.value.find((item) => item.id === assetId)
  assetKind.value = asset?.kind || (imageAssets.value.length || !videoAssets.value.length ? 'IMAGE' : 'VIDEO')
}
function untitledAssetName(name = '') { return name.replace(/\.[a-z0-9]{2,5}$/i, '').trim().slice(0, 120) }
function promptFromAsset(id?: string) { return availableAssets.value.find((item) => item.id === id)?.metadata?.prompt?.trim() || '' }
async function openCreate(prefill?: { assetId?: string; title?: string }) {
  resetDraft()
  editingId.value = ''
  editorMessage.value = ''
  editorOpen.value = true
  await loadAssets()
  const preferred = prefill?.assetId && availableAssets.value.some((item) => item.id === prefill.assetId)
    ? prefill.assetId
    : availableAssets.value[0]?.id
  if (preferred) draft.assetIds = [preferred]
  const named = availableAssets.value.find((item) => item.id === preferred)
  focusAssetKind(preferred)
  draft.title = untitledAssetName(prefill?.title || named?.name || '')
  draft.publicPrompt = promptFromAsset(preferred)
}
async function openEdit(work: MyWork) { editingId.value = work.id; const value = work.currentVersion; Object.assign(draft, { title: value.title, description: value.description, category: value.category, tagsText: value.tags.join('，'), visibility: value.visibility, authorDisplay: value.authorDisplay, customAuthor: value.customAuthor, publicPrompt: value.publicPrompt, assetIds: value.assets.map((item) => item.id) }); editorMessage.value = ''; editorOpen.value = true; await loadAssets(); focusAssetKind(value.assets[0]?.id) }
function closeEditor() { editorOpen.value = false; editorMessage.value = '' }

// 编辑弹层压在详情之上，所以详情的 Esc 只在编辑关闭时生效。
useEscapeClose(closeEditor, { enabled: () => editorOpen.value })
useEscapeClose(() => { detailWork.value = null }, { enabled: () => !editorOpen.value && Boolean(detailWork.value) })
watch(assetKind, () => assetGrid.value?.scrollTo({ top: 0 }))
function toggleAsset(id: string) {
  const index = draft.assetIds.indexOf(id)
  if (index >= 0) draft.assetIds.splice(index, 1)
  else if (draft.assetIds.length < 20) {
    draft.assetIds.push(id)
    if (!draft.publicPrompt) draft.publicPrompt = promptFromAsset(id)
  }
}
function selectedAssetIndex(id: string) { const index = draft.assetIds.indexOf(id); return index >= 0 ? index + 1 : 0 }

async function saveWork() {
  saving.value = true; editorMessage.value = ''; editorError.value = false
  try {
    const payload = { title: draft.title, description: draft.description, category: draft.category, tags: draft.tagsText.split(/[，,]/).map((item) => item.trim()).filter(Boolean), visibility: draft.visibility, authorDisplay: draft.authorDisplay, customAuthor: draft.customAuthor, publicPrompt: draft.publicPrompt, assetIds: draft.assetIds }
    const saved = editingId.value
      ? await api<MyWork>(`/works/${editingId.value}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await api<MyWork>('/works', { method: 'POST', body: JSON.stringify(payload) })
    if (draft.visibility !== 'PRIVATE') await api(`/works/${saved.id}/submit`, { method: 'POST' })
    await loadMine()
    await loadGallery()
    closeEditor()
    if (draft.visibility === 'PUBLIC') {
      activeView.value = 'gallery'
      await router.replace({ path: '/works' })
    }
  } catch (reason) { editorError.value = true; editorMessage.value = reason instanceof Error ? reason.message : '作品保存失败' }
  finally { saving.value = false }
}

async function submitWork(work: MyWork) { try { await api(`/works/${work.id}/submit`, { method: 'POST' }); await loadMine() } catch (reason) { window.alert(reason instanceof Error ? reason.message : '提交审核失败') } }
async function removeWork(work: MyWork) { if (!window.confirm(`删除作品“${work.currentVersion.title}”？`)) return; await api(`/works/${work.id}`, { method: 'DELETE' }); await loadMine() }

async function openPublicWork(work: Pick<PublicWork, 'slug'> | PublicWork | MyWork) {
  const slug = work.slug
  try { detailWork.value = await api<PublicWork>(`/gallery/${slug}`); reportOpen.value = false; reportDetails.value = ''; await api(`/gallery/${slug}/view`, { method: 'POST' }).catch(() => undefined); if (detailWork.value) detailWork.value.viewCount += 1 }
  catch (reason) { window.alert(reason instanceof Error ? reason.message : '作品暂时无法查看') }
}

async function toggleLike(work: PublicWork) { if (!auth.isAuthenticated) return router.push('/login?redirect=/works'); const result = await api<{ liked: boolean; likeCount: number }>(`/works/${work.id}/like`, { method: 'POST' }); detailLiked.value = result.liked; work.likeCount = result.likeCount; const card = galleryItems.value.find((item) => item.id === work.id); if (card) card.likeCount = result.likeCount }
async function toggleFollow(userId: string) { const result = await api<{ following: boolean }>(`/works/creators/${userId}/follow`, { method: 'POST' }); followingAuthor.value = result.following }
async function submitReport() { if (!detailWork.value) return; await api(`/works/${detailWork.value.id}/report`, { method: 'POST', body: JSON.stringify({ reason: reportReason.value, details: reportDetails.value }) }); reportOpen.value = false; reportDetails.value = ''; window.alert('举报已提交，平台会尽快处理') }
</script>

<style scoped>
.works-page { box-sizing: border-box; color: var(--studio-text); margin: 0 auto; max-width: 1240px; min-height: 100%; padding: 34px clamp(18px, 4vw, 54px) 60px; width: 100%; }
.works-page__header { align-items: flex-end; margin-bottom: 22px; }
.works-page h1,.works-page h2,.works-page p { margin: 0; }
.works-page__header :deep(.section-header__title) { font-size: 26px; font-weight: 680; line-height: 1.3; }
.works-primary { align-items: center; background: var(--studio-inverse-bg, #f4f4f5); border: 0; border-radius: 7px; color: var(--studio-inverse-text, #18181b); display: inline-flex; font-weight: 600; gap: 7px; min-height: 38px; padding: 0 14px; text-decoration: none; }
.works-view-switch { border-bottom: 1px solid var(--studio-border); display: flex; gap: 22px; margin-bottom: 20px; }
.works-view-switch button { align-items: center; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--studio-muted); display: inline-flex; font-size: 13px; gap: 7px; min-height: 42px; padding: 0 2px; }
.works-view-switch button.is-active { border-bottom-color: var(--studio-text); color: var(--studio-text); font-weight: 650; }
.works-toolbar { align-items: center; display: grid; gap: 8px; grid-template-columns: minmax(220px, 1fr) 150px 130px 38px; margin-bottom: 18px; }
.works-toolbar label { align-items: center; background: var(--studio-input); border: 1px solid var(--studio-border); border-radius: 7px; color: var(--studio-muted); display: flex; gap: 8px; height: 38px; padding: 0 10px; }
.works-toolbar input,.works-toolbar select,.works-editor input,.works-editor select,.works-editor textarea,.work-report select,.work-report textarea { background: var(--studio-input); border: 1px solid var(--studio-border); border-radius: 7px; color: var(--studio-text); font: inherit; outline: none; }
.works-editor select,.work-report select { padding: 9px 28px 9px 10px; }
.works-toolbar input { background: transparent; border: 0; min-width: 0; width: 100%; }
.works-toolbar select { height: 38px; padding: 0 28px 0 9px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; }
.works-toolbar > button { align-items: center; background: var(--studio-control); border: 1px solid var(--studio-border); border-radius: 7px; color: var(--studio-text); display: flex; height: 38px; justify-content: center; }
.works-grid { display: grid; gap: 18px 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.work-card { min-width: 0; }
.work-card__preview { aspect-ratio: 4 / 3; background: var(--studio-control); border: 1px solid var(--studio-border); border-radius: 8px; display: block; overflow: hidden; padding: 0; position: relative; width: 100%; }
.work-card__preview img,.work-card__preview video { height: 100%; object-fit: cover; transition: transform 180ms ease; width: 100%; }
.work-card__preview:hover img,.work-card__preview:hover video { transform: scale(1.018); }
.work-card__preview > span { align-items: center; color: var(--studio-muted); display: flex; height: 100%; justify-content: center; }
.work-card__preview em { background: rgba(20,20,20,.76); border-radius: 4px; color: #fff; font-size: 10px; font-style: normal; left: 8px; padding: 4px 6px; position: absolute; top: 8px; }
.work-card__copy { padding: 9px 2px 0; }
.work-card__copy > button { background: transparent; border: 0; color: inherit; display: grid; gap: 3px; padding: 0; text-align: left; width: 100%; }
.work-card__copy strong,.work-card__copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.work-card__copy strong { font-size: 13px; }
.work-card__copy small,.work-card__copy footer { color: var(--studio-muted); font-size: 10px; }
.work-card__copy footer { align-items: center; display: flex; justify-content: space-between; margin-top: 7px; }
.work-card__copy footer span:last-child { align-items: center; display: flex; gap: 4px; }
.works-state { align-items: center; color: var(--studio-muted); display: flex; gap: 9px; justify-content: center; min-height: 220px; }
.works-page :deep(.empty-state) { min-height: 220px; }
.works-load-error { align-items: center; background: color-mix(in srgb, var(--canvas-danger, #db4b4b) 8%, var(--studio-panel)); border: 1px solid color-mix(in srgb, var(--canvas-danger, #db4b4b) 28%, var(--studio-border)); border-radius: 8px; color: var(--canvas-danger, #db4b4b); display: flex; font-size: 12px; gap: 16px; justify-content: space-between; margin: 0 0 18px; padding: 11px 12px; }
.works-load-error > span,.works-load-error button { align-items: center; display: inline-flex; gap: 7px; }
.works-load-error button,.works-editor__empty--error button { background: var(--studio-panel); border: 1px solid var(--studio-border); border-radius: 7px; color: var(--studio-text); min-height: 36px; padding: 0 11px; }
.works-load-error--center { margin-top: 12px; }
.works-load-more { background: transparent; border: 1px solid var(--studio-border); border-radius: 7px; color: var(--studio-text); display: block; margin: 28px auto 0; min-height: 36px; padding: 0 18px; }
.works-spin { animation: works-spin 900ms linear infinite; }
@keyframes works-spin { to { transform: rotate(360deg); } }
.my-works-list { border-top: 1px solid var(--studio-border); display: grid; }
.my-works-list > article { align-items: center; border-bottom: 1px solid var(--studio-border); display: grid; gap: 14px; grid-template-columns: 96px minmax(0, 1fr) auto; min-height: 112px; padding: 12px 4px; }
.my-work-cover { align-items: center; aspect-ratio: 4 / 3; background: var(--studio-control); border: 1px solid var(--studio-border); border-radius: 7px; color: var(--studio-muted); display: flex; justify-content: center; overflow: hidden; padding: 0; width: 96px; }
.my-work-cover img,.my-work-cover video { height: 100%; object-fit: cover; width: 100%; }
.my-works-list article > div { display: grid; gap: 5px; min-width: 0; }
.my-works-list article > div > span { align-items: center; display: flex; gap: 8px; }
.my-works-list article strong { font-size: 14px; }
.my-works-list .is-error { color: var(--studio-danger); }
.my-works-list article p,.my-works-list article small { color: var(--studio-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.my-works-list nav { display: flex; gap: 4px; }
.my-works-list nav button,.works-editor header > button,.work-detail > header button { align-items: center; background: transparent; border: 0; border-radius: 6px; color: var(--studio-muted); display: flex; height: 32px; justify-content: center; width: 32px; }
.my-works-list nav button:hover { background: var(--studio-control); color: var(--studio-text); }
.works-modal-layer { align-items: center; background: rgba(0,0,0,.58); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 520; }
.works-editor { background: var(--studio-panel); border: 1px solid var(--studio-border); border-radius: 9px; box-shadow: var(--studio-shadow-lg); color: var(--studio-text); display: grid; max-height: calc(100dvh - 36px); overflow: hidden; width: min(960px, 100%); }
.works-editor > header,.work-detail > header { align-items: flex-start; border-bottom: 1px solid var(--studio-border); display: flex; justify-content: space-between; padding: 17px 18px; }
.works-editor h2,.work-detail h2 { font-size: 17px; }
.works-editor header p { color: var(--studio-muted); font-size: 10px; margin-top: 4px; }
.works-editor__body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, .9fr); min-height: 0; overflow-y: auto; }
.works-editor__fields,.works-asset-picker { display: grid; gap: 13px; padding: 18px; }
.works-editor__fields { border-right: 1px solid var(--studio-border); }
.works-editor label { display: grid; font-size: 11px; gap: 6px; }
.works-editor input,.works-editor select { height: 38px; padding: 0 10px; }
.works-editor textarea { line-height: 1.55; padding: 9px 10px; resize: vertical; }
.works-editor__row { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.works-asset-picker { align-content: start; }
.works-asset-picker > header { align-items: flex-start; display: flex; justify-content: space-between; }
.works-asset-picker > header div { display: grid; gap: 3px; }
.works-asset-picker > header strong { font-size: 12px; }.works-asset-picker > header small,.works-asset-picker > header > span { color: var(--studio-muted); font-size: 10px; }
.works-asset-kind { display: flex; gap: 6px; }
.works-asset-kind button { align-items: center; background: transparent; border: 1px solid var(--studio-border); border-radius: 999px; color: var(--studio-muted); display: inline-flex; font-size: 12px; gap: 6px; min-height: 32px; padding: 0 12px; }
.works-asset-kind button span { color: var(--studio-muted); font-size: 10px; }
.works-asset-kind button.is-active { background: var(--studio-brand-soft, color-mix(in srgb, var(--studio-brand) 12%, transparent)); border-color: transparent; color: var(--studio-brand); }
.works-asset-kind button.is-active span { color: var(--studio-brand); }
.works-asset-grid { align-content: start; align-items: start; display: grid; gap: 7px; grid-auto-rows: max-content; grid-template-columns: repeat(3, minmax(0, 1fr)); max-height: 420px; overflow-y: auto; }
.works-asset-grid button { background: var(--studio-control); border: 2px solid transparent; border-radius: 7px; display: block; overflow: hidden; padding: 0; position: relative; width: 100%; }
.works-asset-grid button.is-selected { border-color: #4386e8; }
.works-asset-grid img,.works-asset-grid video { aspect-ratio: 1; display: block; height: auto; object-fit: cover; width: 100%; }
.works-asset-grid button span { align-items: center; background: #4386e8; border-radius: 50%; color: #fff; display: none; font-size: 10px; height: 20px; justify-content: center; position: absolute; right: 5px; top: 5px; width: 20px; }.works-asset-grid button.is-selected span { display: flex; }
.works-editor__empty { align-items: center; color: var(--studio-muted); display: flex; flex-direction: column; font-size: 11px; gap: 7px; min-height: 180px; justify-content: center; }.works-editor__empty a { color: var(--studio-link); }
.works-editor__empty--error { color: var(--canvas-danger, #db4b4b); text-align: center; }
.works-feedback { color: #58a878; font-size: 11px; padding: 0 18px; }.works-feedback.is-error { color: #df6767; }
.works-editor > footer { border-top: 1px solid var(--studio-border); display: flex; gap: 8px; justify-content: flex-end; padding: 12px 18px; }.works-editor > footer > button { border: 1px solid var(--studio-border); border-radius: 7px; min-height: 36px; padding: 0 14px; }
.work-detail { background: var(--studio-panel); border: 1px solid var(--studio-border); border-radius: 9px; box-shadow: var(--studio-shadow-lg); color: var(--studio-text); display: grid; grid-template-columns: minmax(0, 1fr) 310px; grid-template-rows: auto minmax(0, 1fr); max-height: calc(100dvh - 36px); overflow: hidden; width: min(1060px, 100%); }
.work-detail > header { grid-column: 1 / -1; }.work-detail > header span { color: var(--studio-muted); font-size: 10px; }.work-detail__media { background: #111; display: grid; gap: 2px; min-height: 0; overflow-y: auto; }.work-detail__media img,.work-detail__media video { display: block; max-height: 72vh; object-fit: contain; width: 100%; }
.work-detail > aside { display: flex; flex-direction: column; gap: 16px; overflow-y: auto; padding: 18px; }.work-detail > aside > p { color: var(--studio-muted); font-size: 12px; line-height: 1.65; }
.work-detail__author { align-items: center; display: grid; gap: 9px; grid-template-columns: 36px minmax(0, 1fr) auto; }.work-detail__author > span { align-items: center; background: var(--studio-control); border-radius: 50%; display: flex; height: 36px; justify-content: center; }.work-detail__author div { display: grid; }.work-detail__author strong { font-size: 12px; }.work-detail__author small { color: var(--studio-muted); font-size: 9px; }.work-detail__author button { background: var(--studio-control); border: 1px solid var(--studio-border); border-radius: 6px; color: inherit; min-height: 30px; padding: 0 9px; }
.work-detail__tags { display: flex; flex-wrap: wrap; gap: 5px; }.work-detail__tags span { background: var(--studio-control); border-radius: 4px; color: var(--studio-muted); font-size: 9px; padding: 4px 6px; }
.work-detail details { border-top: 1px solid var(--studio-border); padding-top: 12px; }.work-detail summary { color: var(--studio-muted); cursor: pointer; font-size: 11px; }.work-detail pre { background: var(--studio-control); border-radius: 6px; font: inherit; font-size: 10px; margin: 9px 0 0; max-height: 180px; overflow: auto; padding: 10px; white-space: pre-wrap; }
.work-detail aside > footer { align-items: center; border-top: 1px solid var(--studio-border); display: flex; gap: 8px; margin-top: auto; padding-top: 13px; }.work-detail aside > footer button,.work-detail aside > footer span { align-items: center; background: transparent; border: 0; color: var(--studio-muted); display: flex; font-size: 11px; gap: 5px; padding: 5px; }
.work-report { display: grid; gap: 7px; }.work-report select { height: 34px; padding: 0 8px; }.work-report textarea { padding: 8px; resize: vertical; }.work-report button { background: var(--studio-inverse-bg); border: 0; border-radius: 6px; color: var(--studio-inverse-text); min-height: 34px; }
@media (max-width: 900px) { .works-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }.works-editor__body { grid-template-columns: 1fr; }.works-editor__fields { border-bottom: 1px solid var(--studio-border); border-right: 0; }.work-detail { grid-template-columns: 1fr; overflow-y: auto; }.work-detail__media { max-height: 55vh; }.work-detail > aside { overflow: visible; } }
@media (max-width: 640px) { .works-page { padding: 18px 12px 40px; }.works-page__header { align-items: flex-start; flex-direction: column; }.works-toolbar { grid-template-columns: 1fr 1fr 44px; }.works-toolbar label { grid-column: 1 / -1; }.works-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.my-works-list > article { grid-template-columns: 78px minmax(0, 1fr); }.my-work-cover { width: 78px; }.my-works-list nav { grid-column: 2; }.my-works-list nav button,.works-editor header > button,.work-detail > header button { height: 44px; width: 44px; }.works-view-switch button,.works-primary,.works-empty button,.works-empty a,.works-load-more,.works-load-error button,.works-editor__empty--error button { min-height: 44px; }.works-load-error { align-items: flex-start; flex-direction: column; }.works-editor__row { grid-template-columns: 1fr; }.works-asset-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }.works-modal-layer { padding: 0; }.works-editor { border-radius: 0; max-height: 100dvh; min-height: 100dvh; }.work-detail { border-radius: 0; display: block; max-height: 100dvh; min-height: 100dvh; overflow-y: auto; }.work-detail__media { max-height: none; }.work-detail__media img,.work-detail__media video { height: auto; max-height: 52vh; }.work-detail aside > footer button,.work-detail__author button,.work-report button { min-height: 44px; } }

/* ===== 精修 v2 ===== */
/* 主按钮统一品牌蓝 */
.works-primary, .works-empty button, .works-empty a { background: var(--studio-brand); border-radius: var(--studio-radius-pill); color: #fff; min-height: 40px; padding: 0 18px; transition: background var(--studio-duration-fast) ease, box-shadow var(--studio-duration-fast) ease; }
.works-primary:hover, .works-empty button:hover, .works-empty a:hover { background: var(--studio-brand-hover); box-shadow: 0 6px 18px color-mix(in srgb, var(--studio-brand) 32%, transparent); }

/* 次级按钮：描边胶囊（空态跳转等） */
.works-secondary { align-items: center; background: var(--studio-panel); border: 1px solid var(--studio-border); border-radius: var(--studio-radius-pill); color: var(--studio-text); display: inline-flex; gap: 7px; min-height: 40px; padding: 0 18px; text-decoration: none; transition: border-color var(--studio-duration-fast) ease, color var(--studio-duration-fast) ease; }
.works-secondary:hover { border-color: var(--studio-brand); color: var(--studio-brand); }

/* 视图切换：品牌色指示条 */
.works-view-switch { gap: 26px; }
.works-view-switch button { transition: color var(--studio-duration-fast) ease, border-color var(--studio-duration-fast) ease; }
.works-view-switch button:hover:not(.is-active) { color: var(--studio-text); }
.works-view-switch button.is-active { border-bottom-color: var(--studio-brand); border-bottom-width: 3px; color: var(--studio-brand); font-weight: 650; }

/* 工具行：更高更圆，聚焦品牌描边 */
.works-toolbar { grid-template-columns: minmax(220px, 1fr) 150px 130px 40px; }
.works-toolbar label, .works-toolbar select, .works-toolbar > button { border-radius: var(--studio-radius-md); height: 40px; transition: border-color var(--studio-duration-fast) ease, box-shadow var(--studio-duration-fast) ease; }
.works-toolbar label:focus-within { border-color: var(--studio-focus); box-shadow: 0 0 0 3px var(--studio-brand-soft); color: var(--studio-brand); }
.works-toolbar select:focus { border-color: var(--studio-focus); box-shadow: 0 0 0 3px var(--studio-brand-soft); }
.works-toolbar > button:hover { border-color: color-mix(in srgb, var(--studio-brand) 35%, var(--studio-border)); color: var(--studio-brand); }

/* 作品卡片：圆角加大 + 悬浮上浮投影 */
.work-card__preview { border-radius: 12px; transition: border-color var(--studio-duration-base) ease, box-shadow var(--studio-duration-base) ease, transform var(--studio-duration-base) var(--studio-ease); }
.work-card__preview:hover { border-color: color-mix(in srgb, var(--studio-brand) 32%, var(--studio-border)); box-shadow: var(--studio-shadow-sm); transform: translateY(-3px); }

/* 空态：品牌柔光图标座 + 更舒展的排版 */
.works-empty { border: 1px dashed var(--studio-border); border-radius: var(--studio-radius-lg); margin-top: 8px; min-height: 320px; }
.works-empty > span { background: var(--studio-brand-soft); border: 0; border-radius: 18px; color: var(--studio-brand); height: 64px; margin-bottom: 6px; width: 64px; }
.works-empty strong { font-size: 16px; }
.works-empty p { max-width: 320px; }

/* 加载更多：胶囊 */
.works-load-more { border-radius: var(--studio-radius-pill); min-height: 40px; transition: border-color var(--studio-duration-fast) ease, color var(--studio-duration-fast) ease; }
.works-load-more:hover:not(:disabled) { border-color: var(--studio-brand); color: var(--studio-brand); }

/* 我的作品行：悬浮底色 */
.my-works-list > article { border-radius: var(--studio-radius-md); padding: 12px 10px; transition: background var(--studio-duration-fast) ease; }
.my-works-list > article:hover { background: var(--studio-panel-soft); }

@media (prefers-reduced-motion: reduce) { .works-primary, .works-view-switch button, .works-toolbar label, .works-toolbar select, .works-toolbar > button, .work-card__preview, .works-load-more, .my-works-list > article { transition: none; } .work-card__preview:hover { transform: none; } }
@media (max-width: 640px) {
  .works-toolbar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 44px; }
  .works-toolbar label, .works-toolbar select, .works-toolbar > button { height: 44px; min-width: 0; }
}
</style>
