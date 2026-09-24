<template>
      <div class="studio-modal-backdrop project-detail-backdrop" @click.self="closeProjectDetails">
        <section class="project-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="project-detail-title">
          <header class="project-detail-header"><div><span class="project-detail-eyebrow">PROJECT WORKSPACE</span><h2 id="project-detail-title">{{ projectDetail?.name || '项目详情' }}</h2><p>修订 {{ projectDetail?.revision || 1 }} · {{ projectDetail?.workflowConfig.steps.length || 0 }} 个工作步骤</p></div><button type="button" aria-label="关闭项目详情" title="关闭" @click="closeProjectDetails"><X :size="20" /></button></header>
          <div v-if="projectDetailError" class="modal-error">{{ projectDetailError }}</div>
          <div v-if="projectDetailLoading" class="project-detail-loading"><LoaderCircle class="admin-spin" :size="18" />正在加载项目</div>
          <div v-else class="project-detail-body">
            <div class="project-detail-main">
              <section class="project-detail-section project-content-section"><div class="project-section-heading"><div><span class="project-detail-eyebrow">CONTENT</span><h3>项目内容</h3></div><span class="project-content-total">{{ projectDetail?.conversationCount || 0 }} 个对话 · {{ projectDetail?.assetCount || 0 }} 个文件</span></div><div class="project-content-grid"><div><h4>最近对话</h4><button v-for="conversation in projectDetail?.conversations || []" :key="conversation.id" class="project-content-row" type="button" @click="openProjectConversation(conversation.id)"><MessageSquare :size="15" /><span><strong>{{ conversation.title }}</strong><small>{{ conversation.model }} · {{ formatDate(conversation.updatedAt) }}</small></span><ChevronRight :size="15" /></button><p v-if="!projectDetail?.conversations.length" class="project-content-empty">在选中此项目后开始对话，对话会显示在这里。</p></div><div><h4>项目文件</h4><button v-for="asset in projectDetail?.assets || []" :key="asset.id" class="project-content-row" type="button" @click="openProjectAsset(asset)"><ImageIcon v-if="asset.kind === 'image'" :size="15" /><Video v-else-if="asset.kind === 'video'" :size="15" /><FileText v-else :size="15" /><span><strong>{{ asset.title }}</strong><small>{{ asset.tags.join(' · ') }}</small></span><ChevronRight :size="15" /></button><p v-if="!projectDetail?.assets.length" class="project-content-empty">上传到项目或在项目中生成的文件会显示在这里。</p></div></div></section>
              <section class="project-detail-section">
                <div class="project-section-heading"><div><span class="project-detail-eyebrow">COLLABORATION</span><h3>项目成员</h3></div><span class="project-content-total">{{ (projectDetail?.members.length || 0) + 1 }} 人</span></div>
                <div class="project-team-assignment"><div><strong>团队共享</strong><small>{{ projectDetail?.team ? `团队成员可访问项目对话与文件 · ${projectDetail.team.name}` : '当前仅项目成员可访问' }}</small></div><select v-if="projectSkillStatus?.canManage" v-model="projectTeamId" aria-label="项目团队归属"><option value="">不归属团队</option><option v-for="team in manageableProjectTeams" :key="team.id" :value="team.id">{{ team.name }}</option></select><button v-if="projectSkillStatus?.canManage" type="button" :disabled="projectTeamBusy || projectTeamId === (projectDetail?.teamId || '')" @click="assignProjectTeam">{{ projectTeamBusy ? '保存中' : '保存归属' }}</button></div>
                <div class="project-member-list">
                  <article><span class="project-member-avatar">{{ projectDetail?.owner?.displayName?.slice(0, 1) || '主' }}</span><div><strong>{{ projectDetail?.owner?.displayName || '项目所有者' }}</strong><small>{{ projectDetail?.owner?.email || '所有者' }}</small></div><em>所有者</em></article>
                  <article v-for="member in projectDetail?.members || []" :key="member.userId"><span class="project-member-avatar">{{ member.user.displayName.slice(0, 1) }}</span><div><strong>{{ member.user.displayName }}</strong><small>{{ member.user.email || '未绑定邮箱' }}</small></div><select v-if="projectDetail?.accessRole === 'OWNER'" :value="member.role" :disabled="projectMemberBusy === member.userId" @change="updateProjectMemberRole(member.userId, ($event.target as HTMLSelectElement).value as 'ADMIN' | 'MEMBER')"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select><em v-else>{{ member.role === 'ADMIN' ? '管理员' : '成员' }}</em><button v-if="projectDetail?.accessRole === 'OWNER'" type="button" title="移除成员" :disabled="projectMemberBusy === member.userId" @click="removeProjectMember(member.userId)"><Trash2 :size="14" /></button></article>
                </div>
                <form v-if="projectDetail?.accessRole === 'OWNER'" class="project-member-form" @submit.prevent="addProjectMember"><input v-model.trim="projectMemberEmail" type="email" maxlength="200" placeholder="输入已注册用户的邮箱" /><select v-model="projectMemberRole"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select><button type="submit" :disabled="projectMemberBusy === 'add' || !projectMemberEmail"><Plus :size="15" />添加成员</button></form>
              </section>
              <section class="project-detail-section">
                <div class="project-section-heading"><div><span class="project-detail-eyebrow">PROJECT SKILL</span><h3>项目技能</h3></div><span class="project-content-total">{{ projectSkillStatus?.active?.enabled ? `v${projectSkillStatus.active.version} 已启用` : '未启用' }}</span></div>
                <p class="project-version-note">项目技能会作为项目级工作规范，自动应用于后续聊天和 Agent 任务。</p>
                <div v-if="projectSkillStatus?.canManage" class="project-skill-editor"><input v-model="projectSkillName" maxlength="80" placeholder="技能名称" /><textarea v-model="projectSkillContent" maxlength="50000" rows="7" placeholder="输入项目长期使用的流程、约束、风格和验收标准" /><div><button type="button" class="project-secondary-button" :disabled="projectSkillBusy || !projectSkillStatus?.active?.enabled" @click="disableProjectSkill">停用技能</button><button type="button" class="project-primary-button" :disabled="projectSkillBusy || !projectSkillName.trim() || !projectSkillContent.trim()" @click="saveProjectSkill"><Save :size="15" />保存为新版本</button></div></div>
                <div v-else-if="projectSkillStatus?.active" class="project-skill-readonly"><strong>{{ projectSkillStatus.active.name }}</strong><pre>{{ projectSkillStatus.active.content }}</pre></div>
                <div class="project-skill-summary"><select v-model="projectSkillConversationId"><option value="">选择自己的项目对话</option><option v-for="conversation in projectDetail?.conversations || []" :key="conversation.id" :value="conversation.id">{{ conversation.title }}</option></select><input v-model="projectSkillSummaryRequest" maxlength="2000" placeholder="可选：说明需要提炼的规则" /><button type="button" :disabled="projectSkillBusy || !projectSkillConversationId" @click="summarizeProjectSkill">AI 总结</button></div>
                <div v-if="projectSkillCandidate" class="project-skill-candidate"><header><div><strong>{{ projectSkillCandidate.name }}</strong><small>{{ projectSkillCandidate.changeSummary }}</small></div><button v-if="projectSkillStatus?.canManage" type="button" :disabled="projectSkillBusy" @click="activateProjectSkillCandidate">采用此版本</button></header><pre>{{ projectSkillCandidate.content }}</pre></div>
                <details v-if="projectSkillStatus?.versions.length" class="project-skill-history"><summary>技能版本历史 · {{ projectSkillStatus.versions.length }}</summary><article v-for="version in projectSkillStatus.versions" :key="version.id"><div><strong>v{{ version.version }} · {{ version.name }}</strong><small>{{ version.changeSummary || '未填写变更说明' }} · {{ version.createdBy?.displayName || '系统' }}</small></div><button v-if="projectSkillStatus?.canManage && !version.active" type="button" :disabled="projectSkillBusy" @click="restoreProjectSkill(version.version)"><RotateCcw :size="13" />恢复</button></article></details>
              </section>
              <section class="project-detail-section"><div class="project-section-heading"><div><span class="project-detail-eyebrow">WORKFLOW</span><h3>工作流设置</h3></div><span class="project-revision">v{{ projectDetail?.revision || 1 }}</span></div>
                <div class="project-form-grid"><label><span>项目状态</span><select v-model="projectWorkflowStatus" :disabled="!projectSkillStatus?.canManage"><option value="PLANNING">规划中</option><option value="IN_PROGRESS">进行中</option><option value="REVIEW">待审核</option><option value="COMPLETED">已完成</option><option value="ARCHIVED">已归档</option></select></label><label><span>默认模型</span><input v-model="projectDefaultModel" :disabled="!projectSkillStatus?.canManage" maxlength="160" placeholder="跟随系统默认模型" /></label></div>
                <label class="project-form-field"><span>默认项目指令</span><textarea v-model="projectInstructions" :disabled="!projectSkillStatus?.canManage" maxlength="4000" rows="4" placeholder="每次在此项目中开始工作时使用的背景和约束" /></label>
                <div class="project-form-grid"><label><span>默认助手</span><select v-model="projectDefaultAssistantId" :disabled="!projectSkillStatus?.canManage"><option value="">不使用默认助手</option><option v-for="assistant in assistants" :key="assistant.id" :value="assistant.id">{{ assistant.name }}</option></select></label><label><span>版本标签</span><input v-model="projectVersionLabel" :disabled="!projectSkillStatus?.canManage" maxlength="80" placeholder="例如：第一轮方案" /></label></div>
                <label class="project-form-field"><span>默认提示词</span><textarea v-model="projectDefaultPrompt" :disabled="!projectSkillStatus?.canManage" maxlength="10000" rows="3" placeholder="工作流开始时自动带入的提示词" /></label>
                <label class="project-form-field"><span>交付要求</span><textarea v-model="projectOutputRequirements" :disabled="!projectSkillStatus?.canManage" maxlength="10000" rows="3" placeholder="定义最终产物、格式和验收标准" /></label>
              </section>
              <section class="project-detail-section"><div class="project-section-heading"><div><span class="project-detail-eyebrow">STEPS</span><h3>工作流步骤</h3></div><button v-if="projectSkillStatus?.canManage" class="project-inline-button" type="button" @click="addProjectStep"><Plus :size="15" />新增步骤</button></div>
                <div v-if="projectSteps.length" class="project-steps"><article v-for="(step, index) in projectSteps" :key="step.id" class="project-step"><span class="project-step-number">{{ String(index + 1).padStart(2, '0') }}</span><div class="project-step-fields"><input v-model="step.title" :disabled="!projectSkillStatus?.canManage" maxlength="120" placeholder="步骤名称" /><input v-model="step.description" :disabled="!projectSkillStatus?.canManage" maxlength="1000" placeholder="这一步的目标和交付物" /></div><select v-model="step.status" :disabled="!projectSkillStatus?.canManage" aria-label="步骤状态"><option value="TODO">待开始</option><option value="IN_PROGRESS">进行中</option><option value="DONE">已完成</option></select><button v-if="projectSkillStatus?.canManage" type="button" aria-label="删除步骤" title="删除步骤" @click="removeProjectStep(index)"><Trash2 :size="15" /></button></article></div>
                <div v-else class="project-steps-empty"><Layers3 :size="20" /><span>还没有工作步骤，从拆解第一项任务开始。</span></div>
              </section>
              <footer class="project-detail-actions"><button type="button" class="project-secondary-button" @click="closeProjectDetails">关闭</button><button v-if="projectSkillStatus?.canManage" type="button" class="project-primary-button" :disabled="projectSaving" @click="saveProjectWorkflow"><LoaderCircle v-if="projectSaving" class="admin-spin" :size="15" /><Save v-else :size="15" />保存工作流</button></footer>
            </div>
            <aside class="project-version-panel"><div class="project-section-heading"><div><span class="project-detail-eyebrow">HISTORY</span><h3>版本历史</h3></div><button v-if="projectSkillStatus?.canManage" type="button" class="project-icon-button" title="创建版本检查点" aria-label="创建版本检查点" @click="createProjectCheckpoint"><Plus :size="16" /></button></div><p class="project-version-note">每次保存都会自动留下版本，可随时查看；所有者和管理员可以恢复。</p><div v-if="projectVersions.length" class="project-versions"><article v-for="version in projectVersions" :key="version.id" class="project-version" :class="{ 'is-current': version.version === projectDetail?.revision }"><div class="project-version-dot"></div><div class="project-version-copy"><div><strong>v{{ version.version }}</strong><span>{{ version.label || '未命名版本' }}</span></div><p>{{ version.changeSummary || '未填写修改摘要' }}</p><time>{{ formatDate(version.createdAt) }}</time><div class="project-version-actions"><button type="button" class="project-restore-button" @click="projectVersionPreview = projectVersionPreview?.id === version.id ? null : version"><FileText :size="13" />{{ projectVersionPreview?.id === version.id ? '收起快照' : '查看快照' }}</button><button v-if="projectSkillStatus?.canManage" type="button" class="project-restore-button" :disabled="version.version === projectDetail?.revision || projectRestoringVersion === version.version" @click="restoreProject(version)"><RotateCcw :size="13" />{{ projectRestoringVersion === version.version ? '恢复中' : version.version === projectDetail?.revision ? '当前版本' : '恢复此版本' }}</button></div><pre v-if="projectVersionPreview?.id === version.id" class="project-version-snapshot">{{ formatProjectSnapshot(version.snapshot) }}</pre></div></article></div><div v-else class="project-steps-empty"><History :size="20" /><span>暂无版本历史</span></div></aside>
          </div>
        </section>
      </div>
