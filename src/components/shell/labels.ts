import type { AvailableModel, ProviderType } from './types'

export const rechargeStatusText: Record<string, string> = { PENDING: '待支付', PAID: '已到账', CANCELLED: '已取消', REFUNDED: '已退款' }
/** 支付弹窗标题：与 rechargeStatusText 的短胶囊文案区分，这里是面向用户的完整结果叙述。 */
export const paymentStatusTitleText: Record<string, string> = { PENDING: '等待完成付款', PAID: '付款已确认，正在发放权益', COMPLETED: '支付完成，权益已到账', FAILED: '支付或权益入账失败', CANCELLED: '交易已取消', EXPIRED: '交易已过期', REFUNDED: '交易已退款' }
export const renewalAttemptText: Record<string, string> = { SCHEDULED: '已计划', PROCESSING: '处理中', PAYMENT_REQUIRED: '待支付', SUCCEEDED: '成功', FAILED: '失败', CANCELLED: '已取消' }
export const invoiceStatusText: Record<string, string> = { REQUESTED: '待审核', REVIEWING: '审核中', ISSUED: '已开具', REJECTED: '已拒绝', CANCELLED: '已撤销' }
export const moderationSourceText: Record<string, string> = { CHAT: '对话', IMAGE: '图片生成', COMMERCE: '商品视觉', FILE_NAME: '文件', SUPPORT: '客服' }
export const providerTypeLabel: Record<ProviderType, string> = { OPENAI: 'OpenAI', NEW_API: 'NewAPI', SUB2API: 'Sub2API', OPENAI_COMPATIBLE: 'OpenAI 兼容' }
export const routingStrategyLabel: Record<string, string> = { PRIORITY: '优先级', WEIGHTED: '权重分流', ROUND_ROBIN: '轮询' }
export const modelCapabilityLabel: Record<AvailableModel['capability'], string> = { CHAT: '对话', IMAGE: '图片', VIDEO: '视频', COMMERCE: '商品图' }
export const teamRoleText: Record<string, string> = { OWNER: '所有者', ADMIN: '管理员', MEMBER: '成员' }
