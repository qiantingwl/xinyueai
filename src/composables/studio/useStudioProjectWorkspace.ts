import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../services/api'
import { useStudioStore } from '../../stores/studio'
import type {
  Project,
  ProjectSkillCandidate,
  ProjectSkillStatus,
  ProjectStepStatus,
  ProjectVersion,
  ProjectWorkflowStatus,
  StudioAsset
} from '../../types'
import { createClientId } from '../../utils/client-id'
import { formatDayTime as formatDate } from '../../utils/datetime'

type AssistantOption = { id: string; name: string; description: string; defaultModel?: string }
type ProjectTeam = {
  id: string
  name: string
  ownerId: string
  members: Array<{ userId: string; role: string }>
}

type Options = {
  assistants: Ref<AssistantOption[]>
  currentUserId: ComputedRef<string | undefined>
  projectNotice: Ref<string>
  previewAsset: Ref<StudioAsset | null>
  loadAssistants: () => Promise<void>
  requireAuth: (redirect: string) => boolean
  downloadAsset: (asset: StudioAsset) => Promise<void>
}

export function useStudioProjectWorkspace(options: Options) {
  const router = useRouter()
  const store = useStudioStore()
  const projectDetailOpen = ref(false)
  const projectDetailLoading = ref(false)
  const projectSaving = ref(false)
  const projectRestoringVersion = ref<number | null>(null)
  const projectDetailError = ref('')
  const projectDetail = ref<Project | null>(null)
  const projectVersions = ref<ProjectVersion[]>([])
  const projectVersionPreview = ref<ProjectVersion | null>(null)
  const projectMemberEmail = ref('')
  const projectMemberRole = ref<'ADMIN' | 'MEMBER'>('MEMBER')
  const projectMemberBusy = ref('')
  const projectTeams = ref<ProjectTeam[]>([])
  const projectTeamId = ref('')
  const projectTeamBusy = ref(false)
  const projectSkillStatus = ref<ProjectSkillStatus | null>(null)
  const projectSkillCandidate = ref<ProjectSkillCandidate | null>(null)
  const projectSkillName = ref('')
  const projectSkillContent = ref('')
  const projectSkillConversationId = ref('')
  const projectSkillSummaryRequest = ref('')
  const projectSkillBusy = ref(false)
  const projectWorkflowStatus = ref<ProjectWorkflowStatus>('PLANNING')
  const projectDefaultModel = ref('')
  const projectDefaultAssistantId = ref('')
  const projectInstructions = ref('')
  const projectDefaultPrompt = ref('')
  const projectOutputRequirements = ref('')
  const projectVersionLabel = ref('')
  const projectSteps = ref<Array<{
    id: string
    title: string
    description: string
    status: ProjectStepStatus
    sortOrder: number
  }>>([])
  const assetTeamTarget = ref<StudioAsset | null>(null)
  const assetTeamId = ref('')
  const assetTeamBusy = ref(false)

  const manageableProjectTeams = computed(() => projectTeams.value.filter((team) =>
    team.ownerId === options.currentUserId.value ||
    team.members.some((member) => member.userId === options.currentUserId.value && member.role === 'ADMIN')
  ))
  const canManageAssetTeam = computed(() => Boolean(
    assetTeamTarget.value &&
    !assetTeamTarget.value.projectId &&
    (
      assetTeamTarget.value.owner?.id === options.currentUserId.value ||
      manageableProjectTeams.value.some((team) => team.id === assetTeamTarget.value?.teamId)
    )
  ))

  function closeProjectDetails() {
    projectDetailOpen.value = false
    projectDetail.value = null
    projectVersions.value = []
    projectVersionPreview.value = null
    projectSkillStatus.value = null
    projectSkillCandidate.value = null
    projectMemberEmail.value = ''
    projectDetailError.value = ''
    projectTeamId.value = ''
  }

  function formatProjectSnapshot(snapshot: ProjectVersion['snapshot']) {
    return JSON.stringify(snapshot, null, 2)
  }

  function fillProjectEditor(project: Project) {
    projectDetail.value = project
    projectWorkflowStatus.value = project.workflowStatus
    projectDefaultModel.value = project.defaultModel
    projectDefaultAssistantId.value = project.defaultAssistantId || ''
    projectInstructions.value = project.instructions || ''
    projectDefaultPrompt.value = project.workflowConfig.defaultPrompt
    projectOutputRequirements.value = project.workflowConfig.outputRequirements
    projectSteps.value = project.workflowConfig.steps.map((step, index) => ({ ...step, sortOrder: index }))
    projectVersionLabel.value = ''
    projectTeamId.value = project.teamId || ''
  }

  function applyProjectSkillStatus(status: ProjectSkillStatus) {
    projectSkillStatus.value = status
    projectSkillName.value = status.active?.name || ''
    projectSkillContent.value = status.active?.content || ''
  }

  async function openProjectDetails(project: Project) {
    if (!options.requireAuth('/workspace?tab=projects')) return
    projectDetailOpen.value = true
    projectDetailLoading.value = true
    projectDetailError.value = ''
    try {
      const assistantPromise = options.assistants.value.length ? Promise.resolve() : options.loadAssistants()
      const teamPromise = projectTeams.value.length
        ? Promise.resolve(projectTeams.value)
        : api<ProjectTeam[]>('/teams')
      const [detail, versions, skillStatus, , teams] = await Promise.all([
        store.loadProjectDetail(project.id),
        store.loadProjectVersions(project.id),
        api<ProjectSkillStatus>(`/projects/${project.id}/skill`),
        assistantPromise,
        teamPromise
      ])
      projectTeams.value = teams
      fillProjectEditor(detail)
      projectVersions.value = versions
      applyProjectSkillStatus(skillStatus)
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '项目详情加载失败'
    } finally {
      projectDetailLoading.value = false
    }
  }

  async function refreshProjectDetail() {
    if (!projectDetail.value) return
    const [detail, skillStatus] = await Promise.all([
      store.loadProjectDetail(projectDetail.value.id),
      api<ProjectSkillStatus>(`/projects/${projectDetail.value.id}/skill`)
    ])
    fillProjectEditor(detail)
    applyProjectSkillStatus(skillStatus)
  }

  async function assignProjectTeam() {
    if (!projectDetail.value || projectTeamBusy.value) return
    projectTeamBusy.value = true
    projectDetailError.value = ''
    try {
      await api(`/projects/${projectDetail.value.id}/team`, {
        method: 'PATCH',
        body: JSON.stringify({ teamId: projectTeamId.value || null })
      })
      await refreshProjectDetail()
      options.projectNotice.value = projectTeamId.value
        ? '项目及现有文件已共享到团队'
        : '项目已移出团队空间'
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '项目归属更新失败'
    } finally {
      projectTeamBusy.value = false
    }
  }

  async function addProjectMember() {
    if (!projectDetail.value || !projectMemberEmail.value || projectMemberBusy.value) return
    projectMemberBusy.value = 'add'
    projectDetailError.value = ''
    try {
      await api(`/projects/${projectDetail.value.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: projectMemberEmail.value, role: projectMemberRole.value })
      })
      projectMemberEmail.value = ''
      await refreshProjectDetail()
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '成员添加失败'
    } finally {
      projectMemberBusy.value = ''
    }
  }

  async function updateProjectMemberRole(userId: string, role: 'ADMIN' | 'MEMBER') {
    if (!projectDetail.value || projectMemberBusy.value) return
    projectMemberBusy.value = userId
    try {
      await api(`/projects/${projectDetail.value.id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      })
      await refreshProjectDetail()
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '成员角色更新失败'
    } finally {
      projectMemberBusy.value = ''
    }
  }

  async function removeProjectMember(userId: string) {
    if (!projectDetail.value || projectMemberBusy.value || !window.confirm('确认将该用户移出项目？')) return
    projectMemberBusy.value = userId
    try {
      await api(`/projects/${projectDetail.value.id}/members/${userId}`, { method: 'DELETE' })
      await refreshProjectDetail()
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '成员移除失败'
    } finally {
      projectMemberBusy.value = ''
    }
  }

  async function saveProjectSkill() {
    if (!projectDetail.value || projectSkillBusy.value) return
    projectSkillBusy.value = true
    projectDetailError.value = ''
    try {
      await api(`/projects/${projectDetail.value.id}/skill/manual`, {
        method: 'POST',
        body: JSON.stringify({ name: projectSkillName.value, content: projectSkillContent.value })
      })
      applyProjectSkillStatus(await api<ProjectSkillStatus>(`/projects/${projectDetail.value.id}/skill`))
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '项目技能保存失败'
    } finally {
      projectSkillBusy.value = false
    }
  }

  async function disableProjectSkill() {
    if (!projectDetail.value || projectSkillBusy.value) return
    projectSkillBusy.value = true
    try {
      await api(`/projects/${projectDetail.value.id}/skill`, { method: 'DELETE' })
      applyProjectSkillStatus(await api<ProjectSkillStatus>(`/projects/${projectDetail.value.id}/skill`))
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '项目技能停用失败'
    } finally {
      projectSkillBusy.value = false
    }
  }

  async function summarizeProjectSkill() {
    if (!projectDetail.value || !projectSkillConversationId.value || projectSkillBusy.value) return
    projectSkillBusy.value = true
    projectSkillCandidate.value = null
    try {
      projectSkillCandidate.value = await api<ProjectSkillCandidate>(
        `/projects/${projectDetail.value.id}/skill/summarize`,
        {
          method: 'POST',
          body: JSON.stringify({
            conversationId: projectSkillConversationId.value,
            request: projectSkillSummaryRequest.value
          })
        }
      )
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '项目技能总结失败'
    } finally {
      projectSkillBusy.value = false
    }
  }

  async function activateProjectSkillCandidate() {
    if (!projectDetail.value || !projectSkillCandidate.value || projectSkillBusy.value) return
    projectSkillBusy.value = true
    try {
      const candidate = projectSkillCandidate.value
      await api(`/projects/${projectDetail.value.id}/skill/activate-summary`, {
        method: 'POST',
        body: JSON.stringify({
          name: candidate.name,
          content: candidate.content,
          changeSummary: candidate.changeSummary,
          sourceConversationId: candidate.sourceConversation.id
        })
      })
      projectSkillCandidate.value = null
      applyProjectSkillStatus(await api<ProjectSkillStatus>(`/projects/${projectDetail.value.id}/skill`))
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '项目技能启用失败'
    } finally {
      projectSkillBusy.value = false
    }
  }

  async function restoreProjectSkill(version: number) {
    if (!projectDetail.value || projectSkillBusy.value) return
    projectSkillBusy.value = true
    try {
      await api(`/projects/${projectDetail.value.id}/skill/versions/${version}/restore`, { method: 'POST' })
      applyProjectSkillStatus(await api<ProjectSkillStatus>(`/projects/${projectDetail.value.id}/skill`))
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '项目技能恢复失败'
    } finally {
      projectSkillBusy.value = false
    }
  }

  function addProjectStep() {
    projectSteps.value.push({
      id: createClientId(),
      title: '',
      description: '',
      status: 'TODO',
      sortOrder: projectSteps.value.length
    })
  }

  function removeProjectStep(index: number) {
    projectSteps.value.splice(index, 1)
    projectSteps.value.forEach((step, stepIndex) => { step.sortOrder = stepIndex })
  }

  async function saveProjectWorkflow() {
    if (!projectDetail.value || projectSaving.value) return
    if (projectSteps.value.some((step) => !step.title.trim())) {
      projectDetailError.value = '请为每个工作流步骤填写名称'
      return
    }
    projectSaving.value = true
    projectDetailError.value = ''
    try {
      const project = await store.updateProjectWorkflow(projectDetail.value.id, {
        workflowStatus: projectWorkflowStatus.value,
        workflowConfig: {
          steps: projectSteps.value.map((step) => ({
            id: step.id,
            title: step.title.trim(),
            description: step.description.trim(),
            status: step.status
          })),
          defaultPrompt: projectDefaultPrompt.value.trim(),
          outputRequirements: projectOutputRequirements.value.trim()
        },
        defaultModel: projectDefaultModel.value.trim(),
        defaultAssistantId: projectDefaultAssistantId.value || null,
        instructions: projectInstructions.value.trim(),
        versionLabel: projectVersionLabel.value.trim() || undefined,
        changeSummary: '保存项目工作流'
      })
      fillProjectEditor(project)
      projectVersions.value = await store.loadProjectVersions(project.id)
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '工作流保存失败'
    } finally {
      projectSaving.value = false
    }
  }

  async function createProjectCheckpoint() {
    if (!projectDetail.value) return
    try {
      await store.createProjectVersion(projectDetail.value.id, {
        label: `检查点 ${projectDetail.value.revision + 1}`,
        changeSummary: '手动创建版本检查点'
      })
      const project = await store.loadProjectDetail(projectDetail.value.id)
      fillProjectEditor(project)
      projectVersions.value = await store.loadProjectVersions(project.id)
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '版本创建失败'
    }
  }

  async function restoreProject(version: ProjectVersion) {
    if (!projectDetail.value || projectRestoringVersion.value !== null) return
    if (!window.confirm(`确认恢复到 v${version.version}？当前内容会自动保存为新版本。`)) return
    projectRestoringVersion.value = version.version
    projectDetailError.value = ''
    try {
      const project = await store.restoreProjectVersion(projectDetail.value.id, version.version)
      fillProjectEditor(project)
      projectVersions.value = await store.loadProjectVersions(project.id)
    } catch (reason) {
      projectDetailError.value = reason instanceof Error ? reason.message : '版本恢复失败'
    } finally {
      projectRestoringVersion.value = null
    }
  }

  async function openProjectConversation(conversationId: string) {
    closeProjectDetails()
    await router.push('/chat')
    await store.openConversation(conversationId)
  }

  function openProjectAsset(asset: StudioAsset) {
    if (asset.kind === 'image' || asset.kind === 'video') options.previewAsset.value = asset
    else void options.downloadAsset(asset)
  }

  async function openAssetTeamDialog(asset: StudioAsset) {
    if (!projectTeams.value.length) projectTeams.value = await api<ProjectTeam[]>('/teams').catch(() => [])
    assetTeamTarget.value = asset
    assetTeamId.value = asset.teamId || ''
  }

  async function saveAssetTeam() {
    if (!assetTeamTarget.value || !canManageAssetTeam.value || assetTeamBusy.value) return
    assetTeamBusy.value = true
    try {
      await api(`/assets/${assetTeamTarget.value.id}/team`, {
        method: 'PATCH',
        body: JSON.stringify({ teamId: assetTeamId.value || null })
      })
      await store.refreshAssets()
      assetTeamTarget.value = null
      options.projectNotice.value = assetTeamId.value ? '文件已共享到团队' : '文件已设为个人文件'
    } catch (reason) {
      store.lastError = reason instanceof Error ? reason.message : '文件归属更新失败'
    } finally {
      assetTeamBusy.value = false
    }
  }

  return {
    projectDetailOpen, projectDetailLoading, projectSaving, projectRestoringVersion,
    projectDetailError, projectDetail, projectVersions, projectVersionPreview,
    projectMemberEmail, projectMemberRole, projectMemberBusy, projectTeamId, projectTeamBusy,
    manageableProjectTeams, projectSkillStatus, projectSkillCandidate, projectSkillName,
    projectSkillContent, projectSkillConversationId, projectSkillSummaryRequest, projectSkillBusy,
    projectWorkflowStatus, projectDefaultModel, projectDefaultAssistantId, projectInstructions,
    projectDefaultPrompt, projectOutputRequirements, projectVersionLabel, projectSteps,
    assetTeamTarget, assetTeamId, assetTeamBusy, canManageAssetTeam, formatDate,
    closeProjectDetails, formatProjectSnapshot, openProjectDetails, assignProjectTeam,
    addProjectMember, updateProjectMemberRole, removeProjectMember, saveProjectSkill,
    disableProjectSkill, summarizeProjectSkill, activateProjectSkillCandidate,
    restoreProjectSkill, addProjectStep, removeProjectStep, saveProjectWorkflow,
    createProjectCheckpoint, restoreProject, openProjectConversation, openProjectAsset,
    openAssetTeamDialog, saveAssetTeam
  }
}
