function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function linkify(text: string) {
  const link = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
  let html = "";
  let last = 0;
  for (const match of text.matchAll(link)) {
    const index = match.index ?? 0;
    html += escapeText(text.slice(last, index));
    html += `<a href="${match[2]}" target="_blank" rel="noreferrer">${escapeText(match[1])}</a>`;
    last = index + match[0].length;
  }
  html += escapeText(text.slice(last));
  return html;
}

/** Turns an older plain-text post into editor HTML. Leaves an already visual post alone. */
export function toEditorHtml(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (/<(p|div|br|figure|img|h[1-3]|ul|ol|blockquote|strong|b|em|i|a|table|span)\b/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\n\s*\n/)
    .map((block) => {
      const image = block.trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)\s*$/i);
      if (!image) return `<p>${linkify(block.trim())}</p>`;
      const caption = image[1].trim();
      return `<figure><img src="${image[2]}" alt="${escapeText(caption)}">${caption ? `<figcaption>${escapeText(caption)}</figcaption>` : ""}</figure>`;
    })
    .join("");
}

export function plainText(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function editorIsEmpty(html: string) {
  const text = html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  return text.length < 20 && !/<img\b/i.test(html);
}
