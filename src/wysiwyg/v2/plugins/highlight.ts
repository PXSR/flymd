// 代码块语法高亮 NodeView：使用 highlight.js 为非 mermaid 代码块添加高亮
// 采用 overlay 方式：contentDOM 保持纯文本可编辑，下方叠加高亮显示层
import type { Node } from '@milkdown/prose/model'
import type { EditorView, NodeView } from '@milkdown/prose/view'

// 高亮代码块 NodeView
export class HighlightCodeBlockNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private highlightLayer: HTMLElement
  private codeWrapper: HTMLElement
  private node: Node
  private lastCode: string = ''
  private highlightTimer: number | null = null

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node
    const lang = node.attrs.language || ''

    // 创建 <pre> 容器
    this.dom = document.createElement('pre')
    this.dom.classList.add('code-block-wrapper')
    if (lang) {
      this.dom.setAttribute('data-language', lang)
    }

    // 创建一个内部包装器，用于精确对齐两个层
    this.codeWrapper = document.createElement('div')
    this.codeWrapper.classList.add('code-layers')
    this.codeWrapper.style.position = 'relative'
    this.dom.appendChild(this.codeWrapper)

    // 创建高亮显示层（只读，显示高亮后的代码）
    // 放在底层，contentDOM 透明覆盖在上面
    this.highlightLayer = document.createElement('code')
    this.highlightLayer.classList.add('highlight-layer')
    if (lang) {
      this.highlightLayer.classList.add(`language-${lang}`)
    }
    this.highlightLayer.style.display = 'block'
    this.highlightLayer.style.whiteSpace = 'pre'
    this.highlightLayer.style.pointerEvents = 'none'
    this.codeWrapper.appendChild(this.highlightLayer)

    // 创建 <code> 作为 contentDOM（ProseMirror 可编辑区域）
    // 绝对定位覆盖在 highlightLayer 上方
    this.contentDOM = document.createElement('code')
    this.contentDOM.classList.add('editable-layer')
    if (lang) {
      this.contentDOM.classList.add(`language-${lang}`)
    }
    // 编辑层样式：文字透明，只显示光标，绝对定位完全覆盖高亮层
    this.contentDOM.style.position = 'absolute'
    this.contentDOM.style.top = '0'
    this.contentDOM.style.left = '0'
    this.contentDOM.style.right = '0'
    this.contentDOM.style.bottom = '0'
    this.contentDOM.style.display = 'block'
    this.contentDOM.style.color = 'transparent'
    this.contentDOM.style.caretColor = 'var(--fg, #d4d4d4)'
    this.contentDOM.style.whiteSpace = 'pre'
    this.contentDOM.style.background = 'transparent'
    this.contentDOM.style.margin = '0'
    this.contentDOM.style.padding = '0'
    this.codeWrapper.appendChild(this.contentDOM)

    // 初始高亮（延迟执行，等待 ProseMirror 填充内容）
    requestAnimationFrame(() => {
      this.scheduleHighlight()
    })
  }

  private scheduleHighlight() {
    // 防抖：100ms 内多次调用只执行一次
    if (this.highlightTimer !== null) {
      window.clearTimeout(this.highlightTimer)
    }
    this.highlightTimer = window.setTimeout(() => {
      this.highlightTimer = null
      this.doHighlight()
    }, 100)
  }

  private async doHighlight() {
    try {
      const code = this.contentDOM.textContent || ''
      console.log('[Highlight Plugin] doHighlight 被调用, code length:', code.length)

      // 如果代码没变化，跳过高亮
      if (code === this.lastCode) {
        console.log('[Highlight Plugin] 代码未变化，跳过')
        return
      }
      this.lastCode = code

      if (!code.trim()) {
        this.highlightLayer.innerHTML = ''
        return
      }

      const lang = this.node.attrs.language || ''
      console.log('[Highlight Plugin] 语言:', lang)

      const hljs = await import('highlight.js')
      console.log('[Highlight Plugin] highlight.js 已加载')

      let result: { value: string }
      if (lang && hljs.default.getLanguage(lang)) {
        result = hljs.default.highlight(code, { language: lang, ignoreIllegals: true })
        console.log('[Highlight Plugin] 使用指定语言高亮')
      } else {
        result = hljs.default.highlightAuto(code)
        console.log('[Highlight Plugin] 使用自动检测高亮')
      }

      // 将高亮结果应用到显示层（不影响 contentDOM）
      this.highlightLayer.innerHTML = result.value
      console.log('[Highlight Plugin] 高亮完成, HTML length:', result.value.length)
    } catch (e) {
      // 高亮失败时显示原始代码
      console.error('[Highlight Plugin] 高亮失败:', e)
      this.highlightLayer.textContent = this.contentDOM.textContent || ''
    }
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false

    // 更新语言属性
    const oldLang = this.node.attrs.language || ''
    const newLang = node.attrs.language || ''
    if (oldLang !== newLang) {
      if (newLang) {
        this.dom.setAttribute('data-language', newLang)
        this.contentDOM.className = `editable-layer language-${newLang}`
        this.highlightLayer.className = `highlight-layer language-${newLang}`
      } else {
        this.dom.removeAttribute('data-language')
        this.contentDOM.className = 'editable-layer'
        this.highlightLayer.className = 'highlight-layer'
      }
    }

    this.node = node

    // 检查代码是否变化，触发重新高亮
    const newCode = this.contentDOM.textContent || ''
    if (newCode !== this.lastCode) {
      this.scheduleHighlight()
    }

    return true
  }

  ignoreMutation(mutation: MutationRecord) {
    // 忽略高亮层的任何变化
    if (mutation.target === this.highlightLayer || this.highlightLayer.contains(mutation.target as globalThis.Node)) {
      return true
    }
    // contentDOM 的变化需要通知 ProseMirror
    return false
  }

  destroy() {
    if (this.highlightTimer !== null) {
      window.clearTimeout(this.highlightTimer)
      this.highlightTimer = null
    }
  }
}
