/**
 * TabBar — 墨染扩散（Ink Diffusion）
 * 状态 A: [🗺][🔍][📜][♡][👤]  +  [🔎搜索珠]   (5 tab 胶囊 + 搜索)
 *   状态 B: [⌂] [🔍 input..........]           (返回 + 搜索框)
 */
const config = require('../config.js')

// eslint-disable-next-line
const ICO = {
  map: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSI3IiBvcGFjaXR5PSIwLjEzIi8+PHBhdGggZD0iTTEyIDQgOCA3IDggMTBjMCA1IDQgOSA0IDlzNC00IDQtOWMwLTItMi00LTQtOXoiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiIgcj0iMiIvPjwvc3ZnPg==',
  search: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIyMiIgY3k9IjIyIiByPSI3Ii8+PHBhdGggZD0iTTMwIDMwbDcuMDcgNy4wNyI+PC9wYXRoPjwvc3ZnPg==',
  dynasty: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cmVjdCB4PSI1IiB5PSI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PGxpbmUgeDE9IjguNSIgeTE9IjgiIHgyPSIxNS41IiB5Mj0iOCIvPjxsaW5lIHkxPSI4LjUiIHkxPSIxMiIgeDI9IjE1LjUiIHkyPSIxMiIvPjxsaW5lIHkxPSI4LjUiIHkxPSIxNiIgeTI9IjE2IiB4Mj0iMTMiLz48L3N2Zz4=',
  fav: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTIgMjAuNXMtNy01LTcuNWEzLjUgMy41IDAgMCAxIDYuNS0yLjIgMy41IDMuNSAwIDAgMSA2LjUgMi4yYy0uNSA0LTcuNSA5LTcuNSA5eiIgb3BhY2l0eT0iMC4xMyIvPjxwYXRoIGQ9Ik0xMiAyMC41cy03LTUtNy41YTMuNSAzLjUgMCAwIDEgNi41LTIuMiAzLjUgMy41IDAgMCAxIDYuNSAyLjJjLS41IDQtNy41IDktNy41IDl6Ii8+PC9zdmcPg==',
  me: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjgiIHI9IjQuNSIvPjxwYXRoIGQ9J000IDIyYzAtNSA0LTggOC04czggMyA4IDgnPjwvc3ZnPg==',
  find: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI3Ii8+PHBhdGggZD0iTTIwIDIwbC00LjUtNC41Ii8+PC9zdmc+',
  home: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMyAxMmw5LTkgOSA5Ii8+PHBhdGggZD0iTTYgMTBoMTJ2MTBINnoiLz48L3N2Zz4=',
}

const TAB_DEFS = [
  { key: 'map',    url: '/pages/index/index',         icon: 'map',    label: '地图' },
  { key: 'find',   url: '/pages/search/search',       icon: 'find',   label: '发现' },
  { key: 'dynasty',url: '/pages/dynasty/dynasty',     icon: 'dynasty',label: '朝代' },
  { key: 'fav',    url: '/pages/favorites/favorites', icon: 'fav',    label: '收藏' },
  { key: 'me',     url: '/pages/profile/profile',     icon: 'me',     label: '我的' },
]

Component({
  data: {
    searchMode: false,
    query: '',
    active: 'map',
    tabs: TAB_DEFS.map((t) => ({ ...t, ico: ICO[t.icon] })),
    searchIco: ICO.search,
    homeIco: ICO.home,
  },
  methods: {
    switchTab(e) {
      const key = e.currentTarget.dataset.key
      const tab = TAB_DEFS.find((t) => t.key === key)
      if (!tab) return
      this.setData({ active: key })
      wx.switchTab({ url: tab.url })
    },
    enterSearch() { this.setData({ searchMode: true }) },
    exitSearch()  { this.setData({ searchMode: false, query: '', active: 'map' }); wx.switchTab({ url: '/pages/index/index' }) },
    onInput(e) { this.setData({ query: e.detail.value }) },
    onConfirm(e) {
      const q = (e.detail.value || '').trim()
      if (!q) return
      wx.navigateTo({ url: '/pages/search/search?kw=' + encodeURIComponent(q) })
    },
    noop() {},
  },
})
