// 白板视图插件：在可视化画布中摆放 Markdown 节点并建立简单连接

const WB_LOCALE_LS_KEY = 'flymd.locale'
function wbDetectLocale() {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    const lang = (nav && (nav.language || nav.userLanguage)) || 'en'
    const lower = String(lang || '').toLowerCase()
    if (lower.startsWith('zh')) return 'zh'
  } catch {}
  return 'en'
}
function wbGetLocale() {
  try {
    const ls = typeof localStorage !== 'undefined' ? localStorage : null
    const v = ls && ls.getItem(WB_LOCALE_LS_KEY)
    if (v === 'zh' || v === 'en') return v
  } catch {}
  return wbDetectLocale()
}
function wbText(zh, en) {
  return wbGetLocale() === 'en' ? en : zh
}

// 配置默认值
const WB_DEFAULT_CONFIG = {
  snapToGrid: true,
  gridSize: 20,
}

// 存储键
const WB_STORAGE_STATE_KEY = 'whiteboard.default.state'
const WB_STORAGE_CONFIG_KEY = 'whiteboard.default.config'

// 运行时状态：避免重复创建样式与窗口
let WB_STYLE_READY = false
let WB_BOARD_OPEN = false

// 与 backlinks / graph-view 保持一致的路径规范化
function wbNormalizePath(path) {
  if (!path) return ''
  const s = String(path).trim()
  if (!s) return ''
  return s.replace(/\\/g, '/')
}

function wbEnsureStyle() {
  if (WB_STYLE_READY) return
  if (typeof document === 'undefined') return
  WB_STYLE_READY = true
  const style = document.createElement('style')
  style.setAttribute('data-flymd-plugin', 'whiteboard-view')
  style.textContent = `
.wb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90040;
}
.wb-shell {
  background: var(--flymd-panel-bg, #020617);
  color: var(--flymd-text-primary, #e5e7eb);
  width: min(1080px, 96vw);
  height: min(680px, 88vh);
  border-radius: 14px;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.8);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.4);
}
.wb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.28), transparent 55%),
              radial-gradient(circle at top right, rgba(8, 47, 73, 0.6), transparent 55%);
  border-bottom: 1px solid rgba(148, 163, 184, 0.42);
}
.wb-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-header-title {
  font-size: 13px;
  font-weight: 600;
}
.wb-header-sub {
  font-size: 11px;
  opacity: 0.85;
  cursor: pointer;
}
.wb-header-sub-board-name {
  text-decoration: underline;
  text-decoration-style: dotted;
}
.wb-header-sub:hover .wb-header-sub-board-name {
  color: #60a5fa;
}
.wb-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.wb-mini-shell {
  position: fixed;
  bottom: 16px;
  right: 16px;
  min-width: 220px;
  max-width: 320px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.7);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 90041;
  cursor: grab;
}
.wb-mini-title {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.wb-mini-btn {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(191, 219, 254, 0.9);
  background: rgba(37, 99, 235, 0.28);
  font-size: 11px;
  font-weight: 600;
  color: #e5e7eb;
  cursor: pointer;
}
.wb-mini-btn:hover {
  background: rgba(59, 130, 246, 0.5);
  border-color: rgba(191, 219, 254, 1);
}
.wb-btn {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.6);
  background: rgba(15, 23, 42, 0.8);
  color: inherit;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.16s ease;
}
.wb-btn:hover {
  background: rgba(37, 99, 235, 0.16);
  border-color: rgba(96, 165, 250, 0.95);
}
.wb-btn-ghost {
  border-style: dashed;
  background: transparent;
}
.wb-btn-icon {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.wb-btn-close {
  border-radius: 999px;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.86);
  font-size: 13px;
}
.wb-btn-close:hover {
  background: rgba(239, 68, 68, 0.16);
  border-color: rgba(248, 113, 113, 0.95);
}
.wb-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(30, 64, 175, 0.5);
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.9));
  font-size: 11px;
}
.wb-toolbar-hint {
  opacity: 0.7;
}
.wb-toolbar-spacer {
  flex: 1;
}
.wb-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  background-image:
    linear-gradient(rgba(15, 23, 42, 1), rgba(15, 23, 42, 0.96)),
    radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.25), transparent 55%),
    radial-gradient(circle at 80% 80%, rgba(34, 197, 94, 0.24), transparent 55%);
  background-blend-mode: normal, screen, screen;
}
.wb-canvas {
  position: absolute;
  inset: 0;
  overflow: auto;
  cursor: grab;
}
.wb-canvas-inner {
  position: relative;
  width: 2200px;
  height: 1400px;
  background-image:
    linear-gradient(to right, rgba(148, 163, 184, 0.15) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.15) 1px, transparent 1px);
  background-size: 20px 20px;
  border-radius: 18px;
  margin: 12px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.9), 0 18px 45px rgba(15, 23, 42, 0.9);
}
.wb-node {
  position: absolute;
  min-width: 160px;
  max-width: 260px;
  padding: 8px 9px 7px;
  border-radius: 10px;
  background: radial-gradient(circle at top left, rgba(37, 99, 235, 0.32), rgba(15, 23, 42, 0.9));
  border: 1px solid rgba(96, 165, 250, 0.7);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.85);
  color: #e5e7eb;
  cursor: default;
  user-select: none;
  transition: box-shadow 0.15s ease, transform 0.12s ease, border-color 0.15s ease, background 0.15s ease;
}
.wb-node:hover {
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.95);
  transform: translateY(-1px);
}
.wb-node-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.wb-node-path {
  font-size: 10px;
  opacity: 0.8;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  display: none;
}
.wb-node-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
  font-size: 10px;
  opacity: 0.85;
}
.wb-node-handle {
  padding: 1px 4px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.7);
  cursor: move;
  display: none;
}
.wb-node-open {
  cursor: pointer;
  color: #93c5fd;
  padding: 2px 6px;
  border-radius: 4px;
}
.wb-node-open:hover {
  text-decoration: underline;
}
.wb-node-connect {
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px dashed rgba(148, 163, 184, 0.7);
  cursor: pointer;
}
.wb-node-connect-active {
  border-style: solid;
  border-color: rgba(251, 191, 36, 0.95);
  background: rgba(251, 191, 36, 0.18);
  color: #facc15;
}
.wb-node-delete {
  cursor: pointer;
  color: #fb7185;
  padding: 2px 6px;
  border-radius: 4px;
}
.wb-node-delete:hover {
  color: #ef4444;
}
.wb-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.wb-edge {
  stroke: rgba(148, 163, 184, 0.9);
  stroke-width: 1.4;
  fill: none;
}
.wb-edge-active {
  stroke: rgba(251, 191, 36, 0.95);
}
.wb-settings-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.4);
  z-index: 90050;
}
.wb-settings-dialog {
  background: var(--flymd-panel-bg, #ffffff);
  color: inherit;
  min-width: 360px;
  max-width: 440px;
  border-radius: 10px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.35);
  padding: 14px 18px 12px;
  font-size: 13px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.wb-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 600;
}
.wb-settings-body {
  margin-bottom: 10px;
}
.wb-settings-row {
  margin-bottom: 8px;
}
.wb-settings-row label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.wb-settings-row span {
  flex: 1;
}
.wb-settings-row input[type="number"] {
  width: 90px;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: var(--flymd-panel-bg, #ffffff);
  color: inherit;
}
.wb-settings-row input[type="checkbox"] {
  width: 15px;
  height: 15px;
}
.wb-settings-tip {
  margin-top: 3px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
}
.wb-board-list {
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 8px;
}
.wb-board-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.wb-board-item + .wb-board-item {
  margin-top: 4px;
}
.wb-board-item:hover {
  background: rgba(37, 99, 235, 0.08);
}
.wb-board-item-active {
  background: rgba(37, 99, 235, 0.12);
  border: 1px solid rgba(37, 99, 235, 0.45);
}
.wb-board-item-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wb-board-item-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wb-board-item-tag {
  font-size: 11px;
  opacity: 0.8;
}
.wb-board-item-actions {
  display: flex;
  gap: 6px;
  margin-left: 8px;
}
.wb-board-action-btn {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.7);
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}
.wb-board-action-btn:hover {
  background: rgba(37, 99, 235, 0.12);
  border-color: rgba(37, 99, 235, 0.8);
}
.wb-board-action-btn[disabled] {
  opacity: 0.6;
  cursor: default;
}
.wb-board-action-btn-danger {
  border-color: rgba(248, 113, 113, 0.9);
  color: #b91c1c;
}
.wb-board-action-btn-danger:hover {
  background: rgba(248, 113, 113, 0.16);
}
.wb-settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.wb-settings-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}
.wb-settings-btn:hover {
  background: rgba(37, 99, 235, 0.08);
}
`
  document.head.appendChild(style)
}

