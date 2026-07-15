/**
 * 地图首页 — 诗词地图核心入口 (M4 增强)
 * 全屏 <map> + 地点 markers(热力大小) + 朝代时间轴 + 旅行路线折线 + 缩放聚合
 */
const { getDB, wrapPromise } = require("../../utils/cloudbase.js")
const { throttle } = require("../../utils/util.js")
const { locToLngLat } = require("../../utils/loc.js")
const { syncTabBar } = require("../../utils/tab-bar.js")
const {
  readLocationSettings,
  classifyLocationPrerequisite,
  classifyLocationFailure,
  buildLocationDiagnostic,
} = require("../../utils/location.js")
const {
  CITY_CENTERS,
  readStoredMapView,
  writeStoredMapView,
} = require("../../utils/map-view.js")
const config = require("../../config.js")

// 预定义旅行路线（静态展示数据）
const TRAVEL_ROUTES = [
  {
    id: "libai_yangtze",
    name: "李白长江行",
    color: "#2d5d7b",
    points: [
      { name: "成都", lng: 104.07, lat: 30.65, poem: "《蜀道难》" },
      { name: "江陵", lng: 112.24, lat: 30.33, poem: "《早发白帝城》" },
      { name: "黄鹤楼", lng: 114.30, lat: 30.59, poem: "《黄鹤楼送孟浩然》" },
      { name: "庐山", lng: 115.98, lat: 29.55, poem: "《望庐山瀑布》" },
      { name: "金陵", lng: 118.80, lat: 32.06, poem: "《登金陵凤凰台》" },
    ],
  },
  {
    id: "dufu_tangsan",
    name: "杜甫漂泊",
    color: "#8b1a1a",
    points: [
      { name: "洛阳", lng: 112.45, lat: 34.62, poem: "《闻官军收河南河北》" },
      { name: "长安", lng: 108.94, lat: 34.26, poem: "《春望》" },
      { name: "成都", lng: 104.07, lat: 30.65, poem: "《春夜喜雨》" },
      { name: "夔州", lng: 109.52, lat: 31.05, poem: "《登高》" },
      { name: "岳阳", lng: 113.12, lat: 29.37, poem: "《登岳阳楼》" },
    ],
  },
]

