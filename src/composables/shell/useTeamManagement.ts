import { reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { api } from '../../services/api'
import { copyText } from '../../utils/clipboard'
import type {
  PendingTeamInvitation,
  Team,
  TeamCreditEntry,
  TeamDraft,
  TeamMember,
  TeamResources
} from '../../components/shell/types'

export function useTeamManagement() {
  const message = useMessage()
  const teams = ref<Team[]>([])
  const pendingTeamInvitations = ref<PendingTeamInvitation[]>([])
  const teamDraft = reactive<TeamDraft>({ name: '', description: '' })
  const teamInviteId = ref('')
  const teamInviteEmail = ref('')
  const teamInviteRole = ref<'MEMBER' | 'ADMIN'>('MEMBER')
  const teamBusy = ref(false)
  const teamMessage = ref('')
  const teamError = ref(false)
  const expandedTeamId = ref('')
  const teamResources = reactive<Record<string, TeamResources | undefined>>({})
  const teamLedgerOpenId = ref('')
  const teamCreditLedgers = reactive<Record<string, TeamCreditEntry[] | undefined>>({})
  const teamQuotaDrafts = reactive<Record<string, string>>({})

  async function reloadTeams() {
    teams.value = await api<Team[]>('/teams')
  }

  async function createTeam() {
    if (!teamDraft.name.trim()) return
    teamBusy.value = true
    teamMessage.value = ''
    teamError.value = false
    try {
      await api('/teams', { method: 'POST', body: JSON.stringify(teamDraft) })
      teamDraft.name = ''
      teamDraft.description = ''
      await reloadTeams()
      teamMessage.value = '团队已创建'
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '团队创建失败'
    } finally {
      teamBusy.value = false
    }
  }

  async function inviteToTeam(teamId: string) {
    if (!teamInviteEmail.value.trim()) return
    teamBusy.value = true
    teamMessage.value = ''
    teamError.value = false
    try {
      const result = await api<{ acceptUrl: string; emailSent: boolean }>(
        `/teams/${teamId}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify({ email: teamInviteEmail.value, role: teamInviteRole.value })
        }
      )
      teamInviteEmail.value = ''
      teamInviteRole.value = 'MEMBER'
      teamInviteId.value = ''
      await reloadTeams()
      await copyText(result.acceptUrl)
      teamMessage.value = result.emailSent
        ? '邀请邮件已发送，邀请链接也已复制'
        : '邀请已创建，链接已复制；配置 SMTP 后可自动发送邮件'
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '邀请发送失败'
    } finally {
      teamBusy.value = false
    }
  }

  async function acceptTeamInvitation(invitationId: string) {
    teamBusy.value = true
    teamMessage.value = ''
    teamError.value = false
    try {
      await api(`/team-invitations/${invitationId}/accept-pending`, { method: 'POST' })
      ;[teams.value, pendingTeamInvitations.value] = await Promise.all([
        api<Team[]>('/teams'),
        api<PendingTeamInvitation[]>('/team-invitations')
      ])
      teamMessage.value = '已加入团队'
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '接受邀请失败'
    } finally {
      teamBusy.value = false
    }
  }

  async function cancelTeamInvitation(teamId: string, invitationId: string) {
    if (!window.confirm('确认取消这条团队邀请？')) return
    try {
      await api(`/teams/${teamId}/invitations/${invitationId}`, { method: 'DELETE' })
      await reloadTeams()
      teamMessage.value = '邀请已取消'
      teamError.value = false
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '取消邀请失败'
    }
  }

  async function transferTeamOwnership(team: Team, member: TeamMember) {
    if (!window.confirm(`确认将“${team.name}”的所有权转让给 ${member.user.displayName}？`)) return
    try {
      await api(`/teams/${team.id}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId: member.userId })
      })
      await reloadTeams()
      teamMessage.value = '团队所有权已转让'
      teamError.value = false
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '所有权转让失败'
    }
  }

  async function removeTeamMember(teamId: string, userId: string) {
    if (!window.confirm('确认从团队中移除该成员？')) return
    try {
      await api(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' })
      await reloadTeams()
      teamMessage.value = '成员已移除'
      teamError.value = false
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '移除成员失败'
    }
  }

  async function updateTeamMemberRole(teamId: string, userId: string, role: string) {
    teamBusy.value = true
    teamMessage.value = ''
    teamError.value = false
    try {
      await api(`/teams/${teamId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      })
      await reloadTeams()
      teamMessage.value = '成员角色已更新'
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '角色更新失败'
      await reloadTeams().catch(() => undefined)
    } finally {
      teamBusy.value = false
    }
  }

  async function editTeam(team: Team) {
    const name = window.prompt('团队名称', team.name)?.trim()
    if (!name) return
    const description = window.prompt('团队说明', team.description)?.trim() ?? team.description
    const seatLimit = Number(window.prompt('团队席位数', String(team.seatLimit)) || team.seatLimit)
    if (!Number.isInteger(seatLimit) || seatLimit < team.members.length) {
      message.warning(`席位数不能少于当前成员数 ${team.members.length}`)
      return
    }
    teamBusy.value = true
    teamMessage.value = ''
    teamError.value = false
    try {
      await api(`/teams/${team.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description, seatLimit })
      })
      await reloadTeams()
      teamMessage.value = '团队资料已更新'
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '团队更新失败'
    } finally {
      teamBusy.value = false
    }
  }

  async function leaveTeam(team: Team) {
    if (!window.confirm(`确认退出“${team.name}”？`)) return
    try {
      await api(`/teams/${team.id}/leave`, { method: 'POST' })
      await reloadTeams()
      teamMessage.value = '已退出团队'
      teamError.value = false
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '退出团队失败'
    }
  }

  async function deleteTeam(team: Team) {
    if (!window.confirm(`永久删除“${team.name}”及其成员关系？`)) return
    try {
      await api(`/teams/${team.id}`, { method: 'DELETE' })
      await reloadTeams()
      teamMessage.value = '团队已删除'
      teamError.value = false
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '团队删除失败'
    }
  }

  async function toggleTeamResources(teamId: string) {
    if (expandedTeamId.value === teamId) {
      expandedTeamId.value = ''
      return
    }
    expandedTeamId.value = teamId
    if (teamResources[teamId]) return
    teamBusy.value = true
    try {
      teamResources[teamId] = await api<TeamResources>(`/teams/${teamId}/resources`)
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '团队资源加载失败'
      expandedTeamId.value = ''
    } finally {
      teamBusy.value = false
    }
  }

  async function toggleTeamBilling(team: Team) {
    teamBusy.value = true
    teamMessage.value = ''
    teamError.value = false
    try {
      await api(`/teams/${team.id}/billing`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !team.billingEnabled })
      })
      await reloadTeams()
      teamMessage.value = team.billingEnabled ? '团队共享支付已停用' : '团队共享支付已启用'
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '共享支付设置失败'
    } finally {
      teamBusy.value = false
    }
  }

  async function saveTeamMemberQuota(team: Team, member: TeamMember) {
    const raw = teamQuotaDrafts[`${team.id}:${member.userId}`]?.trim() || ''
    const monthlyCreditLimit = raw === '' ? null : Number(raw)
    if (monthlyCreditLimit !== null && (!Number.isInteger(monthlyCreditLimit) || monthlyCreditLimit < 0)) {
      message.warning('月限额必须是大于等于 0 的整数，留空表示不限额')
      return
    }
    teamBusy.value = true
    teamMessage.value = ''
    teamError.value = false
    try {
      await api(`/teams/${team.id}/members/${member.userId}/quota`, {
        method: 'PATCH',
        body: JSON.stringify({ monthlyCreditLimit })
      })
      await reloadTeams()
      teamMessage.value = '成员月度限额已更新'
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '成员限额更新失败'
    } finally {
      teamBusy.value = false
    }
  }

  async function toggleTeamLedger(teamId: string) {
    if (teamLedgerOpenId.value === teamId) {
      teamLedgerOpenId.value = ''
      return
    }
    teamLedgerOpenId.value = teamId
    if (teamCreditLedgers[teamId]) return
    teamBusy.value = true
    try {
      teamCreditLedgers[teamId] = await api<TeamCreditEntry[]>(`/credits/teams/${teamId}/ledger?take=50`)
    } catch (reason) {
      teamError.value = true
      teamMessage.value = reason instanceof Error ? reason.message : '团队额度流水加载失败'
      teamLedgerOpenId.value = ''
    } finally {
      teamBusy.value = false
    }
  }

  return {
    teams, pendingTeamInvitations, teamDraft, teamInviteId, teamInviteEmail, teamInviteRole,
    teamBusy, teamMessage, teamError, expandedTeamId, teamResources, teamLedgerOpenId,
    teamCreditLedgers, teamQuotaDrafts, createTeam, inviteToTeam, acceptTeamInvitation,
    cancelTeamInvitation, transferTeamOwnership, removeTeamMember, updateTeamMemberRole,
    editTeam, leaveTeam, deleteTeam, toggleTeamResources, toggleTeamBilling,
    saveTeamMemberQuota, toggleTeamLedger
  }
}