async function wbLoadConfig(context) {
  try {
    if (!context || !context.storage) return { ...WB_DEFAULT_CONFIG }
    const raw = await context.storage.get(WB_STORAGE_CONFIG_KEY)
    if (!raw || typeof raw !== 'object') return { ...WB_DEFAULT_CONFIG }
    const merged = { ...WB_DEFAULT_CONFIG }
    if (typeof raw.snapToGrid === 'boolean') merged.snapToGrid = raw.snapToGrid
    const gridSizeNum = Number(raw.gridSize)
    if (!Number.isNaN(gridSizeNum) && gridSizeNum >= 5 && gridSizeNum <= 120) {
      merged.gridSize = gridSizeNum
    }
    return merged
  } catch {
    return { ...WB_DEFAULT_CONFIG }
  }
}

async function wbSaveConfig(context, cfg) {
  if (!context || !context.storage) return
  const next = {
    snapToGrid: !!cfg.snapToGrid,
    gridSize: Number(cfg.gridSize) || WB_DEFAULT_CONFIG.gridSize,
  }
  await context.storage.set(WB_STORAGE_CONFIG_KEY, next)
}

async function wbOpenSettingsDialog(context) {
  wbEnsureStyle()
  if (typeof document === 'undefined') return null

  const baseConfig = await wbLoadConfig(context)

  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'wb-settings-overlay'

    const dialog = document.createElement('div')
    dialog.className = 'wb-settings-dialog'

    const header = document.createElement('div')
    header.className = 'wb-settings-header'
    const title = document.createElement('div')
    title.textContent = wbText('白板设置', 'Whiteboard Settings')
    const btnClose = document.createElement('button')
    btnClose.className = 'wb-settings-btn'
    btnClose.textContent = '×'

    header.appendChild(title)
    header.appendChild(btnClose)

    const body = document.createElement('div')
    body.className = 'wb-settings-body'

    const rowSnap = document.createElement('div')
    rowSnap.className = 'wb-settings-row'
    const labelSnap = document.createElement('label')
    const spanSnap = document.createElement('span')
    spanSnap.textContent = wbText('节点对齐网格', 'Snap nodes to grid')
    const inputSnap = document.createElement('input')
    inputSnap.type = 'checkbox'
    inputSnap.checked = !!baseConfig.snapToGrid
    labelSnap.appendChild(spanSnap)
    labelSnap.appendChild(inputSnap)
    rowSnap.appendChild(labelSnap)

    const rowGrid = document.createElement('div')
    rowGrid.className = 'wb-settings-row'
    const labelGrid = document.createElement('label')
    const spanGrid = document.createElement('span')
    spanGrid.textContent = wbText('网格大小(px)', 'Grid size (px)')
    const inputGrid = document.createElement('input')
    inputGrid.type = 'number'
    inputGrid.min = '5'
    inputGrid.max = '120'
    inputGrid.value = String(baseConfig.gridSize || WB_DEFAULT_CONFIG.gridSize)
    labelGrid.appendChild(spanGrid)
    labelGrid.appendChild(inputGrid)
    rowGrid.appendChild(labelGrid)
    const tipGrid = document.createElement('div')
    tipGrid.className = 'wb-settings-tip'
    tipGrid.textContent = wbText(
      '较小的网格适合精细布局，较大网格更利于结构化分区。',
      'Smaller grid suits fine layout; larger grid suits higher-level structure.',
    )
    rowGrid.appendChild(tipGrid)

    body.appendChild(rowSnap)
    body.appendChild(rowGrid)

    const footer = document.createElement('div')
    footer.className = 'wb-settings-footer'
    const btnCancel = document.createElement('button')
    btnCancel.className = 'wb-settings-btn'
    btnCancel.textContent = wbText('取消', 'Cancel')
    const btnOk = document.createElement('button')
    btnOk.className = 'wb-settings-btn'
    btnOk.textContent = wbText('保存', 'Save')
    footer.appendChild(btnCancel)
    footer.appendChild(btnOk)

    dialog.appendChild(header)
    dialog.appendChild(body)
    dialog.appendChild(footer)
    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    let done = false
    function close(result) {
      if (done) return
      done = true
      overlay.remove()
      resolve(result)
    }

    btnClose.onclick = () => close(null)
    btnCancel.onclick = () => close(null)
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null)
    }
    btnOk.onclick = () => {
      const snapToGrid = !!inputSnap.checked
      let gridSize = Number(inputGrid.value) || WB_DEFAULT_CONFIG.gridSize
      if (gridSize < 5) gridSize = 5
      if (gridSize > 120) gridSize = 120
      close({ snapToGrid, gridSize })
    }
  })
}

