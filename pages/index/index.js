/**
 * 地图首页 — 诗词地图核心入口 (M4 增强)
 * 全屏 <map> + 地点 markers(热力大小) + 朝代时间轴 + 旅行路线折线 + 缩放聚合
 */
const { getDB, wrapPromise } = require("../../utils/cloudbase.js")
const config = require("../../config.js")

// 预定义旅行路线（M4 静态数据，M5 可改由 AI 生成）
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
  },

  onLoad() {
    this._pendingMapUpdate = null
    this._markerIdCounter = 0
    this._markerMap = {}
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

  onReady() {
    this.mapCtx = wx.createMapContext("poetry-map", this)
    this.loadDynasties()
    this.loadMarkers()
  },

  onShow() {
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
    this.setData({ loading: true })
    this._markerIdCounter = 0
    this._markerMap = {}
    let placesData = []
    try {
      const { db } = getDB()
      const scale = this.data.scale
      let markers = []

      if (scale < config.MAP.CLUSTER_THRESHOLD) {
        markers = await this.loadProvinceClusters()
      } else {
        const cond = {}
        if (this.data.selectedDynasty) {
          cond["dynasty_stats." + this.data.selectedDynasty] = db.command.gt(0)
        }
        const res = await wrapPromise(
          db.collection("places").where(cond).orderBy("poem_count", "desc").limit(200).get(),
          { loadingText: "加载地点…" }
        )
        placesData = res.data || []
        markers = placesData.map((p) => this.placeToMarker(p, scale))
      }

      this.setData({ markers, loading: false })
      this.updatePolyline()
      this.loadFeatured(placesData)
    } catch (err) {
      console.error("[index] loadMarkers error:", err)
      this.setData({ loading: false })
    }
  },

  /** 加载今日推荐（取诗词最多的地点 + 其热门诗词首行）*/
  async loadFeatured(places) {
    if (!places || !places.length) return
    const top = places[0]
    const hotPoems = top.hot_poems || []
    if (!hotPoems.length) return
    const poem = hotPoems[Math.floor(Math.random() * hotPoems.length)]
    const lines = (poem.content || '').split(/[。？！；\n]/).filter(Boolean)
    this.setData({
      featuredPoem: { title: poem.title, author: poem.author, dynasty: poem.dynasty, firstLine: lines[0] || '' },
      featuredPlace: top.name,
      featuredHidden: false,
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
      return provinces.map((p) => ({
        id: this._nextMarkerId({ name: p.name, cluster: true, placeId: p.provinceId || p.name }),
        longitude: p.longitude,
        latitude: p.latitude,
        width: 56,
        height: 56,
        iconPath: "/images/marker-city.png",
        title: p.name + " (" + (p.poem_count || 0) + "首)",
      }))
    } catch (err) {
      console.error("[index] loadProvinceClusters error:", err)
      return []
    }
  },

  /** 地点文档 → marker */
  placeToMarker(p, scale) {
    let lng = 0, lat = 0
    const loc = p.location
    if (loc) {
      if (typeof loc.longitude === "number") { lng = loc.longitude; lat = loc.latitude }
      else if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
        lng = loc.coordinates[0]; lat = loc.coordinates[1]
      }
    }
    const markerImg = this._getMarkerIconByType(p.type)
    return {
      id: this._nextMarkerId({ name: p.name, cluster: false, placeId: p._id || '' }),
      longitude: lng,
      latitude: lat,
      width: 44,
      height: 44,
      iconPath: markerImg,
      title: p.name,
      cluster: false,
      placeId: p._id || '',
      poem_count: p.poem_count || 0,
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
      this.mapCtx.getScale({
        success: (res) => {
          if (Math.abs(res.scale - this.data.scale) >= 1) {
            this.setData({ scale: res.scale })
            this.loadMarkers()
          }
        },
      })
      this.mapCtx.getCenterLocation({
        success: (res) => { this.setData({ longitude: res.longitude, latitude: res.latitude }) },
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
    this.setData({ featuredHidden: true })
  },

  moveToLocation(lng, lat, scale) {
    this.setData({ longitude: lng, latitude: lat, scale: scale || this.data.scale })
    this.loadMarkers()
  },

  onSelectDynasty(e) {
    const d = e.currentTarget.dataset.dynasty || ""
    this.setData({ selectedDynasty: this.data.selectedDynasty === d ? "" : d })
    this.loadMarkers()
  },

  onLocate() {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.moveToLocation(res.longitude, res.latitude, 8)
        this.setData({ hasLocation: true })
      },
      fail: () => { wx.showToast({ title: "定位失败，请检查权限", icon: "none" }) },
    })
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

  onShareAppMessage() {
    return { title: "在地图上阅读中国 — 诗词地图", path: "/pages/index/index" }
  },
})
