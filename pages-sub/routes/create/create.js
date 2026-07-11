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
    _pointCounter: 1,
  },

  // ---- 路线基本信息 ----
  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onThemeInput(e) { this.setData({ theme: e.detail.value }) },
  onDescInput(e) { this.setData({ description: e.detail.value }) },

  // ---- 站点列表操作 ----
  onPointField(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    const key = 'points[' + idx + '].' + field
    this.setData({ [key]: value })
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
      wx.showToast({ title: '请填写路线名', icon: 'none' })
      return
    }
    const points = this.data.points
      .map((p) => ({ ...p, lng: parseFloat(p.lng), lat: parseFloat(p.lat) }))
      .filter((p) => p.name && p.name.trim())
    if (!points.length) {
      wx.showToast({ title: '至少 1 站填写名称', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存路线…', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'routes',
        data: {
          action: 'create',
          name,
          theme: (this.data.theme || '').trim(),
          description: (this.data.description || '').trim(),
          points,
        },
      })
      wx.hideLoading()
      const result = (res && res.result) || {}
      if (!result.ok) {
        wx.showToast({ title: result.error || '保存失败', icon: 'none' })
        this.setData({ saving: false })
        return
      }
      wx.showToast({ title: '已保存', icon: 'success' })
      // 通知上一页刷新
      const pages = getCurrentPages()
      const prev = pages[pages.length - 2]
      if (prev && typeof prev.refreshRoutes === 'function') {
        prev.refreshRoutes()
      }
      setTimeout(() => wx.navigateBack(), 600)
    } catch (err) {
      wx.hideLoading()
      console.error('[routes:create] error:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
      this.setData({ saving: false })
    }
  },
})
