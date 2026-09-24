<template>
    <section class="studio-index-page projects-page">
      <div class="index-page-inner">
        <WorkspaceSectionTabs active="projects" />
        <div v-if="store.lastError" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>
        <div v-if="projectNotice" class="project-notice" role="status"><Check :size="15" /><span>{{ projectNotice }}</span><button type="button" aria-label="关闭提示" @click="projectNotice = ''"><X :size="15" /></button></div>
        <header class="index-page-header"><div class="index-page-title"><h1>{{ t('studio.projects') }}</h1><p>集中管理对话、文件、工作流和版本历史。</p></div><div><label class="workspace-search"><Search :size="16" /><input v-model="projectSearch" :placeholder="t('studio.search')" /></label><button class="index-new-button" type="button" @click="projectModalOpen = true"><Plus :size="17" />{{ t('studio.create') }}</button></div></header>
        <div class="index-tabs"><button :class="{ 'is-active': projectTab === 'active' }" type="button" @click="projectTab = 'active'"><span>项目</span><small>{{ activeProjectCount }}</small></button><button :class="{ 'is-active': projectTab === 'archived' }" type="button" @click="projectTab = 'archived'"><span>已归档</span><small>{{ archivedProjectCount + store.archivedConversations.length }}</small></button></div>
        <div class="project-table-head"><span>名称</span><span>项目内容</span><span>修改时间</span><span>操作</span></div>
        <div v-if="auth.isAuthenticated && store.workspaceHydrating && !store.projects.length" class="project-loading"><LoaderCircle class="admin-spin" :size="18" />正在加载项目</div>
        <div v-else-if="filteredProjects.length" class="project-table">
          <article v-for="project in filteredProjects" :key="project.id" class="project-row" :class="{ 'is-active': project.id === store.currentProjectId }"><button type="button" :title="project.archived ? '已归档项目不能设为当前项目' : '设为当前项目'" :disabled="project.archived" @click="selectCurrentProject(project)"><span class="project-row-name"><Folder :size="18" /><span><strong>{{ project.name }}</strong><small>{{ project.brief }}<em v-if="project.team">{{ project.team.name }}</em></small></span></span><span class="project-row-content">{{ project.conversationCount }} 个对话 · {{ project.assetCount }} 个文件 · {{ project.versionCount }} 个版本</span><time>{{ formatDate(project.updatedAt) }}</time></button><div><button type="button" :aria-label="`打开${project.name}详情`" title="项目详情" @click="openProjectDetails(project)"><Settings2 :size="16" /></button><button v-if="project.accessRole === 'OWNER'" type="button" :aria-label="project.archived ? `恢复${project.name}` : `归档${project.name}`" :title="project.archived ? '恢复' : '归档'" @click="toggleProjectArchive(project.id, !project.archived)"><ArchiveRestore v-if="project.archived" :size="16" /><Archive v-else :size="16" /></button><button v-if="project.accessRole === 'OWNER'" type="button" :aria-label="`删除${project.name}`" title="删除" @click="deleteProject(project.id, project.name)"><Trash2 :size="16" /></button></div></article>
        </div>
        <div v-else-if="!(projectTab === 'archived' && filteredArchivedConversations.length)" class="project-empty"><span class="index-empty-icon"><ArchiveRestore v-if="projectTab === 'archived'" :size="25" /><Folder v-else :size="25" /></span><strong>{{ projectSearch ? '没有匹配的项目' : projectTab === 'archived' ? '还没有已归档项目' : '创建你的第一个项目' }}</strong><p>{{ projectSearch ? '换一个关键词继续查找。' : projectTab === 'archived' ? '归档后的项目会保留聊天、文件和版本，并显示在这里。' : '把同一主题的聊天、文件和工作流集中管理，后续内容会自动归入当前项目。' }}</p><button v-if="projectSearch" type="button" @click="projectSearch = ''">清除搜索</button><button v-else-if="projectTab === 'active'" type="button" @click="projectModalOpen = true"><Plus :size="15" />创建项目</button></div>
        <section v-if="projectTab === 'archived' && filteredArchivedConversations.length" class="archived-conversations-panel">
          <header><h2>已归档对话</h2><span>{{ filteredArchivedConversations.length }} 个</span></header>
          <div class="archived-conversations-list">
            <article v-for="conversation in filteredArchivedConversations" :key="conversation.id" class="archived-conversation-row">
              <button type="button" @click="openArchivedConversation(conversation.id)"><MessageSquare :size="17" /><span><strong>{{ conversation.title }}</strong><small>{{ formatDate(conversation.updatedAt) }} · {{ conversation.model }}</small></span></button>
              <div><button type="button" title="恢复" aria-label="恢复对话" @click="restoreArchivedConversation(conversation.id)"><ArchiveRestore :size="16" /></button><button type="button" title="永久删除" aria-label="永久删除对话" @click="deleteArchivedConversation(conversation.id, conversation.title)"><Trash2 :size="16" /></button></div>
            </article>
          </div>
        </section>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="projectModalOpen" class="studio-modal-backdrop" @click.self="closeProjectModal">
        <form class="project-create-dialog" role="dialog" aria-modal="true" aria-labelledby="project-modal-title" @submit.prevent="createProject">
          <header><h2 id="project-modal-title">创建项目</h2><div><button type="button" aria-label="项目设置" :class="{ 'is-active': projectAdvanced }" @click="projectAdvanced = !projectAdvanced"><Settings2 :size="19" /></button><button type="button" aria-label="关闭" @click="closeProjectModal"><X :size="20" /></button></div></header>
          <label class="project-name-label"><span>项目名称</span><div><Folder :size="18" /><input v-model="projectName" autofocus maxlength="40" placeholder="例如：品牌内容计划" /></div></label>
          <label v-if="projectAdvanced" class="project-brief-label"><span>项目说明</span><textarea v-model="projectBrief" maxlength="2000" placeholder="说明项目目标、背景和交付要求" /></label>
          <div class="project-create-tip"><Lightbulb :size="18" /><p>{{ projectAdvanced ? '项目创建后可继续设置说明、成员和默认指令。' : '项目功能可将聊天、文件和自定义指令集中保存，以便用于持续进行的工作，或者单纯用于整理内容，让一切更加井然有序。' }}</p></div>
          <p v-if="projectError" class="modal-error">{{ projectError }}</p>
          <footer><button type="submit" :disabled="!projectName.trim()">创建项目</button></footer>
        </form>
      </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Archive, ArchiveRestore, Check, Folder, Lightbulb, LoaderCircle, MessageSquare, Plus, Search, Settings2, Trash2, X } from 'lucide-vue-next'
