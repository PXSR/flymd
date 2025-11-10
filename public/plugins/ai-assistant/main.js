// AI 写作助手（OpenAI 兼容路径）
// 说明：
// - 仅实现 OpenAI 兼容接口（/v1/chat/completions）
// - 浮动窗口、基本对话、快捷动作（续写/润色/纠错/提纲）
// - 设置项：baseUrl、apiKey、model、上下文截断长度
// - 默认不写回文档，需用户点击“插入文末”

// ========== 配置与状态 ==========
const CFG_KEY = 'ai.config'
const SES_KEY = 'ai.session.default'

const DEFAULT_CFG = {
  provider: 'openai', // 预留字段（仅 openai）
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  win: { x: 60, y: 60, w: 520, h: 440 },
  limits: { maxCtxChars: 6000 }
}

// 会话只做最小持久化（可选），首版以内存为主
let __AI_SESSION__ = { id: '', name: '默认会话', messages: [], docHash: '', docTitle: '' }
let __AI_DB__ = null // { byDoc: { [hash]: { title, activeId, items:[{id,name,created,updated,messages:[]}] } } }
let __AI_SENDING__ = false
let __AI_LAST_REPLY__ = ''

// ========== 工具函数 ==========
async function loadCfg(context) {
  try { const s = await context.storage.get(CFG_KEY); return { ...DEFAULT_CFG, ...(s || {}) } } catch { return { ...DEFAULT_CFG } }
}
async function saveCfg(context, cfg) { try { await context.storage.set(CFG_KEY, cfg) } catch {} }
async function loadSession(context) { try { const s = await context.storage.get(SES_KEY); return s && typeof s === 'object' ? s : { messages: [] } } catch { return { messages: [] } } }
async function saveSession(context, ses) { try { await context.storage.set(SES_KEY, ses) } catch {} }

async function loadSessionsDB(context) {
  try { const db = await context.storage.get('ai.sessions'); if (db && typeof db === 'object') { __AI_DB__ = db; return __AI_DB__ } } catch {}
  __AI_DB__ = { byDoc: {} }
  return __AI_DB__
}
async function saveSessionsDB(context) { try { await context.storage.set('ai.sessions', __AI_DB__ || { byDoc: {} }) } catch {} }

function gid(){ return 's_' + Math.random().toString(36).slice(2,10) }

function clampCtx(s, n) { const t = String(s || ''); return t.length > n ? t.slice(t.length - n) : t }

function el(id) { return document.getElementById(id) }
function lastUserMsg() { try { const arr = __AI_SESSION__.messages; for (let i = arr.length - 1; i >= 0; i--) { if (arr[i].role === 'user') return String(arr[i].content || '') } } catch {} return '' }
function shorten(s, n){ const t = String(s||'').trim(); return t.length>n? (t.slice(0,n)+'…') : t }

