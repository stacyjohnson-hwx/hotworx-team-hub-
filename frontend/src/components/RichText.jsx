import { useRef, useEffect } from 'react'
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Link2 } from 'lucide-react'

// Shared lightweight rich-text editor + safe renderer.
// Stores HTML. The renderer sanitizes before output because event
// descriptions are shown on the PUBLIC (no-auth) calendar.

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'A', 'SPAN'])

function scrub(node) {
  // Iterate over a static copy because we mutate the tree as we go.
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) { child.remove(); continue }      // comments
    if (child.nodeType !== 1) continue                          // keep text
    if (!ALLOWED.has(child.tagName)) {                          // unwrap unknown tags
      child.replaceWith(...child.childNodes)
      continue
    }
    for (const attr of [...child.attributes]) {
      const name = attr.name.toLowerCase()
      if (child.tagName === 'A' && name === 'href') {
        if (/^\s*javascript:/i.test(attr.value)) child.removeAttribute('href')
      } else {
        child.removeAttribute(attr.name)
      }
    }
    if (child.tagName === 'A') {
      child.setAttribute('target', '_blank')
      child.setAttribute('rel', 'noreferrer')
    }
    scrub(child)
  }
}

// Pass stored HTML through (sanitized); convert legacy plain text to <br>s.
export function renderRichText(content) {
  if (!content) return ''
  const hasTags = /<[a-z][\s\S]*>/i.test(content)
  const html = hasTags
    ? content
    : content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  if (typeof document === 'undefined') return hasTags ? '' : html  // SSR guard
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  scrub(tpl.content)
  return tpl.innerHTML
}

export function RichTextEditor({ value, onChange, minHeight = 140 }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.innerHTML = value || '' }, []) // init once
  const sync = () => onChange(ref.current?.innerHTML || '')
  const exec = (cmd, arg) => { document.execCommand(cmd, false, arg); ref.current?.focus(); sync() }
  const addLink = () => { const url = prompt('Link URL:'); if (url) exec('createLink', url.startsWith('http') ? url : `https://${url}`) }
  const Btn = ({ onClick, title, children }) => (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick} title={title}
      className="px-2 py-1 rounded hover:bg-gray-200 text-gray-600">{children}</button>
  )
  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <Btn onClick={() => exec('bold')} title="Bold"><Bold size={14} /></Btn>
        <Btn onClick={() => exec('italic')} title="Italic"><Italic size={14} /></Btn>
        <Btn onClick={() => exec('underline')} title="Underline"><Underline size={14} /></Btn>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <Btn onClick={() => exec('formatBlock', '<h2>')} title="Heading"><Heading2 size={14} /></Btn>
        <Btn onClick={() => exec('insertUnorderedList')} title="Bullet list"><List size={14} /></Btn>
        <Btn onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered size={14} /></Btn>
        <Btn onClick={addLink} title="Add link"><Link2 size={14} /></Btn>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={sync} onBlur={sync}
        style={{ minHeight }}
        className="rich-content overflow-y-auto px-4 py-3 text-sm text-gray-800 focus:outline-none" />
    </div>
  )
}
