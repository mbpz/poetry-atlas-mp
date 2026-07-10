/**
 * 自定义 tabBar — iOS Capsule/Floating 设计（参考 poetry-atlas）
 * 特点: 大图标 + 极小文字 + 凸弧指示 + 柔和配色
 */
const config = require('../config.js')

// SVG data URL（内嵌无需 CDN）
const ICONS = {
  map: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS42IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMiAyQzguMTMgMiA1IDUuMTMgNSA5YzAgNS4yNSA3IDEzIDcgMTNzNy03Ljc1IDctMTNjMC0zLjg3LTMuMTMtNy03LTd6Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSI5IiByPSIyLjUiLz48cGF0aCBkPSJNMjIyMmw1LTUiLz48cGF0aCBkPSJNMjEgMjFsLTQuMy00LjMiLz48L3N2Zz4=',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48cGF0aCBkPSJNMTIgMkM4LjEzIDIgNSA1LjEzIDUgOWMwIDUuMjUgNyAxMyA3IDEzczctNy43NSA3LTEzYzAtMy44Ny0zLjEzLTctNy03em0wIDkuNWEyLjUgMi41IDAgMSAxIDAtNSAyLjUgMi41IDAgMCAxIDAgNXoiLz48L3N2Zz4=',
  },
  search: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS42IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjE4IiBjeT0iMTgiIHI9IjciLz48cGF0aCBkPSJNMjEgMjFsLTQuMy00LjMiLz48L3N2Zz4=',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48cGF0aCBkPSJNMTEgN2E0IDQgMCAxIDAgOCAwIDQgNCAwIDAgMC04IDB6bTAtNWE5IDkgMCAxIDAgNy4wNyAxNS4zbDQuMjUgNC4yNkwuNCAxLjRsMS40Mi0uMDIgNC4yNS00LjI1QTkgOSAwIDAgMCAxMSAyeiIvPjwvc3ZnPg==',
  },
  dynasty: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNCAxNCIgZmlsbD0iY3VycmVudENvbG9yIj48cmVjdCB4PSI0IiB5PSIyIiB3aWR0aD0iMTQiIGhlaWdodD0iMTYiIHJ4PSIxIi8+PHRleHQgeD0iMTAiIHk9IjEwIiBmb250LXNpemU9IjciIGZvbnQtZmFtaWx5PSJzZXJpZiIgZmlsbD0iY3VycmVudENvbG9yIj7mnIg8L3RleHQ+PC9zdmc+',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNCAxNCIgZmlsbD0iY3VycmVudENvbG9yIj48cmVjdCB4PSI0IiB5PSIyIiB3aWR0aD0iMTQiIGhlaWdodD0iMTYiIHJ4PSIxIi8+PHRleHQgeD0iMTAiIHk9IjEwIiBmb250LXNpemU9IjciIGZvbnQtZmFtaWx5PSJzZXJpZiIgZmlsbD0iI2ZmZiI+5pyIPC90ZXh0Pjwvc3ZnPg==',
  },
  fav: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS42IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMC44NCA0LjYxYS41LjUgMCAwIDAtNy43OCAwTDEyIDUuNjdsLTEuMDYtMS4wNmEuNS41IDAgMCAwLTcuNzggNy43OGwxLjA2IDEuMDZMMTIgMjAuMjNsNy43OC03Ljc4IDEuMDYtMS4wNmEuNS41IDAgMCAwIDAtNy43OHoiLz48L3N2Zz4=',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48cGF0aCBkPSJNMTIgMjEuMzVsLTEuNDUtMS4zMkM1LjQgMTUuMzYgMiAxMi4yOCAyIDguNSAyIDUuNDIgNC40MiAzIDcuNSAzYzEuNzQgMCAzLjQxLjgxIDQuNSAyLjA5QzEzLjA5IDMuODEgMTQuNzYgMyAxNi41IDMgMTkuNTggMyAyMiA1LjQyIDIyIDguNWMwIDMuOC0zLjQgNi45LTguNTUgMTEuNTRMMTIgMjEuMzV6Ii8+PC9zdmc+',
  },
  me: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS42IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjEyIiBjeT0iOCIgcj0iNCIvPjxwYXRoIGQ9Ik00IDIxYzAtNCA0LTcgOC03czggMyA4IDciLz48L3N2Zz4=',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjgiIHI9IjQiLz48cGF0aCBkPSJNNCAyMWMwLTQgNC03IDgtN3M4IDMgOCA3djFIMHYtMXoiLz48L3N2Zz4=',
  },
}

Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '地图', icon: 'map' },
      { pagePath: '/pages/search/search', text: '发现', icon: 'search' },
      { pagePath: '/pages/dynasty/dynasty', text: '朝代', icon: 'dynasty' },
      { pagePath: '/pages/favorites/favorites', text: '收藏', icon: 'fav' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: 'me' },
    ].map((t) => ({
      ...t,
      iconUrl: ICONS[t.icon].normal,
      activeIconUrl: ICONS[t.icon].active,
    })),
    version: config.VERSION,
  },
  methods: {
    switchTab(e) {
      const url = e.currentTarget.dataset.url
      wx.switchTab({ url })
    },
  },
})
