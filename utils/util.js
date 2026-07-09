/**
 * 通用工具函数
 */

/**
 * 节流函数
 */
function throttle(fn, delay = 300) {
  let last = 0
  return function (...args) {
    const now = Date.now()
    if (now - last >= delay) {
      last = now
      fn.apply(this, args)
    }
  }
}

/**
 * 防抖函数
 */
function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

/**
 * 文本截断（超出显示省略号）
 */
function truncate(str, max = 30) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

/**
 * 将诗词内容按句号/问号/叹号切为短行（便于竖排/卡片展示）
 */
function splitPoemLines(content) {
  if (!content) return []
  return content
    .split(/[。？！；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 格式化 Error 为可读字符串 */
function formatError(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  return err.errMsg || err.message || JSON.stringify(err)
}

module.exports = {
  throttle,
  debounce,
  truncate,
  splitPoemLines,
  formatError,
}
