/**
 * 社区种子脚本：向 posts / comments / likes / follows 写入示例数据
 *
 * 前提：在 CloudBase 控制台创建好 4 个集合（详见 .superpowers/sdd/task-4-report.md 手动步骤）。
 *       集合无需预置 schema，首次 add 即自动建表。
 *
 * 用法：node scripts/seed-community.cjs
 *
 * 注意：需要云开发管理员密钥才能直写集合，推荐改用云函数配合 initData 模式或控制台导入。
 *       本脚本仅在本地持有환경密钥时可用（wx-server-sdk + API key），否则请在控制台手动导入 data/seed-community.json。
 */
const path = require('path')
const fs = require('fs')

let cloud
try {
  cloud = require('wx-server-sdk')
} catch (e) {
  console.error('[seed-community] 未找到 wx-server-sdk，请先 npm install（cloudfunctions/community 目录下）')
  process.exit(1)
}

// 优先读取命令行传入的 env；否则读 config
const env = process.argv[2] || require(path.join(__dirname, '..', 'config.js')).ENV_ID
cloud.init({ env })
const db = cloud.database()

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed-community.json'), 'utf8'))

async function run() {
  const cols = ['posts', 'comments', 'likes', 'follows']
  for (const col of cols) {
    const list = data[col] || []
    let n = 0
    for (const doc of list) {
      try {
        await db.collection(col).add({ data: doc })
        n++
      } catch (err) {
        console.warn(`[seed-community] ${col} 写入失败:`, err.errMsg || err.message)
      }
    }
    console.log(`[seed-community] ${col}: 写入 ${n}/${list.length}`)
  }
  console.log('[seed-community] 完成')
}

run().catch((e) => {
  console.error('[seed-community] 异常:', e)
  process.exit(1)
})
