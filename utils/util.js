/**
 * 通用工具函数
 */

/**
 * 节流函数
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
 * 将诗词内容按句号/问号/叹号切为短行（便于竖排/卡片展示）
 */
function splitPoemLines(content) {
  if (!content) return []
  return content
    .split(/[。？！；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

module.exports = {
  throttle,
  debounce,
  splitPoemLines,
}
