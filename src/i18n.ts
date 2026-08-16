import { createI18n } from 'vue-i18n'
import { readStoredSettings } from './utils/settings-storage'

export const supportedLocales = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko'] as const
export type AppLocale = typeof supportedLocales[number]

const zhCN = {
  workspace: { newChat: '新对话', creation: 'AI 创作', images: '图片', videos: '视频', commerce: '电商中心', office: '办公中心', prompts: '提示词库', plugins: '能力中心', projects: '项目', assets: '文件库', api: 'API', recent: '最近', noChats: '暂无对话', settings: '设置', signIn: '登录', personalization: '个性化', account: '个人资料', logout: '退出登录' },
  settings: { general: '常规', personalization: '个性化', notifications: '通知', data: '数据控制', api: 'API 与模型', credits: '创作点', redeem: '兑换码', invite: '邀请与奖励', account: '账户', appearance: '外观', language: '语言', dark: '深色', light: '浅色', system: '跟随系统' },
  studio: { thought: '你今天在想些什么？', thinking: '正在思考', messagePlaceholder: '想聊什么都可以', model: '模型', images: '图片', videos: '视频', commerce: '商品图', inspiration: '灵感', myImages: '我的图片', myVideos: '我的视频', myCommerce: '我的商品图', projects: '项目', library: '资料库', create: '新建', search: '搜索' },
  login: { account: 'Xinyue AI 账户', title: '登录 Xinyue AI', subtitle: '使用邮箱继续，首次登录将自动创建账号。', email: '邮箱', sending: '正在发送', continue: '继续', checkEmail: '检查你的邮箱', sentTo: '验证码已发送至 {email}', code: '验证码', verifying: '正在验证', signIn: '登录', resendIn: '{seconds} 秒后重新发送', resend: '重新发送验证码', success: '登录成功', entering: '正在进入 Xinyue AI', invalidEmail: '请输入有效的邮箱地址', invalidCode: '请输入六位验证码', sendFailed: '验证码发送失败', loginFailed: '登录失败', legal: '继续即表示你同意 Xinyue AI 的用户协议和隐私政策。', terms: '用户协议', privacy: '隐私政策', back: '返回修改邮箱' },
}

const en = {
  workspace: { newChat: 'New chat', creation: 'AI creation', images: 'Images', videos: 'Videos', commerce: 'Commerce studio', office: 'Office center', prompts: 'Prompt library', plugins: 'Plugin market', projects: 'Projects', assets: 'Library', api: 'API', recent: 'Recent', noChats: 'No conversations', settings: 'Settings', signIn: 'Sign in', personalization: 'Personalization', account: 'Profile', logout: 'Sign out' },
  settings: { general: 'General', personalization: 'Personalization', notifications: 'Notifications', data: 'Data controls', api: 'API & models', credits: 'Credits', redeem: 'Redeem code', invite: 'Invites & rewards', account: 'Account', appearance: 'Appearance', language: 'Language', dark: 'Dark', light: 'Light', system: 'System' },
  studio: { thought: 'What are you thinking about today?', thinking: 'Thinking', messagePlaceholder: 'Ask anything', model: 'Model', images: 'Image generation', videos: 'Video generation', commerce: 'Commerce studio', inspiration: 'Inspiration', myImages: 'My images', myVideos: 'My videos', myCommerce: 'My commerce assets', projects: 'Projects', library: 'Library', create: 'New', search: 'Search' },
  login: { account: 'Xinyue AI account', title: 'Sign in to Xinyue AI', subtitle: 'Continue with email. Your account will be created on first sign-in.', email: 'Email', sending: 'Sending', continue: 'Continue', checkEmail: 'Check your email', sentTo: 'We sent a code to {email}', code: 'Verification code', verifying: 'Verifying', signIn: 'Sign in', resendIn: 'Resend in {seconds}s', resend: 'Resend code', success: 'Signed in', entering: 'Opening Xinyue AI', invalidEmail: 'Enter a valid email address', invalidCode: 'Enter the six-digit code', sendFailed: 'Could not send the code', loginFailed: 'Sign-in failed', legal: 'By continuing, you agree to the Xinyue AI Terms and Privacy Policy.', terms: 'Terms', privacy: 'Privacy Policy', back: 'Change email' },
}

const zhTW = {
  workspace: { ...zhCN.workspace, newChat: '新對話', creation: 'AI 創作', images: '圖片生成', videos: '影片生成', commerce: '電商中心', office: '辦公中心', prompts: '提示詞庫', plugins: '外掛市集', projects: '專案', assets: '檔案庫', recent: '最近', noChats: '暫無對話', settings: '設定', signIn: '登入', personalization: '個人化', account: '個人資料', logout: '登出' },
  settings: { ...zhCN.settings, general: '一般', personalization: '個人化', notifications: '通知', data: '資料控制', api: 'API 與模型', credits: '創作點', redeem: '兌換碼', invite: '邀請與獎勵', account: '帳戶', appearance: '外觀', language: '語言', dark: '深色', light: '淺色', system: '跟隨系統' },
  studio: { ...zhCN.studio, thought: '你今天在想些什麼？', thinking: '正在思考', messagePlaceholder: '想聊什麼都可以', images: '圖片生成', videos: '影片生成', commerce: '商品圖', inspiration: '靈感', myImages: '我的圖片', myVideos: '我的影片', myCommerce: '我的商品圖', projects: '專案', library: '資料庫', create: '新增', search: '搜尋' },
  login: { ...zhCN.login, account: 'Xinyue AI 帳戶', title: '登入 Xinyue AI', subtitle: '使用電子郵件繼續，首次登入將自動建立帳戶。', email: '電子郵件', sending: '正在傳送', continue: '繼續', checkEmail: '檢查你的電子郵件', sentTo: '驗證碼已傳送至 {email}', code: '驗證碼', verifying: '正在驗證', signIn: '登入', resendIn: '{seconds} 秒後重新傳送', resend: '重新傳送驗證碼', success: '登入成功', entering: '正在進入 Xinyue AI', invalidEmail: '請輸入有效的電子郵件地址', invalidCode: '請輸入六位驗證碼', sendFailed: '驗證碼傳送失敗', loginFailed: '登入失敗', legal: '繼續即表示你同意 Xinyue AI 的使用者協議和隱私權政策。', terms: '使用者協議', privacy: '隱私權政策', back: '返回修改電子郵件' },
}

