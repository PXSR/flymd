// 所见模式 V2：基于 Milkdown 的真实所见编辑视图
// 暴露 enable/disable 与 setMarkdown/getMarkdown 能力，供主流程挂接

import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { automd } from '@milkdown/plugin-automd'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { upload, uploadConfig } from '@milkdown/plugin-upload'
import { uploader } from './plugins/paste'
// 注：保留 automd 插件以提供编辑功能，通过 CSS 隐藏其 UI 组件
// 引入富文本所见视图的必要样式（避免工具条/布局错乱导致不可编辑/不可滚动）
// 注：不直接导入 @milkdown/crepe/style.css，避免 Vite 对未导出的样式路径解析失败。

let _editor: Editor | null = null
let _root: HTMLElement | null = null
let _onChange: ((md: string) => void) | null = null
let _suppressInitialUpdate = false
let _lastMd = ''

export async function enableWysiwygV2(root: HTMLElement, initialMd: string, onChange: (md: string) => void) {
  // 规范化内容：空内容也是合法的（新文档或空文档）
  const content = (initialMd || '').toString()
  console.log('[WYSIWYG V2] enableWysiwygV2 called, content length:', content.length)

  // 总是先销毁旧编辑器，确保干净的状态
  await disableWysiwygV2()
  _root = root
  _onChange = onChange
  _suppressInitialUpdate = true
  _lastMd = content

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, _lastMd)
      // 配置编辑器视图选项，确保可编辑
      ctx.set(editorViewOptionsCtx, { editable: () => true })
      // 配置上传：接入现有图床上传逻辑，同时允许从 HTML 粘贴的文件触发上传
      try {
        ctx.update(uploadConfig.key, (prev) => ({
          ...prev,
          uploader,
          enableHtmlFileUploader: true,
        }))
      } catch {}
    })
    .use(commonmark)
    .use(gfm)
    .use(automd)
    .use(listener)
    .use(upload)
    .create()
  // 初次渲染后聚焦
  try {
    const view = (editor as any).ctx.get(editorViewCtx)
    requestAnimationFrame(() => { try { view?.focus() } catch {} })
  } catch {}
  // 成功创建后清理占位文案（仅移除纯文本节点，不影响编辑器 DOM）
  try {
    if (_root && _root.firstChild && (_root.firstChild as any).nodeType === 3) {
      _root.removeChild(_root.firstChild)
    }
  } catch {}
  // 兜底：确保编辑区可见且占满容器
  try {
    const pm = _root?.querySelector('.ProseMirror') as HTMLElement | null
    if (pm) {
      pm.style.display = 'block'
      pm.style.minHeight = '100%'
      pm.style.width = '100%'
    }
    const host = _root?.firstElementChild as HTMLElement | null
    if (host) {
      host.style.display = host.style.display || 'block'
      host.style.minHeight = host.style.minHeight || '100%'
      host.style.width = host.style.width || '100%'
    }
  } catch {}
  // 监听内容更新并回写给外层（用于保存与切回源码视图）
  try {
    const ctx = (editor as any).ctx
    const lm = ctx.get(listenerCtx)
    lm.markdownUpdated((_ctx, markdown) => {
      if (_suppressInitialUpdate) return
      _lastMd = markdown
      try { _onChange?.(markdown) } catch {}
    })
  } catch {}
  _suppressInitialUpdate = false
  _editor = editor
}

export async function disableWysiwygV2() {
  if (_editor) {
    try { await _editor.destroy() } catch {}
    _editor = null
  }
  if (_root) {
    try { _root.innerHTML = '' } catch {}
    _root = null
  }
  _onChange = null
}

export function isWysiwygV2Enabled(): boolean { return !!_editor }
