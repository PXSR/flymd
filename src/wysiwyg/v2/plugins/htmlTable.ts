import { htmlToMarkdown } from '../../../html2md'

export const WYSIWYG_HTML_TABLE_TO_MD_KEY = 'flymd:wysiwyg:htmlTableToMd'

export function isWysiwygHtmlTableToMdEnabled(): boolean {
  try {
    const v = localStorage.getItem(WYSIWYG_HTML_TABLE_TO_MD_KEY)
    if (v == null) return false
    const s = String(v).toLowerCase().trim()
    if (s === '1' || s === 'true' || s === 'on' || s === 'yes') return true
    if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false
  } catch {}
  return false
}

function looksLikeGfmTable(md: string): boolean {
  const lines = String(md || '').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return false
  const head = lines[0]
  const sep = lines[1]
  if (!head.includes('|')) return false
  // | --- | --- | 或 ---|--- 这种都算
  return /(\|\s*:?-{3,}:?\s*){1,}\|?/.test(sep)
}

export type SimpleTable = {
  header: string[] | null
  body: string[][]
}

export function parseSimpleHtmlTable(html: string): SimpleTable | null {
  const raw = String(html || '')
  const trimmed = raw.trim()
  if (!/^<table\b/i.test(trimmed) || !/<\/table>\s*$/i.test(trimmed)) return null

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(`<!doctype html><meta charset="utf-8">${trimmed}`, 'text/html')
  } catch {
    return null
  }
  const table = doc.querySelector('table')
  if (!table) return null

  // Markdown 表格无法表达 rowspan/colspan，遇到就别“聪明”了，直接不转换。
  if (table.querySelector('[rowspan], [colspan]')) return null
  // 避免嵌套表格把结构搞乱
  if (table.querySelector('table table')) return null

  const rows: Element[] = []
  const thead = table.querySelector('thead')
  const tbody = table.querySelector('tbody')
  const tfoot = table.querySelector('tfoot')
  const collectRows = (scope: Element | null) => {
    if (!scope) return
    for (const tr of Array.from(scope.querySelectorAll(':scope > tr'))) rows.push(tr)
  }
  if (thead) collectRows(thead)
  if (tbody) collectRows(tbody)
  if (tfoot) collectRows(tfoot)
  if (!thead && !tbody && !tfoot) collectRows(table)
  if (!rows.length) return null

  const grid: { cells: string[], hasTh: boolean }[] = rows.map((tr) => {
    const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH') as Element[]
    const texts = cells.map((c) => {
      const t = (c.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
      // 单元格内的 | 会破坏 Markdown 表格
      return t.replace(/\|/g, '\\|')
    })
    return { cells: texts, hasTh: cells.some(c => c.tagName === 'TH') }
  })

  const headerRowIdx = (() => {
    if (thead) return 0
    for (let i = 0; i < grid.length; i++) if (grid[i].hasTh) return i
    return -1
  })()

  const header = headerRowIdx >= 0 ? grid[headerRowIdx].cells : null
  const body = grid
    .filter((_, i) => i !== headerRowIdx)
    .map(r => r.cells)
    .filter(r => r.length > 0)

  const head = (header && header.length) ? header : (grid[0]?.cells || [])
  if (!head.length) return null

  // 归一化列数：不足补空，超出截断（保证输出稳定）
  const colCount = head.length
  const norm = (r: string[]) => {
    const out = r.slice(0, colCount)
    while (out.length < colCount) out.push('')
    return out
  }

  return { header: norm(head), body: body.map(norm) }
}

export function createSafeTableElement(t: SimpleTable): HTMLTableElement {
  const table = document.createElement('table')
  const thead = document.createElement('thead')
  const tbody = document.createElement('tbody')

  const headRow = document.createElement('tr')
  for (const cell of (t.header || [])) {
    const th = document.createElement('th')
    th.textContent = cell
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  for (const row of t.body) {
    const tr = document.createElement('tr')
    for (const cell of row) {
      const td = document.createElement('td')
      td.textContent = cell
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  return table
}

function convertOneHtmlTable(html: string): string | null {
  const parsed = parseSimpleHtmlTable(html)
  if (!parsed) return null

  let md = ''
  try {
    md = htmlToMarkdown(html)
  } catch {
    md = ''
  }
  md = String(md || '').trimEnd()
  if (!looksLikeGfmTable(md)) return null
  return md
}

// 将 Markdown 里的 <table>...</table> HTML 块转换为 GFM 表格
// 目的：让 Milkdown 的表格节点接管，从而获得“所见可编辑”的表格体验。
export function maybeConvertHtmlTableBlocksToGfm(md: string): string {
  if (!isWysiwygHtmlTableToMdEnabled()) return md

  const src = String(md || '').replace(/\r\n?/g, '\n')
  if (!src.includes('<table')) return md

  const lines = src.split('\n')
  const out: string[] = []
  let inFence = false
  let fenceCh = ''
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      const marker = fence[1]
      if (!inFence) {
        inFence = true
        fenceCh = marker[0]
        fenceLen = marker.length
      } else if (marker[0] === fenceCh && marker.length >= fenceLen) {
        inFence = false
        fenceCh = ''
        fenceLen = 0
      }
      out.push(line)
      continue
    }

    if (inFence) {
      out.push(line)
      continue
    }

    if (/^\s*<table\b/i.test(line)) {
      const buf: string[] = [line]
      let foundEnd = /<\/table>/i.test(line)
      while (!foundEnd && i + 1 < lines.length) {
        i++
        const l2 = lines[i]
        buf.push(l2)
        if (/<\/table>/i.test(l2)) foundEnd = true
      }
      if (!foundEnd) {
        out.push(...buf)
        continue
      }

      const html = buf.join('\n')
      const converted = convertOneHtmlTable(html)
      if (!converted) {
        out.push(...buf)
        continue
      }

      out.push(...converted.split('\n'))
      continue
    }

    out.push(line)
  }

  return out.join('\n')
}

