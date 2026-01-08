// KaTeX 公式容错：修复“复制粘贴导致的双反斜杠”问题
// 典型症状：用户输入 `\\xrightarrow` / `\\circ` / `\\ce{...}`，KaTeX 会把它当成换行 + 普通文本，导致渲染失败。
// 原则：只做最小、低风险的修复——仅把 `\\<已知宏名>` 归一为 `\<宏名>`，避免影响真正的 `\\` 换行用法。

const FIXABLE_MACROS = new Set<string>([
  // mhchem
  'ce',
  'pu',
  // 反应箭头/符号（常见复制场景）
  'xrightarrow',
  'xleftarrow',
  'xleftrightarrow',
  'rightarrow',
  'leftarrow',
  'leftrightarrow',
  'uparrow',
  'downarrow',
  // 单位/温度常见
  'circ',
  // 文本/字体
  'text',
  'mathrm',
  'mathbf',
  'mathit',
])

export function normalizeKatexLatexForInline(latex: string): string {
  const s = (latex || '').toString()
  if (!s.includes('\\\\')) return s
  // 将 `\\macro` → `\macro`（仅限白名单宏）
  return s.replace(/\\\\([A-Za-z]+)\b/g, (m, name: string) => {
    if (FIXABLE_MACROS.has(name)) return `\\${name}`
    return m
  })
}

