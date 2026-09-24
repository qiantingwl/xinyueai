import assert from 'node:assert/strict'
import test from 'node:test'
import { presentSystemNav } from '../../server/src/common/sidebar-nav'
import { applySidebarNav, closedPageRedirect, emptySidebarNav, firstSidebarPath, firstWorkspacePath, moveSidebarItem, parseSidebarNav, visibleGroupTabs, visibleSidebarNav, visibleWorkspaceNav } from '../../src/utils/sidebar-nav.ts'

test('sidebar nav hides items including chat', () => {
  const items = [
    { key: 'chat', label: '新对话' },
    { key: 'creation', label: 'AI 创作' },
    { key: 'office', label: '办公中心' },
  ]
  const next = applySidebarNav(items, { order: ['office', 'chat', 'creation'], hidden: ['chat', 'creation'], labels: { office: '文档' } })
  assert.deepEqual(next.map((item) => item.key), ['office'])
  assert.equal(next[0]?.label, '文档')
})

test('parseSidebarNav ignores malformed payloads', () => {
  assert.deepEqual(parseSidebarNav(null), emptySidebarNav())
  assert.deepEqual(parseSidebarNav({ order: ['a', 1], hidden: ['b'], labels: { a: 'A', b: 2 } }), {
    order: ['a'],
    hidden: ['b'],
    labels: { a: 'A' },
    promoted: [],
  })
})