</template>

<script setup lang="ts">
import { ChevronRight, FileText, History, Image as ImageIcon, Layers3, LoaderCircle, MessageSquare, Plus, RotateCcw, Save, Trash2, Video, X } from 'lucide-vue-next'
import { useEscapeClose } from '../../composables/useEscapeClose'
import type { Project, ProjectSkillCandidate, ProjectSkillStatus, ProjectStepStatus, ProjectVersion, ProjectWorkflowStatus, StudioAsset } from '../../types'

const props = defineProps<{
  projectDetail: Project | null
  projectVersions: ProjectVersion[]
  projectDetailLoading: boolean
  projectDetailError: string
  projectSkillStatus: ProjectSkillStatus | null
  projectSkillCandidate: ProjectSkillCandidate | null
  projectMemberBusy: string
  projectTeamBusy: boolean
  projectSkillBusy: boolean
  projectSaving: boolean
  projectRestoringVersion: number | null
  projectSteps: Array<{ id: string; title: string; description: string; status: ProjectStepStatus; sortOrder: number }>
  manageableProjectTeams: Array<{ id: string; name: string }>
  assistants: Array<{ id: string; name: string }>
  closeProjectDetails: () => void
  formatDate: (value: number) => string
  openProjectConversation: (conversationId: string) => void
  openProjectAsset: (asset: StudioAsset) => void
  assignProjectTeam: () => void
  addProjectMember: () => void
  updateProjectMemberRole: (userId: string, role: 'ADMIN' | 'MEMBER') => void
  removeProjectMember: (userId: string) => void
  saveProjectSkill: () => void
  disableProjectSkill: () => void
  summarizeProjectSkill: () => void
  activateProjectSkillCandidate: () => void
  restoreProjectSkill: (version: number) => void
  addProjectStep: () => void
  removeProjectStep: (index: number) => void
  saveProjectWorkflow: () => void
  createProjectCheckpoint: () => void
  restoreProject: (version: ProjectVersion) => void
  formatProjectSnapshot: (snapshot: ProjectVersion['snapshot']) => string
}>()
useEscapeClose(() => props.closeProjectDetails())
const projectTeamId = defineModel<string>('projectTeamId', { required: true })
const projectVersionPreview = defineModel<ProjectVersion | null>('projectVersionPreview', { required: true })
const projectSkillName = defineModel<string>('projectSkillName', { required: true })
const projectSkillContent = defineModel<string>('projectSkillContent', { required: true })
const projectSkillConversationId = defineModel<string>('projectSkillConversationId', { required: true })
const projectSkillSummaryRequest = defineModel<string>('projectSkillSummaryRequest', { required: true })
const projectWorkflowStatus = defineModel<ProjectWorkflowStatus>('projectWorkflowStatus', { required: true })
const projectDefaultModel = defineModel<string>('projectDefaultModel', { required: true })
const projectDefaultAssistantId = defineModel<string>('projectDefaultAssistantId', { required: true })
const projectInstructions = defineModel<string>('projectInstructions', { required: true })
const projectDefaultPrompt = defineModel<string>('projectDefaultPrompt', { required: true })
const projectOutputRequirements = defineModel<string>('projectOutputRequirements', { required: true })
const projectVersionLabel = defineModel<string>('projectVersionLabel', { required: true })
const projectMemberEmail = defineModel<string>('projectMemberEmail', { required: true })
const projectMemberRole = defineModel<'ADMIN' | 'MEMBER'>('projectMemberRole', { required: true })
</script>
