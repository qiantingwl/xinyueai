<template>
  <main class="plugin-market-page">
    <div class="plugin-market-inner">
      <header v-if="!embedded" class="plugin-market-header">
        <div><h1>技能</h1><p>安装官方技能，或创建仅自己可用的私有技能</p></div>
        <div v-if="activeTab === 'mine'" class="plugin-header-actions"><button type="button" @click="skillFileInput?.click()"><Upload :size="16" />导入 Skill</button><button class="plugin-primary-action" type="button" @click="openEditor()"><Plus :size="16" />创建技能</button></div>
      </header>
      <div v-else-if="activeTab === 'mine'" class="plugin-embedded-actions"><div class="plugin-header-actions"><button type="button" @click="skillFileInput?.click()"><Upload :size="16" />导入 Skill</button><button class="plugin-primary-action" type="button" @click="openEditor()"><Plus :size="16" />创建技能</button></div></div>

      <nav class="plugin-tabs" aria-label="技能视图">
        <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id"><component :is="tab.icon" :size="16" />{{ tab.label }}<span>{{ tab.count }}</span></button>
      </nav>

      <section v-if="activeTab === 'market'" class="plugin-filter-bar">
        <label><Search :size="15" /><input v-model="query" placeholder="搜索技能" /></label>
        <div><button type="button" :class="{ active: !category }" @click="category = ''">全部</button><button v-for="item in categories" :key="item.id" type="button" :class="{ active: category === item.slug }" @click="category = item.slug">{{ item.name }}</button></div>
      </section>

      <div v-if="error" class="plugin-feedback" role="alert"><CircleAlert :size="16" /><span>{{ error }}</span><button type="button" @click="loadAll">重试</button></div>
      <section v-if="loading" class="plugin-empty"><LoaderCircle class="plugin-spin" :size="22" /><span>正在加载技能</span></section>
      <section v-else-if="visiblePlugins.length" class="plugin-grid">
        <article v-for="plugin in visiblePlugins" :key="plugin.id" class="plugin-card">
          <header><span class="plugin-card__icon"><component :is="pluginIcon(plugin.icon)" :size="21" /></span><div><strong>{{ plugin.name }}</strong><small>v{{ plugin.version }}<template v-if="plugin.category"> · {{ plugin.category.name }}</template></small></div><em v-if="plugin.featured">精选</em><em v-else-if="plugin.visibility === 'PRIVATE'">仅自己可见</em></header>
          <p>{{ plugin.description || '未填写技能说明' }}</p>
          <div class="plugin-capabilities"><span v-for="item in plugin.capabilities" :key="item">{{ capabilityName(item) }}</span></div>
          <footer v-if="activeTab !== 'mine'"><span><Download :size="14" />{{ plugin.installCount }}<template v-if="plugin.priceCredits"> · {{ plugin.priceCredits }} 点</template><template v-else> · 免费</template></span><button v-if="plugin.installed" type="button" :disabled="busyId === plugin.id" @click="uninstall(plugin)"><Check :size="15" />已安装</button><button v-else class="primary" type="button" :disabled="busyId === plugin.id" @click="install(plugin)"><LoaderCircle v-if="busyId === plugin.id" class="plugin-spin" :size="15" /><Plus v-else :size="15" />安装</button></footer>
          <footer v-else><span><ShieldCheck :size="14" />不可公开或分享</span><div><button type="button" @click="openEditor(plugin)"><Pencil :size="15" />编辑</button><button class="danger" type="button" :disabled="busyId === plugin.id" aria-label="删除插件" @click="removePrivate(plugin)"><Trash2 :size="15" /></button></div></footer>
        </article>
      </section>
      <section v-else class="plugin-empty"><Blocks :size="28" /><strong>{{ activeTab === 'mine' ? '还没有私有技能' : activeTab === 'installed' ? '还没有安装技能' : '没有找到技能' }}</strong><p>{{ activeTab === 'mine' ? '创建私有技能，用于自己的对话和任务。' : '从技能市场安装后即可在工作区调用。' }}</p></section>
    </div>
    <input ref="skillFileInput" type="file" accept=".md,.skill,.zip,application/zip,text/markdown" hidden @change="importSkill" />

    <Teleport to="body"><div v-if="editorOpen" class="plugin-dialog-layer" @mousedown.self="editorOpen = false"><form class="plugin-dialog" @submit.prevent="savePrivate"><header><div><strong>{{ draft.id ? '编辑私有插件' : '新建私有插件' }}</strong><small>此插件仅你的账户可见和使用</small></div><button type="button" aria-label="关闭" @click="editorOpen = false"><X :size="18" /></button></header><div class="plugin-dialog__body"><div class="plugin-dialog__row"><label><span>名称</span><input v-model.trim="draft.name" maxlength="80" required /></label><label><span>图标</span><select v-model="draft.icon"><option v-for="item in iconOptions" :key="item.id" :value="item.id">{{ item.label }}</option></select></label></div><label><span>简介</span><textarea v-model.trim="draft.description" maxlength="500" rows="2" /></label><label><span>分类（可选）</span><select v-model="draft.categoryId"><option value="">不分类</option><option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label><span>系统指令</span><textarea v-model="draft.instruction" maxlength="20000" rows="8" required placeholder="描述插件在任务中应遵循的角色、规则和工作方法" /></label><fieldset><legend>支持能力</legend><label v-for="item in capabilityOptions" :key="item.id"><input v-model="draft.capabilities" type="checkbox" :value="item.id" /><span>{{ item.label }}</span></label></fieldset><div class="plugin-dialog__row"><label><span>版本</span><input v-model.trim="draft.version" pattern="\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?" /></label><label><span>推荐模型（可选）</span><input v-model.trim="draft.recommendedModel" /></label></div><label><span>输出要求（可选）</span><textarea v-model="draft.outputRequirements" maxlength="4000" rows="3" /></label><aside><ShieldCheck :size="17" /><p><strong>私有与安全</strong><span>不支持脚本、代码包、远程地址或文件上传，也不能提交到市场、分享或转让。</span></p></aside></div><footer><button type="button" @click="editorOpen = false">取消</button><button class="primary" type="submit" :disabled="saving || !draft.capabilities.length"><LoaderCircle v-if="saving" class="plugin-spin" :size="15" />保存插件</button></footer></form></div></Teleport>
  </main>