import WorkspaceSectionTabs from '../WorkspaceSectionTabs.vue'
import { useEscapeClose } from '../../composables/useEscapeClose'
import { formatDayTime as formatDate } from '../../utils/datetime'
import { useAuthStore } from '../../stores/auth'
import { useStudioStore } from '../../stores/studio'
import type { Project } from '../../types'

defineProps<{ openProjectDetails: (project: Project) => void }>()
const projectNotice = defineModel<string>('projectNotice', { required: true })

const router = useRouter()
const { t } = useI18n()
const store = useStudioStore()
const auth = useAuthStore()
const projectSearch = ref('')
const projectTab = ref<'active' | 'archived'>('active')
const projectModalOpen = ref(false)
const projectName = ref('')
const projectBrief = ref('')
const projectError = ref('')
const projectAdvanced = ref(false)
const filteredProjects = computed(() => store.projects.filter((project) => Boolean(project.archived) === (projectTab.value === 'archived') && project.name.toLowerCase().includes(projectSearch.value.trim().toLowerCase())))
const activeProjectCount = computed(() => store.projects.filter((project) => !project.archived).length)
const archivedProjectCount = computed(() => store.projects.filter((project) => project.archived).length)
const filteredArchivedConversations = computed(() => store.archivedConversations.filter((conversation) => conversation.title.toLowerCase().includes(projectSearch.value.trim().toLowerCase())))

function requireAuth(redirect: string) { if (auth.isAuthenticated) return true; void router.push(`/login?redirect=${encodeURIComponent(redirect)}`); return false }
function selectCurrentProject(project: Project) { store.selectProject(project.id); projectNotice.value = `已切换到项目“${project.name}”，后续对话、上传和生成内容会归入该项目。`; window.setTimeout(() => { projectNotice.value = '' }, 3600) }
async function openArchivedConversation(conversationId: string) { await store.openConversation(conversationId); await router.push('/chat') }
async function restoreArchivedConversation(conversationId: string) { try { await store.restoreConversation(conversationId); projectNotice.value = '对话已恢复'; window.setTimeout(() => { projectNotice.value = '' }, 2400) } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '恢复失败' } }
async function deleteArchivedConversation(conversationId: string, title: string) { if (!window.confirm(`永久删除“${title}”？此操作无法撤销。`)) return; try { await store.deleteConversation(conversationId) } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '对话删除失败' } }
async function toggleProjectArchive(projectId: string, archived: boolean) {
  try {
    const project = store.projects.find((item) => item.id === projectId)
    await store.setProjectArchived(projectId, archived)
    projectNotice.value = `“${project?.name || '项目'}”已${archived ? '归档' : '恢复'}`
    window.setTimeout(() => { projectNotice.value = '' }, 3000)
  } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '项目状态更新失败' }
}
async function deleteProject(projectId: string, name: string) { if (!window.confirm(`确认删除“${name}”？此操作无法撤销。`)) return; try { await store.deleteProject(projectId) } catch (reason) { store.lastError = reason instanceof Error ? reason.message : '项目删除失败' } }
function closeProjectModal() { projectModalOpen.value = false; projectName.value = ''; projectBrief.value = ''; projectError.value = ''; projectAdvanced.value = false }
useEscapeClose(() => { if (projectModalOpen.value) closeProjectModal() })
async function createProject() { if (!requireAuth('/workspace?tab=projects')) return; if (!projectName.value.trim()) { projectError.value = '请输入项目名称'; return } try { await store.createProject(projectName.value, projectBrief.value); closeProjectModal() } catch (reason) { projectError.value = reason instanceof Error ? reason.message : '项目创建失败' } }
</script>
