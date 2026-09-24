import assert from 'node:assert/strict'
import test from 'node:test'
import { localPromptLibraryEntries } from '../../server/src/prompt-templates/prompt-library.defaults.ts'

test('内置图片提示词封面池足够分散且相邻不撞图', () => {
  const imageEntries = localPromptLibraryEntries.filter((entry) => !entry.sourceId.startsWith('video-'))
  assert.ok(imageEntries.length >= 20, `默认图片条目应保持规模，实际 ${imageEntries.length}`)

  const coverUse = new Map<string, number>()
  for (const entry of imageEntries) coverUse.set(entry.coverUrl, (coverUse.get(entry.coverUrl) || 0) + 1)
  const distinctCovers = coverUse.size
  assert.ok(distinctCovers >= 8, `封面池应不少于 8 张，实际 ${distinctCovers}`)
  const maxUse = Math.max(...coverUse.values())
  assert.ok(maxUse <= Math.ceil(imageEntries.length / 4), `单张封面最多复用 1/4 条目数，实际最高 ${maxUse}`)

  const adjacentDuplicates = imageEntries.filter((entry, index) => index > 0 && entry.coverUrl === imageEntries[index - 1].coverUrl)
  assert.equal(adjacentDuplicates.length, 0, `相邻条目不应使用同一封面: ${adjacentDuplicates.map((entry) => entry.title).join(', ')}`)
})
