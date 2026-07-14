/**
 * 云函数：ttsPoem — 诗词即时朗读（腾讯云基础 TTS）
 *
 * 入参:
 *   poem_id  诗词文档 ID（优先，从 poems 读正文）
 *   text?    兜底文本（无 poem_id 时）
 *   voice?   'male' | 'female'（默认 female）
 *
 * 返回:
 *   { ok, fileID, audio_url, duration, cached, voice } | { ok:false, error }
 *
 * 环境变量（可选）:
 *   TTS_SECRET_ID / TTS_SECRET_KEY（腾讯云 TTS；未配置则回落 Google TTS）
 *   或 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY
 *   可选 TTS_VOICE_MALE / TTS_VOICE_FEMALE（音色 ID，默认 10510000 / 1001）
 *
 * 回落 Google Translate TTS（零依赖 / 免费 / 免 API Key）
 *
 * 缓存集合 tts_cache（仅云函数读写）:
 *   { _id: `${poemId}_${voice}`, poem_id, voice, text_hash, fileID, duration, updated_at }
 */
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const CACHE_COL = 'tts_cache'
const MAX_CHUNK = 140
const MAX_TOTAL_CHARS = 2000

function getCredentials() {
  const secretId = process.env.TTS_SECRET_ID || process.env.TENCENTCLOUD_SECRET_ID || ''
  const secretKey = process.env.TTS_SECRET_KEY || process.env.TENCENTCLOUD_SECRET_KEY || ''
  return { secretId, secretKey }
}

function voiceTypeOf(voice) {
  if (voice === 'male') {
    return Number(process.env.TTS_VOICE_MALE || 10510000)
  }
  return Number(process.env.TTS_VOICE_FEMALE || 1001)
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest()
}

function chunkText(text, maxLen) {
  const cleaned = String(text || '').replace(/\s+/g, '').trim()
  if (!cleaned) return []
  const parts = []
  let buf = ''
  const segs = cleaned.split(/(?<=[。？！；，、\n])/)
  for (const seg of segs) {
    if (!seg) continue
    if ((buf + seg).length <= maxLen) {
      buf += seg
      continue
    }
    if (buf) parts.push(buf)
    if (seg.length <= maxLen) {
      buf = seg
    } else {
      for (let i = 0; i < seg.length; i += maxLen) {
        parts.push(seg.slice(i, i + maxLen))
      }
      buf = ''
    }
  }
  if (buf) parts.push(buf)
  return parts
}

function buildSpeakText(poem) {
  const title = poem.title || ''
  const dynasty = poem.dynasty || ''
  const author = poem.author || ''
  const content = poem.content || ''
  const head = [title, dynasty + author].filter(Boolean).join('。')
  return (head ? head + '。' : '') + content
}

function estimateDurationSec(text) {
  // 约 4 字/秒（略慢语速）
  const n = String(text || '').length
  return Math.max(3, Math.ceil(n / 4))
}

function tc3Request({ secretId, secretKey, action, payload }) {
  const host = 'tts.tencentcloudapi.com'
  const service = 'tts'
  const version = '2019-08-23'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const payloadStr = JSON.stringify(payload)

  const hashedPayload = sha256Hex(payloadStr)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n')

  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const secretDate = hmacSha256('TC3' + secretKey, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')

  const authorization = [
    'TC3-HMAC-SHA256',
    `Credential=${secretId}/${credentialScope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signature}`,
  ].join(' ')

  const headers = {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        path: '/',
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(payloadStr),
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          let json
          try {
            json = JSON.parse(body)
          } catch (e) {
            reject(new Error('TTS response parse failed'))
            return
          }
          if (json.Response && json.Response.Error) {
            const err = json.Response.Error
            reject(new Error(err.Message || err.Code || 'TTS API error'))
            return
          }
          resolve(json.Response || json)
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('TTS request timeout'))
    })
    req.write(payloadStr)
    req.end()
  })
}

