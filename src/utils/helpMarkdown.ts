// 帮助文档 Markdown 渲染管线（HelpRenderer 专用）
// 约定（方案第八节）：
// - html: false —— 不执行文档内联 HTML，嵌入视频走受控的 ```video 围栏语法
// - 相对资源路径（图片/视频/链接）按文档自身 URL 解析
// - 标题自动生成 id 锚点，供后续字段级帮助 / 帮助中心跳转
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,
  linkify: true,
})

interface HelpEnv {
  /** 文档自身 URL，如 /docs/works/gallery.md；Markdown 内相对路径以它为基准 */
  baseUrl?: string
}

function resolveUrl(href: string, baseUrl: string | undefined): string {
  if (!baseUrl) return href
  // 绝对地址 / 站内根路径 / 锚点原样保留
  if (/^(https?:|data:|mailto:|tel:|#|\/)/i.test(href)) return href
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  try {
    return new URL(href, new URL(baseUrl, origin)).pathname
  } catch {
    return href
  }
}

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      // 保留中英文与数字（\p{Letter} 覆盖 CJK），其余符号丢弃
      .replace(/[^\p{Letter}\p{Number}\s-]+/gu, '')
      .replace(/\s+/g, '-')
  )
}

function inlineText(token: { children?: { content: string }[] | null } | undefined): string {
  return (token?.children ?? []).map((t) => t.content).join('')
}

function attrString(token: { attrGet(name: string): string | number | null }, name: string): string {
  const value = token.attrGet(name)
  return value == null ? '' : String(value)
}

// 标题锚点
md.renderer.rules.heading_open = (tokens, idx, _options, _env, self) => {
  const id = slugify(inlineText(tokens[idx + 1]))
  if (id) tokens[idx].attrSet('id', id)
  return self.renderToken(tokens, idx, _options)
}

// 链接：解析相对路径 + 统一新窗口打开
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = attrString(tokens[idx], 'href')
  tokens[idx].attrSet('href', resolveUrl(href, (env as HelpEnv).baseUrl))
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, idx, options)
}

// 图片：解析相对路径
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const src = attrString(tokens[idx], 'src')
  tokens[idx].attrSet('src', resolveUrl(src, (env as HelpEnv).baseUrl))
  return self.renderToken(tokens, idx, options)
}

// 视频围栏：```video 后跟一行相对/绝对地址，渲染为受控 <video>（强制 controls + muted）
const defaultFence =
  md.renderer.rules.fence ??
  ((tokens, idx, options) => md.renderer.renderToken(tokens, idx, options))

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = (token.info || '').trim().split(/\s+/)[0]
  if (info === 'video') {
    const src = resolveUrl(token.content.trim(), (env as HelpEnv).baseUrl)
    return `<video class="help-video" controls muted playsinline preload="metadata"><source src="${md.utils.escapeHtml(src)}"></video>\n`
  }
  return defaultFence(tokens, idx, options, env, self)
}

export function renderHelpMarkdown(source: string, baseUrl: string): string {
  return md.render(source, { baseUrl })
}
