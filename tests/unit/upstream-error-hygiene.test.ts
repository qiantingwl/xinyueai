import assert from 'node:assert/strict'
import test from 'node:test'
import { UpstreamChannelError, publicUpstreamHealthMessage, upstreamHttpError, upstreamSafeMessage } from '../../server/src/providers/upstream-errors'

test('上游 HTTP 失败只暴露状态码与可执行提示', () => {
  const error = upstreamHttpError('渠道模型目录', 401)
  assert.match(error.message, /HTTP 401/)
  assert.match(error.message, /请检查 API 密钥/)
  assert.equal(error instanceof UpstreamChannelError, true)
})

test('未知状态码按区间给出兜底提示', () => {
  assert.match(upstreamHttpError('Worker 健康检查', 503).message, /上游服务异常/)
  assert.match(upstreamHttpError('Worker 健康检查', 418).message, /上游请求未成功/)
})

test('上游响应体、内部路径与密钥不会进入对外错误信息', () => {
  const leaky = new Error('HTTP 500: {"error":{"message":"invalid key sk-live-abc123","url":"http://10.0.0.7:8080/internal"}}')
  const message = upstreamSafeMessage(leaky)
  assert.doesNotMatch(message, /sk-live-abc123/)
  assert.doesNotMatch(message, /10\.0\.0\.7/)
  assert.doesNotMatch(message, /internal/)
  assert.match(message, /连接上游渠道失败/)
})

test('自建提示按原文保留，超时与非法 JSON 各有专属提示', () => {
  assert.equal(upstreamSafeMessage(new UpstreamChannelError('渠道未返回可识别的模型列表')), '渠道未返回可识别的模型列表')

  const timeout = new Error('The operation was aborted due to timeout')
  timeout.name = 'TimeoutError'
  assert.match(upstreamSafeMessage(timeout), /超时/)

  assert.match(upstreamSafeMessage(new SyntaxError('Unexpected token < in JSON at position 0')), /不是合法 JSON/)
})

test('文件系统错误不会把绝对路径写进对外错误信息', () => {
  const fsError = Object.assign(new Error("ENOENT: no such file or directory, open 'C:\\srv\\xinyue\\storage\\exports\\a.json'"), { code: 'ENOENT' })
  const message = upstreamSafeMessage(fsError)
  assert.doesNotMatch(message, /storage/)
  assert.doesNotMatch(message, /C:\\/)
})

test('渠道健康通知不会回传上游响应体', () => {
  const leaky = 'Provider returned 402: {"error":{"message":"Insufficient Balance","type":"unknown_error","code":"invalid_request_error"}}'
  const message = publicUpstreamHealthMessage(leaky)
  assert.equal(message, '上游账户余额不足，请检查渠道充值')
  assert.doesNotMatch(message, /Insufficient Balance/)
  assert.doesNotMatch(message, /invalid_request_error/)
  assert.doesNotMatch(message, /Provider returned/)
})

test('已经写好的中文健康说明保持原文', () => {
  assert.equal(publicUpstreamHealthMessage('连续失败 5 次'), '连续失败 5 次')
})
