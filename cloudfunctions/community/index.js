'use strict'
/**
 * 云函数：社区（动态 Feed + 评论 + 点赞 + 关注）
 * 动作:
 *   feed       分页拉 feed（page/pageSize），created_at desc；返回 posts + 当前用户 liked 标记
 *   publish    写 posts { poem_id?, author_name?, content, images[] }
 *   removePost 仅本人可删（级联删其评论 + 点赞）
 *   comments   拉某帖评论（created_at asc）
 *   comment    写 comments + posts.comments_count+1
 *   removeComment 仅本人可删 + posts.comments_count-1
 *   toggleLike  幂等 toggle（target_type/target_id）；posts.likes_count 联动
 *   follow      幂等 toggle（following_openid）
 *
 * 集合: posts / comments / likes / follows
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const COL = {
  posts: 'posts',
  comments: 'comments',
  likes: 'likes',
  follows: 'follows',
  users: 'users',
}

// 允许客户端直接写入 posts 的字段白itelist
const POST_ALLOW = ['poem_id', 'author_name', 'content', 'images']
const COMMENT_MAX = 500

async function feed(openid, query) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10))

  const res = await db.collection(COL.posts)
    .orderBy('created_at', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  const posts = res.data || []

  // 当前用户 liked 哪些帖子（一次批量查）
  const postIds = posts.map((p) => p._id)
  const likedSet = new Set()
  if (openid && postIds.length) {
    const lr = await db.collection(COL.likes)
      .where({ target_type: 'post', target_id: _.in(postIds), openid })
      .field({ target_id: true })
      .get()
    ;(lr.data || []).forEach((l) => likedSet.add(l.target_id))
  }

  const data = posts.map((p) => ({ ...p, liked: likedSet.has(p._id) }))
  return { ok: true, data, page, pageSize }
}

async function publish(openid, event, user) {
  if (!openid) return { ok: false, error: 'no openid' }
  const content = String(event.content || '').trim().slice(0, COMMENT_MAX)
  if (!content) return { ok: false, error: 'content required' }

  const data = {
    openid,
    nickname: (user && user.nickname) || '',
    avatar_url: (user && user.avatar_url) || '',
    content,
    images: Array.isArray(event.images) ? event.images.slice(0, 9) : [],
    likes_count: 0,
    comments_count: 0,
    created_at: Date.now(),
  }
  for (const k of POST_ALLOW) {
    if (k === 'content' || k === 'images') continue
    if (event[k] !== undefined) data[k] = String(event[k] || '').slice(0, 120)
  }

  const r = await db.collection(COL.posts).add({ data })
  return { ok: true, _id: r._id }
}

async function removePost(openid, event) {
  if (!openid) return { ok: false, error: 'no openid' }
  const id = event.postId || event._id
  if (!id) return { ok: false, error: 'postId required' }

  const owner = await db.collection(COL.posts).doc(id).field({ openid: true }).get()
  if (!owner.data) return { ok: false, error: 'not found' }
  if (owner.data.openid !== openid) return { ok: false, error: 'forbidden' }

  await db.collection(COL.posts).doc(id).remove()
  // 级联：删该帖的评论与点赞（静默失败不影响主流程）
  await db.collection(COL.comments).where({ post_id: id }).remove().catch(() => {})
  await db.collection(COL.likes).where({ target_type: 'post', target_id: id }).remove().catch(() => {})
  return { ok: true }
}

async function comments(openid, event) {
  const postId = event.postId
  if (!postId) return { ok: false, error: 'postId required' }
  // 仅回传必要字段；owner 标记供前端判断删除权限
  const res = await db.collection(COL.comments)
    .where({ post_id: postId })
    .orderBy('created_at', 'asc')
    .limit(200)
    .field({ _id: true, post_id: true, openid: true, nickname: true, content: true, created_at: true })
    .get()
  const data = (res.data || []).map((c) => ({ ...c, owner: c.openid === openid }))
  return { ok: true, data }
}

async function comment(openid, event, user) {
  if (!openid) return { ok: false, error: 'no openid' }
  const content = String(event.content || '').trim().slice(0, COMMENT_MAX)
  if (!content) return { ok: false, error: 'content required' }
  const postId = event.postId
  if (!postId) return { ok: false, error: 'postId required' }

  const data = {
    post_id: postId,
    openid,
    nickname: (user && user.nickname) || '',
    content,
    created_at: Date.now(),
  }
  const r = await db.collection(COL.comments).add({ data })
  // 评论数 +1（静默失败不影响主流程）
  await db.collection(COL.posts).doc(postId).update({ data: { comments_count: _.inc(1) } }).catch(() => {})
  return { ok: true, _id: r._id, comment: { ...data, owner: true } }
}

async function removeComment(openid, event) {
  if (!openid) return { ok: false, error: 'no openid' }
  const id = event.commentId || event._id
  if (!id) return { ok: false, error: 'commentId required' }

  const owner = await db.collection(COL.comments).doc(id).field({ openid: true, post_id: true }).get()
  if (!owner.data) return { ok: false, error: 'not found' }
  if (owner.data.openid !== openid) return { ok: false, error: 'forbidden' }

  await db.collection(COL.comments).doc(id).remove()
  await db.collection(COL.posts).doc(owner.data.post_id).update({ data: { comments_count: _.inc(-1) } }).catch(() => {})
  return { ok: true }
}

async function toggleLike(openid, event) {
  if (!openid) return { ok: false, error: 'no openid' }
  const { target_type, target_id } = event
  if (!target_type || !target_id) return { ok: false, error: 'target_type/target_id required' }

  const exists = await db.collection(COL.likes)
    .where({ target_type, target_id, openid })
    .limit(1)
    .get()

  if (exists.data && exists.data.length) {
    // 取消点赞
    await db.collection(COL.likes).doc(exists.data[0]._id).remove()
    if (target_type === 'post') {
      await db.collection(COL.posts).doc(target_id).update({ data: { likes_count: _.inc(-1) } }).catch(() => {})
    }
    return { ok: true, liked: false }
  }

  // 点赞
  await db.collection(COL.likes).add({ data: { target_type, target_id, openid, created_at: Date.now() } })
  if (target_type === 'post') {
    await db.collection(COL.posts).doc(target_id).update({ data: { likes_count: _.inc(1) } }).catch(() => {})
  }
  return { ok: true, liked: true }
}

async function follow(openid, event) {
  if (!openid) return { ok: false, error: 'no openid' }
  const following_openid = event.following_openid
  if (!following_openid) return { ok: false, error: 'following_openid required' }
  if (following_openid === openid) return { ok: false, error: 'cannot follow self' }

  const exists = await db.collection(COL.follows)
    .where({ follower_openid: openid, following_openid })
    .limit(1)
    .get()

  if (exists.data && exists.data.length) {
    await db.collection(COL.follows).doc(exists.data[0]._id).remove()
    return { ok: true, following: false }
  }

  await db.collection(COL.follows).add({
    data: { follower_openid: openid, following_openid, created_at: Date.now() },
  })
  return { ok: true, following: true }
}

// 取当前用户档案（publish / comment 需要 nickname/avatar）
async function getSelf(openid) {
  if (!openid) return null
  try {
    const r = await db.collection(COL.users).doc(openid).get()
    return r.data || null
  } catch (e) {
    return null
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  try {
    switch (action) {
      case 'feed':
        return await feed(openid, event)
      case 'publish':
        return await publish(openid, event, await getSelf(openid))
      case 'removePost':
        return await removePost(openid, event)
      case 'comments':
        return await comments(openid, event)
      case 'comment': {
        const user = await getSelf(openid)
        return await comment(openid, event, user)
      }
      case 'removeComment':
        return await removeComment(openid, event)
      case 'toggleLike':
        return await toggleLike(openid, event)
      case 'follow':
        return await follow(openid, event)
      default:
        return { ok: false, error: 'unknown action: ' + action }
    }
  } catch (err) {
    console.error('[community] action=' + action + ' error:', err)
    return { ok: false, error: err.errMsg || err.message || 'server error' }
  }
}
