import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { NodeTypes, parse as parseTemplate } from '@vue/compiler-dom'

const roots = ['src', join('admin', 'src', 'views', 'xinyue')]
const actionElements = new Set(['button', 'a', 'ElButton', 'NButton', 'RouterLink'])
const uploadElements = new Set(['ElUpload', 'NUpload'])
const delegatedActionElements = new Set(['ElDropdown'])

async function vueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? vueFiles(path) : extname(entry.name) === '.vue' ? [path] : []
  }))
  return nested.flat()
}

function staticAttribute(node, name) {
  const prop = node.props.find((item) => item.type === NodeTypes.ATTRIBUTE && item.name === name)
  return prop?.value?.content || ''
}

function hasAttribute(node, name) {
  return node.props.some((item) => item.type === NodeTypes.ATTRIBUTE && item.name === name)
}

function hasDirective(node, name, argument) {
  return node.props.some((item) => item.type === NodeTypes.DIRECTIVE
    && item.name === name
    && (!argument || (item.arg?.type === NodeTypes.SIMPLE_EXPRESSION && item.arg.content === argument)))
}

function hasAction(node, ancestors) {
  if (ancestors.some((ancestor) => uploadElements.has(ancestor.tag) || delegatedActionElements.has(ancestor.tag))) return true
  if (hasDirective(node, 'on')) return true
  if (node.tag === 'a') return Boolean(staticAttribute(node, 'href') || hasDirective(node, 'bind', 'href'))
  if (node.tag === 'RouterLink') return Boolean(staticAttribute(node, 'to') || hasDirective(node, 'bind', 'to'))
  const type = staticAttribute(node, 'type').toLowerCase()
  if (node.tag === 'button' && type === 'submit' && ancestors.some((ancestor) => ancestor.tag === 'form')) return true
  if (hasAttribute(node, 'disabled') || hasDirective(node, 'bind', 'disabled')) return true
  return false
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length
}

function inspectTemplate(source, filename) {
  const ast = parseTemplate(source, { comments: false })
  const findings = []
  const visit = (node, ancestors = []) => {
    if (node.type === NodeTypes.ELEMENT) {
      if (actionElements.has(node.tag) && !hasAction(node, ancestors)) {
        findings.push(`${filename}:${lineAt(source, node.loc.start.offset)} <${node.tag}> 缺少点击、链接或提交行为`)
      }
      for (const child of node.children) visit(child, [...ancestors, node])
      return
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child, ancestors)
    }
    if (node.type === NodeTypes.IF) {
      for (const branch of node.branches) visit(branch, ancestors)
    }
  }
  visit(ast)
  return findings
}

const files = (await Promise.all(roots.map(vueFiles))).flat()
const findings = []
for (const file of files) {
  const source = await readFile(file, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: file })
  if (errors.length) {
    findings.push(...errors.map((error) => `${file}: ${String(error)}`))
    continue
  }
  if (descriptor.template?.content) findings.push(...inspectTemplate(descriptor.template.content, relative(process.cwd(), file)))
}

if (findings.length) {
  console.error(`发现 ${findings.length} 个可能失效的交互入口：`)
  findings.forEach((finding) => console.error(`- ${finding}`))
  process.exit(1)
}

console.log(`UI 操作审计通过：检查 ${files.length} 个 Vue 页面/组件，未发现无行为按钮或链接。`)
