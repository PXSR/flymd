// 快速搜索（库侧栏搜索）：支持
// 设计目标：不破坏旧行为，默认仍是文件名搜索
// - 默认：文件名/路径过滤（输入即时刷新，回车打开）
// - `:`/`：` 前缀：全文检索（两段式：快速扫描 + 深度搜索）
// - `::`/`：：` 前缀：语义检索（接入 flymd-RAG）

import { readTextFileLines } from '@tauri-apps/plugin-fs'
import { listAllFiles, type LibEntry } from '../core/libraryFs'

export type QuickSearchMode = 'file' | 'fulltext' | 'semantic'

export type QuickSearchDeps = {
  getLibraryRoot: () => Promise<string | null>
  openFile: (path: string) => Promise<void>
  showError: (msg: string, err?: any) => void
  getPluginAPI?: (namespace: string) => any | null
  openPluginSettings?: (pluginId: string) => Promise<void>
}

type QuickSearchItem = {
  kind: QuickSearchMode
  name: string
  path: string
  relPath: string
  snippet?: string
  score?: number
  line?: number
}

type ParsedInput = { mode: QuickSearchMode; query: string }

function escapeHtml(s: string): string {
  const x = String(s || '')
  return x
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeSlashPath(p: string): string {
  return String(p || '').replace(/\\/g, '/')
}

function relPathFromRoot(absPath: string, root: string): string {
  const p = normalizeSlashPath(absPath)
  const r0 = normalizeSlashPath(root)
  const r = r0.endsWith('/') ? r0 : r0 + '/'
  if (!r) return p
  const pl = p.toLowerCase()
  const rl = r.toLowerCase()
  if (pl.startsWith(rl)) return p.slice(r.length)
  return p
}

function parseQuickSearchInput(raw: string): ParsedInput {
  const s = String(raw || '').trimStart()
  if (s.startsWith('::') || s.startsWith('：：')) {
    return { mode: 'semantic', query: s.slice(2).trim() }
  }
  if (s.startsWith(':') || s.startsWith('：')) {
    return { mode: 'fulltext', query: s.slice(1).trim() }
  }
  return { mode: 'file', query: s.trim() }
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export function createQuickSearch(deps: QuickSearchDeps) {
  // DOM 与状态
  let panel: HTMLDivElement | null = null
  let inputEl: HTMLInputElement | null = null
  let cloudBtn: HTMLButtonElement | null = null
  let resultsEl: HTMLDivElement | null = null
  let statusEl: HTMLDivElement | null = null
  let statusTextEl: HTMLSpanElement | null = null
  let deepBtn: HTMLButtonElement | null = null
  let cancelBtn: HTMLButtonElement | null = null

  let files: LibEntry[] = []
  let rootAbs = ''
  let items: QuickSearchItem[] = []
  let selected = 0

  let searching = false
  let token = 0
  let lastMode: QuickSearchMode = 'file'
  let lastQuery = ''

  // 全文检索：两段式状态
  let fulltextScannedLines = new Map<string, number>() // absPath -> linesRead
  let fulltextHitPaths = new Set<string>() // absPath
  let fulltextFastStopped = false

  function cancelSearch() {
    token++
    searching = false
    try { cancelBtn?.classList.add('hidden') } catch {}
  }

  function showStatus(
    text: string,
    opt?: { showDeep?: boolean; deepLabel?: string; showCancel?: boolean },
  ) {
    if (!statusEl || !statusTextEl) return
    statusEl.classList.remove('hidden')
    statusTextEl.textContent = text
    try {
      if (deepBtn) {
        if (opt?.deepLabel) deepBtn.textContent = opt.deepLabel
        deepBtn.classList.toggle('hidden', !opt?.showDeep)
      }
      if (cancelBtn) {
        cancelBtn.classList.toggle('hidden', !opt?.showCancel)
      }
    } catch {}
  }

  function hideStatus() {
    try { statusEl?.classList.add('hidden') } catch {}
  }

  function syncCloudBtn(mode: QuickSearchMode) {
    if (!cloudBtn) return
    const enable = mode === 'semantic'
    try {
      cloudBtn.disabled = !enable
      // 现在它只是“知识库”标签：语义模式下点亮，表示当前在走知识库检索
      cloudBtn.classList.toggle('active', enable)
    } catch {}
  }

  function render() {
    if (!resultsEl || !inputEl) return
    const parsed = parseQuickSearchInput(inputEl.value)
    syncCloudBtn(parsed.mode)

    // 文件名/路径过滤：实时
    if (parsed.mode === 'file') {
      hideStatus()
      const q = parsed.query.toLowerCase().trim()
      let filtered = files
      if (q) {
        filtered = files.filter(
          (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
        )
      }
      filtered = filtered.slice(0, 20)
      items = filtered.map((f) => ({
        kind: 'file',
        name: f.name,
        path: f.path,
        relPath: relPathFromRoot(f.path, rootAbs),
      }))
      lastMode = 'file'
      lastQuery = q
    } else {
      // 全文/语义：回车触发
      if (!parsed.query) {
        items = []
        resultsEl.innerHTML = '<div class="quick-search-loading">输入关键词，按 Enter 开始检索…</div>'
        showStatus(
          parsed.mode === 'fulltext'
            ? '全文检索：输入 :关键词，回车开始快速扫描'
            : '知识库搜索：输入 ::关键词，回车开始搜索',
          { showDeep: false, showCancel: false },
        )
        return
      }
      if (parsed.mode !== lastMode || parsed.query !== lastQuery) {
        items = []
        resultsEl.innerHTML = `<div class="quick-search-loading">按 Enter 开始${parsed.mode === 'fulltext' ? '全文' : '语义'}检索…</div>`
        showStatus(
          parsed.mode === 'fulltext'
            ? '全文检索：回车=快速扫描；可点“继续深度搜索”扫全文'
            : '知识库搜索：回车开始（需要 flymd-RAG 索引）',
          { showDeep: false, showCancel: false },
        )
        return
      }
    }

    const view = items.slice(0, 50)
    resultsEl.innerHTML = view
      .map((it, i) => {
        const sel = i === selected ? 'selected' : ''
        const lineHint = typeof it.line === 'number' && it.line > 0 ? `:${it.line}` : ''
        const titlePrefix =
          it.kind === 'semantic' && typeof it.score === 'number'
            ? `${it.score.toFixed(3)} `
            : ''
        const subtitle = escapeHtml(it.relPath + lineHint)
        const snippet = it.snippet
          ? `<span class="quick-search-snippet">${escapeHtml(it.snippet)}</span>`
          : ''
        return `<div class="quick-search-item ${sel}" data-path="${escapeHtml(it.path)}">
          <span class="quick-search-name">${escapeHtml(titlePrefix + it.name)}</span>
          <span class="quick-search-path">${subtitle}</span>
          ${snippet}
        </div>`
      })
      .join('')

    // 点击打开文件（先不做跳行，避免破坏 openFile 行为；后续可扩展）
    resultsEl.querySelectorAll('.quick-search-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const p = (el as HTMLElement).dataset.path
        if (!p) return
        hide()
        await deps.openFile(p)
      })
    })
  }

  async function scanFilePrefixForHit(
    absPath: string,
    queryLower: string,
    opt: { curToken: number; maxChars: number },
  ): Promise<{ hit: boolean; snippet: string; line: number; linesRead: number }> {
    let linesRead = 0
    let chars = 0
    let hit = false
    let hitLine = 0
    let snippet = ''
    try {
      const iter = await readTextFileLines(absPath as any)
      for await (const line of iter as any) {
        if (opt.curToken !== token) break
        linesRead++
        const ln = String(line || '')
        chars += ln.length + 1
        if (!hit && ln.toLowerCase().includes(queryLower)) {
          hit = true
          hitLine = linesRead
          snippet = ln.trim().slice(0, 180)
        }
        if (chars >= opt.maxChars) break
      }
    } catch {}
    return { hit, snippet, line: hitLine, linesRead }
  }

  async function scanFileFromLineForHit(
    absPath: string,
    queryLower: string,
    opt: { curToken: number; skipLines: number; maxLines: number },
  ): Promise<{ hit: boolean; snippet: string; line: number }> {
    let lineNo = 0
    let hit = false
    let hitLine = 0
    let snippet = ''
    try {
      const iter = await readTextFileLines(absPath as any)
      let skipped = 0
      let prev = ''
      for await (const line of iter as any) {
        if (opt.curToken !== token) break
        lineNo++
        const ln = String(line || '')
        if (skipped < opt.skipLines) {
          skipped++
          prev = ln
          continue
        }
        if (ln.toLowerCase().includes(queryLower)) {
          hit = true
          hitLine = lineNo
          const prevText = prev.trim()
          const curText = ln.trim()
          snippet = (prevText ? prevText + '\n' : '') + curText
          snippet = snippet.slice(0, 220)
          break
        }
        prev = ln
        if (opt.maxLines > 0 && lineNo >= opt.maxLines) break
      }
    } catch {}
    return { hit, snippet, line: hitLine }
  }

  async function runFulltextFast(q: string) {
    if (searching) return
    if (!rootAbs) return
    const query = String(q || '').trim()
    if (!query) return

    cancelSearch()
    const curToken = ++token
    searching = true
    lastMode = 'fulltext'
    lastQuery = query
    items = []
    selected = 0
    fulltextScannedLines = new Map()
    fulltextHitPaths = new Set()
    fulltextFastStopped = false

    const mdFiles = (files || []).filter((f) => /\.(md|markdown|txt)$/i.test(f.name || ''))
    const total = mdFiles.length
    const queryLower = query.toLowerCase()
    const t0 = Date.now()
    let scanned = 0
    let hits = 0

    showStatus('全文检索：快速扫描中…', { showDeep: false, showCancel: true })
    if (resultsEl) resultsEl.innerHTML = '<div class="quick-search-loading">快速扫描中…</div>'

    const hitLimit = 20
    const timeBudgetMs = 800
    const scanBudgetFiles = 400
    const maxCharsPerFile = 12000

    for (const f of mdFiles) {
      if (curToken !== token) break
      scanned++
      const r = await scanFilePrefixForHit(f.path, queryLower, { curToken, maxChars: maxCharsPerFile })
      fulltextScannedLines.set(f.path, r.linesRead)
      if (r.hit) {
        hits++
        fulltextHitPaths.add(f.path)
        items.push({
          kind: 'fulltext',
          name: f.name,
          path: f.path,
          relPath: relPathFromRoot(f.path, rootAbs),
          snippet: r.snippet,
          line: r.line,
        })
      }
      if (scanned % 20 === 0 || hits >= hitLimit) {
        showStatus(`全文检索：已扫 ${scanned}/${total}，命中 ${hits}（回车打开；可深度搜索）`, {
          showDeep: true,
          showCancel: true,
        })
        render()
        await yieldToUi()
      }
      if (hits >= hitLimit) break
      if (scanned >= scanBudgetFiles) break
      if (Date.now() - t0 >= timeBudgetMs) break
    }

    fulltextFastStopped = scanned < total
    searching = false
    const tail = fulltextFastStopped ? '（可继续深度搜索找更多）' : '（可深度搜索扫全文）'
    showStatus(`全文检索：快速扫描完成，已扫 ${scanned}/${total}，命中 ${hits}${tail}`, {
      showDeep: true,
      showCancel: false,
    })
    render()
  }

  async function runFulltextDeep(q: string) {
    if (searching) return
    if (!rootAbs) return
    const query = String(q || '').trim()
    if (!query) return
    if (lastMode !== 'fulltext' || lastQuery !== query) {
      void runFulltextFast(query)
      return
    }

    cancelSearch()
    const curToken = ++token
    searching = true

    const mdFiles = (files || []).filter((f) => /\.(md|markdown|txt)$/i.test(f.name || ''))
    const total = mdFiles.length
    const queryLower = query.toLowerCase()
    let scanned = 0
    let hits = items.length
    const maxHits = 80

    showStatus('全文检索：深度搜索中…', { showDeep: false, showCancel: true })

    for (const f of mdFiles) {
      if (curToken !== token) break
      scanned++
      if (fulltextHitPaths.has(f.path)) continue
      const skip = fulltextScannedLines.get(f.path) || 0
      const r = await scanFileFromLineForHit(f.path, queryLower, { curToken, skipLines: skip, maxLines: 0 })
      if (r.hit) {
        hits++
        fulltextHitPaths.add(f.path)
        items.push({
          kind: 'fulltext',
          name: f.name,
          path: f.path,
          relPath: relPathFromRoot(f.path, rootAbs),
          snippet: r.snippet,
          line: r.line,
        })
      }
      if (scanned % 20 === 0) {
        showStatus(`全文检索：深度搜索 ${scanned}/${total}，命中 ${hits}`, { showDeep: false, showCancel: true })
        render()
        await yieldToUi()
      }
      if (hits >= maxHits) break
    }

    searching = false
    const stopHint = hits >= maxHits ? `（已达上限 ${maxHits}）` : ''
    showStatus(`全文检索：深度搜索完成，命中 ${hits}${stopHint}`, { showDeep: false, showCancel: false })
    render()
  }

  async function runSemantic(q: string) {
    if (searching) return
    if (!rootAbs) return
    const query = String(q || '').trim()
    if (!query) return
    if (!deps.getPluginAPI) {
      deps.showError('当前环境不支持插件 API')
      return
    }

    const api = deps.getPluginAPI('flymdRAG') || deps.getPluginAPI('flySmart')
    if (!api || typeof api.search !== 'function') {
      showStatus('未找到 flymd-RAG 插件（需要安装并启用 flymd-RAG 扩展）', { showDeep: false, showCancel: false })
      return
    }

    // 先读一下配置/状态，给出更靠谱的失败提示（否则用户只看到“0 条”，以为功能坏了）
    try {
      if (typeof api.getConfig === 'function') {
        const cfg = await api.getConfig()
        if (cfg && cfg.enabled === false) {
          showStatus('知识库索引未启用：请到 flymd-RAG 设置开启 enabled，并重建索引', { showDeep: false, showCancel: false })
          return
        }
      }
      if (typeof api.getStatus === 'function') {
        const st = await api.getStatus()
        if (st && typeof st.lastIndexedAt === 'number' && st.lastIndexedAt <= 0) {
          showStatus('知识库索引尚未构建：请到 flymd-RAG 设置执行“重建索引”', { showDeep: false, showCancel: false })
          return
        }
        if (st && typeof st.state === 'string' && st.state !== 'idle') {
          showStatus('知识库正在索引中：请稍后再试', { showDeep: false, showCancel: false })
          return
        }
      }
    } catch {}

    cancelSearch()
    const curToken = ++token
    searching = true
    lastMode = 'semantic'
    lastQuery = query
    items = []
    selected = 0
    showStatus('知识库搜索：搜索中…', { showDeep: false, showCancel: true })
    if (resultsEl) resultsEl.innerHTML = '<div class="quick-search-loading">知识库搜索中…</div>'

    try {
      const hits = await api.search(query, { topK: 20, contextMaxChars: 240 })
      if (curToken !== token) return
      const arr = Array.isArray(hits) ? hits : []
      items = arr.map((h: any) => {
        const filePath = String(h && h.filePath ? h.filePath : '')
        const rel = filePath ? relPathFromRoot(filePath, rootAbs) : String(h && h.relative ? h.relative : '')
        const name = rel ? (rel.split('/').pop() || rel) : (filePath.split(/[\\/]+/).pop() || filePath)
        return {
          kind: 'semantic',
          name,
          path: filePath,
          relPath: rel,
          snippet: String(h && h.snippet ? h.snippet : ''),
          score: h && typeof h.score === 'number' ? h.score : undefined,
          line: h && typeof h.startLine === 'number' ? h.startLine : undefined,
        }
      })
      showStatus(`知识库搜索：完成（${items.length} 条）`, { showDeep: false, showCancel: false })
      render()
    } catch (e) {
      if (curToken !== token) return
      deps.showError('知识库搜索失败', e)
      showStatus('知识库搜索失败（可能未启用/未构建索引）', { showDeep: false, showCancel: false })
      render()
    } finally {
      searching = false
    }
  }

  function bindOnce() {
    if (!panel) return
    if ((panel as any)._bound) return
    ;(panel as any)._bound = true

    // 点击遮罩关闭
    panel.addEventListener('click', (e) => {
      if (e.target === panel) hide()
    })

    // 输入过滤（只影响文件名模式；全文/语义只展示提示）
    inputEl?.addEventListener('input', () => {
      selected = 0
      // 只要用户改了输入，就立刻取消正在进行的扫描/检索，避免后台白跑
      cancelSearch()
      render()
    })

    // “知识库”按钮不做开关：它只是语义模式的标签（避免“能开能关”制造假复杂度）

    // 深度搜索按钮
    deepBtn?.addEventListener('click', () => {
      const parsed = parseQuickSearchInput(inputEl?.value || '')
      if (parsed.mode !== 'fulltext') return
      if (!parsed.query) return
      void runFulltextDeep(parsed.query)
    })

    // 取消按钮
    cancelBtn?.addEventListener('click', () => {
      cancelSearch()
      showStatus('已取消', { showDeep: false, showCancel: false })
    })

    // 键盘导航
    inputEl?.addEventListener('keydown', (e) => {
      const nodes = resultsEl?.querySelectorAll('.quick-search-item') || []
      const parsed = parseQuickSearchInput(inputEl?.value || '')

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        selected = Math.min(selected + 1, nodes.length - 1)
        render()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        selected = Math.max(selected - 1, 0)
        render()
        return
      }
      if (e.key === 'Escape') {
        hide()
        return
      }
      if (e.key !== 'Enter') return

      e.preventDefault()
      // 默认：回车打开
      if (parsed.mode === 'file') {
        const selectedEl = nodes[selected] as HTMLElement
        selectedEl?.click()
        return
      }

      // 全文/语义：第一次回车=执行检索；结果出来后再次回车=打开
      if (!parsed.query) return
      const isSame = parsed.mode === lastMode && parsed.query === lastQuery
      const hasResults = (items || []).length > 0
      if (isSame && hasResults && !searching) {
        const selectedEl = nodes[selected] as HTMLElement
        selectedEl?.click()
        return
      }
      if (parsed.mode === 'fulltext') {
        void runFulltextFast(parsed.query)
      } else {
        void runSemantic(parsed.query)
      }
    })
  }

  async function show() {
    if (!panel) {
      panel = document.createElement('div')
      panel.className = 'quick-search-overlay'
      panel.innerHTML = `
        <div class="quick-search-dialog">
          <div class="quick-search-bar">
            <input type="text" class="quick-search-input" placeholder="搜索文件名…（:全文  ::知识库搜索）" />
            <button type="button" class="quick-search-cloud-btn">知识库</button>
          </div>
          <div class="quick-search-status hidden">
            <span class="quick-search-status-text"></span>
            <button type="button" class="quick-search-action-btn quick-search-deep-btn hidden">继续深度搜索</button>
            <button type="button" class="quick-search-action-btn quick-search-cancel-btn hidden">取消</button>
          </div>
          <div class="quick-search-results"></div>
        </div>
      `
      document.body.appendChild(panel)
      inputEl = panel.querySelector('.quick-search-input') as HTMLInputElement
      resultsEl = panel.querySelector('.quick-search-results') as HTMLDivElement
      cloudBtn = panel.querySelector('.quick-search-cloud-btn') as HTMLButtonElement
      statusEl = panel.querySelector('.quick-search-status') as HTMLDivElement
      statusTextEl = panel.querySelector('.quick-search-status-text') as HTMLSpanElement
      deepBtn = panel.querySelector('.quick-search-deep-btn') as HTMLButtonElement
      cancelBtn = panel.querySelector('.quick-search-cancel-btn') as HTMLButtonElement
      bindOnce()
    }

    cancelSearch()
    files = []
    rootAbs = ''
    items = []
    selected = 0
    lastMode = 'file'
    lastQuery = ''
    fulltextScannedLines = new Map()
    fulltextHitPaths = new Set()
    fulltextFastStopped = false

    if (inputEl) inputEl.value = ''
    if (resultsEl) resultsEl.innerHTML = '<div class="quick-search-loading">加载中...</div>'
    hideStatus()
    panel.classList.add('show')
    setTimeout(() => inputEl?.focus(), 50)

    const root = await deps.getLibraryRoot()
    if (!root) {
      hide()
      deps.showError('请先选择库目录')
      return
    }
    rootAbs = root
    files = await listAllFiles(root)
    render()
  }

  function hide() {
    cancelSearch()
    panel?.classList.remove('show')
  }

  return {
    show,
    hide,
  }
}
