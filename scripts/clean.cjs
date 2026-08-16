const { existsSync, readdirSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '..')
const reportsOnly = process.argv.includes('--reports')
const directories = reportsOnly
  ? ['test-results', 'playwright-report', '.playwright-cli', join('output', 'playwright')]
  : [
      'dist',
      join('admin', 'dist'),
      join('server', 'dist'),
      'test-results',
      'playwright-report',
      '.playwright-cli',
      'output',
      'xiaoye.io_yibazhan'
    ]
const rootFiles = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && (entry.name.endsWith('.tsbuildinfo') || (!reportsOnly && (entry.name.endsWith('.log') || entry.name.endsWith('.png')))))
  .map((entry) => entry.name)
const serverLogs = reportsOnly
  ? []
  : readdirSync(join(root, 'server'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
      .map((entry) => join('server', entry.name))
const targets = [...directories, ...rootFiles, ...serverLogs]
for (const target of targets) {
  const absoluteTarget = join(root, target)
  if (!existsSync(absoluteTarget)) continue
  try {
    rmSync(absoluteTarget, { recursive: true, force: true })
    console.log(`removed ${target}`)
  } catch (error) {
    if (error && (error.code === 'EPERM' || error.code === 'EBUSY')) {
      console.warn(`skipped active file ${target}`)
      continue
    }
    throw error
  }
}

const outputDirectory = join(root, 'output')
if (existsSync(outputDirectory) && readdirSync(outputDirectory).length === 0) {
  rmSync(outputDirectory, { recursive: true })
  console.log('removed empty output directory')
}
