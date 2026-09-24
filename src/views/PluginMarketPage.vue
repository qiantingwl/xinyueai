<template>
  <main class="plugin-market-page">
    <div class="plugin-market-inner">
      <header v-if="!embedded" class="plugin-market-header">
        <div><h1>技能</h1><p>安装官方技能，或创建仅自己可用的私有技能</p></div>
        <div class="plugin-header-actions"><button type="button" @click="pickSkillFile()"><Upload :size="16" />导入 Skill</button><button class="plugin-primary-action" type="button" @click="openEditor()"><Plus :size="16" />创建技能</button></div>
      </header>

      <nav class="plugin-tabs" aria-label="技能视图">
        <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}<span>{{ tab.count }}</span></button>
      </nav>

      <section v-if="activeTab === 'market'" class="plugin-filter-bar">
        <label v-if="!embedded"><Search :size="15" /><input v-model="query" placeholder="搜索技能" /></label>
        <div><button type="button" :class="{ active: !category }" @click="category = ''">全部</button><button v-for="item in categories" :key="item.id" type="button" :class="{ active: category === item.slug }" @click="category = item.slug">{{ item.name }}</button></div>
      </section>
      <section v-else-if="activeTab === 'external'" class="plugin-filter-bar plugin-external-filter">
        <label v-if="!embedded"><Search :size="15" /><input v-model="query" placeholder="搜索外部 Skills" /></label>
        <div><button type="button" :class="{ active: !externalCategory }" @click="externalCategory = ''">全部技能</button><button v-for="item in externalCategories" :key="item" type="button" :class="{ active: externalCategory === item }" @click="externalCategory = item">{{ item }}</button></div>
      </section>

      <div v-if="error" class="plugin-feedback" role="alert"><CircleAlert :size="16" /><span>{{ error }}</span><button type="button" @click="loadAll">重试</button></div>
      <div v-else-if="notice" class="plugin-feedback plugin-feedback--success" role="status"><Check :size="16" /><span>{{ notice }}</span><button type="button" aria-label="关闭提示" @click="notice = ''"><X :size="15" /></button></div>
      <div v-else-if="activeTab === 'external' && externalNotice" class="plugin-feedback plugin-feedback--policy" role="status"><ShieldCheck :size="16" /><span>{{ externalNotice }}</span></div>
      <section v-if="loading" class="plugin-empty"><LoaderCircle class="plugin-spin" :size="22" /><span>正在加载技能</span></section>
      <template v-else-if="activeTab === 'external' && externalItems.length">
        <section class="plugin-grid">
          <article v-for="skill in externalItems" :key="`${skill.source}:${skill.id}`" class="plugin-card plugin-card--external">
            <header><div><strong>{{ displayExternalSkillName(skill.name) }}</strong><small>{{ skill.category || '通用技能' }}<template v-if="skill.author"> · {{ skill.author }}</template><template v-if="skill.version"> · v{{ skill.version }}</template></small></div><em>{{ skill.licenseStatus === 'restricted' ? '商业限制待核验' : '许可证待核验' }}</em></header>
            <p>{{ skill.description || '外部市场技能，安装前会在服务端进行格式与安全检查。' }}<small v-if="skill.licenseNote" class="plugin-license-note">{{ skill.licenseNote }}</small></p>
            <div class="plugin-capabilities"><span>{{ skill.installable ? '可直接安装' : '仅供浏览' }}</span><span>{{ skill.risk === 'reviewed' ? '安全已审核' : '安全待扫描' }}</span><span v-if="skill.stars">{{ skill.stars }} stars</span></div>
            <footer><a class="plugin-source-link" :href="externalSourceUrl(skill)" target="_blank" rel="noopener noreferrer">查看说明</a><button :class="{ primary: !skill.installed }" type="button" :disabled="busyId === `${skill.source}:${skill.id}` || !skill.installable || skill.installed" @click="installExternal(skill)"><LoaderCircle v-if="busyId === `${skill.source}:${skill.id}`" class="plugin-spin" :size="15" /><Check v-else-if="skill.installed" :size="15" /><Download v-else :size="15" />{{ skill.installed ? '已安装' : skill.installable ? '安装到技能库' : '暂不可安装' }}</button></footer>
          </article>
        </section>
        <button v-if="externalItems.length < externalTotal" class="plugin-load-more" type="button" :disabled="externalLoadingMore" @click="loadMoreExternal"><LoaderCircle v-if="externalLoadingMore" class="plugin-spin" :size="15" />{{ externalLoadingMore ? '加载中' : `加载更多（剩余 ${externalTotal - externalItems.length} 项）` }}</button>
      </template>
      <section v-else-if="activeTab !== 'external' && visiblePlugins.length" class="plugin-grid">
        <article v-for="plugin in visiblePlugins" :key="plugin.id" class="plugin-card">
          <header><div><strong>{{ plugin.name }}</strong><small>v{{ plugin.version }}<template v-if="plugin.category"> · {{ plugin.category.name }}</template></small></div><em v-if="plugin.featured">精选</em><em v-else-if="plugin.preinstalled">内置</em><em v-else-if="plugin.visibility === 'PRIVATE'">仅自己可见</em></header>
          <p>{{ plugin.description || '未填写技能说明' }}</p>
          <div class="plugin-capabilities"><span v-for="item in plugin.capabilities" :key="item">{{ capabilityName(item) }}</span></div>
          <footer v-if="activeTab !== 'mine'"><span><Download :size="14" />{{ plugin.installCount }}<template v-if="plugin.priceCredits"> · {{ plugin.priceCredits }} 点</template><template v-else> · 免费</template></span><button v-if="plugin.installed" type="button" :disabled="busyId === plugin.id" @click="uninstall(plugin)"><Check :size="15" />已安装</button><button v-else class="primary" type="button" :disabled="busyId === plugin.id" @click="install(plugin)"><LoaderCircle v-if="busyId === plugin.id" class="plugin-spin" :size="15" /><Plus v-else :size="15" />安装</button></footer>
          <footer v-else><span><ShieldCheck :size="14" />不可公开或分享</span><div><button type="button" @click="openEditor(plugin)"><Pencil :size="15" />编辑</button><button class="danger" type="button" :disabled="busyId === plugin.id" aria-label="删除技能" @click="removePrivate(plugin)"><Trash2 :size="15" /></button></div></footer>
        </article>
      </section>
      <EmptyState v-else class="plugin-empty" :icon="Blocks" :title="emptyStateTitle" :description="emptyStateDescription" />
    </div>
    <input ref="skillFileInput" type="file" accept=".md,.skill,.zip,application/zip,text/markdown" hidden @change="importSkill" />

    <Teleport to="body"><div v-if="editorOpen" class="plugin-dialog-layer" @mousedown.self="editorOpen = false"><form class="plugin-dialog" @submit.prevent="savePrivate"><header><div><strong>{{ draft.id ? '编辑私有技能' : '新建私有技能' }}</strong><small>此技能仅你的账户可见和使用</small></div><button type="button" aria-label="关闭" @click="editorOpen = false"><X :size="18" /></button></header><div class="plugin-dialog__body"><label><span>名称</span><input v-model.trim="draft.name" maxlength="80" required /></label><label><span>简介</span><textarea v-model.trim="draft.description" maxlength="500" rows="2" /></label><label><span>分类（可选）</span><select v-model="draft.categoryId"><option value="">不分类</option><option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label><span>系统指令</span><textarea v-model.trim="draft.instruction" maxlength="20000" rows="8" required placeholder="描述技能在任务中应遵循的角色、规则和工作方法" /></label><fieldset><legend>支持能力</legend><label v-for="item in capabilityOptions" :key="item.id"><input v-model="draft.capabilities" type="checkbox" :value="item.id" /><span>{{ item.label }}</span></label></fieldset><div class="plugin-dialog__row"><label><span>版本</span><input v-model.trim="draft.version" pattern="\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?" /></label><label><span>推荐模型（可选）</span><input v-model.trim="draft.recommendedModel" /></label></div><label><span>输出要求（可选）</span><textarea v-model="draft.outputRequirements" maxlength="4000" rows="3" /></label><aside><ShieldCheck :size="17" /><p><strong>私有与安全</strong><span>不支持脚本、代码包、远程地址或文件上传，也不能提交到市场、分享或转让。</span></p></aside></div><footer><button type="button" @click="editorOpen = false">取消</button><button class="primary" type="submit" :disabled="saving || !draft.capabilities.length"><LoaderCircle v-if="saving" class="plugin-spin" :size="15" />保存技能</button></footer></form></div></Teleport>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Blocks, Check, CircleAlert, Download, LoaderCircle, Pencil, Plus, Search, ShieldCheck, Trash2, Upload, X } from 'lucide-vue-next'
