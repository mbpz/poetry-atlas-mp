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

/**
 * 相对时间：将时间戳化为「刚刚 / N 分钟前 / N 小时前 / N 天前」等传统措辞
 */
function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return min + ' 分钟前'
  const hour = Math.floor(min / 60)
  if (hour < 24) return hour + ' 小时前'
  const day = Math.floor(hour / 24)
  if (day < 30) return day + ' 天前'
  return new Date(ts).toLocaleDateString('zh-CN')
}

module.exports = {
  throttle,
  debounce,
  splitPoemLines,
  timeAgo,
}
