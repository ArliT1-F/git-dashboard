/**
 * The profile README is injected with `dangerouslySetInnerHTML`, so it gets
 * scrubbed before it ever touches the DOM.
 *
 * GitHub already sanitises the markup it renders, but the dashboard should not
 * depend on that: this strips anything executable, blocks `javascript:` URLs
 * and neutralises third-party styles, while keeping the badges, images and
 * tables that make a profile README useful.
 */

const BLOCKED_ELEMENTS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta',
  'style',
  'base',
  'noscript',
  'template',
].join(',')

const DANGEROUS_URL_PATTERN = /^\s*(?:javascript|vbscript|data:text\/html)/i

/** Regex fallback for environments without `DOMParser` (e.g. unit tests). */
export const stripDangerousHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(iframe|object|embed|form|style|link|meta|base)[\s\S]*?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(["']?)\s*(?:javascript|vbscript):[^"'\s>]*\1/gi, '')

export const sanitizeReadmeHtml = (html: string | null | undefined): string | null => {
  if (!html) return null

  if (typeof DOMParser === 'undefined') {
    const stripped = stripDangerousHtml(html)
    return stripped.trim().length > 0 ? stripped : null
  }

  const document_ = new DOMParser().parseFromString(html, 'text/html')
  document_.querySelectorAll(BLOCKED_ELEMENTS).forEach((element) => element.remove())

  document_.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()

      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (name === 'style' && /expression\s*\(|url\(\s*['"]?\s*javascript/i.test(attribute.value)) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (
        (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'srcset') &&
        DANGEROUS_URL_PATTERN.test(attribute.value)
      ) {
        element.removeAttribute(attribute.name)
      }
    }

    const tag = element.tagName.toLowerCase()

    if (tag === 'a') {
      const href = element.getAttribute('href')
      if (href && /^https?:/i.test(href)) {
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noopener noreferrer nofollow')
      }
    }

    if (tag === 'img') {
      element.setAttribute('loading', 'lazy')
      element.setAttribute('decoding', 'async')
      element.setAttribute('referrerpolicy', 'no-referrer')
      if (!element.getAttribute('alt')) {
        element.setAttribute('alt', '')
      }
    }
  })

  const cleaned = document_.body.innerHTML.trim()
  return cleaned.length > 0 ? cleaned : null
}