// 追加一段样式，使用独立命名空间，避免污染宿主
function ensureCss() {
  if (document.getElementById('ai-assist-style')) return
  const css = document.createElement('style')
  css.id = 'ai-assist-style'
  css.textContent = [
    // 容器（浅色友好 UI）
    '#ai-assist-win{position:fixed;z-index:99999;background:#ffffff;color:#0f172a;',
    'border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.15);overflow:hidden;resize:both}',
    // 头部与标题
    '#ai-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:move;',
    'background:linear-gradient(180deg,#f8fafc,#f1f5f9);border-bottom:1px solid #e5e7eb}',
    '#ai-title{font-weight:600;color:#111827}',
    // 主体、工具栏
    '#ai-body{display:flex;flex-direction:column;height:calc(100% - 48px)}',
    '#ai-toolbar{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #e5e7eb;background:#fafafa}',
    '#ai-chat{flex:1;overflow:auto;padding:10px;background:#fff}',
    '.msg{white-space:pre-wrap;line-height:1.6;border-radius:10px;padding:10px 12px;margin:8px 0;box-shadow:0 1px 0 rgba(0,0,0,.03)}',
    '.msg.u{background:#f3f4f6;border:1px solid #e5e7eb}',
    '.msg.a{background:#f9fafb;border:1px solid #e5e7eb}',
    '#ai-input{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fafafa}',
    '#ai-input textarea{flex:1;min-height:72px;background:#fff;border:1px solid #e5e7eb;color:#0f172a;border-radius:10px;padding:10px 12px}',
    '#ai-input button{padding:8px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#ffffff;color:#0f172a}',
    '#ai-input button:hover{background:#f8fafc}',
    '#ai-resizer{position:absolute;right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize;background:transparent}',
    '#ai-selects select,#ai-selects input{background:#fff;border:1px solid #e5e7eb;color:#0f172a;border-radius:8px;padding:6px 8px}',
    '#ai-toolbar .btn{padding:6px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#ffffff;color:#0f172a}',
    '#ai-toolbar .btn:hover{background:#f8fafc}',
    '.small{font-size:12px;opacity:.85}',
    // 设置面板（内置模态）
    '#ai-set-overlay{position:absolute;inset:0;background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:2147483000}',
    '#ai-set-dialog{width:520px;max-width:92vw;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.18);overflow:hidden}',
    '#ai-set-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb}',
    '#ai-set-title{font-weight:600}',
    '#ai-set-body{padding:12px}',
    '.set-row{display:flex;align-items:center;gap:10px;margin:8px 0}',
    '.set-row label{width:110px;color:#334155}',
    '.set-row input{flex:1;background:#fff;border:1px solid #e5e7eb;color:#0f172a;border-radius:8px;padding:8px 10px}',
    '#ai-set-actions{display:flex;gap:10px;justify-content:flex-end;padding:10px 12px;border-top:1px solid #e5e7eb;background:#fafafa}',
    '#ai-set-actions button{padding:8px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#ffffff;color:#0f172a}',
    '#ai-set-actions button.primary{background:#2563eb;border-color:#2563eb;color:#fff}',
  ].join('\n')
  document.head.appendChild(css)
}

function pushMsg(role, content) {
  __AI_SESSION__.messages.push({ role, content })
}

function renderMsgs(root) {
  const msgs = __AI_SESSION__.messages
  root.innerHTML = ''
  msgs.forEach(m => {
    const d = document.createElement('div')
    d.className = 'msg ' + (m.role === 'user' ? 'u' : 'a')
    d.textContent = String(m.content || '')
    root.appendChild(d)
  })
  root.scrollTop = root.scrollHeight
}

function bindDragAndResize(context, el) {
  const head = el.querySelector('#ai-head')
  const resizer = el.querySelector('#ai-resizer')
  let sx, sy, sl, st, sw, sh, dragging=false, resizing=false
  head.addEventListener('mousedown', (e)=>{ dragging=true; sx=e.clientX; sy=e.clientY; sl=parseInt(el.style.left)||60; st=parseInt(el.style.top)||60; e.preventDefault() })
  window.addEventListener('mousemove', (e)=>{
    if (dragging){ el.style.left = (sl + e.clientX - sx) + 'px'; el.style.top = (st + e.clientY - sy) + 'px' }
    if (resizing){ el.style.width = Math.max(380, sw + e.clientX - sx) + 'px'; el.style.height = Math.max(300, sh + e.clientY - sy) + 'px' }
  })
  window.addEventListener('mouseup', async ()=>{
    if (dragging||resizing){ dragging=false; resizing=false; const cfg = await loadCfg(context); cfg.win = { x: parseInt(el.style.left)||60, y: parseInt(el.style.top)||60, w: parseInt(el.style.width)||520, h: parseInt(el.style.height)||440 }; await saveCfg(context,cfg) }
  })
  resizer.addEventListener('mousedown', (e)=>{ resizing=true; sx=e.clientX; sy=e.clientY; sw=parseInt(el.style.width)||520; sh=parseInt(el.style.height)||440; e.preventDefault() })
}