async function wbLoadState(context) {
  try {
    if (!context || !context.storage) {
      return {
        boards: {},
        activeId: null,
        lastUpdated: Date.now(),
      }
    }
    const raw = await context.storage.get(WB_STORAGE_STATE_KEY)
    if (!raw || typeof raw !== 'object') {
      return {
        boards: {},
        activeId: null,
        lastUpdated: Date.now(),
      }
    }
    // 新格式：多白板
    if (raw.boards && typeof raw.boards === 'object') {
      const boards = {}
      const rawBoards = raw.boards
      Object.keys(rawBoards).forEach((id) => {
        const b = rawBoards[id]
        if (!b || typeof b !== 'object') return
        boards[id] = {
          id,
          name: typeof b.name === 'string' ? b.name : '',
          nodes: Array.isArray(b.nodes) ? b.nodes : [],
          edges: Array.isArray(b.edges) ? b.edges : [],
          createdAt: b.createdAt || raw.lastUpdated || Date.now(),
          updatedAt: b.updatedAt || raw.lastUpdated || Date.now(),
        }
      })
      const ids = Object.keys(boards)
      let activeId = null
      if (ids.length) {
        const candidate = typeof raw.activeId === 'string' ? raw.activeId : null
        activeId = candidate && boards[candidate] ? candidate : ids[0]
      }
      return {
        boards,
        activeId,
        lastUpdated: raw.lastUpdated || Date.now(),
      }
    }
    // 旧格式：单白板节点/边数组
    const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
    const edges = Array.isArray(raw.edges) ? raw.edges : []
    const id = 'board_default'
    const now = raw.lastUpdated || Date.now()
    return {
      boards: {
        [id]: {
          id,
          name: 'default',
          nodes,
          edges,
          createdAt: now,
          updatedAt: now,
        },
      },
      activeId: id,
      lastUpdated: now,
    }
  } catch {
    return {
      boards: {},
      activeId: null,
      lastUpdated: Date.now(),
    }
  }
}

async function wbSaveState(context, state) {
  if (!context || !context.storage) return
  const safeBoards = {}
  if (state && state.boards && typeof state.boards === 'object') {
    const rawBoards = state.boards
    Object.keys(rawBoards).forEach((id) => {
      const b = rawBoards[id]
      if (!b || typeof b !== 'object') return
      safeBoards[id] = {
        id,
        name: typeof b.name === 'string' ? b.name : '',
        nodes: Array.isArray(b.nodes) ? b.nodes : [],
        edges: Array.isArray(b.edges) ? b.edges : [],
        createdAt: b.createdAt || Date.now(),
        updatedAt: Date.now(),
      }
    })
  }
  const payload = {
    boards: safeBoards,
    activeId:
      state && typeof state.activeId === 'string' && safeBoards[state.activeId]
        ? state.activeId
        : null,
    lastUpdated: Date.now(),
  }
  await context.storage.set(WB_STORAGE_STATE_KEY, payload)
}

function wbEnsureActiveBoard(state) {
  if (!state || typeof state !== 'object') {
    const now = Date.now()
    const id = 'board_' + Math.random().toString(36).slice(2, 10)
    const board = {
      id,
      name: wbText('默认白板', 'Default board'),
      nodes: [],
      edges: [],
      createdAt: now,
      updatedAt: now,
    }
    return {
      state: {
        boards: { [id]: board },
        activeId: id,
        lastUpdated: now,
      },
      board,
    }
  }
  if (!state.boards || typeof state.boards !== 'object') {
    state.boards = {}
  }
  const ids = Object.keys(state.boards)
  if (!ids.length) {
    const now = Date.now()
    const id = 'board_' + Math.random().toString(36).slice(2, 10)
    const board = {
      id,
      name: wbText('默认白板', 'Default board'),
      nodes: [],
      edges: [],
      createdAt: now,
      updatedAt: now,
    }
    state.boards[id] = board
    state.activeId = id
    state.lastUpdated = now
    return { state, board }
  }
  if (!state.activeId || !state.boards[state.activeId]) {
    state.activeId = ids[0]
  }
  const board = state.boards[state.activeId]
  return { state, board }
}

function wbGuessTitleFromPath(path) {
  if (!path) return wbText('未命名', 'Untitled')
  const fileName = String(path).replace(/^.*[\\/]/, '')
  const noExt = fileName.replace(/\.[^.]*$/, '')
  return noExt || wbText('未命名', 'Untitled')
}

async function wbAddNodeForCurrentFile(context) {
  let state = await wbLoadState(context)
  const ensured = wbEnsureActiveBoard(state)
  state = ensured.state
  const board = ensured.board
  const path = typeof context.getCurrentFilePath === 'function'
    ? await context.getCurrentFilePath()
    : null
  if (!path) {
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('当前文档尚未保存，无法添加到白板。', 'Current document is not saved; cannot add to whiteboard.'),
        'err',
        2600,
      )
    }
    return state
  }
  const title = wbGuessTitleFromPath(path)
  const exists = board.nodes.find((n) => n && n.path === path)
  if (exists) {
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('该文档已经在白板上。', 'This document is already on the whiteboard.'),
        'info',
        1800,
      )
    }
    return state
  }
  const node = {
    id: 'n_' + Math.random().toString(36).slice(2, 10),
    path,
    title,
    x: 200 + board.nodes.length * 40,
    y: 140 + board.nodes.length * 30,
  }
  board.nodes = Array.isArray(board.nodes) ? board.nodes.concat(node) : [node]
  await wbSaveState(context, state)
  if (context && context.ui && typeof context.ui.notice === 'function') {
    context.ui.notice(
      wbText('已将当前文档添加到白板。', 'Current document added to whiteboard.'),
      'ok',
      2000,
    )
  }
  return state
}

