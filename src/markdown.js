// Renderizador intencionalmente limitado: no acepta HTML, enlaces ni imágenes del usuario.
// Así los fragmentos de código se pueden compartir sin ejecutar contenido ajeno.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
export function safeHttpsUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}
function inline(text) {
  return String(text).split(/(`[^`\n]+`)/g).map(part => part.startsWith('`') && part.endsWith('`')
    ? `<code>${escapeHtml(part.slice(1, -1))}</code>` : escapeHtml(part).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')).join('');
}
const tokenPattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b(?:abstract|async|await|boolean|break|case|catch|class|const|continue|def|delete|do|else|enum|export|extends|false|final|finally|for|from|function|if|import|in|int|interface|let|new|null|package|private|protected|public|return|select|static|super|switch|this|throw|true|try|type|update|var|void|while|with|yield)\b)/g;
function highlight(code) {
  let result = '', start = 0;
  tokenPattern.lastIndex = 0;
  for (const match of String(code).matchAll(tokenPattern)) {
    result += escapeHtml(code.slice(start, match.index));
    const value = match[0];
    const kind = /^(\/\/|\/\*|#)/.test(value) ? 'comment' : /^["'`]/.test(value) ? 'str' : /^\d/.test(value) ? 'num' : 'key';
    result += `<span class="tok-${kind}">${escapeHtml(value)}</span>`;
    start = match.index + value.length;
  }
  return result + escapeHtml(code.slice(start));
}
function plain(text) {
  return String(text).split(/\n{2,}/).map(chunk => {
    const lines = chunk.trim().split('\n');
    if (!lines[0]) return '';
    if (lines.every(line => /^[-*] /.test(line))) return `<ul>${lines.map(line => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
    const heading = /^(#{2,3}) (.+)$/.exec(lines[0]);
    if (heading && lines.length === 1) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
export function renderMarkdown(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const fences = /^```([^\n`]*)\n([\s\S]*?)^```[ \t]*$/gm;
  let html = '', position = 0;
  for (const match of source.matchAll(fences)) {
    html += plain(source.slice(position, match.index));
    const language = match[1].trim().slice(0, 24) || 'código';
    html += `<div class="code-block"><div class="code-header"><span>${escapeHtml(language)}</span><button class="btn btn-small btn-ghost" data-action="copy-code" type="button">Copiar</button></div><pre><code>${highlight(match[2].replace(/\n$/, ''))}</code></pre></div>`;
    position = match.index + match[0].length;
  }
  return html + plain(source.slice(position));
}
