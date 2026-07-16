/**
 * 旅行路线创建页 — 表单 + 动态站点列表
 * 字段: name / theme / description / points[]
 * 保存 → 调云函数 routes.create → navigateBack 并刷新列表
 */
Page({
  data: {
    name: '',
    theme: '',
    description: '',
    points: [
      { _id: 1, name: '', lng: '', lat: '', poem_title: '', poem_author: '', poem_content: '', note: '' },
    ],
    saving: false,
    saveError: '',
    _pointCounter: 1,
  },

  onLoad() {
    this._requestId = `route_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },

  onUnload() {
    if (this._backTimer) clearTimeout(this._backTimer)
  },

  // ---- 路线基本信息 ----
  onNameInput(e) { this.setData({ name: e.detail.value, saveError: '' }) },
  onThemeInput(e) { this.setData({ theme: e.detail.value, saveError: '' }) },
  onDescInput(e) { this.setData({ description: e.detail.value, saveError: '' }) },

  // ---- 站点列表操作 ----
  onPointField(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    const key = 'points[' + idx + '].' + field
    this.setData({ [key]: value, saveError: '' })
  },
  addPoint() {
    const counter = this.data._pointCounter + 1
    const list = this.data.points.slice()
    list.push({ _id: counter, name: '', lng: '', lat: '', poem_title: '', poem_author: '', poem_content: '', note: '' })
    this.setData({ points: list, _pointCounter: counter })
  },
  removePoint(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    if (this.data.points.length <= 1) {
      wx.showToast({ title: '至少保留 1 站', icon: 'none' })
      return
    }
    const list = this.data.points.filter((_, i) => i !== idx)
    this.setData({ points: list })
  },
  movePoint(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const dir = Number(e.currentTarget.dataset.dir)
    const target = idx + dir
    if (target < 0 || target >= this.data.points.length) return
    const list = this.data.points.slice()
    const tmp = list[idx]
    list[idx] = list[target]
    list[target] = tmp
    this.setData({ points: list })
  },

  // ---- 保存 ----
  async onSave() {
    if (this.data.saving) return
    const name = (this.data.name || '').trim()
    if (!name) {
      this.setData({ saveError: '请填写路线名。' })
      wx.showToast({ title: '请填写路线名', icon: 'none' })
      return
    }
    const namedPoints = this.data.points.filter((p) => p.name && p.name.trim())
    const points = []
    for (const point of namedPoints) {
      const lngText = String(point.lng || '').trim()
      const latText = String(point.lat || '').trim()
      if (!!lngText !== !!latText) {
        this.setData({ saveError: `“${point.name.trim()}”的经纬度需要同时填写。` })
        return
      }
      const lng = lngText ? Number(lngText) : 0
      const lat = latText ? Number(latText) : 0
      if (
        (lngText && (!Number.isFinite(lng) || lng < -180 || lng > 180)) ||
        (latText && (!Number.isFinite(lat) || lat < -90 || lat > 90))
      ) {
        this.setData({ saveError: `“${point.name.trim()}”的经纬度超出有效范围。` })
        return
      }
      points.push(Object.assign({}, point, { name: point.name.trim(), lng, lat }))
    }
    if (!points.length) {
      this.setData({ saveError: '至少填写 1 个站点名称。' })
      wx.showToast({ title: '至少 1 站填写名称', icon: 'none' })
      return
    }
    this.setData({ saving: true, saveError: '' })
    wx.showLoading({ title: '保存路线…', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'routes',
        data: {
          action: 'create',
          request_id: this._requestId,
          name,
          theme: (this.data.theme || '').trim(),
          description: (this.data.description || '').trim(),
          points,
        },
      })
      wx.hideLoading()
      const result = (res && res.result) || {}
      if (!result.ok) {
        this.setData({ saving: false, saveError: result.error || '保存失败，请检查输入后重试。' })
        return
      }
      const app = getApp()
      if (app.globalData.user) {
        app.globalData.user.stats = Object.assign({}, app.globalData.user.stats || {}, {
          routes_count: result.routes_count || 0,
        })
      }
      wx.showToast({ title: '已保存', icon: 'success' })
      // 通知上一页刷新
      const pages = getCurrentPages()
      const prev = pages[pages.length - 2]
      if (prev && typeof prev.refreshRoutes === 'function') {
        prev.refreshRoutes()
      }
      this._backTimer = setTimeout(() => wx.navigateBack(), 600)
    } catch (err) {
      wx.hideLoading()
      console.error('[routes:create] error:', err)
      this.setData({ saving: false, saveError: '保存失败，输入内容已保留。请检查网络后重试。' })
    }
  },
})