const ja = {
  workspace: { newChat: '新しいチャット', creation: 'AI 作成', images: '画像生成', videos: '動画生成', commerce: 'コマース', office: 'オフィス', prompts: 'プロンプト', plugins: 'プラグイン', projects: 'プロジェクト', assets: 'ライブラリ', api: 'API', recent: '最近', noChats: '会話はありません', settings: '設定', signIn: 'ログイン', personalization: 'パーソナライズ', account: 'プロフィール', logout: 'ログアウト' },
  settings: { general: '一般', personalization: 'パーソナライズ', notifications: '通知', data: 'データ管理', api: 'API とモデル', credits: 'クレジット', redeem: 'コード交換', invite: '招待と報酬', account: 'アカウント', appearance: '外観', language: '言語', dark: 'ダーク', light: 'ライト', system: 'システム' },
  studio: { thought: '今日は何を考えていますか？', thinking: '考えています', messagePlaceholder: '何でも聞いてください', model: 'モデル', images: '画像生成', videos: '動画生成', commerce: '商品画像', inspiration: 'インスピレーション', myImages: 'マイ画像', myVideos: 'マイ動画', myCommerce: '商品素材', projects: 'プロジェクト', library: 'ライブラリ', create: '新規', search: '検索' },
  login: { account: 'Xinyue AI アカウント', title: 'Xinyue AI にログイン', subtitle: 'メールで続行します。初回ログイン時にアカウントが作成されます。', email: 'メール', sending: '送信中', continue: '続行', checkEmail: 'メールを確認', sentTo: '{email} にコードを送信しました', code: '認証コード', verifying: '確認中', signIn: 'ログイン', resendIn: '{seconds}秒後に再送信', resend: 'コードを再送信', success: 'ログインしました', entering: 'Xinyue AI を開いています', invalidEmail: '有効なメールアドレスを入力してください', invalidCode: '6桁のコードを入力してください', sendFailed: 'コードを送信できませんでした', loginFailed: 'ログインに失敗しました', legal: '続行すると、Xinyue AI の利用規約とプライバシーポリシーに同意したものとみなされます。', terms: '利用規約', privacy: 'プライバシーポリシー', back: 'メールを変更' },
}

const ko = {
  workspace: { newChat: '새 대화', creation: 'AI 만들기', images: '이미지 생성', videos: '동영상 생성', commerce: '커머스', office: '오피스 센터', prompts: '프롬프트', plugins: '플러그인', projects: '프로젝트', assets: '라이브러리', api: 'API', recent: '최근', noChats: '대화 없음', settings: '설정', signIn: '로그인', personalization: '개인화', account: '프로필', logout: '로그아웃' },
  settings: { general: '일반', personalization: '개인화', notifications: '알림', data: '데이터 관리', api: 'API 및 모델', credits: '크레딧', redeem: '코드 등록', invite: '초대 및 보상', account: '계정', appearance: '화면 모드', language: '언어', dark: '다크', light: '라이트', system: '시스템' },
  studio: { thought: '오늘은 무슨 생각을 하고 있나요?', thinking: '생각 중', messagePlaceholder: '무엇이든 물어보세요', model: '모델', images: '이미지 생성', videos: '동영상 생성', commerce: '상품 이미지', inspiration: '영감', myImages: '내 이미지', myVideos: '내 동영상', myCommerce: '상품 자료', projects: '프로젝트', library: '라이브러리', create: '새로 만들기', search: '검색' },
  login: { account: 'Xinyue AI 계정', title: 'Xinyue AI 로그인', subtitle: '이메일로 계속하세요. 처음 로그인할 때 계정이 생성됩니다.', email: '이메일', sending: '전송 중', continue: '계속', checkEmail: '이메일 확인', sentTo: '{email}로 코드를 보냈습니다', code: '인증 코드', verifying: '확인 중', signIn: '로그인', resendIn: '{seconds}초 후 다시 보내기', resend: '코드 다시 보내기', success: '로그인 성공', entering: 'Xinyue AI로 이동 중', invalidEmail: '올바른 이메일 주소를 입력하세요', invalidCode: '6자리 코드를 입력하세요', sendFailed: '코드를 보내지 못했습니다', loginFailed: '로그인 실패', legal: '계속하면 Xinyue AI 이용약관 및 개인정보 처리방침에 동의하는 것입니다.', terms: '이용약관', privacy: '개인정보 처리방침', back: '이메일 변경' },
}

function initialLocale(): AppLocale {
  const stored = readStoredSettings().language
  if (typeof stored === 'string' && supportedLocales.includes(stored as AppLocale)) return stored as AppLocale
  const browser = navigator.language
  if (browser.startsWith('zh-TW') || browser.startsWith('zh-HK')) return 'zh-TW'
  if (browser.startsWith('ja')) return 'ja'
  if (browser.startsWith('ko')) return 'ko'
  if (browser.startsWith('en')) return 'en'
  return 'zh-CN'
}

export const i18n = createI18n({ legacy: false, locale: initialLocale(), fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja, ko } })
