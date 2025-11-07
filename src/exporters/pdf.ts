// src/exporters/pdf.ts
// 使用 html2pdf.js 将指定 DOM 元素导出为 PDF 字节

async function svgToPngDataUrl(svgEl: SVGElement): Promise<string> {
  try {
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svgEl)
    const viewBox = svgEl.getAttribute('viewBox')
    let width = Number(svgEl.getAttribute('width')) || 0
    let height = Number(svgEl.getAttribute('height')) || 0
    if ((!width || !height) && viewBox) {
      const parts = viewBox.split(/\s+/).map(Number)
      if (parts.length === 4) { width = parts[2]; height = parts[3] }
    }
    if (!width || !height) {
      width = (svgEl as any).clientWidth || 800
      height = (svgEl as any).clientHeight || 600
    }
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          try {
            const ratio = img.width > 0 ? Math.min(1, 2000 / img.width) : 1
            const cw = Math.max(1, Math.round(img.width * ratio))
            const ch = Math.max(1, Math.round(img.height * ratio))
            const canvas = document.createElement('canvas')
            canvas.width = cw; canvas.height = ch
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cw,ch)
            ctx.drawImage(img, 0, 0, cw, ch)
            ;(img as any)._dataUrl = canvas.toDataURL('image/png')
            resolve()
          } catch (e) { reject(e) }
        }
        img.onerror = () => reject(new Error('svg -> png 加载失败'))
        img.src = url
      })
      const imgEl: any = (await (async () => { const im = new Image(); im.src = url; return im })())
      return String((imgEl as any)._dataUrl || '')
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (e) {
    console.error('svgToPngDataUrl 失败', e)
    return ''
  }
}

export async function exportPdf(el: HTMLElement, opt?: any): Promise<Uint8Array> {
  const mod: any = await import('html2pdf.js/dist/html2pdf.bundle.min.js')
  const html2pdf: any = (mod && (mod.default || mod)) || mod

  const options = {
    margin: 10, // 单位：mm
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
    ...opt,
  }

  // 克隆并注入基础样式，保证图片不溢出；并将 Mermaid SVG 转为 PNG
  const wrap = document.createElement('div')
  wrap.style.position = 'fixed'
  wrap.style.left = '-10000px'
  wrap.style.top = '0'
  const clone = el.cloneNode(true) as HTMLElement
  const style = document.createElement('style')
  style.textContent = `
    .preview-body img, img { max-width: 100% !important; height: auto !important; }
    figure { max-width: 100% !important; }
  `
  clone.prepend(style)

  // SVG -> IMG(PNG)
  try {
    const svgs = Array.from(clone.querySelectorAll('svg')) as SVGElement[]
    for (const svg of svgs) {
      try {
        const dataUrl = await svgToPngDataUrl(svg)
        if (dataUrl) {
          const img = document.createElement('img')
          img.src = dataUrl
          const vb = svg.getAttribute('viewBox') || ''
          const w = svg.getAttribute('width')
          const h = svg.getAttribute('height')
          if (w) img.setAttribute('width', w)
          if (h) img.setAttribute('height', h)
          if (!w && vb) {
            const parts = vb.split(/\s+/)
            if (parts.length === 4) img.setAttribute('width', parts[2])
            if (parts.length === 4) img.setAttribute('height', parts[3])
          }
          svg.replaceWith(img)
        }
      } catch {}
    }
  } catch {}

    // 先处理 Mermaid：把 code/pre 转为 <div class="mermaid">，并在克隆体内渲染为 SVG
  try {
    // 情况1：<pre><code class="language-mermaid">...</code></pre>
    const codeBlocks = clone.querySelectorAll('pre > code.language-mermaid')
    codeBlocks.forEach((code) => {
      try {
        const pre = code.parentElement as HTMLElement
        const text = code.textContent || ''
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.textContent = text
        pre.replaceWith(div)
      } catch {}
    })
    // 情况2：<pre class="mermaid">...</pre>
    const preMermaid = clone.querySelectorAll('pre.mermaid')
    preMermaid.forEach((pre) => {
      try {
        const text = pre.textContent || ''
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.textContent = text
        pre.replaceWith(div)
      } catch {}
    })
    // 渲染 .mermaid 为 SVG
    const nodes = Array.from(clone.querySelectorAll('.mermaid')) as HTMLElement[]
    if (nodes.length > 0) {
      let mermaid: any
      try { mermaid = (await import('mermaid')).default } catch (e1) { try { mermaid = (await import('mermaid/dist/mermaid.esm.mjs')).default } catch (e2) { mermaid = null } }
      if (mermaid) {
        try {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', logLevel: 'fatal' as any })
        } catch {}
        for (let i = 0; i < nodes.length; i++) {
          const el2 = nodes[i]
          const code = el2.textContent || ''
          try {
            const id = 'pdf-mermaid-' + i + '-' + Date.now()
            const { svg } = await mermaid.render(id, code)
            const wrapSvg = document.createElement('div')
            wrapSvg.innerHTML = svg
            const svgEl = wrapSvg.firstElementChild as SVGElement | null
            if (svgEl) el2.replaceWith(svgEl)
          } catch {}
        }
      }
    }
  } catch {}

  // 将所有 SVG 转为 PNG IMG，再进行 PDF 渲染
  try {
    const svgs = Array.from(clone.querySelectorAll('svg')) as SVGElement[]
    for (const svg of svgs) {
      try {
        const dataUrl = await svgToPngDataUrl(svg)
        if (dataUrl) {
          const img = document.createElement('img')
          img.src = dataUrl
          const vb = svg.getAttribute('viewBox') || ''
          const w = svg.getAttribute('width')
          const h = svg.getAttribute('height')
          if (w) img.setAttribute('width', w)
          if (h) img.setAttribute('height', h)
          if (!w && vb) {
            const parts = vb.split(/\s+/)
            if (parts.length === 4) img.setAttribute('width', parts[2])
            if (parts.length === 4) img.setAttribute('height', parts[3])
          }
          svg.replaceWith(img)
        }
      } catch {}
    }
  } catch {}
wrap.appendChild(clone)
  document.body.appendChild(wrap)
  try {
    const ab: ArrayBuffer = await html2pdf().set(options).from(clone).toPdf().output('arraybuffer')
    return new Uint8Array(ab)
  } finally {
    try { document.body.removeChild(wrap) } catch {}
  }
}

