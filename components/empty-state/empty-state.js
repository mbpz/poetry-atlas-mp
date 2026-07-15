/**
 * 空状态组件 — 无数据/无结果/空列表时的友好提示
 * 用法: <empty-state iconSrc="/tab-bar-icons/search.svg" title="未找到" tip="换个词试试" />
 */
Component({
  properties: {
    icon: { type: String, value: "空" },
    iconSrc: { type: String, value: "" },
    title: { type: String, value: "暂无内容" },
    tip: { type: String, value: "" },
    showBtn: { type: Boolean, value: false },
    btnText: { type: String, value: "去发现" },
  },
  methods: {
    onBtn() { this.triggerEvent("tap") },
  },
})