Page({
  data: {
    longitude: config.MAP.INITIAL_LONGITUDE,
    latitude: config.MAP.INITIAL_LATITUDE,
    scale: config.MAP.INITIAL_SCALE,
    minScale: config.MAP.MIN_SCALE,
    maxScale: config.MAP.MAX_SCALE,
    dynasties: [],
    selectedDynasty: "",
    markers: [],
    polyline: [],
    loading: true,
    showDynastyBar: false,
    hasLocation: false,
    locating: false,
    showLocationFallback: false,
    showCityPicker: false,
    locationFailure: null,
    manualCities: CITY_CENTERS,
    timelineDynasties: [],
    showTimeline: false,
    heatMode: false,
    routes: TRAVEL_ROUTES,
    activeRouteId: "",
    showRoutePanel: false,
    showGuide: false,
    featuredPoem: null,
    featuredPlace: "",
    featuredHidden: false,
    heatRange: { min: 0, max: 0 },
  },

  onLoad() {
    this._markerIdCounter = 0
    this._markerMap = {}
    // 推荐卡"关闭"仅在本次生命周期内保持，避免 loadMarkers 重复触发又把卡弹出来
    this._featuredClosedThisSession = false
    const savedView = readStoredMapView(wx, {
      minScale: config.MAP.MIN_SCALE,
      maxScale: config.MAP.MAX_SCALE,
    })
    if (savedView) this.setData(savedView)
    // 首次进入显示冷启动引导
    const guided = wx.getStorageSync("poetry_guided")
    if (!guided) {
      this.setData({ showGuide: true })
    }
  },

  _nextMarkerId(placeData) {
    const id = ++this._markerIdCounter
    this._markerMap[id] = placeData
    return id
  },

  onGuideClose() {
    wx.setStorageSync("poetry_guided", true)
    this.setData({ showGuide: false })
  },

  noop() {},

  onReady() {
    this.mapCtx = wx.createMapContext("poetry-map", this)
    // 节流版 loadMarkers：拖/放地图时避免 DB 请求风暴
    this._throttledLoadMarkers = throttle(this.loadMarkers, 350)
    this.loadDynasties()
    this.loadMarkers()
    this._checkPrivacyAgreement()
  },

  // 兜底：App 层 onLaunch 已做全局隐私门控（未同意不会加载任何主页），
  // 此处只在极端路径（直达且绕过 gate）下弹出协议，正常流程不会执行。
  _checkPrivacyAgreement() {
    const agreed = (getApp().globalData || {}).__privacyAgreed !== false
    if (agreed) return
    const dialog = this.selectComponent('#privacyDialog')
    if (dialog && typeof dialog.show === 'function') dialog.show()
  },

  onPrivacyAgreed() {
    // 用户同意隐私协议 → 引导页自然按 showGuide 逻辑展示
    if (this.data.showGuide) this.setData({ showGuide: true })
  },

  onShow() {
    syncTabBar(this, 'map')
    if (this.mapCtx) this.loadMarkers()
  },

  // ===== 朝代数据 =====
  async loadDynasties() {
    const { db } = getDB()
    try {
      const res = await db.collection("dynasties")
        .where({ poem_count: db.command.gt(0) })
        .orderBy("sort_order", "asc")
        .get()
      this.setData({
        timelineDynasties: res.data,
        dynasties: res.data.map((d) => d.name),
      })
    } catch (err) {
      console.error("[index] loadDynasties error:", err)
      this.setData({ dynasties: config.DYNASTIES })
    }
  },

  // ===== 数据加载 =====
  async loadMarkers() {
    // 防并发：上一次请求未结束则跳过（下一次 region change 会刷新到最新视野）
    if (this._loadingMarkers) return
    this._loadingMarkers = true
    this.setData({ loading: true })
    this._markerIdCounter = 0
    this._markerMap = {}
    let placesData = []
    try {
      const { db } = getDB()
      const scale = this.data.scale
      let markers = []

      if (scale < config.MAP.CLUSTER_THRESHOLD) {
        markers = (await this.loadProvinceClusters()).map((m) => ({ ...m, heatMode: this.data.heatMode }))
      } else {
        const cond = {}
        if (this.data.selectedDynasty) {
          cond["dynasty_stats." + this.data.selectedDynasty] = db.command.gt(0)
        }
        const res = await wrapPromise(
          db.collection("places").where(cond)
            .field({ name: true, location: true, type: true, poem_count: true, hot_poems: true })
            .orderBy("poem_count", "desc").limit(200).get(),
          { loadingText: "加载地点…" }
        )
        placesData = res.data || []
        // 计算 heatRange（仅热力模式使用）
        const counts = placesData.map((p) => p.poem_count || 0)
        const heatRange = counts.length
          ? { min: Math.min(...counts), max: Math.max(...counts) }
          : { min: 0, max: 0 }
        if (heatRange.max !== this.data.heatRange.max || heatRange.min !== this.data.heatRange.min) {
          this.setData({ heatRange })
        }
        markers = placesData.map((p) => this.placeToMarker(p, scale, this.data.heatMode))
      }

      this._loadingMarkers = false
      this.setData({ markers, loading: false })
      this.updatePolyline()
      // 传当前地图中心 → 推荐离用户视野中心最近的地点
      this.loadFeatured(placesData, { longitude: this.data.longitude, latitude: this.data.latitude })
    } catch (err) {
      this._loadingMarkers = false
      console.error("[index] loadMarkers error:", err)
      this.setData({ loading: false })
    }
  },

  /** 经纬度简化距离平方（仅用于比较，无需开根号）*/
  _dist2(lng1, lat1, lng2, lat2) {
    return (lng1 - lng2) * (lng1 - lng2) + (lat1 - lat2) * (lat1 - lat2)
  },

  /** 加载推荐：取离用户当前位置最近的地点（首按诗数兜底）*/
  async loadFeatured(places, center) {
    if (!places || !places.length) return
    let top
    if (center) {
      let best = Infinity
      for (const p of places) {
        const { longitude: lng, latitude: lat } = locToLngLat(p.location)
        if (!lng && !lat) continue
        const d = this._dist2(center.longitude, center.latitude, lng, lat)
        if (d < best) { best = d; top = p }
      }
    }
    top = top || places[0]
    const hotPoems = top.hot_poems || []
    if (!hotPoems.length) return
    const poem = hotPoems[Math.floor(Math.random() * hotPoems.length)]
    const lines = (poem.excerpt || poem.content || '').split(/[。？！；\n]/).filter(Boolean)
    this.setData({
      featuredPoem: { title: poem.title, author: poem.author, dynasty: poem.dynasty, firstLine: lines[0] || '' },
      featuredPlace: top.name,
      // 只要用户本次没关过就不再隐藏；关过就保持隐藏
      featuredHidden: !!this._featuredClosedThisSession,
    })
  },

  /** 省份聚合 */
  async loadProvinceClusters() {
    try {
      const res = await wx.cloud.callFunction({
        name: "aggregateMap",
        data: { type: "province", dynasty: this.data.selectedDynasty || "" },
      })
      const provinces = (res.result && res.result.data) || []
      return provinces.map((p) => {
        const cnt = p.poem_count || 0
        return {
          id: this._nextMarkerId({ name: p.name, cluster: true, placeId: p.provinceId || p.name }),
          longitude: p.longitude,
          latitude: p.latitude,
          width: 48,
          height: 48,
          // anchor 把 marker 坐标对到圆心，label 才能居中于气泡
          anchor: { x: 0.5, y: 0.5 },
          iconPath: "/images/marker-cluster.png",
          title: p.name + " (" + cnt + "首)",
          // label 在气泡中心显示真实聚合数量（按位数动态锚点，精确居中）
          ...(cnt
            ? (() => {
                const text = String(cnt)
                const w = text.length * 7 + 2 // fontSize 14 下≈每字 7px
                const h = 16
                return {
                  label: {
                    content: text,
                    color: "#9e2b23",
                    fontSize: 14,
                    textAlign: "center",
                    anchorX: w / 2,
                    anchorY: h / 2,
                  },
                }
              })()
            : {}),
        }
      })
    } catch (err) {
      console.error("[index] loadProvinceClusters error:", err)
      return []
    }
  },

  /** 地点文档 → marker（heat=true 时按 poem_count 调整为大圆形热力标记）*/
  placeToMarker(p, scale, heat = false) {
    const { longitude: lng, latitude: lat } = locToLngLat(p.location)
    const markerImg = this._getMarkerIconByType(p.type)
    const count = p.poem_count || 0
    let width = 44
    let height = 44
    let iconPath = markerImg
    if (heat && this.data.heatRange.max > 0) {
      const { min, max } = this.data.heatRange
      const t = (count - min) / (max - min || 1)
      const size = Math.round(28 + t * 44)
      width = size
      height = size
      iconPath = '/images/marker-cluster.png'
    }
    return {
      id: this._nextMarkerId({ name: p.name, cluster: false, placeId: p._id || '' }),
      longitude: lng,
      latitude: lat,
      width,
      height,
      iconPath,
      title: p.name,
      cluster: false,
      placeId: p._id || '',
      poem_count: count,
    }
  },

  _getMarkerIconByType(type) {
    const map = { city:'city', tower:'tower', mountain:'mountain', lake:'mountain',
      river:'river', bridge:'bridge', temple:'temple', pass:'pass',
      garden:'garden', palace:'palace', ancient_city:'tower', historic_site:'temple', county:'city', province:'city' }
    const key = map[type] || 'city'
    return `/images/marker-${key}.png`
  },

  // ===== 旅行路线折线 =====
  updatePolyline() {
    if (!this.data.activeRouteId) {
      this.setData({ polyline: [] })
      return
    }
    const route = this.data.routes.find((r) => r.id === this.data.activeRouteId)
    if (!route) return
    this.setData({
      polyline: [{
        points: route.points.map((pt) => ({ longitude: pt.lng, latitude: pt.lat })),
        color: route.color,
        width: 4,
        dottedLine: true,
        arrowLine: true,
      }],
    })
  },

  // ===== 交互事件 =====
  onRegionChange(e) {
    if (e.type === "end" && (e.causedBy === "scale" || e.causedBy === "drag")) {
      // 每次 drag/scale 都更新中心（轻量 setData），但 loadMarkers 走节流版
      this.mapCtx.getCenterLocation({
        success: (res) => {
          this.setData({ longitude: res.longitude, latitude: res.latitude })
          this._rememberMapView(res.longitude, res.latitude, this.data.scale)
        },
      })
      this.mapCtx.getScale({
        success: (res) => {
          if (Math.abs(res.scale - this.data.scale) >= 1) {
            this.setData({ scale: res.scale })
            if (this._throttledLoadMarkers) {
              this._throttledLoadMarkers()
            } else {
              this.loadMarkers()
            }
          }
        },
      })
    }
  },

  onMarkerTap(e) {
    const place = this._markerMap[e.markerId]
    if (!place) return
    // 从 markers 数组拿精确坐标（_markerMap 只存了元信息）
    const marker = this.data.markers.find((m) => m.id === e.markerId)
    const lng = marker ? marker.longitude : (e.detail && e.detail.longitude) || 0
    const lat = marker ? marker.latitude : (e.detail && e.detail.latitude) || 0
    if (place.cluster) {
      this.moveToLocation(lng, lat, this.data.scale + 3)
    } else if (place.placeId) {
      wx.navigateTo({ url: "/pages-sub/info/place/place?id=" + place.placeId })
    }
  },

  // 今日推荐弹窗
  onFeaturedTap() {
    if (!this.data.featuredPoem) return
    getApp().globalData.currentPoem = this.data.featuredPoem
    wx.navigateTo({ url: '/pages-sub/info/poem/poem' })
  },
  onFeaturedHide(e) {
    this._featuredClosedThisSession = true
    this.setData({ featuredHidden: true })
  },

  // 推荐卡下滑关闭手势
  onFeaturedTouch(e) {
    this._fy = e.touches[0].clientY
    this._fmoved = false
  },
  onFeaturedMove(e) {
    if (this._fy == null) return
    const dy = e.touches[0].clientY - this._fy
    if (dy > 8) { this._fmoved = true }
  },
  onFeaturedEnd(e) {
    if (this._fy == null) return
    const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : this._fy) - this._fy
    this._fy = null
    if (dy > 60) { // 下滑超过 60px 关闭
      this._featuredClosedThisSession = true
      this.setData({ featuredHidden: true })
    }
  },

  moveToLocation(lng, lat, scale) {
    const nextScale = scale || this.data.scale
    this.setData({ longitude: lng, latitude: lat, scale: nextScale })
    this._rememberMapView(lng, lat, nextScale)
    this.loadMarkers()
  },

  _rememberMapView(longitude, latitude, scale) {
    writeStoredMapView(wx, { longitude, latitude, scale }, {
      minScale: config.MAP.MIN_SCALE,
      maxScale: config.MAP.MAX_SCALE,
    })
  },

  onSelectDynasty(e) {
    const d = e.currentTarget.dataset.dynasty || ""
    this.setData({ selectedDynasty: this.data.selectedDynasty === d ? "" : d })
    this.loadMarkers()
  },

  onLocate() {
    if (this.data.locating) return
    this._locationRetryCount = 0
    this._startLocate()
  },

  _startLocate() {
    this.setData({ locating: true })
    wx.getSetting({
      success: (res) => {
        const settings = readLocationSettings(wx, res.authSetting)
        const prerequisite = classifyLocationPrerequisite(settings)
        if (prerequisite) this._handleLocationFailure(prerequisite)
        else this._doLocate(settings)
      },
      fail: () => this._doLocate(readLocationSettings(wx, {})),
    })
  },

  _doLocate(settings) {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        // 精确设备坐标只进入当前页面状态，不写入本地视野缓存。
        this.setData({ longitude: res.longitude, latitude: res.latitude, scale: 8 })
        this.loadMarkers()
        this.setData({
          hasLocation: true,
          locating: false,
          showLocationFallback: false,
          showCityPicker: false,
          locationFailure: null,
        })
      },
      fail: (err) => {
        const latest = readLocationSettings(wx, {})
        const context = Object.assign({}, settings || {}, latest)
        const result = classifyLocationFailure(err, context)
        console.warn('[location]', buildLocationDiagnostic(err, context))
        this._handleLocationFailure(result)
      },
    })
  },

  _handleLocationFailure(result) {
    this.setData({
      locating: false,
      showLocationFallback: true,
      showCityPicker: false,
      locationFailure: result,
    })
  },

  onLocationPrimary() {
    const result = this.data.locationFailure || {}
    this.setData({ showLocationFallback: false, showCityPicker: false })
    if (result.action === 'open-mini-setting') {
      this._openMiniProgramLocationSetting()
    } else if (result.action === 'open-app-setting') {
      this._openAppLocationSetting()
    } else {
      this.onLocationRetry()
    }
  },

  onLocationRetry() {
    this.setData({ showLocationFallback: false, showCityPicker: false })
    this._locationRetryCount = 0
    this._startLocate()
  },

  onOpenCityPicker() {
    this.setData({ showCityPicker: true })
  },

  onCityPickerBack() {
    this.setData({ showCityPicker: false })
  },

  onSelectManualCity(e) {
    const cityId = e.currentTarget.dataset.id
    const city = CITY_CENTERS.find((item) => item.id === cityId)
    if (!city) return
    this.setData({
      hasLocation: false,
      showLocationFallback: false,
      showCityPicker: false,
      locationFailure: null,
    })
    this.moveToLocation(city.longitude, city.latitude, city.scale)
    wx.showToast({ title: '已切换到' + city.name, icon: 'none' })
  },

  onBrowseNationwide() {
    this.setData({
      hasLocation: false,
      showLocationFallback: false,
      showCityPicker: false,
      locationFailure: null,
    })
    this.moveToLocation(
      config.MAP.INITIAL_LONGITUDE,
      config.MAP.INITIAL_LATITUDE,
      config.MAP.INITIAL_SCALE
    )
  },

  onLocationFallbackClose() {
    this.setData({ showLocationFallback: false, showCityPicker: false })
  },

  _openMiniProgramLocationSetting() {
    wx.openSetting({
      success: (res) => {
        if (res.authSetting && res.authSetting['scope.userLocation']) {
          this._retryLocationOnce()
        } else {
          wx.showToast({ title: '未开启定位，可继续浏览地图', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '设置页打开失败，请稍后重试', icon: 'none' }),
    })
  },

  _openAppLocationSetting() {
    if (typeof wx.openAppAuthorizeSetting !== 'function') {
      wx.showToast({ title: '请在手机系统设置中开启微信定位', icon: 'none' })
      return
    }
    wx.openAppAuthorizeSetting({
      success: () => this._retryLocationOnce(),
      fail: () => wx.showToast({ title: '请手动开启微信定位权限', icon: 'none' }),
    })
  },

  _retryLocationOnce() {
    if ((this._locationRetryCount || 0) >= 1) {
      wx.showToast({ title: '仍无法定位，可先拖动地图浏览', icon: 'none' })
      return
    }
    this._locationRetryCount = (this._locationRetryCount || 0) + 1
    this._startLocate()
  },

  onTapProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  onToggleDynastyBar() {
    this.setData({ showDynastyBar: !this.data.showDynastyBar })
  },

  // M4: 时间轴
  onToggleTimeline() {
    this.setData({ showTimeline: !this.data.showTimeline })
  },

  onTimelineSelect(e) {
    const d = e.currentTarget.dataset.dynasty || ""
    this.setData({ selectedDynasty: this.data.selectedDynasty === d ? "" : d, showTimeline: false })
    this.loadMarkers()
  },

  // M4: 热力模式
  onToggleHeat() {
    const heatMode = !this.data.heatMode
    this.setData({ heatMode })
    this.loadMarkers()
  },

  // M4: 旅行路线
  onToggleRoutePanel() {
    this.setData({ showRoutePanel: !this.data.showRoutePanel })
  },

  onSelectRoute(e) {
    const id = e.currentTarget.dataset.id || ""
    this.setData({ activeRouteId: this.data.activeRouteId === id ? "" : id, showRoutePanel: false })
    this.updatePolyline()
    // 自动缩放到路线范围
    const route = this.data.routes.find((r) => r.id === (this.data.activeRouteId || id))
    if (route && route.points.length) {
      const lng = route.points[0].lng
      const lat = route.points[0].lat
      this.moveToLocation(lng, lat, 6)
    }
  },

  // 旅行路线面板：创建 + 我的路线
  onOpenCreateRoute() {
    this.setData({ showRoutePanel: false })
    wx.navigateTo({ url: '/pages-sub/routes/create/create' })
  },
  onOpenMyRoutes() {
    this.setData({ showRoutePanel: false })
    wx.navigateTo({ url: '/pages-sub/routes/list/list' })
  },

  onShareAppMessage() {
    return { title: "在地图上阅读中国 — 诗词地图", path: "/pages/index/index" }
  },
})