import { api } from '../services/api'
import { useEscapeClose } from '../composables/useEscapeClose'
import EmptyState from '../components/common/EmptyState.vue'
import type { ExternalSkill, ExternalSkillCategory, Plugin, PluginCapability, PluginCategory } from '../types'

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const query = defineModel<string>('query', { default: '' })

type Tab = 'market' | 'external' | 'installed' | 'mine'
const activeTab = ref<Tab>('external'); const market = ref<Plugin[]>([]); const externalItems = ref<ExternalSkill[]>([]); const installed = ref<Plugin[]>([]); const mine = ref<Plugin[]>([]); const categories = ref<PluginCategory[]>([])
const loading = ref(true); const error = ref(''); const notice = ref(''); const externalNotice = ref(''); const externalEnabled = ref(true); const category = ref(''); const busyId = ref(''); const saving = ref(false); const editorOpen = ref(false); const externalTotal = ref(0); const externalLoadingMore = ref(false)

useEscapeClose(() => { editorOpen.value = false }, { enabled: () => editorOpen.value })

const emptyStateTitle = computed(() => {
  if (activeTab.value === 'mine') return '还没有私有技能'
  if (activeTab.value === 'installed') return '还没有安装技能'
  if (activeTab.value !== 'external') return '没有找到技能'
  return externalEnabled.value ? '没有匹配的社区技能' : '外部技能市场未启用'
})
const emptyStateDescription = computed(() => {
  if (activeTab.value === 'mine') return '创建私有技能，用于自己的对话和任务。'
  if (activeTab.value !== 'external') return '从技能市场安装后即可在工作区调用。'
  return externalEnabled.value ? '调整关键词或切换技能分类。' : '外部技能市场已关闭，部署管理员可通过 EXTERNAL_SKILL_MARKET_ENABLED=true 重新启用。'
})
const externalCategory = ref<ExternalSkillCategory | ''>('')
const externalCategories: ExternalSkillCategory[] = ['开发编程', '办公效率', '研究分析', '内容创作', '设计创意', '营销运营', 'Agent 自动化', '通用技能']
const externalSourcePolicy: Record<ExternalSkill['source'], { homepage: string; hosts: string[] }> = {
  skillsmp: { homepage: 'https://skillsmp.com/zh/occupations', hosts: ['skillsmp.com', 'www.skillsmp.com', 'github.com'] },
  lobehub: { homepage: 'https://lobehub.com/zh/skills', hosts: ['lobehub.com', 'www.lobehub.com', 'github.com'] },
  cocoloop: { homepage: 'https://hub.cocoloop.cn/', hosts: ['hub.cocoloop.cn', 'dl.cocoloop.cn'] },
  skillhub: { homepage: 'https://www.skillhub.cn/skills', hosts: ['skillhub.cn', 'www.skillhub.cn', 'api.skillhub.cn'] }
}
const skillFileInput = ref<HTMLInputElement | null>(null)
const emptyDraft = () => ({ id: '', name: '', description: '', instruction: '', icon: 'blocks', categoryId: '', version: '1.0.0', recommendedModel: '', outputRequirements: '', capabilities: ['CHAT'] as PluginCapability[] }); const draft = reactive(emptyDraft())
const capabilityOptions: Array<{ id: PluginCapability; label: string }> = [{ id: 'CHAT', label: '对话' }, { id: 'IMAGE', label: '图片' }, { id: 'VIDEO', label: '视频' }, { id: 'COMMERCE', label: '电商' }, { id: 'OFFICE', label: '办公' }]
const tabs = computed(() => [{ id: 'market' as const, label: '官方插件', count: market.value.length }, { id: 'external' as const, label: '外部市场', count: externalTotal.value || externalItems.value.length }, { id: 'installed' as const, label: '已安装', count: installed.value.length }, { id: 'mine' as const, label: '我的技能', count: mine.value.length }])
const visiblePlugins = computed(() => {
  const rows = activeTab.value === 'installed' ? installed.value : activeTab.value === 'mine' ? mine.value : market.value
  const keyword = query.value.trim().toLowerCase()
  return keyword && activeTab.value !== 'market' ? rows.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(keyword)) : rows
})
function capabilityName(value: PluginCapability) { return capabilityOptions.find((item) => item.id === value)?.label || value }
function externalSourceUrl(skill: ExternalSkill) {
  const policy = externalSourcePolicy[skill.source]
  try {
    const url = new URL(skill.sourceUrl)
    if (url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && policy.hosts.includes(url.hostname.toLowerCase())) return url.toString()
  } catch { /* Fall through to the canonical marketplace page. */ }
  return policy.homepage
}
function displayExternalSkillName(name: string) {
  let value = name.trim()
  while (true) {
    const next = value.replace(/^(?:\d+[.)]?|[🥇🥈🥉🏆⭐✨🔥🔝🔍🔎🧠🧾🥥])\s+/u, '')
    if (next === value) break
    value = next
  }
  value = value.replace(/\s+[SA]\s+CLS[\s\S]*$/u, '').trim()
  const cjk = value.search(/\s+[\u4e00-\u9fff]/)
  if (cjk > 0) value = value.slice(0, cjk).trim()
  value = value.replace(/\s+AI$/i, '').trim()
  return value || name.trim()
}
const EXTERNAL_PAGE_SIZE = 12
let initialTabResolved = false
async function loadExternal(append = false) { const params = new URLSearchParams({ limit: String(EXTERNAL_PAGE_SIZE), ...(append ? { offset: String(externalItems.value.length) } : {}), ...(query.value ? { q: query.value } : {}), ...(externalCategory.value ? { category: externalCategory.value } : {}) }); const result = await api<{ enabled?: boolean; notice?: string; items: ExternalSkill[]; total: number }>(`/plugins/external/search?${params}`); externalEnabled.value = result.enabled !== false; externalNotice.value = result.notice || ''; externalItems.value = append ? [...externalItems.value, ...result.items] : result.items; externalTotal.value = result.total }
async function loadMoreExternal() { externalLoadingMore.value = true; error.value = ''; try { await loadExternal(true) } catch (reason) { error.value = reason instanceof Error ? reason.message : '更多外部技能加载失败' } finally { externalLoadingMore.value = false } }
async function loadAll() { loading.value = true; error.value = ''; try { const [marketRows, installedRows, mineRows, categoryRows, externalRows] = await Promise.all([api<Plugin[]>(`/plugins/market?${new URLSearchParams({ ...(activeTab.value === 'market' && query.value ? { q: query.value } : {}), ...(category.value ? { category: category.value } : {}) })}`), api<Plugin[]>('/plugins/installed'), api<Plugin[]>('/plugins/mine'), api<PluginCategory[]>('/plugins/categories'), api<{ enabled?: boolean; notice?: string; items: ExternalSkill[]; total: number }>(`/plugins/external/search?limit=${EXTERNAL_PAGE_SIZE}`)]); market.value = marketRows; installed.value = installedRows; mine.value = mineRows; categories.value = categoryRows; externalEnabled.value = externalRows.enabled !== false; externalNotice.value = externalRows.notice || ''; externalItems.value = externalRows.items; externalTotal.value = externalRows.total; if (!initialTabResolved) { initialTabResolved = true; if (!externalEnabled.value && activeTab.value === 'external') activeTab.value = 'market' } } catch (reason) { error.value = reason instanceof Error ? reason.message : '技能加载失败' } finally { loading.value = false } }
async function install(plugin: Plugin) { busyId.value = plugin.id; try { await api(`/plugins/${plugin.id}/install`, { method: 'POST' }); await loadAll() } catch (reason) { error.value = reason instanceof Error ? reason.message : '安装失败' } finally { busyId.value = '' } }
async function uninstall(plugin: Plugin) { busyId.value = plugin.id; error.value = ''; notice.value = ''; try { await api(plugin.owned && plugin.visibility === 'PRIVATE' ? `/plugins/mine/${plugin.id}` : `/plugins/${plugin.id}/install`, { method: 'DELETE' }); await loadAll() } catch (reason) { error.value = reason instanceof Error ? reason.message : '卸载失败' } finally { busyId.value = '' } }
async function installExternal(skill: ExternalSkill) {
  if (skill.installed) return
  const key = `${skill.source}:${skill.id}`; busyId.value = key; error.value = ''; notice.value = ''
  try {
    const result = await api<{ warning?: string; alreadyInstalled?: boolean }>('/plugins/external/install', { method: 'POST', body: JSON.stringify({ source: skill.source, id: skill.id, sourceUrl: skill.sourceUrl, githubUrl: skill.githubUrl, downloadUrl: skill.downloadUrl, skillUrl: skill.skillUrl }) })
    skill.installed = true
    const [installedRows, mineRows] = await Promise.all([api<Plugin[]>('/plugins/installed'), api<Plugin[]>('/plugins/mine')])
    installed.value = installedRows; mine.value = mineRows
    notice.value = result.warning || (result.alreadyInstalled ? '该技能已经安装' : '技能已安装，仅启用技能说明')
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '外部技能安装失败' }
  finally { busyId.value = '' }
}
function pickSkillFile() { skillFileInput.value?.click() }
function openEditor(plugin?: Plugin) { Object.assign(draft, plugin ? { id: plugin.id, name: plugin.name, description: plugin.description, instruction: plugin.instruction, icon: plugin.icon, categoryId: plugin.categoryId || '', version: plugin.version, recommendedModel: plugin.recommendedModel, outputRequirements: plugin.outputRequirements, capabilities: [...plugin.capabilities] } : emptyDraft()); editorOpen.value = true }
defineExpose({ pickSkillFile, openEditor })
async function savePrivate() { saving.value = true; error.value = ''; try { const body = JSON.stringify({ name: draft.name, description: draft.description, instruction: draft.instruction, icon: draft.icon, categoryId: draft.categoryId || undefined, version: draft.version, recommendedModel: draft.recommendedModel, outputRequirements: draft.outputRequirements, capabilities: draft.capabilities }); await api(draft.id ? `/plugins/mine/${draft.id}` : '/plugins/mine', { method: draft.id ? 'PATCH' : 'POST', body }); editorOpen.value = false; await loadAll() } catch (reason) { error.value = reason instanceof Error ? reason.message : '保存失败' } finally { saving.value = false } }
async function removePrivate(plugin: Plugin) { if (!window.confirm(`删除私有技能“${plugin.name}”？`)) return; busyId.value = plugin.id; try { await api(`/plugins/mine/${plugin.id}`, { method: 'DELETE' }); await loadAll() } catch (reason) { error.value = reason instanceof Error ? reason.message : '删除失败' } finally { busyId.value = '' } }
async function importSkill(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  saving.value = true; error.value = ''
  try { const form = new FormData(); form.append('file', file); await api('/plugins/mine/import', { method: 'POST', body: form }); activeTab.value = 'mine'; await loadAll() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'Skill 导入失败' }
  finally { saving.value = false; input.value = '' }
}
let searchTimer = 0; watch([query, category, externalCategory], () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => activeTab.value === 'external' ? loadExternal().catch((reason) => { error.value = reason instanceof Error ? reason.message : '社区技能搜索失败' }) : loadAll(), 280) }); onMounted(loadAll)
</script>
