import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { defaultPreinstalledSkillSlugs, defaultSkillCategoryPresets, defaultSkillPresets } from '../../server/src/plugins/default-skill-presets'
import { isPreinstalledPlugin, preinstalledPluginWhere } from '../../server/src/plugins/plugin-preinstall'
import { defaultAssistantPresets } from '../../server/src/workspace/default-capability-presets'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const capabilityValues: readonly string[] = ['CHAT', 'IMAGE', 'VIDEO', 'COMMERCE', 'OFFICE']

test('默认技能标识唯一、分类存在且指令完整', () => {
  const categories = new Set(defaultSkillCategoryPresets.map((item) => item.slug))
  assert.equal(categories.size, defaultSkillCategoryPresets.length)
  assert.equal(new Set(defaultSkillPresets.map((item) => item.slug)).size, defaultSkillPresets.length)
  for (const skill of defaultSkillPresets) {
    assert.match(skill.slug, slugPattern)
    assert.ok(categories.has(skill.category), `${skill.slug} 分类不存在`)
    assert.ok(skill.capabilities.length > 0)
    assert.ok(skill.capabilities.every((item) => capabilityValues.includes(item)))
    assert.ok(skill.name.length <= 80)
    assert.ok(skill.description.length >= 15 && skill.description.length <= 500)
    assert.ok(skill.instruction.length >= 60 && skill.instruction.length <= 20_000)
    assert.ok(skill.outputRequirements.length <= 4_000)
  }
})

test('图示类对话技能输出可预览的 HTML 或 SVG 代码块', () => {
  for (const slug of ['flowchart', 'mind-map', 'svg-vector', 'infographic', 'data-chart', 'html-prototype']) {
    const skill = defaultSkillPresets.find((item) => item.slug === slug)
    assert.ok(skill, slug)
    assert.ok(skill.capabilities.includes('CHAT'))
    assert.match(skill.outputRequirements, /```(?:html|svg)/)
    assert.match(skill.outputRequirements, /外部/)
  }
})

test('默认启用技能覆盖对话、图片与办公入口', () => {
  assert.equal(new Set(defaultPreinstalledSkillSlugs).size, defaultPreinstalledSkillSlugs.length)
  const preinstalled = defaultSkillPresets.filter((item) => defaultPreinstalledSkillSlugs.includes(item.slug))
  for (const capability of ['CHAT', 'IMAGE', 'OFFICE'] as const) {
    assert.ok(preinstalled.some((item) => item.capabilities.includes(capability)), capability)
  }
})

test('只有免费的官方技能可以免安装使用', () => {
  const base = { config: { preinstalled: true }, priceCredits: 0, ownerId: null, visibility: 'OFFICIAL' }
  assert.equal(isPreinstalledPlugin(base), true)
  assert.equal(isPreinstalledPlugin({ ...base, priceCredits: 10 }), false)
  assert.equal(isPreinstalledPlugin({ ...base, ownerId: 'user-1', visibility: 'PRIVATE' }), false)
  assert.equal(isPreinstalledPlugin({ ...base, config: { preinstalled: false } }), false)
  assert.equal(isPreinstalledPlugin({ ...base, config: null }), false)
  const where = preinstalledPluginWhere('user-1')
  assert.deepEqual(where.installations, { none: { userId: 'user-1' } })
  assert.equal(where.priceCredits, 0)
})

test('默认助手引用的提示词模板都由迁移预置', () => {
  const seeded = new Set<string>()
  for (const name of ['20260809040000_seed_prompt_templates', '20260809050000_expand_prompt_templates']) {
    const sql = readFileSync(new URL(`../../server/prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8')
    for (const match of sql.matchAll(/'(prompt-[a-z0-9-]+)'/g)) seeded.add(match[1])
  }
  for (const assistant of defaultAssistantPresets) {
    for (const id of assistant.templateIds) assert.ok(seeded.has(id), `${assistant.id} 引用了不存在的模板 ${id}`)
  }
})
