/**
 * 云函数：analyzePoem
 * 调用 CloudBase 内置 AI 对诗词进行解析（白话/典故/情感/背景）
 * TODO: M5 接入内置大模型（DeepSeek / Hunyuan）
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  console.log('[analyzePoem]', event)
  return { ok: true, message: 'AI 能力 M5 接入' }
}
