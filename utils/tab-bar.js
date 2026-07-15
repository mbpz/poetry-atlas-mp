function getTab(tabs, key) {
  return (tabs || []).find((tab) => tab.key === key) || null
}

function switchTabSafely(options) {
  const opts = options || {}
  const target = getTab(opts.tabs, opts.targetKey)
  const previousKey = opts.currentKey
  if (!target || target.key === previousKey || opts.navigating) return false
  if (!opts.wxApi || typeof opts.wxApi.switchTab !== 'function' || typeof opts.setState !== 'function') return false

  opts.setState({ active: target.key, navigating: true })
  opts.wxApi.switchTab({
    url: target.url,
    fail: (err) => {
      opts.setState({ active: previousKey, navigating: false })
      if (typeof opts.onError === 'function') opts.onError(err, target)
    },
    complete: () => opts.setState({ navigating: false }),
  })
  return true
}

function syncTabBar(page, key) {
  if (!page || typeof page.getTabBar !== 'function') return false
  const tabBar = page.getTabBar()
  if (!tabBar) return false
  if (typeof tabBar.syncActive === 'function') {
    tabBar.syncActive(key)
    return true
  }
  if (typeof tabBar.setData === 'function') {
    tabBar.setData({ active: key, navigating: false })
    return true
  }
  return false
}

module.exports = { getTab, switchTabSafely, syncTabBar }
