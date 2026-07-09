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
    latitude: config.MAP.INITIAL_LATIAL || config.MAP.INITIAL_LATITUDE,
    scale: config.MAP.INITIAL_SCALE,
    minScale: config.MAP.MIN_SCALE,
    maxScale: config.MAP.MAX_SCALE,
    dynasties: [],
    selectedDynasty: "",
    markers: [],
    polyline: [],
    loading: true,
    showDynastyBar: true,
    hasLocation: false,
    // M4: 时间轴
    timelineDynasties: [],
    showTimeline: false,
    // M4: 热力模式
    heatMode: false,
    // M4: 旅行路线
    routes: TRAVEL_ROUTES,
    activeRouteId: "",
    showRoutePanel: false,
  },

  onLoad() {
    this._pendingMapUpdate = null
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
        markers = (res.data || []).map((p) => this.placeToMarker(p, scale))
      }

      this.setData({ markers, loading: false })
      this.updatePolyline()
    } catch (err) {
      console.error("[index] loadMarkers error:", err)
      this.setData({ loading: false })
    }
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
        id: "cluster-" + (p.provinceId || p._id || p.name),
        longitude: p.longitude,
        latitude: p.latitude,
        width: this._heatWidth(p.poem_count),
        height: this._heatWidth(p.poem_count),
        cluster: true,
        poem_count: p.poem_count,
        callout: {
          content: p.name + " " + (p.poem_count || 0),
          color: "#fff",
          fontSize: 22,
          borderRadius: 20,
          bgColor: this._heatColor(p.poem_count),
          padding: 10,
          display: "ALWAYS",
        },
      }))
    } catch (err) {
      console.error("[index] loadProvinceClusters error:", err)
      return []
    }
  },

  /** 热力颜色：诗词越多越红 */
  _heatColor(count) {
    if (count > 200) return "#8b1a1a"
    if (count > 100) return "#b85c5c"
    if (count > 50) return "#d48a6a"
    return "#e8c090"
  },

  /** 热力尺寸 */
  _heatWidth(count) {
    if (!this.data.heatMode) return 56
    return Math.min(120, Math.max(40, Math.sqrt(count) * 5))
  },

  /** 地点文档 → marker（兼容两种 GeoPoint 格式 + 热力大小） */
  placeToMarker(p, scale) {
    let lng = 0, lat = 0
    const loc = p.location
    if (loc) {
      if (typeof loc.longitude === "number") { lng = loc.longitude; lat = loc.latitude }
      else if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
        lng = loc.coordinates[0]; lat = loc.coordinates[1]
      }
    }
    const w = this.data.heatMode ? this._heatWidth(p.poem_count) : 56
    return {
      id: p._id,
      longitude: lng,
      latitude: lat,
      width: w,
      height: w,
      cluster: false,
      placeId: p._id,
      poem_count: p.poem_count || 0,
      callout: {
        content: p.name + " " + (p.poem_count || 0),
        color: "#2c2c2c",
        fontSize: 20,
        borderRadius: 16,
        bgColor: this.data.heatMode ? this._heatColor(p.poem_count) : "#ffffff",
        padding: 8,
        display: "BYCLICK",
        borderColor: "#8b1a1a",
        borderWidth: 1,
      },
    }
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
    const marker = this.data.markers.find((m) => m.id === e.markerId)
    if (!marker) return
    if (marker.cluster) {
      this.moveToLocation(marker.longitude, marker.latitude, this.data.scale + 3)
    } else {
      wx.navigateTo({ url: "/pages/place/place?id=" + marker.placeId })
    }
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