async function synthesizeMp3(secretId, secretKey, text, voiceType) {
  const chunks = chunkText(text, MAX_CHUNK)
  if (!chunks.length) throw new Error('empty text')
  const buffers = []
  for (let i = 0; i < chunks.length; i++) {
    const res = await tc3Request({
      secretId,
      secretKey,
      action: 'TextToVoice',
      payload: {
        Text: chunks[i],
        SessionId: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        VoiceType: voiceType,
        Codec: 'mp3',
        SampleRate: 16000,
        Speed: -1,
        Volume: 0,
        PrimaryLanguage: 1,
        ModelType: 1,
      },
    })
    if (!res.Audio) throw new Error('TTS returned empty audio')
    buffers.push(Buffer.from(res.Audio, 'base64'))
  }
  return Buffer.concat(buffers)
}

async function getTempUrl(fileID) {
  const urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
  const item = (urlRes.fileList && urlRes.fileList[0]) || {}
  if (item.status !== 0 && item.status !== 'SUCCESS' && !item.tempFileURL) {
    return ''
  }
  return item.tempFileURL || ''
}

function safeCloudPath(poemId, voice) {
  const safe = String(poemId || 'anon')
    .replace(/[^\w\u4e00-\u9fff.-]/g, '_')
    .slice(0, 80)
  return `tts/${safe}_${voice}.mp3`
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550 Google Translate TTS \u96f6\u4f9d\u8d56\u515c\u5e95\uff08\u514d\u8d39 / \u514d Key / Node \u5185\u7f6e https\uff09\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u4e2d\u6587\u5355\u4e00\u97f3\u8272\uff08\u5973\uff09\uff0c\u7537\u6027\u6309\u94ae\u4e5f\u56de\u843d\u8be5\u7aef\u70b9
const GOOGLE_TTS_HOST = 'https://translate.google.com'
const GOOGLE_TTS_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36'

function googleTTSRequest(text) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(String(text || ''))
    const url = `${GOOGLE_TTS_HOST}/translate_tts?ie=UTF-8&q=${q}&tl=zh-CN&client=tw-ob`
    const req = require('https').get(
      url,
      { headers: { 'User-Agent': GOOGLE_TTS_UA } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          require('https').get(res.headers.location, { headers: { 'User-Agent': GOOGLE_TTS_UA } }, (r2) => collect(r2)).on('error', reject)
          return
        }
        collect(res)
      }
    )
    function collect(res) {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }
    req.on('error', reject)
    req.setTimeout(18000, () => { req.destroy(); reject(new Error('Google TTS timeout')) })
  })
}

// \u62c6\u5206\u957f\u6587\u672c\u4e3a \u2264200 \u5b57\u7b26\u7684\u6bb5\uff08Google TTS GET \u957f\u5ea6\u9650\u5236\uff09
function splitForGoogle(text, max = 180) {
  const cleaned = String(text || '').replace(/\s+/g, '').trim()
  if (!cleaned) return []
  const segs = cleaned.split(/(?<=[\u3002\uff1f\uff01\uff1b\uff0c\u3001\n])/)
  const parts = []
  let buf = ''
  for (const seg of segs) {
    if (!seg) continue
    if ((buf + seg).length <= max) {
      buf += seg; continue
    }
    if (buf) parts.push(buf)
    if (seg.length <= max) { buf = seg }
    else { for (let i = 0; i < seg.length; i += max) parts.push(seg.slice(i, i + max)); buf = '' }
  }
  if (buf) parts.push(buf)
  return parts
}

