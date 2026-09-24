// Start the API (NestJS, port 3100) and the web frontend (Vite, port 5173)
// together so a single `npm run dev` gives a fully working local app.
// Any CLI args (e.g. --host/--port) are forwarded to Vite.
const { spawn } = require('node:child_process')
const { resolve } = require('node:path')

const root = resolve(__dirname, '..')
const isWin = process.platform === 'win32'
const npm = isWin ? 'npm.cmd' : 'npm'
const children = []

function run(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', env: process.env, shell: isWin })
  child.on('exit', (code) => {
    console.log(`[dev-all] ${name} exited with code ${code}`)
    shutdown(code || 0)
  })
  children.push(child)
  return child
}

function killTree(child) {
  if (!child || child.killed) return
  try {
    if (isWin) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
    } else {
      child.kill('SIGTERM')
    }
  } catch { /* ignore */ }
}

let shuttingDown = false
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) killTree(child)
  setTimeout(() => process.exit(code), 500).unref()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('api', npm, ['--prefix', 'server', 'run', 'dev'], root)
run('web', npm, ['exec', '--', 'vite', '--host', '0.0.0.0', ...process.argv.slice(2)], root)