// 从 backlinks 索引为当前文档生成节点 + 邻居节点并填充白板
async function wbFillFromBacklinks(context) {
  const api = context && typeof context.getPluginAPI === 'function'
    ? context.getPluginAPI('backlinks-index')
    : null
  if (!api || typeof api.getIndexSnapshot !== 'function') {
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('未检测到双向链接索引，请先启用并构建“双向链接”索引。', 'Backlinks index not found. Please enable the Backlinks plugin and build the index first.'),
        'err',
        3200,
      )
    }
    return
  }
  if (!context || typeof context.getCurrentFilePath !== 'function') {
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('当前环境不支持获取当前文档路径。', 'Current environment cannot provide current file path.'),
        'err',
        2600,
      )
    }
    return
  }
  const curPathRaw = context.getCurrentFilePath && (await context.getCurrentFilePath())
  const curNorm = wbNormalizePath(curPathRaw)
  if (!curNorm) {
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('当前没有已保存的文档。', 'No saved document is currently open.'),
        'err',
        2400,
      )
    }
    return
  }
  const snapshot = api.getIndexSnapshot()
  if (!snapshot || !snapshot.docs || !snapshot.forward || !snapshot.backward) {
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('双向链接索引不可用，请在“双向链接”插件中重建索引。', 'Backlinks index is not ready; please rebuild it in the Backlinks plugin.'),
        'err',
        3200,
      )
    }
    return
  }
  const docs = snapshot.docs || {}
  const curDoc = docs[curNorm]
  if (!curDoc) {
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('当前文档尚未出现在双向链接索引中，请先保存并重建索引。', 'Current document is not in the backlinks index yet. Please save it and rebuild the index.'),
        'err',
        3200,
      )
    }
    return
  }

  const forward = snapshot.forward || {}
  const backward = snapshot.backward || {}
  const neighbors = new Set()
  const outArr = forward[curNorm]
  if (Array.isArray(outArr)) {
    outArr.forEach((n) => {
      if (n && typeof n === 'string') neighbors.add(n)
    })
  }
  const inArr = backward[curNorm]
  if (Array.isArray(inArr)) {
    inArr.forEach((n) => {
      if (n && typeof n === 'string') neighbors.add(n)
    })
  }
  if (!neighbors.size) {
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('当前文档没有任何双向链接邻居。', 'Current document has no backlinks neighbors.'),
        'info',
        2600,
      )
    }
    return
  }

  let state = await wbLoadState(context)
  const ensured = wbEnsureActiveBoard(state)
  state = ensured.state
  const board = ensured.board
  const pathToNode = new Map()
  board.nodes.forEach((n) => {
    if (n && n.path) pathToNode.set(wbNormalizePath(n.path), n)
  })

  let centerNode = pathToNode.get(wbNormalizePath(curDoc.path || curNorm))
  if (!centerNode) {
    centerNode = {
      id: 'n_' + Math.random().toString(36).slice(2, 10),
      path: curDoc.path || curNorm,
      title: curDoc.title || curDoc.name || wbGuessTitleFromPath(curDoc.path || curNorm),
      x: 420,
      y: 260,
    }
    board.nodes.push(centerNode)
    pathToNode.set(wbNormalizePath(centerNode.path), centerNode)
  }

  const MAX_NEIGHBOR = 40
  const newNeighbors = []
  let count = 0
  for (const norm of neighbors) {
    if (count >= MAX_NEIGHBOR) break
    const info = docs[norm]
    if (!info) continue
    const existing = pathToNode.get(wbNormalizePath(info.path || norm))
    if (existing) {
      count++
      continue
    }
    count++
    const node = {
      id: 'n_' + Math.random().toString(36).slice(2, 10),
      path: info.path || norm,
      title: info.title || info.name || wbGuessTitleFromPath(info.path || norm),
      x: 0,
      y: 0,
    }
    board.nodes.push(node)
    pathToNode.set(wbNormalizePath(node.path), node)
    newNeighbors.push(node)
  }

  const cx = centerNode.x || 420
  const cy = centerNode.y || 260
  const r = 220
  const nCount = newNeighbors.length
  if (nCount > 0) {
    for (let i = 0; i < nCount; i++) {
      const angle = (2 * Math.PI * i) / nCount
      const nx = cx + r * Math.cos(angle)
      const ny = cy + r * Math.sin(angle)
      newNeighbors[i].x = nx
      newNeighbors[i].y = ny
    }
  }

  const haveEdge = new Set()
  board.edges.forEach((e) => {
    if (e && e.fromId && e.toId) {
      haveEdge.add(e.fromId + '->' + e.toId)
    }
  })

  const centerId = centerNode.id
  neighbors.forEach((norm) => {
    const info = docs[norm]
    if (!info) return
    const node = pathToNode.get(wbNormalizePath(info.path || norm))
    if (!node) return
    const sig = centerId + '->' + node.id
    if (haveEdge.has(sig)) return
    haveEdge.add(sig)
    board.edges.push({ fromId: centerId, toId: node.id })
  })

  await wbSaveState(context, state)
  if (context && context.ui && typeof context.ui.notice === 'function') {
    context.ui.notice(
      wbText('已从双向链接填充白板。', 'Whiteboard filled from backlinks.'),
      'ok',
      2600,
    )
  }
}

