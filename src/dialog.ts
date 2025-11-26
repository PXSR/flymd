/**
 * 自定义三按钮确认对话框
 */

// 对话框返回值类型
export type DialogResult = 'save' | 'discard' | 'cancel'

// 对话框样式
const dialogStyles = `
.custom-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  backdrop-filter: blur(4px);
  animation: dialogFadeIn 0.15s ease;
}

@keyframes dialogFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.custom-dialog-box {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
  animation: dialogSlideIn 0.2s ease;
}

@keyframes dialogSlideIn {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.custom-dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--fg);
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-dialog-icon {
  font-size: 24px;
}

.custom-dialog-message {
  font-size: 14px;
  color: var(--fg);
  opacity: 0.85;
  line-height: 1.6;
  margin: 0 0 24px 0;
  white-space: pre-line;
}

.custom-dialog-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.custom-dialog-button {
  -webkit-app-region: no-drag;
  cursor: pointer;
  border: 1px solid var(--border);
  background: rgba(127, 127, 127, 0.08);
  color: var(--fg);
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s ease;
  min-width: 100px;
}

.custom-dialog-button:hover {
  background: rgba(127, 127, 127, 0.15);
  border-color: rgba(127, 127, 127, 0.35);
}

.custom-dialog-button:active {
  transform: scale(0.97);
}

.custom-dialog-button.primary {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}

.custom-dialog-button.primary:hover {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.custom-dialog-button.danger {
  background: #dc2626;
  color: white;
  border-color: #dc2626;
}

.custom-dialog-button.danger:hover {
  background: #b91c1c;
  border-color: #b91c1c;
}

.custom-dialog-button:focus {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
`

// 注入样式到页面
function injectStyles() {
  const styleId = 'custom-dialog-styles'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = dialogStyles
    document.head.appendChild(style)
  }
}

/**
 * 显示三按钮确认对话框
 * @param message 对话框消息
 * @param title 对话框标题
 * @returns Promise<DialogResult> - 'save': 保存并退出, 'discard': 直接退出, 'cancel': 取消
 */
export function showThreeButtonDialog(
  message: string,
  title: string = '退出确认'
): Promise<DialogResult> {
  return new Promise((resolve) => {
    // 注入样式
    injectStyles()

    // 创建对话框 DOM
    const overlay = document.createElement('div')
    overlay.className = 'custom-dialog-overlay'

    const box = document.createElement('div')
    box.className = 'custom-dialog-box'

    const titleEl = document.createElement('div')
    titleEl.className = 'custom-dialog-title'
    titleEl.innerHTML = `<span class="custom-dialog-icon">ℹ️</span>${title}`

    const messageEl = document.createElement('div')
    messageEl.className = 'custom-dialog-message'
    messageEl.textContent = message

    const buttonsContainer = document.createElement('div')
    buttonsContainer.className = 'custom-dialog-buttons'

    // 创建三个按钮
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'custom-dialog-button'
    cancelBtn.textContent = '取消'
    cancelBtn.onclick = () => {
      closeDialog('cancel')
    }

    const discardBtn = document.createElement('button')
    discardBtn.className = 'custom-dialog-button danger'
    discardBtn.textContent = '直接退出'
    discardBtn.onclick = () => {
      closeDialog('discard')
    }

    const saveBtn = document.createElement('button')
    saveBtn.className = 'custom-dialog-button primary'
    saveBtn.textContent = '保存并退出'
    saveBtn.onclick = () => {
      closeDialog('save')
    }

    buttonsContainer.appendChild(cancelBtn)
    buttonsContainer.appendChild(discardBtn)
    buttonsContainer.appendChild(saveBtn)

    box.appendChild(titleEl)
    box.appendChild(messageEl)
    box.appendChild(buttonsContainer)
    overlay.appendChild(box)

    // 添加到页面
    document.body.appendChild(overlay)

    // 聚焦到保存按钮（默认操作）
    setTimeout(() => saveBtn.focus(), 50)

    // 关闭对话框的函数
    function closeDialog(result: DialogResult) {
      overlay.style.animation = 'dialogFadeIn 0.1s ease reverse'
      setTimeout(() => {
        overlay.remove()
        resolve(result)
      }, 100)
    }

    // 点击遮罩层关闭（视为取消）
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        closeDialog('cancel')
      }
    }

    // ESC 键取消
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDialog('cancel')
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
  })
}
