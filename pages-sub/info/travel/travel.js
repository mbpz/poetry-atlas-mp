/**
 * 旅行路线详情页 — 展示主题路线各站 + 配诗
 * 入参: route (路线 id), from=db 表示查自建路线；否则保留静态示例路线
 *
 * 加载策略:
 *   - from=db → 首选云函数 routes.detail，失败回退 ROUTE_DETAILS[route]
 *   - 否则 → 直接读 ROUTE_DETAILS（静态示例）
 */
const { splitPoemLines } = require("../../../utils/util.js")

// 路线详情（静态示例数据，作为回退兜底）
const ROUTE_DETAILS = {
  libai_yangtze: {
    name: "李白长江壮游行",
    theme: "朝辞白帝彩云间，千里江陵一日还",
    description: "从成都出发，顺江而下，经江陵、黄鹤楼、庐山，终至金陵。一路山水，一路诗篇。",
    days: [
      {
        day: 1, city: "成都", poemTitle: "《蜀道难》", poemAuthor: "李白",
        poemContent: "噫吁嚱，危乎高哉！蜀道之难，难于上青天！",
        note: "蜀道之难，开篇雄奇，道尽入蜀艰险。",
      },
      {
        day: 2, city: "江陵", poemTitle: "《早发白帝城》", poemAuthor: "李白",
        poemContent: "朝辞白帝彩云间，千里江陵一日还。两岸猿声啼不住，轻舟已过万重山。",
        note: "白帝城出发，一日千里，豪情万丈。",
      },
      {
        day: 3, city: "黄鹤楼", poemTitle: "《黄鹤楼送孟浩然之广陵》", poemAuthor: "李白",
        poemContent: "故人西辞黄鹤楼，烟花三月下扬州。孤帆远影碧空尽，唯见长江天际流。",
        note: "烟花三月，送别故人，长江天际流。",
      },
      {
        day: 4, city: "庐山", poemTitle: "《望庐山瀑布》", poemAuthor: "李白",
        poemContent: "日照香炉生紫烟，遥看瀑布挂前川。飞流直下三千尺，疑是银河落九天。",
        note: "庐山瀑布，疑是银河落九天。",
      },
      {
        day: 5, city: "金陵", poemTitle: "《登金陵凤凰台》", poemAuthor: "李白",
        poemContent: "凤凰台上凤凰游，凤去台空江自流。吴宫花草埋幽径，晋代衣冠成古丘。",
        note: "凤凰台上，怀古思今，江水依旧。",
      },
    ],
  },
  dufu_tangsan: {
    name: "杜甫漂泊记",
    theme: "国破山河在，城春草木深",
    description: "安史之乱后，杜甫漂泊半生。从洛阳到长安，从成都到岳阳，一路忧国忧民。",
    days: [
      {
        day: 1, city: "长安", poemTitle: "《春望》", poemAuthor: "杜甫",
        poemContent: "国破山河在，城春草木深。感时花溅泪，恨别鸟惊心。",
        note: "国破家亡，感时伤怀。",
      },
      {
        day: 2, city: "成都", poemTitle: "《春夜喜雨》", poemAuthor: "杜甫",
        poemContent: "好雨知时节，当春乃发生。随风潜入夜，润物细无声。",
        note: "草堂夜雨，润泽万物。",
      },
      {
        day: 3, city: "夔州", poemTitle: "《登高》", poemAuthor: "杜甫",
        poemContent: "风急天高猿啸哀，渚清沙白鸟飞回。无边落木萧萧下，不尽长江滚滚来。",
        note: "登高望远，悲秋之情。",
      },
      {
        day: 4, city: "岳阳", poemTitle: "《登岳阳楼》", poemAuthor: "杜甫",
        poemContent: "昔闻洞庭水，今上岳阳楼。吴楚东南坼，乾坤日夜浮。",
        note: "洞庭天下水，岳阳天下楼。",
      },
    ],
  },
}

Page({
  data: {
    route: null,
    loading: true,
    isDynamic: false,
  },

  onLoad(options) {
    this.routeId = options.route || 'libai_yangtze'
    this.fromDb = options.from === 'db'
    if (this.fromDb) {
      this.loadFromDb()
    } else {
      this.loadStatic()
    }
  },

  // 优先查 DB，失败回退静态
  async loadFromDb() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'routes',
        data: { action: 'detail', routeId: this.routeId },
      })
      const result = (res && res.result) || {}
      if (result.ok && result.data) {
        this.renderDynamic(result.data)
        return
      }
      // 回退静态
      console.warn('[travel] db detail failed, fallback static:', result.error)
      this.loadStatic()
    } catch (err) {
      console.error('[travel] loadFromDb error:', err)
      this.loadStatic()
    }
  },

  loadStatic() {
    const route = ROUTE_DETAILS[this.routeId]
    if (route) {
      this.setData({
        route: {
          ...route,
          days: route.days.map((d) => ({
            ...d,
            lines: splitPoemLines(d.poemContent),
          })),
        },
        loading: false,
        isDynamic: false,
      })
    } else {
      wx.showToast({ title: "路线不存在", icon: "none" })
      this.setData({ loading: false })
    }
  },

  // 将自建路线结构映射为 UI 需要的 days 展示格式
  renderDynamic(data) {
    const points = Array.isArray(data.points) ? data.points : []
    const days = points.map((p, i) => ({
      day: i + 1,
      city: p.name || '',
      poemTitle: p.poem_title || '',
      poemAuthor: p.poem_author || '',
      poemContent: p.poem_content || '',
      note: p.note || '',
      lines: splitPoemLines(p.poem_content || ''),
    }))
    this.setData({
      route: {
        name: data.name,
        theme: data.theme || '',
        description: data.description || '',
        days,
      },
      loading: false,
      isDynamic: true,
    })
  },

  onTapPoem(e) {
    const day = e.currentTarget.dataset.day
    if (!day) return
    // 旅行页诗句无 _id，用 globalData 传递一首合成的诗词对象
    getApp().globalData.currentPoem = {
      title: day.poemTitle,
      author: day.poemAuthor,
      dynasty: "未知",
      content: day.poemContent,
    }
    wx.navigateTo({ url: "/pages-sub/info/poem/poem" })
  },

  // 自建路线为私有内容，不提供公开分享
})