// 打开白板选择 / 新建对话框，返回可能更新后的 state
async function wbOpenBoardSelectorDialog(context, state) {
  wbEnsureStyle()
  if (typeof document === 'undefined') return null
  const safeState = state || { boards: {}, activeId: null }
  const boards = safeState.boards || {}
  const activeId = safeState.activeId || null

  const entries = Object.keys(boards).map((id) => ({
    id,
    rawName: boards[id] && typeof boards[id].name === 'string' ? boards[id].name : '',
    name: boards[id] && typeof boards[id].name === 'string' && boards[id].name.trim()
      ? boards[id].name.trim()
      : wbText('未命名白板', 'Unnamed board'),
  }))

  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'wb-settings-overlay'

    const dialog = document.createElement('div')
    dialog.className = 'wb-settings-dialog'

    const header = document.createElement('div')
    header.className = 'wb-settings-header'
    const title = document.createElement('div')
    title.textContent = wbText('选择白板', 'Select Board')
    const btnClose = document.createElement('button')
    btnClose.className = 'wb-settings-btn'
    btnClose.textContent = '×'
    header.appendChild(title)
    header.appendChild(btnClose)

    const body = document.createElement('div')
    body.className = 'wb-settings-body'

    const list = document.createElement('div')
    list.className = 'wb-board-list'

    if (!entries.length) {
      const empty = document.createElement('div')
      empty.className = 'wb-settings-tip'
      empty.textContent = wbText(
        '当前尚未创建任何白板，请在下方输入名称并创建。',
        'No boards yet. Create one below.',
      )
      list.appendChild(empty)
    } else {
      entries.forEach((item) => {
        const row = document.createElement('div')
        row.className = 'wb-board-item'
        if (item.id === activeId) {
          row.classList.add('wb-board-item-active')
        }

        const left = document.createElement('div')
        left.className = 'wb-board-item-left'
        const spanName = document.createElement('div')
        spanName.className = 'wb-board-item-name'
        spanName.textContent = item.name
        const spanTag = document.createElement('div')
        spanTag.className = 'wb-board-item-tag'
        spanTag.textContent = item.id === activeId
          ? wbText('当前白板', 'Current board')
          : wbText('点击切换为当前白板', 'Click to make this current')
        left.appendChild(spanName)
        left.appendChild(spanTag)

        const actions = document.createElement('div')
        actions.className = 'wb-board-item-actions'

        const btnSwitch = document.createElement('button')
        btnSwitch.className = 'wb-board-action-btn'
        btnSwitch.textContent = item.id === activeId
          ? wbText('当前', 'Current')
          : wbText('切换', 'Switch')
        if (item.id === activeId) {
          btnSwitch.disabled = true
        }

        const btnRename = document.createElement('button')
        btnRename.className = 'wb-board-action-btn'
        btnRename.textContent = wbText('重命名', 'Rename')

        const btnDelete = document.createElement('button')
        btnDelete.className = 'wb-board-action-btn wb-board-action-btn-danger'
        btnDelete.textContent = wbText('删除', 'Delete')

        actions.appendChild(btnSwitch)
        actions.appendChild(btnRename)
        actions.appendChild(btnDelete)

        row.appendChild(left)
        row.appendChild(actions)

        const doSwitch = () => {
          if (!safeState.boards || !safeState.boards[item.id]) {
            overlay.remove()
            resolve(null)
            return
          }
          const nextState = {
            ...safeState,
            boards: { ...safeState.boards },
            activeId: item.id,
          }
          overlay.remove()
          resolve(nextState)
        }

        row.onclick = (ev) => {
          const target = ev.target
          if (target && typeof target.closest === 'function') {
            if (target.closest('.wb-board-item-actions')) {
              return
            }
          }
          if (item.id === activeId) return
          doSwitch()
        }

        btnSwitch.onclick = (ev) => {
          ev.stopPropagation()
          if (item.id === activeId) return
          doSwitch()
        }

        btnRename.onclick = (ev) => {
          ev.stopPropagation()
          if (!safeState.boards || !safeState.boards[item.id]) return
          const currentName = item.rawName || item.name || ''
          let nextNameRaw
          try {
            nextNameRaw = typeof window !== 'undefined'
              ? window.prompt(
                  wbText('输入新的白板名称：', 'Enter a new board name:'),
                  currentName,
                )
              : null
          } catch {
            nextNameRaw = null
          }
          if (nextNameRaw == null) return
          const nextName = String(nextNameRaw).trim()
          if (!nextName) return
          const nextBoards = { ...(safeState.boards || {}) }
          const oldBoard = nextBoards[item.id]
          if (!oldBoard || typeof oldBoard !== 'object') return
          nextBoards[item.id] = {
            ...oldBoard,
            name: nextName,
            updatedAt: Date.now(),
          }
          const nextState = {
            ...safeState,
            boards: nextBoards,
            lastUpdated: Date.now(),
          }
          overlay.remove()
          resolve(nextState)
        }

        btnDelete.onclick = async (ev) => {
          ev.stopPropagation()
          if (!safeState.boards || !safeState.boards[item.id]) return
          let ok = true
          try {
            ok =
              context &&
              context.ui &&
              typeof context.ui.confirm === 'function'
                ? await context.ui.confirm(
                    wbText(
                      '确定要删除这个白板吗？不会删除任何文档内容。',
                      'Delete this board? It will not delete any files.',
                    ),
                  )
                : true
          } catch {
            ok = false
          }
          if (!ok) return
          const nextBoards = { ...(safeState.boards || {}) }
          delete nextBoards[item.id]
          const ids = Object.keys(nextBoards)
          let nextActiveId = safeState.activeId || null
          if (!ids.length) {
            nextActiveId = null
          } else if (item.id === safeState.activeId || !nextBoards[nextActiveId]) {
            nextActiveId = ids[0]
          }
          const nextState = {
            ...safeState,
            boards: nextBoards,
            activeId: nextActiveId,
            lastUpdated: Date.now(),
          }
          overlay.remove()
          resolve(nextState)
        }

        list.appendChild(row)
      })
    }

    const createRow = document.createElement('div')
    createRow.className = 'wb-board-create-row'
    const input = document.createElement('input')
    input.className = 'wb-board-input'
    input.type = 'text'
    input.placeholder = wbText('输入新白板名称', 'New board name')
    const btnCreate = document.createElement('button')
    btnCreate.className = 'wb-board-create-btn'
    btnCreate.textContent = wbText('创建', 'Create')

    const doCreate = () => {
      const rawName = input.value || ''
      const name = rawName.trim()
      if (!name) {
        input.focus()
        return
      }
      const id = 'board_' + Math.random().toString(36).slice(2, 10)
      const now = Date.now()
      const nextBoards = { ...(safeState.boards || {}) }
      nextBoards[id] = {
        id,
        name,
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now,
      }
      const nextState = {
        boards: nextBoards,
        activeId: id,
        lastUpdated: now,
      }
      overlay.remove()
      resolve(nextState)
    }

    btnCreate.onclick = () => doCreate()
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        doCreate()
      }
    })

    createRow.appendChild(input)
    createRow.appendChild(btnCreate)

    const tip = document.createElement('div')
    tip.className = 'wb-settings-tip'
    tip.textContent = wbText(
      '一个白板可以对应一个项目或主题，名称仅影响视图，不会修改任何文档内容。',
      'Each board can represent a project or topic; names only affect the view, not your files.',
    )

    body.appendChild(list)
    body.appendChild(createRow)
    body.appendChild(tip)

    const footer = document.createElement('div')
    footer.className = 'wb-settings-footer'
    const btnCancel = document.createElement('button')
    btnCancel.className = 'wb-settings-btn'
    btnCancel.textContent = wbText('关闭', 'Close')
    footer.appendChild(btnCancel)

    dialog.appendChild(header)
    dialog.appendChild(body)
    dialog.appendChild(footer)

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    btnClose.onclick = () => {
      overlay.remove()
      resolve(null)
    }
    btnCancel.onclick = () => {
      overlay.remove()
      resolve(null)
    }
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove()
        resolve(null)
      }
    }
  })
}

function wbCreateSvgElement(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag)
}