test('moveSidebarItem swaps neighbors and no-ops at the edges', () => {
  assert.deepEqual(moveSidebarItem(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c'])
  assert.deepEqual(moveSidebarItem(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c'])
})

test('workspace nav can reorder and hide files or canvases', () => {
  const flags = {
    workspaceNav: { order: ['canvases', 'projects', 'files'], hidden: ['files'], labels: { canvases: '创作画布' } },
    sidebarProjectsEnabled: true,
    sidebarAssetsEnabled: true,
    imagePromptEnabled: true,
  }
  const next = visibleWorkspaceNav(flags)
  assert.deepEqual(next.map((item) => item.key), ['canvases', 'projects', 'works', 'image-prompts'])
  assert.equal(next[0]?.label, '创作画布')
  assert.equal(firstWorkspacePath(flags), '/canvases')
})

test('closed workspace pages redirect to the first remaining tab', () => {
  const flags = {
    workspaceNav: { order: [], hidden: ['projects'], labels: {} },
    sidebarProjectsEnabled: true,
    sidebarAssetsEnabled: true,
    imagePromptEnabled: true,
    sidebarNav: emptySidebarNav(),
  }
  assert.equal(closedPageRedirect('/workspace', 'workspace', { tab: 'projects' }, flags), '/workspace?tab=files')
  assert.equal(closedPageRedirect('/workspace', 'workspace', { tab: 'files' }, flags), '')
})

test('hiding chat does not bounce conversation routes', () => {
  const flags = {
    sidebarNav: { order: ['creation', 'chat'], hidden: ['chat'], labels: {} },
    workspaceNav: emptySidebarNav(),
    sidebarCreationEnabled: true,
    sidebarProjectsEnabled: true,
    sidebarAssetsEnabled: true,
    imagePromptEnabled: true,
  }
  assert.equal(firstSidebarPath(flags), '/image')
  assert.equal(closedPageRedirect('/chat', 'chat', undefined, flags), '')
})

test('closed creation and workspace sidebar entries redirect away', () => {
  const flags = {
    sidebarNav: { order: [], hidden: ['creation', 'workspace'], labels: {} },
    workspaceNav: { order: ['files', 'projects'], hidden: [], labels: {} },
    sidebarCreationEnabled: false,
    sidebarProjectsEnabled: true,
    sidebarAssetsEnabled: true,
    imagePromptEnabled: true,
  }
  assert.equal(closedPageRedirect('/image', 'images', undefined, flags), '/chat')
  assert.equal(closedPageRedirect('/workspace', 'workspace', { tab: 'files' }, flags), '/chat')
})

test('workspace root follows the first remaining tab', () => {
  const flags = {
    workspaceNav: { order: ['canvases', 'projects'], hidden: [], labels: {} },
    sidebarProjectsEnabled: true,
    sidebarAssetsEnabled: true,
    imagePromptEnabled: true,
    sidebarNav: emptySidebarNav(),
  }
  assert.equal(closedPageRedirect('/workspace', 'workspace', undefined, flags), '/canvases')
  assert.equal(closedPageRedirect('/workspace', 'workspace', { tab: 'projects' }, flags), '')
})

test('promoted nested pages appear on the first-level sidebar', () => {
  const flags = {
    sidebarNav: { order: ['chat', 'projects', 'creation'], hidden: [], labels: {}, promoted: ['projects'] },
    workspaceNav: emptySidebarNav(),
    sidebarProjectsEnabled: true,
    sidebarAssetsEnabled: true,
    imagePromptEnabled: true,
    sidebarCreationEnabled: true,
  }
  assert.deepEqual(visibleSidebarNav(flags).map((item) => item.key), ['chat', 'projects', 'creation', 'commerce', 'office', 'prompts', 'plugins', 'workspace'])
  assert.equal(visibleSidebarNav(flags).find((item) => item.key === 'projects')?.to, '/workspace?tab=projects')
  assert.deepEqual(visibleWorkspaceNav(flags).map((item) => item.key), ['files', 'works', 'canvases', 'image-prompts'])
  assert.equal(closedPageRedirect('/workspace', 'workspace', { tab: 'projects' }, flags), '')
})

test('promoted creation pages stay on their own routes', () => {
  const flags = {
    sidebarNav: { order: [], hidden: [], labels: {}, promoted: ['videos'] },
    workspaceNav: emptySidebarNav(),
    sectionNav: { creation: emptySidebarNav(), plugins: emptySidebarNav(), prompts: emptySidebarNav() },
    sidebarCreationEnabled: true,
  }
  assert.deepEqual(visibleGroupTabs('creation', flags).map((item) => item.key), ['images'])
  assert.equal(visibleSidebarNav(flags).find((item) => item.key === 'videos')?.to, '/video')
  assert.equal(closedPageRedirect('/video', 'videos', undefined, flags), '')
  assert.equal(visibleSidebarNav(flags).find((item) => item.key === 'creation')?.to, '/image')
})

test('works is a workspace tab and can be hidden', () => {
  const flags = {
    workspaceNav: emptySidebarNav(),
    sidebarProjectsEnabled: true,
    sidebarAssetsEnabled: true,
    imagePromptEnabled: true,
    sidebarNav: emptySidebarNav(),
  }
  assert.deepEqual(visibleWorkspaceNav(flags).map((item) => item.key), ['projects', 'files', 'works', 'canvases', 'image-prompts'])
  assert.equal(visibleWorkspaceNav(flags).find((item) => item.key === 'works')?.to, '/works')
  assert.equal(closedPageRedirect('/works', 'works', undefined, flags), '')
  assert.equal(closedPageRedirect('/works', 'works', undefined, {
    ...flags,
    workspaceNav: { order: [], hidden: ['works'], labels: {} },
  }), '/workspace?tab=projects')
})

test('system settings unpack sidebar and section nav once', () => {
  const next = presentSystemNav({ order: ['chat'], hidden: [], labels: {}, promoted: ['projects'] }, {
    order: ['files'],
    hidden: [],
    labels: {},
    creation: { order: ['videos'], hidden: [], labels: {}, promoted: [] },
  })
  assert.deepEqual(next.sidebarNav.promoted, ['projects'])
  assert.deepEqual(next.workspaceNav.order, ['files'])
  assert.deepEqual(next.sectionNav.creation.order, ['videos'])
  assert.deepEqual(next.sectionNav.plugins.order, [])
})