async function synthesizeGoogleTTS(text) {
  const parts = splitForGoogle(text)
  if (!parts.length) throw new Error('empty text')
  const buffers = []
  for (const p of parts) {
    const buf = await googleTTSRequest(p)
    buffers.push(buf)
  }
  return Buffer.concat(buffers)
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const voice = event.voice === 'male' ? 'male' : 'female'
  const poemId = event.poem_id || ''
  const db = cloud.database()

  const { secretId, secretKey } = getCredentials()
  // 腾讯云 TTS 是否可用；不可用回落到 Google TTS（零依赖）
  const useTencent = !!(secretId && secretKey)

  let poem = null
  if (poemId) {
    try {
      const res = await db.collection('poems').doc(poemId).get()
      poem = res.data || null
    } catch (e) {
      poem = null
    }
    if (!poem) return { ok: false, error: '诗词不存在' }
  } else if (event.text) {
    poem = {
      title: event.title || '',
      author: event.author || '',
      dynasty: event.dynasty || '',
      content: String(event.text),
    }
  } else {
    return { ok: false, error: 'poem_id or text required' }
  }

  const speakText = buildSpeakText(poem).slice(0, MAX_TOTAL_CHARS)
  if (!speakText) return { ok: false, error: 'empty poem text' }

  const textHash = sha256Hex(speakText + '|' + voice + '|' + voiceTypeOf(voice))
  const cacheId = poemId ? `${poemId}_${voice}` : `hash_${textHash.slice(0, 24)}`

  try {
    const cached = await db.collection(CACHE_COL).doc(cacheId).get().catch(() => null)
    if (cached && cached.data && cached.data.text_hash === textHash && cached.data.fileID) {
      const audio_url = await getTempUrl(cached.data.fileID)
      return {
        ok: true,
        cached: true,
        voice,
        fileID: cached.data.fileID,
        audio_url: audio_url || cached.data.fileID,
        duration: cached.data.duration || estimateDurationSec(speakText),
      }
    }
  } catch (e) {
    // cache miss
  }

  // 未配腾讯云 → 直接走 Google TTS（零依赖）
  if (!useTencent) {
    const mp3 = await synthesizeGoogleTTS(speakText)
    const cloudPath = safeCloudPath(poemId || cacheId, voice)
    const upload = await cloud.uploadFile({ cloudPath, fileContent: mp3 })
    const fileID = upload.fileID
    const duration = estimateDurationSec(speakText)
    const audio_url = (await getTempUrl(fileID)) || fileID
    return { ok: true, cached: false, voice, fileID, audio_url, duration, fallback: 'google-tts' }
  }

  try {
    const mp3 = await synthesizeMp3(secretId, secretKey, speakText, voiceTypeOf(voice))
    const cloudPath = safeCloudPath(poemId || cacheId, voice)
    const upload = await cloud.uploadFile({
      cloudPath,
      fileContent: mp3,
    })
    const fileID = upload.fileID
    const duration = estimateDurationSec(speakText)
    const audio_url = (await getTempUrl(fileID)) || fileID

    try {
      await db.collection(CACHE_COL).doc(cacheId).set({
        data: {
          poem_id: poemId || '',
          voice,
          text_hash: textHash,
          fileID,
          duration,
          openid,
          updated_at: Date.now(),
        },
      })
    } catch (e) {
      console.warn('[ttsPoem] cache write failed:', e.message || e)
    }

    return {
      ok: true,
      cached: false,
      voice,
      fileID,
      audio_url,
      duration,
    }
  } catch (err) {
    // 腾讯云 TTS 失败 → 回落 Google TTS（零依赖）
    if (useTencent) {
      console.warn('[ttsPoem] tencent tts failed, fallback to google-tts:', err.message || err)
      try {
        const mp3 = await synthesizeGoogleTTS(speakText)
        const cloudPath = safeCloudPath(poemId || cacheId, voice)
        const upload = await cloud.uploadFile({ cloudPath, fileContent: mp3 })
        const fileID = upload.fileID
        const duration = estimateDurationSec(speakText)
        const audio_url = (await getTempUrl(fileID)) || fileID
        return { ok: true, cached: false, voice, fileID, audio_url, duration, fallback: 'google-tts' }
      } catch (e2) {
        console.error('[ttsPoem] google-tts fallback failed:', e2.message || e2)
        return { ok: false, error: err.message || 'TTS failed' }
      }
    }
    console.error('[ttsPoem] error:', err)
    return { ok: false, error: err.message || 'TTS failed' }
  }
}
