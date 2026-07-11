/**
 * 我的路线列表 — 当前用户自建路线
 * 入口: profile / 首页旅行面板
 * 点击进入详情 / 长按删除
 */
Page({
  data: {
    routes: [],
    loading: true,
  },

  onShow() {
    this.refreshRoutes()
  },

  onPullDownRefresh() {
    this.refreshRoutes().then(() => wx.stopPullDownRefresh())
  },

  refreshRoutes() {
    this.setData({ loading: true })
    const app = getApp()
    const openid = app.globalData.openid || ''
    if (!openid) {
      this.setData({ loading: false, routes: [] })
      return Promise.resolve()
    }
    return wx.cloud.callFunction({
      name: 'routes',
      data: { action: 'list', openid, page: 1, pageSize: 50 },
    }).then((res) => {
      const result = (res && res.result) || {}
      this.setData({ routes: result.data || [], loading: false })
    }).catch((err) => {
      console.error('[routes:list] error:', err)
      this.setData({ loading: false, routes: [] })
    })
  },

  onTapRoute(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages-sub/info/travel/travel?route=' + id + '&from=db' })
  },

  onLongPressRoute(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除路线',
      content: '确认删除这条自建路线？此操作不可撤销。',
      confirmColor: '#9e2b23',
      success: (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '删除…', mask: true })
        wx.cloud.callFunction({
          name: 'routes',
          data: { action: 'delete', routeId: id },
        }).then((res) => {
          wx.hideLoading()
          const result = (res && res.result) || {}
          if (result.ok) {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.refreshRoutes()
          } else {
            wx.showToast({ title: result.error || '删除失败', icon: 'none' })
          }
        }).catch((err) => {
          wx.hideLoading()
          console.error('[routes:delete] error:', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      },
    })
  },

  onCreateTap() {
    wx.navigateTo({ url: '/pages-sub/routes/create/create' })
  },
})
