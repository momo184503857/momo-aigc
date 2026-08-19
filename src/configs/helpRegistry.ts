// 帮助文档注册表：helpKey → 文档元信息
// helpKey 是功能与文档之间的唯一标识，业务页面不直接绑定 Markdown 路径
// （见 docs/requirements/Vue3 后台内嵌帮助文档系统方案.md 第五节）
export interface HelpEntry {
  title: string
  /** 相对 docs/help/ 的 Markdown 路径 */
  path: string
}

export const helpRegistry: Record<string, HelpEntry> = {
  'works.gallery': {
    title: '作品库',
    path: 'works/gallery.md',
  },
  'prompt-workshop': {
    title: '提示词工坊',
    path: 'prompt-workshop/home.md',
  },
  'expert': {
    title: '提示词专家',
    path: 'expert/home.md',
  },
}

export function getHelpEntry(key: string | null | undefined): HelpEntry | null {
  if (!key) return null
  return helpRegistry[key] ?? null
}
