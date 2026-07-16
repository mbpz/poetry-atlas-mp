/**
 * 我的路线列表 — 当前用户自建路线
 * 入口: profile / 首页旅行面板
 * 点击进入详情 / 长按删除
 */
Page({
  data: {
    routes: [],
    loading: true,
    listError: '',
    deletingId: '',
  },

  onShow() {
    this.refreshRoutes()
  },

  onPullDownRefresh() {
    this.refreshRoutes().then(() => wx.stopPullDownRefresh())
  },

  refreshRoutes() {
    if (this._loadingRoutes) return Promise.resolve()
    this._loadingRoutes = true
    this.setData({ loading: true, listError: '' })
    return wx.cloud.callFunction({
      name: 'routes',
      // 注意：不再传 openid；routes 云函数 list 使用服务端 wxContext.openid，
      //       客户端 openid 不可信，无实际效果。
      data: { action: 'list', page: 1, pageSize: 50 },
    }).then((res) => {
      const result = (res && res.result) || {}
      if (!result.ok) throw new Error(result.error || '路线加载失败')
      this.setData({ routes: result.data || [], loading: false, listError: '' })
      const app = getApp()
      if (app.globalData.user) {
        app.globalData.user.stats = Object.assign({}, app.globalData.user.stats || {}, {
          routes_count: result.total || 0,
        })
      }
    }).catch((err) => {
      console.error('[routes:list] error:', err)
      this.setData({ loading: false, listError: '路线加载失败，请检查网络后重试。' })
    }).finally(() => {
      this._loadingRoutes = false
    })
  },

  onRetryRoutes() {
    this.refreshRoutes()
  },

  onTapRoute(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages-sub/info/travel/travel?route=' + id + '&from=db' })
  },

  onLongPressRoute(e) {
    const id = e.currentTarget.dataset.id
    this._confirmDelete(id)
  },

  onDeleteTap(e) {
    this._confirmDelete(e.currentTarget.dataset.id)
  },

  _confirmDelete(id) {
    if (!id || this.data.deletingId) return
    wx.showModal({
      title: '删除路线',
      content: '确认删除这条自建路线？此操作不可撤销。',
      confirmColor: '#9e2b23',
      success: async (r) => {
        if (!r.confirm) return
        this.setData({ deletingId: id, listError: '' })
        try {
          const res = await wx.cloud.callFunction({
            name: 'routes',
            data: { action: 'delete', routeId: id },
          })
          const result = (res && res.result) || {}
          if (result.ok) {
            this.setData({ routes: this.data.routes.filter((route) => route._id !== id) })
            const app = getApp()
            if (app.globalData.user) {
              app.globalData.user.stats = Object.assign({}, app.globalData.user.stats || {}, {
                routes_count: result.routes_count || 0,
              })
            }
            wx.showToast({ title: '已删除', icon: 'success' })
          } else {
            throw new Error(result.error || '删除失败')
          }
        } catch (err) {
          console.error('[routes:delete] error:', err)
          this.setData({ listError: '路线删除失败，列表没有发生变化。请重试。' })
        } finally {
          this.setData({ deletingId: '' })
        }
      },
    })
  },

  onCreateTap() {
    wx.navigateTo({ url: '/pages-sub/routes/create/create' })
  },
})
