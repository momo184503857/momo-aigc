/**
 * 错误消息中文化映射
 * 对应 PRD 第 10 节错误提示表
 */

export function translateError(err: any): string {
  // If it's already a string, check for known patterns
  const msg: string = typeof err === 'string'
    ? err
    : err?.message || err?.error?.message || JSON.stringify(err)

  // HTTP status-based
  if (err?.status) {
    const code = err.status
    const map: Record<number, string> = {
      401: 'API Key 不正确或已失效，请重新填写',
      402: '积分不足，请先充值',
      404: '没找到这个任务，可能 Key 不一致或任务 ID 错误',
      422: '图片或提示词可能触发平台限制，请换图或修改提示词',
      429: '请求太频繁，稍等几秒再试',
      500: '服务异常，请稍后重试',
    }
    if (map[code]) return map[code]
  }

  // String pattern matching
  if (/(?:unauthorized|401|invalid.*key|invalid.*token)/i.test(msg)) {
    return 'API Key 不正确或已失效，请重新填写'
  }
  if (/(?:insufficient.*quota|402|balance|no.*credit|insufficient.*balance|积分不足)/i.test(msg)) {
    return '余额不足，请先充值'
  }
  if (/(?:not.*found|404|task.*not.*found)/i.test(msg)) {
    return '没找到这个任务，可能 Key 不一致或任务 ID 错误'
  }
  if (/(?:content.*policy|422|policy.*violation|safety)/i.test(msg)) {
    return '图片或提示词可能触发平台限制，请换图或修改提示词'
  }
  if (/(?:rate.*limit|429|too.*many.*requests)/i.test(msg)) {
    return '请求太频繁，稍等几秒再试'
  }
  if (/(?:internal.*error|500|server.*error)/i.test(msg)) {
    return '服务异常，请稍后重试'
  }
  if (/image.*(?:too.*large|size|exceed|over.*limit)/i.test(msg)) {
    return '图片超过限制，请压缩后再上传'
  }
  if (/format/i.test(msg)) {
    return '图片格式不支持，请使用 JPG、PNG 或 WebP'
  }
  if (/api.*key.*missing|api.*key.*required|请先/i.test(msg)) {
    return '请先填写你的 ToAPIs API Key'
  }

  // Fallback: return original message wrapped with a prefix
  return msg || '未知错误，请稍后重试'
}
