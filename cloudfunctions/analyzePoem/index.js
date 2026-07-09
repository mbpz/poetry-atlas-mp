/**
 * 云函数：analyzePoem
 * AI 深度解析诗词（白话译文 + 典故 + 情感 + 背景 + 艺术手法）
 *
 * 使用 CloudBase 内置 AI（@cloudbase/node-sdk），cloudbase 托管组 + hy3 模型
 *
 * 入参: { title, author, dynasty, content, annotation }
 * 返回: { ok, text, usage }
 *
 * 注意：此函数使用 @cloudbase/node-sdk 的 AI 能力，需 tcb.ai()；
 *       保持 wx-server-sdk 用于数据库读取（按需）。
 */
const tcb = require("@cloudbase/node-sdk")

// 环境 ID 硬编码（与 wx-server-sdk 的 DYNAMIC_CURRENT_ENV 一致）
const ENV_ID = "online-d2gyjoohe58cc4936"

// 初始化 AI 客户端（cloudbase 托管组，TokenHub 计费池）
let _ai = null
function getAI() {
  if (_ai) return _ai
  const app = tcb.init({ env: ENV_ID })
  _ai = app.ai()
  return _ai
}

/** 构建诗词解析 prompt */
function buildPrompt({ title, author, dynasty, content, annotation }) {
  return [
    {
      role: "system",
      content:
        "你是一位精通中国古典文学的学者兼诗人。请对给定诗词进行全方位深度解读，" +
        "用语典雅流畅、深入浅出。严格按以下 JSON 格式输出（不要 Markdown 代码块）：" +
        '{"translation":"白话译文","allusions":[{"phrase":"...","source":"...","meaning":"..."}],"emotion":"主要情感","background":"创作背景","techniques":["手法1","手法2"],"significance":"文学史地位"}',
    },
    {
      role: "user",
      content:
        "请解析以下诗词。\n" +
        "标题：" + (title || "未知") + "\n" +
        "作者：" + (author || "佚名") + "（" + (dynasty || "") + "）\n" +
        "正文：" + (content || "") + "\n" +
        "原注：" + (annotation || "无"),
    },
  ]
}

/** 简易解析模型返回的 JSON（容错：模型可能包 ```json ... ```） */
function parseResult(text) {
  if (!text) return null
  let s = text.trim()
  // 剥掉 ```json ... ``` 包裹
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  try {
    return JSON.parse(s)
  } catch (e) {
    // 尝试提取第一段 {...}
    const m = s.match(/\{[\s\S]*\}/)
    if (m) {
      try { return JSON.parse(m[0]) } catch (e2) {}
    }
    return null
  }
}

exports.main = async (event) => {
  const { title, author, dynasty, content, annotation } = event
  console.log("[analyzePoem]", JSON.stringify({ title, author, hasContent: !!content }))

  if (!content) {
    return { ok: false, error: "缺少诗词正文" }
  }

  try {
    const ai = getAI()
    const model = ai.createModel("cloudbase")

    const result = await model.generateText({
      model: "hy3",
      messages: buildPrompt({ title, author, dynasty, content, annotation }),
      temperature: 0.7,
    })

    const raw = result.text || ""
    console.log("[analyzePoem] raw length:", raw.length, "usage:", JSON.stringify(result.usage))

    const parsed = parseResult(raw)
    return {
      ok: true,
      text: raw,
      structured: parsed,
      usage: result.usage || null,
    }
  } catch (err) {
    console.error("[analyzePoem] error:", err)
    return {
      ok: false,
      error: err.errMsg || err.message || "AI 解析失败",
    }
  }
}
