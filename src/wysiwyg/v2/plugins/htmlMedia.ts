import { $view } from '@milkdown/utils'
import { htmlSchema } from '@milkdown/preset-commonmark'
import type { Node } from '@milkdown/prose/model'
import type { EditorView, NodeView } from '@milkdown/prose/view'
import { createSafeTableElement, parseSimpleHtmlTable } from './htmlTable'

class HtmlMediaNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement | null

  constructor(node: Node, _view: EditorView, _getPos: () => number | undefined) {
    const span = document.createElement('span')
    span.dataset.type = 'html'
    this.contentDOM = null

    let value = ''
    try {
      value = String((node.attrs as any)?.value || '')
    } catch {
      value = ''
    }

    try {
      span.dataset.value = value
    } catch {}

    const trimmed = value.trim()

    try {
      if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
        span.style.display = 'none'
        this.dom = span
        return
      }

      const isImgTag =
        /^<img\b[^>]*>$/i.test(trimmed) ||
        /^<img\b[^>]*\/>$/i.test(trimmed)

      if (isImgTag) {
        const img = document.createElement('img')

        const srcMatch = trimmed.match(/\ssrc\s*=\s*(['"])(.*?)\1/i)
        const altMatch = trimmed.match(/\salt\s*=\s*(['"])(.*?)\1/i)
        const titleMatch = trimmed.match(/\stitle\s*=\s*(['"])(.*?)\1/i)

        const rawSrc = srcMatch && srcMatch[2] ? srcMatch[2] : ''
        if (rawSrc) {
          img.src = rawSrc
          try {
            img.setAttribute('data-raw-src', rawSrc)
          } catch {}
        }

        if (altMatch && altMatch[2]) {
          img.alt = altMatch[2]
        }
        if (titleMatch && titleMatch[2]) {
          img.title = titleMatch[2]
        }

        img.addEventListener('dblclick', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })

        span.appendChild(img)
        this.dom = span
        return
      }

      const isTableTag = /^<table\b[\s\S]*<\/table>\s*$/i.test(trimmed)
      if (isTableTag) {
        const parsed = parseSimpleHtmlTable(trimmed)
        if (parsed) {
          try {
            const table = createSafeTableElement(parsed)
            span.appendChild(table)
            this.dom = span
            return
          } catch { /* fallthrough */ }
        }
      }

      span.textContent = value
      this.dom = span
    } catch {
      span.textContent = value
      this.dom = span
    }
  }

  ignoreMutation() {
    return true
  }
}

export const htmlMediaPlugin = $view(htmlSchema.node, () => {
  return (node, view, getPos) => {
    return new HtmlMediaNodeView(node, view, getPos as () => number | undefined)
  }
})