// 提取文档标题与哈希（用于会话隔离与标题显示）
function getDocMetaFromContent(context, content) {
  const text = String(content || '')
  // 1) 优先：文件名（来自标题栏 #filename）
  let display = ''
  try {
    const label = (document.getElementById('filename') || {}).textContent || ''
    const name = String(label).replace(/\s*\*\s*$/, '').trim()
    if (name && name !== '未命名') display = name
  } catch {}
  // 2) 退化：首个 Markdown 标题
  if (!display) {
    const m = text.match(/^\s*#+\s*(.+)\s*$/m)
    if (m && m[1]) display = m[1].trim()
  }
  // 3) 再退化：截取正文前若干字符
  if (!display) {
    const plain = text.replace(/^[\s\n]+/, '')
    display = plain.slice(0, 20) || '未命名'
  }
  // 简单 djb2 哈希（区分文档）
  let h = 5381 >>> 0
  for (let i = 0; i < text.length; i++) { h = (((h << 5) + h) + text.charCodeAt(i)) >>> 0 }
  const hash = h.toString(16)
  return { title: display, hash }
}

async function ensureSessionForDoc(context) {
  const content = String(context.getEditorValue() || '')
  const { title, hash } = getDocMetaFromContent(context, content)
  // 加载会话库
  if (!__AI_DB__) await loadSessionsDB(context)
  if (!__AI_DB__.byDoc[hash]) {
    __AI_DB__.byDoc[hash] = { title, activeId: '', items: [] }
  } else {
    __AI_DB__.byDoc[hash].title = title
  }
  const bucket = __AI_DB__.byDoc[hash]
  if (!bucket.activeId || !bucket.items.find(it => it.id === bucket.activeId)) {
    const s = { id: gid(), name: '默认会话', created: Date.now(), updated: Date.now(), messages: [] }
    bucket.items.unshift(s)
    bucket.activeId = s.id
  }
  const cur = bucket.items.find(it => it.id === bucket.activeId)
  __AI_SESSION__ = { id: cur.id, name: cur.name, messages: cur.messages.slice(), docHash: hash, docTitle: title }
  await saveSessionsDB(context)
}

async function syncCurrentSessionToDB(context){
  try {
    if (!__AI_DB__) await loadSessionsDB(context)
    const bucket = __AI_DB__.byDoc[__AI_SESSION__.docHash]
    if (!bucket) return
    const it = bucket.items.find(x => x.id === bucket.activeId)
    if (!it) return
    it.messages = __AI_SESSION__.messages.slice()
    it.updated = Date.now()
    await saveSessionsDB(context)
    await refreshSessionSelect(context)
  } catch {}
}

function isDefaultSessionName(name){
  const s = String(name||'').trim()
  if (!s) return true
  if (s === '默认会话' || s === '默认' || s === '未命名') return true
  if (/^会话\s*\d+$/i.test(s)) return true
  if (/^新建?会话$/i.test(s)) return true
  return false
}

async function maybeNameCurrentSession(context, cfg, assistantText){
  try {
    if (!__AI_DB__) await loadSessionsDB(context)
    const bucket = __AI_DB__.byDoc[__AI_SESSION__.docHash]
    const it = bucket && bucket.items.find(x => x.id === bucket.activeId)
    if (!it || !isDefaultSessionName(it.name)) return
    // 构造命名提示：优先基于文件名/文档标题/最后一次用户输入
    const base = __AI_SESSION__.docTitle || ''
    const lastQ = lastUserMsg()
    const sample = shorten(lastQ || assistantText || '', 80)
    const sys = '你是命名助手。任务：基于上下文，为对话生成一个简短的中文名称。要求：5-12个中文字符以内，不要标点、不要引号、不要编号。只输出名称本身。'
    const prompt = `文件/标题：${base}\n线索：${sample}`
    const url = (cfg.baseUrl||'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions'
    const headers = { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + cfg.apiKey }
    const body = JSON.stringify({ model: cfg.model, stream: false, messages: [ { role:'system', content: sys }, { role:'user', content: prompt } ] })
    let name = ''
    try {
      const r = await fetch(url, { method:'POST', headers, body })
      const t = await r.text()
      const j = t? JSON.parse(t):null
      name = shorten(j?.choices?.[0]?.message?.content || '', 12).replace(/[\s\n]+/g,'').replace(/[「」\[\]\(\)\{\}\"\'\.,，。!！?？:：;；]/g,'')
    } catch {}
    if (!name) return
    it.name = name
    await saveSessionsDB(context)
    await refreshSessionSelect(context)
    try { context.ui.notice('会话已命名：' + name, 'ok', 1600) } catch {}
  } catch {}
}

async function updateWindowTitle(context) {
  try {
    const head = document.getElementById('ai-title')
    if (!head) return
    await ensureSessionForDoc(context)
    head.textContent = `AI 写作助手 · ${__AI_SESSION__.docTitle || '未命名'}`
  } catch {}
}

async function ensureWindow(context) {
  let el = elById('ai-assist-win')
  if (el && el.__mounted) return el
  return await mountWindow(context)
}

function elById(id) { return document.getElementById(id) }

async function refreshHeader(context){
  const cfg = await loadCfg(context)
  const selP = el('ai-model')
  if (selP) selP.value = cfg.model || ''
  await updateWindowTitle(context)
  await refreshSessionSelect(context)
}

async function refreshSessionSelect(context) {
  try {
    const select = document.getElementById('ai-sel-session')
    if (!select) return
    await ensureSessionForDoc(context)
    if (!__AI_DB__) await loadSessionsDB(context)
    const bucket = __AI_DB__.byDoc[__AI_SESSION__.docHash]
    select.innerHTML = ''
    for (const it of bucket.items) {
      const opt = document.createElement('option')
      opt.value = it.id
      opt.textContent = it.name
      if (it.id === bucket.activeId) opt.selected = true
      select.appendChild(opt)
    }
  } catch {}
}

async function switchSessionBySelect(context) {
  try {
    const select = document.getElementById('ai-sel-session')
    if (!select) return
    const id = String(select.value || '')
    if (!id) return
    if (!__AI_DB__) await loadSessionsDB(context)
    const bucket = __AI_DB__.byDoc[__AI_SESSION__.docHash]
    const it = bucket.items.find(x => x.id === id)
    if (!it) return
    bucket.activeId = id
    __AI_SESSION__ = { id: it.id, name: it.name, messages: it.messages.slice(), docHash: __AI_SESSION__.docHash, docTitle: __AI_SESSION__.docTitle }
    await saveSessionsDB(context)
    const chat = document.getElementById('ai-chat'); if (chat) renderMsgs(chat)
  } catch {}
}

async function createNewSession(context) {
  try {
    await ensureSessionForDoc(context)
    if (!__AI_DB__) await loadSessionsDB(context)
    const bucket = __AI_DB__.byDoc[__AI_SESSION__.docHash]
    const s = { id: gid(), name: '会话' + (bucket.items.length + 1), created: Date.now(), updated: Date.now(), messages: [] }
    bucket.items.unshift(s)
    bucket.activeId = s.id
    __AI_SESSION__ = { id: s.id, name: s.name, messages: [], docHash: __AI_SESSION__.docHash, docTitle: __AI_SESSION__.docTitle }
    await saveSessionsDB(context)
    await refreshSessionSelect(context)
    const chat = document.getElementById('ai-chat'); if (chat) renderMsgs(chat)
  } catch {}
}

async function deleteCurrentSession(context) {
  try {
    await ensureSessionForDoc(context)
    if (!__AI_DB__) await loadSessionsDB(context)
    const bucket = __AI_DB__.byDoc[__AI_SESSION__.docHash]
    const idx = bucket.items.findIndex(x => x.id === bucket.activeId)
    if (idx < 0) return
    bucket.items.splice(idx, 1)
    if (bucket.items.length === 0) {
      const s = { id: gid(), name: '默认会话', created: Date.now(), updated: Date.now(), messages: [] }
      bucket.items.push(s); bucket.activeId = s.id
    } else {
      bucket.activeId = bucket.items[0].id
    }
    const it = bucket.items.find(x => x.id === bucket.activeId)
    __AI_SESSION__ = { id: it.id, name: it.name, messages: it.messages.slice(), docHash: __AI_SESSION__.docHash, docTitle: __AI_SESSION__.docTitle }
    await saveSessionsDB(context)
    await refreshSessionSelect(context)
    const chat = document.getElementById('ai-chat'); if (chat) renderMsgs(chat)
  } catch {}
}

async function mountWindow(context){
  ensureCss()
  const cfg = await loadCfg(context)
  const el = document.createElement('div'); el.id='ai-assist-win';
  Object.assign(el.style,{ left:cfg.win.x+'px', top:cfg.win.y+'px', width:cfg.win.w+'px', height:cfg.win.h+'px' })
  el.innerHTML = [
    '<div id="ai-head"><div id="ai-title">AI 写作助手</div><div><button id="ai-btn-set" title="设置">设置</button> <button id="ai-btn-close" title="关闭">×</button></div></div>',
    '<div id="ai-body">',
    ' <div id="ai-toolbar">',
    '  <div id="ai-selects" class="small">',
    '   <label>模型</label> <input id="ai-model" placeholder="如 gpt-4o-mini" style="width:160px"/>',
    '  </div>',
    '  <div style="flex:1"></div>',
    '  <label class="small">会话</label> <select id="ai-sel-session" style="max-width:180px"></select>',
    '  <button class="btn" id="ai-s-new" title="新建会话">新建</button>',
    '  <button class="btn" id="ai-s-del" title="删除当前会话">删除</button>',
    '  <button class="btn" id="ai-fit">自适应</button>',
    '  <button class="btn" id="q-continue">续写</button><button class="btn" id="q-polish">润色</button><button class="btn" id="q-proof">纠错</button><button class="btn" id="q-outline">提纲</button><button class="btn" id="ai-clear" title="清空本篇会话">清空</button>',
    ' </div>',
    ' <div id="ai-chat"></div>',
    ' <div id="ai-input"><textarea id="ai-text" placeholder="输入与 AI 对话…"></textarea><div style="display:flex;flex-direction:column;gap:6px">',
    '  <button id="ai-send">发送</button><button id="ai-apply">插入文末</button><button id="ai-copy">复制</button>',
    ' </div></div>',
    '</div>',
    '<div id="ai-resizer"></div>'
  ].join('')
  document.body.appendChild(el)
  bindDragAndResize(context, el)
  el.querySelector('#ai-btn-close').addEventListener('click',()=>{ el.style.display='none' })
  el.querySelector('#ai-btn-set').addEventListener('click',()=>{ openSettings(context) })
  // 模型输入变更即保存
  try {
    const modelInput = el.querySelector('#ai-model')
    modelInput?.addEventListener('change', async (ev) => {
      const cfg = await loadCfg(context)
      cfg.model = String(modelInput.value || '').trim()
      await saveCfg(context, cfg)
    })
  } catch {}
  el.querySelector('#ai-send').addEventListener('click',()=>{ sendFromInput(context) })
  el.querySelector('#ai-apply').addEventListener('click',()=>{ applyLastToDoc(context) })
  el.querySelector('#ai-copy').addEventListener('click',()=>{ copyLast() })
  el.querySelector('#ai-clear').addEventListener('click',()=>{ clearConversation(context) })
  el.querySelector('#ai-fit').addEventListener('click',()=>{ autoFitWindow(context, el) })
  el.querySelector('#ai-s-new').addEventListener('click',()=>{ createNewSession(context) })
  el.querySelector('#ai-s-del').addEventListener('click',()=>{ deleteCurrentSession(context) })
  const selSession = el.querySelector('#ai-sel-session')
  selSession?.addEventListener('change',()=>{ switchSessionBySelect(context) })
  el.querySelector('#q-continue').addEventListener('click',()=>{ quick(context,'续写') })
  el.querySelector('#q-polish').addEventListener('click',()=>{ quick(context,'润色') })
  el.querySelector('#q-proof').addEventListener('click',()=>{ quick(context,'纠错') })
  el.querySelector('#q-outline').addEventListener('click',()=>{ quick(context,'提纲') })
  el.__mounted = true
  // 头部双击：大小切换（小↔大）
  try {
    const head = el.querySelector('#ai-head')
    head?.addEventListener('dblclick', () => toggleWinSizePreset(context, el))
  } catch {}
  try { startFilenameObserver(context) } catch {}
  await refreshHeader(context)
  try { __AI_SESSION__ = await loadSession(context) } catch {}
  await ensureSessionForDoc(context)
  renderMsgs(el.querySelector('#ai-chat'))
  return el
}

async function toggleWindow(context){
  let el = elById('ai-assist-win')
  if (!el) el = await mountWindow(context)
  el.style.display = (el.style.display==='none'?'block':'none')
  if (el.style.display==='block') { await ensureSessionForDoc(context); await refreshHeader(context) }
}

function toggleWinSizePreset(context, el){
  try {
    const w = parseInt(el.style.width)||520
    const wide = w < 700
    if (wide) {
      const vw = Math.max(600, Math.floor(window.innerWidth * 0.62))
      const vh = Math.max(360, Math.floor(window.innerHeight * 0.66))
      el.style.width = vw + 'px'; el.style.height = vh + 'px'
    } else {
      el.style.width = '520px'; el.style.height = '440px'
    }
  } catch {}
}

function autoFitWindow(context, el){
  try {
    const chat = el.querySelector('#ai-chat')
    const input = el.querySelector('#ai-input')
    const head = el.querySelector('#ai-head')
    const tool = el.querySelector('#ai-toolbar')
    const pad = 24
    let desired = (head?.clientHeight||48) + (tool?.clientHeight||40) + (chat?.scrollHeight||280) + (input?.clientHeight||96) + pad
    const maxH = Math.floor(window.innerHeight * 0.86)
    desired = Math.min(maxH, Math.max(360, desired))
    el.style.height = desired + 'px'
    const maxW = Math.floor(window.innerWidth * 0.9)
    const curW = parseInt(el.style.width)||520
    if (curW > maxW) el.style.width = maxW + 'px'
  } catch {}
}

let __AI_FN_OB__ = null
function startFilenameObserver(context){
  try {
    if (__AI_FN_OB__) { try { __AI_FN_OB__.disconnect() } catch {} }
    const target = document.getElementById('filename')
    if (!target) return
    __AI_FN_OB__ = new MutationObserver(async () => {
      try { await ensureSessionForDoc(context); await updateWindowTitle(context); const chat = el('ai-chat'); if (chat) renderMsgs(chat) } catch {}
    })
    __AI_FN_OB__.observe(target, { characterData: true, childList: true, subtree: true })
  } catch {}
}

function buildPromptPrefix(kind){
  switch(kind){
    case '续写': return '基于文档上下文，继续自然连贯地续写。'
    case '润色': return '基于文档上下文，润色并提升表达的清晰度与逻辑性，仅输出修改后的结果。'
    case '纠错': return '基于文档上下文，找出并修正错别字、语法问题，仅输出修订后的结果。'
    case '提纲': return '阅读文档上下文，输出一份结构化提纲（分级列表）。'
    default: return ''
  }
}

async function quick(context, kind){
  const inp = el('ai-text')
  const prefix = buildPromptPrefix(kind)
  inp.value = prefix
  await sendFromInput(context)
}

async function sendFromInput(context){
  const ta = el('ai-text')
  const text = String(ta.value || '').trim()
  if (!text) return
  ta.value = ''
  await ensureSessionForDoc(context)
  pushMsg('user', text)
  await syncCurrentSessionToDB(context)
  renderMsgs(el('ai-chat'))
  await doSend(context)
}

async function doSend(context){
  if (__AI_SENDING__) return
  const cfg = await loadCfg(context)
  if (!cfg.apiKey) { context.ui.notice('请先在“设置”中配置 OpenAI API Key', 'err', 3000); return }
  if (!cfg.model) { context.ui.notice('请先选择模型', 'err', 2000); return }
  __AI_SENDING__ = true
  try {
    await ensureSessionForDoc(context)
    const doc = String(context.getEditorValue() || '')
    const docCtx = clampCtx(doc, Number(cfg.limits?.maxCtxChars||6000))
    const system = '你是专业的中文写作助手，回答要简洁、实用、可直接落地。'
    const userMsgs = __AI_SESSION__.messages
    const finalMsgs = [ { role:'system', content: system }, { role:'user', content: '文档上下文：\n\n' + docCtx } ]
    userMsgs.forEach(m => finalMsgs.push(m))

    const url = (cfg.baseUrl||'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions'
    const bodyObj = { model: cfg.model, messages: finalMsgs, stream: true }
    const body = JSON.stringify(bodyObj)
    const headers = { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + cfg.apiKey }

    const chatEl = el('ai-chat')
    const draft = document.createElement('div'); draft.className = 'msg a'; draft.textContent = ''
    chatEl.appendChild(draft); chatEl.scrollTop = chatEl.scrollHeight

    // 首选用原生 fetch 进行流式解析（SSE）
    let finalText = ''
    try {
      const r2 = await fetch(url, { method:'POST', headers, body })
      if (!r2.ok || !r2.body) { throw new Error('HTTP ' + r2.status) }
      const reader = r2.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const p of parts) {
          const line = p.trim()
          if (!line) continue
          const rows = line.split('\n').filter(Boolean)
          for (const row of rows) {
            const m = row.match(/^data:\s*(.*)$/)
            if (!m) continue
            const payload = m[1]
            if (payload === '[DONE]') continue
            try {
              const j = JSON.parse(payload)
              const delta = j?.choices?.[0]?.delta?.content || ''
              if (delta) { finalText += delta; draft.textContent = finalText; chatEl.scrollTop = chatEl.scrollHeight }
            } catch {}
          }
        }
      }
    } catch (e) {
      // 流式失败兜底：改非流式一次性请求
      try {
        const r3 = await fetch(url, { method:'POST', headers, body: JSON.stringify({ ...bodyObj, stream: false }) })
        const text = await r3.text()
        const data = text ? JSON.parse(text) : null
        const ctt = data?.choices?.[0]?.message?.content || ''
        finalText = ctt
        draft.textContent = finalText
      } catch (e2) { throw e2 }
    }

    __AI_LAST_REPLY__ = finalText || ''
    pushMsg('assistant', __AI_LAST_REPLY__ || '[空响应]')
    renderMsgs(el('ai-chat'))
    // 同步会话库：写回当前文档的 active 会话
    try {
      await syncCurrentSessionToDB(context)
    } catch {}
    try { await maybeNameCurrentSession(context, cfg, finalText) } catch {}
    try { const elw = el('ai-assist-win'); if (elw) autoFitWindow(context, elw) } catch {}
  } catch (e) {
    console.error(e)
    context.ui.notice('AI 调用失败：' + (e && e.message ? e.message : '未知错误'), 'err', 4000)
  } finally { __AI_SENDING__ = false }
}

async function applyLastToDoc(context){
  const s = String(__AI_LAST_REPLY__||'').trim()
  if (!s) { context.ui.notice('没有可插入的内容', 'err', 2000); return }
  const cur = String(context.getEditorValue() || '')
  const next = cur + (cur.endsWith('\n')?'':'\n') + '\n' + s + '\n'
  context.setEditorValue(next)
  context.ui.notice('已插入文末', 'ok', 1600)
}

function copyLast(){ try { const s = String(__AI_LAST_REPLY__||''); if(!s) return; navigator.clipboard?.writeText(s) } catch {} }

export async function openSettings(context){
  ensureCss()
  const cfg = await loadCfg(context)
  let overlay = document.getElementById('ai-set-overlay')
  if (overlay) { overlay.remove() }
  overlay = document.createElement('div')
  overlay.id = 'ai-set-overlay'
  overlay.innerHTML = [
    '<div id="ai-set-dialog">',
    ' <div id="ai-set-head"><div id="ai-set-title">AI 设置</div><button id="ai-set-close" title="关闭">×</button></div>',
    ' <div id="ai-set-body">',
    '  <div class="set-row"><label>Base URL</label><input id="set-base" type="text" placeholder="https://api.openai.com/v1"/></div>',
    '  <div class="set-row"><label>API Key</label><input id="set-key" type="password" placeholder="sk-..."/></div>',
    '  <div class="set-row"><label>模型</label><input id="set-model" type="text" placeholder="gpt-4o-mini"/></div>',
    '  <div class="set-row"><label>上下文截断</label><input id="set-max" type="number" min="1000" step="500" placeholder="6000"/></div>',
    ' </div>',
    ' <div id="ai-set-actions"><button id="ai-set-cancel">取消</button><button class="primary" id="ai-set-ok">保存</button></div>',
    '</div>'
  ].join('')
  const host = document.getElementById('ai-assist-win') || document.body
  host.appendChild(overlay)
  // 若没有插件窗口，挂到 body：用固定定位覆盖全局
  if (host === document.body) {
    try { overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.zIndex = '2147483000' } catch {}
  }
  // 赋初值
  const elBase = overlay.querySelector('#set-base')
  const elKey = overlay.querySelector('#set-key')
  const elModel = overlay.querySelector('#set-model')
  const elMax = overlay.querySelector('#set-max')
  elBase.value = cfg.baseUrl || 'https://api.openai.com/v1'
  elKey.value = cfg.apiKey || ''
  elModel.value = cfg.model || 'gpt-4o-mini'
  elMax.value = String((cfg.limits?.maxCtxChars) || 6000)
  // 交互
  const close = () => { try { overlay.remove() } catch {} }
  overlay.querySelector('#ai-set-close')?.addEventListener('click', close)
  overlay.querySelector('#ai-set-cancel')?.addEventListener('click', close)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  window.addEventListener('keydown', function onEsc(e){ if (e.key === 'Escape') { close(); window.removeEventListener('keydown', onEsc) } })
  overlay.querySelector('#ai-set-ok')?.addEventListener('click', async () => {
    const baseUrl = String(elBase.value || '').trim() || 'https://api.openai.com/v1'
    const apiKey = String(elKey.value || '').trim()
    const model = String(elModel.value || '').trim() || 'gpt-4o-mini'
    const n = Math.max(1000, parseInt(String(elMax.value || '6000'),10) || 6000)
    const next = { ...cfg, baseUrl, apiKey, model, limits: { maxCtxChars: n } }
    await saveCfg(context, next)
    const m = el('ai-model'); if (m) m.value = model
    context.ui.notice('设置已保存', 'ok', 1600)
    close()
  })
}

// ========== 插件主入口 ==========
export async function activate(context) {
  // 菜单：AI 助手（显示/隐藏）
  context.addMenuItem({ label: 'AI 助手', title: '打开 AI 写作助手', onClick: async () => { await toggleWindow(context) } })
  // 预加载配置与会话
  try { const cfg = await loadCfg(context); await saveCfg(context, cfg) } catch {}
  try { __AI_SESSION__ = await loadSession(context) } catch {}
}

export function deactivate(){ /* 无状态清理需求 */ }

// ========== 其它动作 ==========
async function clearConversation(context) {
  try {
    await ensureSessionForDoc(context)
    __AI_SESSION__.messages = []
    // 同步到 DB
    if (!__AI_DB__) await loadSessionsDB(context)
    const bucket = __AI_DB__.byDoc[__AI_SESSION__.docHash]
    const it = bucket.items.find(x => x.id === bucket.activeId)
    if (it) { it.messages = [] ; it.updated = Date.now() }
    await saveSessionsDB(context)
    const chat = el('ai-chat'); if (chat) renderMsgs(chat)
    context.ui.notice('会话已清空（仅当前文档）', 'ok', 1400)
  } catch {}
}