async function wbOpenBoard(context) {
  wbEnsureStyle()
  if (typeof document === 'undefined') return
  if (WB_BOARD_OPEN) return
  WB_BOARD_OPEN = true

  const config = await wbLoadConfig(context)
  let state = await wbLoadState(context)
  const ensured = wbEnsureActiveBoard(state)
  state = ensured.state
  let board = ensured.board
  let miniShell = null
  let miniDragging = false
  let miniDragStartX = 0
  let miniDragStartY = 0
  let miniStartLeft = 0
  let miniStartTop = 0

  const overlay = document.createElement('div')
  overlay.className = 'wb-overlay'

  const shell = document.createElement('div')
  shell.className = 'wb-shell'

  const header = document.createElement('div')
  header.className = 'wb-header'
  const headerLeft = document.createElement('div')
  headerLeft.className = 'wb-header-left'
  const title = document.createElement('div')
  title.className = 'wb-header-title'
  title.textContent = wbText('白板视图', 'Whiteboard View')

  function wbGetBoardDisplayName(b) {
    if (!b || typeof b !== 'object') {
      return wbText('未命名白板', 'Unnamed board')
    }
    const raw = typeof b.name === 'string' ? b.name.trim() : ''
    if (raw) return raw
    return wbText('未命名白板', 'Unnamed board')
  }

  const sub = document.createElement('div')
  sub.className = 'wb-header-sub'
  const subPrefix = document.createElement('span')
  subPrefix.textContent = wbText('当前白板：', 'Current board: ')
  const subName = document.createElement('span')
  subName.className = 'wb-header-sub-board-name'
  subName.textContent = wbGetBoardDisplayName(board)
  const subSuffix = document.createElement('span')
  subSuffix.textContent = wbText('（点击切换/新建）', '(click to switch/create)')
  sub.appendChild(subPrefix)
  sub.appendChild(subName)
  sub.appendChild(subSuffix)
  headerLeft.appendChild(title)
  headerLeft.appendChild(sub)

  const headerActions = document.createElement('div')
  headerActions.className = 'wb-header-actions'
  const btnAddCurrent = document.createElement('button')
  btnAddCurrent.className = 'wb-btn'
  btnAddCurrent.innerHTML = `<span class="wb-btn-icon">＋</span><span>${wbText('添加当前文档', 'Add current note')}</span>`
  const btnMinimize = document.createElement('button')
  btnMinimize.className = 'wb-btn wb-btn-ghost'
  btnMinimize.textContent = wbText('最小化', 'Minimize')
  const btnSettings = document.createElement('button')
  btnSettings.className = 'wb-btn wb-btn-ghost'
  btnSettings.textContent = wbText('白板设置', 'Settings')
  const btnClose = document.createElement('button')
  btnClose.className = 'wb-btn wb-btn-close'
  btnClose.textContent = '×'
  headerActions.appendChild(btnAddCurrent)
  headerActions.appendChild(btnMinimize)
  headerActions.appendChild(btnSettings)
  headerActions.appendChild(btnClose)

  header.appendChild(headerLeft)
  header.appendChild(headerActions)

  const toolbar = document.createElement('div')
  toolbar.className = 'wb-toolbar'
  const hint = document.createElement('div')
  hint.className = 'wb-toolbar-hint'
  hint.textContent = wbText(
    '拖动节点移动，双击标题打开文档，连接按钮可建立关系。',
    'Drag node to move; double-click title to open note; use connect button to create relations.',
  )
  const toolbarSpacer = document.createElement('div')
  toolbarSpacer.className = 'wb-toolbar-spacer'
  const toolbarMeta = document.createElement('div')
  toolbarMeta.textContent = wbText(
    `节点: ${board.nodes.length}`,
    `Nodes: ${board.nodes.length}`,
  )
  toolbar.appendChild(hint)
  toolbar.appendChild(toolbarSpacer)
  toolbar.appendChild(toolbarMeta)

  const body = document.createElement('div')
  body.className = 'wb-body'

  const canvas = document.createElement('div')
  canvas.className = 'wb-canvas'
  const canvasInner = document.createElement('div')
  canvasInner.className = 'wb-canvas-inner'

  const nodesContainer = document.createElement('div')
  nodesContainer.style.position = 'relative'
  nodesContainer.style.width = '100%'
  nodesContainer.style.height = '100%'

  const svg = wbCreateSvgElement('svg')
  svg.classList.add('wb-svg')

  canvasInner.appendChild(nodesContainer)
  canvasInner.appendChild(svg)
  canvas.appendChild(canvasInner)
  body.appendChild(canvas)

  shell.appendChild(header)
  shell.appendChild(toolbar)
  shell.appendChild(body)
  overlay.appendChild(shell)
  document.body.appendChild(overlay)

  let activeConnectNodeId = null

  function syncToolbarMeta() {
    toolbarMeta.textContent = wbText(
      `节点: ${board.nodes.length}`,
      `Nodes: ${board.nodes.length}`,
    )
  }

  function syncHeaderBoardName() {
    subName.textContent = wbGetBoardDisplayName(board)
  }

  function ensureMiniShell() {
    if (miniShell) return miniShell
    const el = document.createElement('div')
    el.className = 'wb-mini-shell'
    const titleEl = document.createElement('div')
    titleEl.className = 'wb-mini-title'
    titleEl.textContent = `${wbText('白板', 'Whiteboard')} · ${wbGetBoardDisplayName(board)}`
    const btnRestore = document.createElement('button')
    btnRestore.className = 'wb-mini-btn'
    btnRestore.textContent = wbText('还原', 'Restore')
    const btnCloseMini = document.createElement('button')
    btnCloseMini.className = 'wb-mini-btn'
    btnCloseMini.textContent = wbText('关闭', 'Close')

    el.appendChild(titleEl)
    el.appendChild(btnRestore)
    el.appendChild(btnCloseMini)
    document.body.appendChild(el)

    const onMiniMouseDown = (ev) => {
      if (ev.button !== 0) return
      if (ev.target === btnRestore || ev.target === btnCloseMini) return
      ev.preventDefault()
      const rect = el.getBoundingClientRect()
      miniDragging = true
      miniDragStartX = ev.clientX
      miniDragStartY = ev.clientY
      miniStartLeft = rect.left
      miniStartTop = rect.top
      el.style.cursor = 'grabbing'
      const onMove = (e) => {
        if (!miniDragging) return
        const dx = e.clientX - miniDragStartX
        const dy = e.clientY - miniDragStartY
        const nextLeft = miniStartLeft + dx
        const nextTop = miniStartTop + dy
        el.style.left = nextLeft + 'px'
        el.style.top = nextTop + 'px'
        el.style.right = 'auto'
        el.style.bottom = 'auto'
      }
      const onUp = () => {
        if (!miniDragging) return
        miniDragging = false
        el.style.cursor = 'grab'
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

    el.addEventListener('mousedown', onMiniMouseDown)

    btnRestore.onclick = () => {
      overlay.style.display = 'flex'
      if (miniShell) {
        miniShell.remove()
        miniShell = null
      }
    }

    btnCloseMini.onclick = () => {
      if (miniShell) {
        miniShell.remove()
        miniShell = null
      }
      if (WB_BOARD_OPEN) {
        WB_BOARD_OPEN = false
      }
    }

    miniShell = el
    return el
  }

  function applySnap(value) {
    if (!config.snapToGrid) return value
    const size = config.gridSize || 20
    return Math.round(value / size) * size
  }

  /**
   * 计算从矩形中心到目标点的射线与矩形边界的交点
   * @param {number} cx - 矩形中心X坐标
   * @param {number} cy - 矩形中心Y坐标
   * @param {number} width - 矩形宽度
   * @param {number} height - 矩形高度
   * @param {number} targetX - 目标点X坐标
   * @param {number} targetY - 目标点Y坐标
   * @returns {{x: number, y: number}} 边界交点坐标
   */
  function calculateBorderIntersection(cx, cy, width, height, targetX, targetY) {
    const halfW = width / 2
    const halfH = height / 2
    const dx = targetX - cx
    const dy = targetY - cy

    // 处理边缘情况：目标点在中心或非常接近中心
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      return { x: cx + halfW, y: cy }
    }

    // 计算与四条边的交点候选
    const candidates = []

    // 右边 (x = cx + halfW)
    if (dx > 0) {
      const y = cy + (halfW * dy) / dx
      if (y >= cy - halfH && y <= cy + halfH) {
        candidates.push({ x: cx + halfW, y, dist: halfW / dx })
      }
    }

    // 左边 (x = cx - halfW)
    if (dx < 0) {
      const y = cy + (-halfW * dy) / dx
      if (y >= cy - halfH && y <= cy + halfH) {
        candidates.push({ x: cx - halfW, y, dist: -halfW / dx })
      }
    }

    // 下边 (y = cy + halfH)
    if (dy > 0) {
      const x = cx + (halfH * dx) / dy
      if (x >= cx - halfW && x <= cx + halfW) {
        candidates.push({ x, y: cy + halfH, dist: halfH / dy })
      }
    }

    // 上边 (y = cy - halfH)
    if (dy < 0) {
      const x = cx + (-halfH * dx) / dy
      if (x >= cx - halfW && x <= cx + halfW) {
        candidates.push({ x, y: cy - halfH, dist: -halfH / dy })
      }
    }

    // 选择距离最近的有效交点
    candidates.sort((a, b) => a.dist - b.dist)
    return candidates[0] || { x: cx + halfW, y: cy }
  }

  function renderEdges() {
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    // 批量缓存所有节点的 DOM 元素和尺寸信息
    const nodeCache = new Map()
    board.nodes.forEach((node) => {
      const nodeEl = nodesContainer.querySelector(`[data-id="${node.id}"]`)
      if (nodeEl) {
        const rect = nodeEl.getBoundingClientRect()
        nodeCache.set(node.id, {
          width: rect.width,
          height: rect.height,
          // 中心点坐标（相对于画布）
          centerX: (node.x || 0) + rect.width / 2,
          centerY: (node.y || 0) + rect.height / 2
        })
      }
    })

    board.edges.forEach((edge) => {
      const fromNode = board.nodes.find((n) => n.id === edge.fromId)
      const toNode = board.nodes.find((n) => n.id === edge.toId)
      if (!fromNode || !toNode) return

      const fromCache = nodeCache.get(edge.fromId)
      const toCache = nodeCache.get(edge.toId)
      if (!fromCache || !toCache) return

      // 计算起点边界交点
      const fromPoint = calculateBorderIntersection(
        fromCache.centerX,
        fromCache.centerY,
        fromCache.width,
        fromCache.height,
        toCache.centerX,
        toCache.centerY
      )

      // 计算终点边界交点
      const toPoint = calculateBorderIntersection(
        toCache.centerX,
        toCache.centerY,
        toCache.width,
        toCache.height,
        fromCache.centerX,
        fromCache.centerY
      )

      const line = wbCreateSvgElement('line')
      line.setAttribute('x1', String(fromPoint.x))
      line.setAttribute('y1', String(fromPoint.y))
      line.setAttribute('x2', String(toPoint.x))
      line.setAttribute('y2', String(toPoint.y))
      line.classList.add('wb-edge')
      if (activeConnectNodeId && (edge.fromId === activeConnectNodeId || edge.toId === activeConnectNodeId)) {
        line.classList.add('wb-edge-active')
      }
      svg.appendChild(line)
    })
  }

  function rebuildNodes() {
    while (nodesContainer.firstChild) nodesContainer.removeChild(nodesContainer.firstChild)
    board.nodes.forEach((node) => {
      const nodeEl = document.createElement('div')
      nodeEl.className = 'wb-node'
      nodeEl.dataset.id = node.id
      nodeEl.style.left = (node.x || 0) + 'px'
      nodeEl.style.top = (node.y || 0) + 'px'

      const titleEl = document.createElement('div')
      titleEl.className = 'wb-node-title'
      titleEl.textContent = node.title || wbGuessTitleFromPath(node.path)

      const pathEl = document.createElement('div')
      pathEl.className = 'wb-node-path'
      pathEl.textContent = node.path || wbText('未绑定文件', 'No file bound')

      const footerEl = document.createElement('div')
      footerEl.className = 'wb-node-footer'
      const handleEl = document.createElement('div')
      handleEl.className = 'wb-node-handle'
      handleEl.textContent = wbText('拖动', 'Move')

      const actionsWrap = document.createElement('div')
      const openEl = document.createElement('span')
      openEl.className = 'wb-node-open'
      openEl.textContent = wbText('打开', 'Open')
      const connectEl = document.createElement('span')
      connectEl.className = 'wb-node-connect'
      connectEl.textContent = wbText('连接', 'Link')
      const deleteEl = document.createElement('span')
      deleteEl.className = 'wb-node-delete'
      deleteEl.textContent = wbText('删除', 'Remove')

      actionsWrap.appendChild(openEl)
      actionsWrap.appendChild(connectEl)
      actionsWrap.appendChild(deleteEl)

      footerEl.appendChild(handleEl)
      footerEl.appendChild(actionsWrap)

      nodeEl.appendChild(titleEl)
      nodeEl.appendChild(pathEl)
      nodeEl.appendChild(footerEl)
      nodesContainer.appendChild(nodeEl)

      titleEl.ondblclick = async () => {
        if (!node.path || !context || typeof context.openFileByPath !== 'function') return
        try {
          await context.openFileByPath(node.path)
        } catch {
          if (context.ui && typeof context.ui.notice === 'function') {
            context.ui.notice(
              wbText('无法打开文档，请检查路径。', 'Unable to open note; please check the path.'),
              'err',
              2400,
            )
          }
        }
      }

      openEl.onclick = async () => {
        if (!node.path || !context || typeof context.openFileByPath !== 'function') return
        try {
          await context.openFileByPath(node.path)
        } catch {
          if (context.ui && typeof context.ui.notice === 'function') {
            context.ui.notice(
              wbText('无法打开文档，请检查路径。', 'Unable to open note; please check the path.'),
              'err',
              2400,
            )
          }
        }
      }

      connectEl.onclick = async () => {
        if (activeConnectNodeId === node.id) {
          activeConnectNodeId = null
          connectEl.classList.remove('wb-node-connect-active')
          renderEdges()
          return
        }
        if (!activeConnectNodeId) {
          activeConnectNodeId = node.id
          const allConnectBtns = nodesContainer.querySelectorAll('.wb-node-connect')
          allConnectBtns.forEach((el) => el.classList.remove('wb-node-connect-active'))
          connectEl.classList.add('wb-node-connect-active')
          renderEdges()
          return
        }
        const fromId = activeConnectNodeId
        const toId = node.id
        activeConnectNodeId = null
        const allConnectBtns = nodesContainer.querySelectorAll('.wb-node-connect')
        allConnectBtns.forEach((el) => el.classList.remove('wb-node-connect-active'))
        const existsEdge = board.edges.find((e) => e.fromId === fromId && e.toId === toId)
        if (!existsEdge) {
          board.edges.push({ fromId, toId })
          await wbSaveState(context, state)
        }
        renderEdges()
      }

      let dragging = false
      let dragStartX = 0
      let dragStartY = 0
      let nodeStartX = node.x || 0
      let nodeStartY = node.y || 0

      nodeEl.onmousedown = (ev) => {
        if (ev.button !== 0) return
        const target = ev.target
        if (target && typeof target.closest === 'function') {
          if (target.closest('.wb-node-open') || target.closest('.wb-node-connect') || target.closest('.wb-node-delete')) {
            return
          }
        }
        if (ev.detail > 1) return
        ev.preventDefault()
        ev.stopPropagation()
        dragging = true
        dragStartX = ev.clientX
        dragStartY = ev.clientY
        nodeStartX = node.x || 0
        nodeStartY = node.y || 0
        canvas.style.cursor = 'grabbing'
        const onMove = (e) => {
          if (!dragging) return
          const dx = e.clientX - dragStartX
          const dy = e.clientY - dragStartY
          let nextX = nodeStartX + dx
          let nextY = nodeStartY + dy
          nextX = applySnap(nextX)
          nextY = applySnap(nextY)
          node.x = nextX
          node.y = nextY
          nodeEl.style.left = nextX + 'px'
          nodeEl.style.top = nextY + 'px'
          renderEdges()
        }
        const onUp = async () => {
          if (!dragging) return
          dragging = false
          canvas.style.cursor = 'grab'
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          await wbSaveState(context, state)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }

      deleteEl.onclick = async () => {
        const id = node.id
        board.nodes = board.nodes.filter((n) => n.id !== id)
        board.edges = board.edges.filter((e) => e.fromId !== id && e.toId !== id)
        await wbSaveState(context, state)
        rebuildNodes()
      }
    })
    renderEdges()
    syncToolbarMeta()
  }

  rebuildNodes()
  syncHeaderBoardName()

  function closeBoard() {
    if (!WB_BOARD_OPEN) return
    WB_BOARD_OPEN = false
    if (miniShell) {
      miniShell.remove()
      miniShell = null
    }
    overlay.remove()
  }

  btnClose.onclick = () => closeBoard()
  overlay.onclick = (e) => {
    if (e.target === overlay) closeBoard()
  }

  btnAddCurrent.onclick = async () => {
    state = await wbAddNodeForCurrentFile(context)
    board = state.boards[state.activeId]
    rebuildNodes()
  }

  btnSettings.onclick = async () => {
    const next = await wbOpenSettingsDialog(context)
    if (!next) return
    await wbSaveConfig(context, next)
    if (context && context.ui && typeof context.ui.notice === 'function') {
      context.ui.notice(
        wbText('白板设置已保存', 'Whiteboard settings saved'),
        'ok',
        1800,
      )
    }
  }

  btnMinimize.onclick = () => {
    overlay.style.display = 'none'
    ensureMiniShell()
  }

  sub.onclick = async () => {
    const nextState = await wbOpenBoardSelectorDialog(context, state)
    if (!nextState) return
    state = nextState
    const ensuredNext = wbEnsureActiveBoard(state)
    state = ensuredNext.state
    board = ensuredNext.board
    await wbSaveState(context, state)
    rebuildNodes()
    syncToolbarMeta()
    syncHeaderBoardName()
  }

  // 初次打开时，如果希望快速基于双向链接构建上下文，可在这里选择是否自动填充
  // 目前保持显式操作：用户通过菜单或右键触发 wbFillFromBacklinks
}

// 插件主入口
export async function activate(context) {
  // 菜单栏入口
  if (typeof context.addMenuItem === 'function') {
    context.addMenuItem({
      label: wbText('白板视图', 'Whiteboard'),
      title: wbText(
        '在可视化画布中摆放文档节点，构建自己的知识地图。',
        'Place notes on a visual canvas to build your own knowledge map.',
      ),
      children: [
        {
          label: wbText('打开白板', 'Open whiteboard'),
          onClick: () => {
            void wbOpenBoard(context)
          },
        },
        {
          label: wbText('从反向链接填充当前白板', 'Fill whiteboard from backlinks'),
          onClick: () => {
            void wbFillFromBacklinks(context)
          },
        },
        {
          label: wbText('将当前文档添加到白板', 'Add current note to whiteboard'),
          onClick: () => {
            void wbAddNodeForCurrentFile(context)
          },
        },
        {
          label: wbText('白板设置', 'Whiteboard settings'),
          onClick: async () => {
            const next = await wbOpenSettingsDialog(context)
            if (!next) return
            await wbSaveConfig(context, next)
            if (context && context.ui && typeof context.ui.notice === 'function') {
              context.ui.notice(
                wbText('白板设置已保存', 'Whiteboard settings saved'),
                'ok',
                1800,
              )
            }
          },
        },
      ],
    })
  }

  // 编辑区右键菜单入口（源码 / 所见均可用）
  if (typeof context.addContextMenuItem === 'function') {
    context.addContextMenuItem({
      label: wbText('白板视图', 'Whiteboard'),
      icon: '🧊',
      children: [
        {
          label: wbText('打开白板', 'Open whiteboard'),
          onClick: () => {
            void wbOpenBoard(context)
          },
        },
        {
          label: wbText('从反向链接填充当前白板', 'Fill from backlinks'),
          onClick: () => {
            void wbFillFromBacklinks(context)
          },
        },
        {
          label: wbText('将当前文档添加到白板', 'Add current note to whiteboard'),
          onClick: async () => {
            await wbAddNodeForCurrentFile(context)
          },
        },
      ],
    })
  }
}

export async function openSettings(context) {
  const next = await wbOpenSettingsDialog(context)
  if (!next) return
  await wbSaveConfig(context, next)
  if (context && context.ui && typeof context.ui.notice === 'function') {
    context.ui.notice(
      wbText('白板设置已保存', 'Whiteboard settings saved'),
      'ok',
      1800,
    )
  }
}

export function deactivate() {
  // 目前仅依赖 DOM 节点，无常驻定时器，无需特别清理
}
