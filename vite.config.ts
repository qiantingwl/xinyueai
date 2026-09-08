import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { Agent } from 'node:http'

const apiProxyAgent = new Agent({ keepAlive: true, maxFreeSockets: 8, maxSockets: 32 })
const apiProxy = {
  target: process.env.VITE_API_PROXY || 'http://localhost:3100',
  changeOrigin: true,
  agent: apiProxyAgent,
}

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 6001,
    proxy: {
      '/v1': apiProxy,
    },
  },
  preview: {
    proxy: {
      '/v1': apiProxy,
    },
  },
})
