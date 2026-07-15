# 规范诗词语料迁移说明

## 当前状态

规范模型和确定性导入逻辑已进入代码库，但当前语料仍存在未解决的实质冲突和来源缺失。因此，在人工校订完成前，不得将规范语料写入生产环境，也不得用旧的 `cloudfunctions/initData/seed.json` 覆盖生产 `poems` 集合。

## 规范字段

| 字段 | 含义 |
|---|---|
| `_id` / `canonical_id` | 由朝代、作者、标题生成的稳定 ID；人工维护的数据可显式提供 ID |
| `content_kind` | 规范正文为 `full`；短版本在 `alternate_versions` 中标记为 `excerpt` |
| `content_hash` | 规范化正文的 SHA-256 |
| `data_version` | 本次语料发布版本 |
| `review_status` | `verified` / `needs-review` / `needs-source` |
| `source_name/source_url/source_license` | 来源、访问地址和许可说明 |
| `alternate_versions` | 被识别为节选或经人工裁决后保留的其他版本 |

## 导入门槛

1. 运行 `npm run audit:poems:strict`，所有阻断项必须已裁决。
2. 对实质冲突，在 `data/poem-overrides.json` 中写入完整正文、来源和许可说明。
3. 运行 `npm run test:canonical-poems`。
4. 运行 `node scripts/migrate-data.cjs --dry-run`，输出必须稳定且无冲突。
5. 生成发布版本并记录集合计数、内容哈希及抽样作品。

## 生产兼容迁移

现网收藏使用旧 `poems._id`。切换到规范 `_id` 前必须：

1. 导出旧 `poems` 的 `_id/title/author/dynasty` 映射。
2. 以标题、作者、朝代匹配规范 `canonical_id`，冲突项人工确认。
3. 为 `favorites.poem_id`、`recitations.poem_id`、`tts_cache.poem_id` 生成旧 ID 到新 ID 的迁移表。
4. 在测试环境先迁移并验证地图、搜索、详情、收藏和朗读链路。
5. 生产发布前备份受影响集合，并冻结相关写入窗口。

## 回滚

每次发布保留：

- 上一版 `poems/places/authors/dynasties` 导出文件；
- 本次 `data_version` 和各集合内容哈希；
- 旧 ID 与规范 ID 的双向映射；
- 收藏、朗诵和 TTS 缓存迁移前备份。

若抽样、计数或核心路径不通过，应恢复上一版集合并反向应用 ID 映射。禁止在没有备份和映射的情况下直接删除旧集合。