</template>

<script setup lang="ts">
import { computed, markRaw, onMounted, reactive, ref, watch } from 'vue'
import { Aperture, Badge, Blocks, BriefcaseBusiness, ChartNoAxesCombined, Check, CircleAlert, Clapperboard, Code2, CodeXml, Download, FileSearch, GraduationCap, Image, Landmark, LayoutTemplate, LoaderCircle, Megaphone, MessageSquare, MessagesSquare, Network, NotebookTabs, Palette, Pencil, Plus, Presentation, Scale, Search, SearchCheck, ShieldCheck, ShoppingBag, Table2, Trash2, Upload, Video, X } from 'lucide-vue-next'
import { api } from '../services/api'
import type { Plugin, PluginCapability, PluginCategory } from '../types'

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

type Tab = 'market' | 'installed' | 'mine'
const activeTab = ref<Tab>('market'); const market = ref<Plugin[]>([]); const installed = ref<Plugin[]>([]); const mine = ref<Plugin[]>([]); const categories = ref<PluginCategory[]>([])
const loading = ref(true); const error = ref(''); const query = ref(''); const category = ref(''); const busyId = ref(''); const saving = ref(false); const editorOpen = ref(false)
const skillFileInput = ref<HTMLInputElement | null>(null)
const emptyDraft = () => ({ id: '', name: '', description: '', instruction: '', icon: 'blocks', categoryId: '', version: '1.0.0', recommendedModel: '', outputRequirements: '', capabilities: ['CHAT'] as PluginCapability[] }); const draft = reactive(emptyDraft())
const capabilityOptions: Array<{ id: PluginCapability; label: string }> = [{ id: 'CHAT', label: '对话' }, { id: 'IMAGE', label: '图片' }, { id: 'VIDEO', label: '视频' }, { id: 'COMMERCE', label: '电商' }, { id: 'OFFICE', label: '办公' }]
const iconOptions = [{ id: 'blocks', label: '插件' }, { id: 'aperture', label: '创意' }, { id: 'briefcase-business', label: '办公' }, { id: 'code-2', label: '开发' }, { id: 'image', label: '图片' }, { id: 'palette', label: '设计' }, { id: 'shopping-bag', label: '电商' }, { id: 'video', label: '视频' }, { id: 'chat', label: '对话' }]
const tabs = computed(() => [{ id: 'market' as const, label: '技能市场', icon: markRaw(Blocks), count: market.value.length }, { id: 'installed' as const, label: '已安装', icon: markRaw(Download), count: installed.value.length }, { id: 'mine' as const, label: '我的技能', icon: markRaw(ShieldCheck), count: mine.value.length }])
const visiblePlugins = computed(() => activeTab.value === 'installed' ? installed.value : activeTab.value === 'mine' ? mine.value : market.value)
const icons = { aperture: Aperture, 'badge-palette': Badge, blocks: Blocks, 'briefcase-business': BriefcaseBusiness, 'chart-no-axes-combined': ChartNoAxesCombined, clapperboard: Clapperboard, 'code-2': Code2, 'file-search': FileSearch, 'graduation-cap': GraduationCap, image: Image, landmark: Landmark, 'layout-template': LayoutTemplate, megaphone: Megaphone, 'messages-square': MessagesSquare, network: Network, 'notebook-tabs': NotebookTabs, palette: Palette, presentation: Presentation, scale: Scale, 'scan-code': CodeXml, 'search-check': SearchCheck, 'shopping-bag': ShoppingBag, 'table-2': Table2, video: Video, chat: MessageSquare }
function pluginIcon(name: string) { return markRaw(icons[name as keyof typeof icons] || Blocks) }
function capabilityName(value: PluginCapability) { return capabilityOptions.find((item) => item.id === value)?.label || value }
async function loadAll() { loading.value = true; error.value = ''; try { [market.value, installed.value, mine.value, categories.value] = await Promise.all([api<Plugin[]>(`/plugins/market?${new URLSearchParams({ ...(query.value ? { q: query.value } : {}), ...(category.value ? { category: category.value } : {}) })}`), api<Plugin[]>('/plugins/installed'), api<Plugin[]>('/plugins/mine'), api<PluginCategory[]>('/plugins/categories')]) } catch (reason) { error.value = reason instanceof Error ? reason.message : '插件加载失败' } finally { loading.value = false } }
async function install(plugin: Plugin) { busyId.value = plugin.id; try { await api(`/plugins/${plugin.id}/install`, { method: 'POST' }); await loadAll() } catch (reason) { error.value = reason instanceof Error ? reason.message : '安装失败' } finally { busyId.value = '' } }
async function uninstall(plugin: Plugin) { busyId.value = plugin.id; try { await api(`/plugins/${plugin.id}/install`, { method: 'DELETE' }); await loadAll() } catch (reason) { error.value = reason instanceof Error ? reason.message : '卸载失败' } finally { busyId.value = '' } }
function openEditor(plugin?: Plugin) { Object.assign(draft, plugin ? { id: plugin.id, name: plugin.name, description: plugin.description, instruction: plugin.instruction, icon: plugin.icon, categoryId: plugin.categoryId || '', version: plugin.version, recommendedModel: plugin.recommendedModel, outputRequirements: plugin.outputRequirements, capabilities: [...plugin.capabilities] } : emptyDraft()); editorOpen.value = true }
async function savePrivate() { saving.value = true; error.value = ''; try { const body = JSON.stringify({ name: draft.name, description: draft.description, instruction: draft.instruction, icon: draft.icon, categoryId: draft.categoryId || undefined, version: draft.version, recommendedModel: draft.recommendedModel, outputRequirements: draft.outputRequirements, capabilities: draft.capabilities }); await api(draft.id ? `/plugins/mine/${draft.id}` : '/plugins/mine', { method: draft.id ? 'PATCH' : 'POST', body }); editorOpen.value = false; await loadAll() } catch (reason) { error.value = reason instanceof Error ? reason.message : '保存失败' } finally { saving.value = false } }
async function removePrivate(plugin: Plugin) { if (!window.confirm(`删除私有插件“${plugin.name}”？`)) return; busyId.value = plugin.id; try { await api(`/plugins/mine/${plugin.id}`, { method: 'DELETE' }); await loadAll() } catch (reason) { error.value = reason instanceof Error ? reason.message : '删除失败' } finally { busyId.value = '' } }
async function importSkill(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  saving.value = true; error.value = ''
  try { const form = new FormData(); form.append('file', file); await api('/plugins/mine/import', { method: 'POST', body: form }); activeTab.value = 'mine'; await loadAll() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'Skill 导入失败' }
  finally { saving.value = false; input.value = '' }
}
let searchTimer = 0; watch([query, category], () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(loadAll, 280) }); onMounted(loadAll)
</script>
