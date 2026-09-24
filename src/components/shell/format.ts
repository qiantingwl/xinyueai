import { formatDayTime, formatFullDay } from '../../utils/datetime'

// 设置分区沿用这两个语义化名字；日期格式本身统一由 utils/datetime 决定。
export const formatServerDate = (value: string) => formatDayTime(value)

export const formatInvitationExpiry = (value: string) => `${formatFullDay(value)} 到期`
