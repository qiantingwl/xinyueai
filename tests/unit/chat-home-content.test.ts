import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeChatHomeContent } from '../../server/src/providers/chat-home-content.ts'

test('聊天主页配置限制数量并校验跳转协议', () => {
  const result = normalizeChatHomeContent({
    doubaoRecommendations: Array.from({ length: 15 }, (_, index) => ({
      title: `推荐 ${index + 1}`,
      prompt: '内容',
      targetUrl: index === 0 ? 'javascript:alert(1)' : `/chat?item=${index}`
    }))
  })

  assert.equal(result.doubaoRecommendations.length, 12)
  assert.equal(result.doubaoRecommendations[0].targetUrl, '')
  assert.equal(result.doubaoRecommendations[1].targetUrl, '/chat?item=1')
})

test('聊天主页配置拒绝协议相对和反斜线相对地址', () => {
  const result = normalizeChatHomeContent({
    qianwenBanners: [
      { title: '协议相对地址', targetUrl: '//attacker.example/path' },
      { title: '反斜线地址', targetUrl: '/\\attacker.example/path' },
    ],
  })

  assert.equal(result.qianwenBanners[0]?.targetUrl, '/office')
  assert.equal(result.qianwenBanners[1]?.targetUrl, '/office')
})

test('设计快捷入口把旧的生图地址纠正到画布', () => {
  const result = normalizeChatHomeContent({
    quickActions: {
      kimi: [
        { id: 'kimi-design', label: '设计', icon: 'design', placement: 'BAR', actionType: 'ROUTE', target: '/image' },
      ],
    },
  })
  const design = result.quickActions.kimi.find((item) => item.id === 'kimi-design')
  assert.equal(design?.target, '/canvases')
})

test('快捷能力 ID 去重且只接受受支持的动作类型', () => {
  const result = normalizeChatHomeContent({
    quickActions: {
      gpt: [
        { id: 'same id', label: '动作一', actionType: 'INVALID', placement: 'INVALID' },
        { id: 'same id', label: '动作二', actionType: 'ROUTE', placement: 'BAR', target: '/image' }
      ]
    }
  })

  assert.deepEqual(result.quickActions.gpt.map((item) => item.id), ['same-id', 'same-id-2'])
  assert.equal(result.quickActions.gpt[0].actionType, 'PROMPT')
  assert.equal(result.quickActions.gpt[0].placement, 'MORE')
  assert.equal(result.quickActions.gpt[1].target, '/image')
})

test('旧轮播标题不再触发运行时内容迁移', () => {
  const result = normalizeChatHomeContent({
    qianwenBanners: [{
      title: '一键生成录音纪要',
      description: '管理员保存的内容',
      buttonText: '查看',
      targetUrl: '/office?tool=meeting'
    }]
  })

  assert.equal(result.qianwenBanners[0].title, '一键生成录音纪要')
  assert.equal(result.qianwenBanners[0].description, '管理员保存的内容')
})
