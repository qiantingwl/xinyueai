/**
 * 聊天 Layout 注册表——多 Layout 切换的唯一配置入口。
 *
 * preset 值由服务端 `/catalog/settings` 的 `chatUiPreset` 下发（管理后台配置），
 * 只控制空白聊天首页。进入会话后统一使用豆包布局，避免后台首页模板改变
 * 已有对话的消息区和输入框。
 */
import type { ChatUiPreset } from '../stores/catalog'

export interface ChatLayoutConfig {
  key: ChatUiPreset
  /** 内容区宽度：standard 居中单列 / wide 更宽的阅读区（Kimi） */
  contentWidth: 'standard' | 'wide'
  /** 输入框形态：floating-card 悬浮卡片 / docked 贴底通栏 */
  composer: 'floating-card' | 'docked'
  /** 顶栏形态：minimal 仅模型与分享 / productized 更丰富的功能入口 */
  header: 'minimal' | 'productized'
  /** 空状态首页：centered 居中问候 / banner 产品化横幅+推荐 */
  homeLayout: 'centered' | 'banner'
  /** AI 消息样式：plain 全宽无卡片 / carded 卡片化 */
  messageStyle: 'plain' | 'carded'
}

export const CHAT_LAYOUTS: Record<ChatUiPreset, ChatLayoutConfig> = {
  gpt: {
    key: 'gpt',
    contentWidth: 'standard',
    composer: 'floating-card',
    header: 'minimal',
    homeLayout: 'centered',
    messageStyle: 'plain',
  },
  kimi: {
    key: 'kimi',
    contentWidth: 'wide',
    composer: 'floating-card',
    header: 'minimal',
    homeLayout: 'centered',
    messageStyle: 'plain',
  },
  qianwen: {
    key: 'qianwen',
    contentWidth: 'standard',
    composer: 'floating-card',
    header: 'productized',
    homeLayout: 'banner',
    messageStyle: 'plain',
  },
  doubao: {
    key: 'doubao',
    contentWidth: 'standard',
    composer: 'floating-card',
    header: 'productized',
    homeLayout: 'banner',
    messageStyle: 'plain',
  },
  jixing: {
    key: 'jixing',
    contentWidth: 'standard',
    composer: 'floating-card',
    header: 'productized',
    homeLayout: 'banner',
    messageStyle: 'plain',
  },
}

export function getChatLayout(preset: ChatUiPreset): ChatLayoutConfig {
  return CHAT_LAYOUTS[preset] ?? CHAT_LAYOUTS.gpt
}

export function resolveChatUiPreset(homePreset: ChatUiPreset, conversationActive: boolean): ChatUiPreset {
  return conversationActive ? 'doubao' : homePreset
}
