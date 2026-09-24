// 从 URL 和路径模块中导入必要的功能
import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

// 从 ESLint 插件中导入推荐配置
import pluginJs from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// 使用 import.meta.url 获取当前模块的路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// unplugin-auto-import 在 Vite 启动时写出 .auto-import.json，该文件被 gitignore。
// CI 只跑 lint、不会先启动 Vite。缺失时改从已提交的 auto-imports.d.ts 读取全局名称。
// 类型名（如 VNode）只出现在 d.ts 的 type 再导出里，生成的 JSON 不含它们，因此始终合并进来。
function globalsFromAutoImportDts() {
  const dtsPath = path.resolve(__dirname, 'src/types/import/auto-imports.d.ts')
  if (!fs.existsSync(dtsPath)) return {}

  const globals = {}
  const source = fs.readFileSync(dtsPath, 'utf-8')
  for (const match of source.matchAll(/^ {2}const (\w+):/gm)) globals[match[1]] = true
  const typeExport = source.match(/export type \{([^}]+)\}/)
  if (typeExport) {
    for (const name of typeExport[1].split(',')) {
      const trimmed = name.trim()
      if (trimmed) globals[trimmed] = true
    }
  }
  return globals
}

function loadAutoImportGlobals() {
  const fromDts = globalsFromAutoImportDts()
  const jsonPath = path.resolve(__dirname, '.auto-import.json')
  if (!fs.existsSync(jsonPath)) return fromDts

  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  return { ...fromDts, ...(parsed.globals ?? {}) }
}

const autoImportGlobals = loadAutoImportGlobals()

export default [
  // 指定文件匹配规则
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,vue}']
  },
  // 指定全局变量和环境
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  // 扩展配置
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  // 自定义规则
  {
    // 针对所有 JavaScript、TypeScript 和 Vue 文件应用以下配置
    files: ['**/*.{js,mjs,cjs,ts,tsx,vue}'],

    languageOptions: {
      globals: {
        // 合并从 autoImportConfig 中读取的全局变量配置
        ...autoImportGlobals,
        // TypeScript 全局命名空间
        Api: 'readonly'
      }
    },
    rules: {
      quotes: ['error', 'single'], // 使用单引号
      semi: ['error', 'never'], // 语句末尾不加分号
      'no-var': 'error', // 要求使用 let 或 const 而不是 var
      '@typescript-eslint/no-explicit-any': 'off', // 禁用 any 检查
      'vue/multi-word-component-names': 'off', // 禁用对 Vue 组件名称的多词要求检查
      'no-multiple-empty-lines': ['warn', { max: 1 }], // 不允许多个空行
      'no-unexpected-multiline': 'error' // 禁止空余的多行
    }
  },
  // vue 规则
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser }
    }
  },
  // 忽略文件
  {
    ignores: [
      'node_modules',
      'dist',
      'public',
      '.vscode/**',
      'src/assets/**',
      'src/utils/console.ts'
    ]
  },
  // prettier 配置
  eslintPluginPrettierRecommended
]
