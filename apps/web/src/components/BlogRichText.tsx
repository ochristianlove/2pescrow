import { useLanguage } from "../lib/language";
import { type ReactNode } from "react";
import { mediaUrl } from "../lib/api";

const IMAGE_LINE = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)\s*$/i;
const BARE_IMAGE = /^(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif))(?:\?\S*)?$/i;
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;

function inline(text: string, t: (text: string) => string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(t(text.slice(last, index)));
    nodes.push(
      <a key={`${index}-${match[2]}`} href={match[2]} target="_blank" rel="noreferrer">
        {t(match[1])}
      </a>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(t(text.slice(last)));
  return nodes;
}

function safeSrc(src: string) {
  const resolved = mediaUrl(src);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  return "";
}

function nodeToReact(node: Node, key: string, t: (text: string) => string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return t(node.textContent || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as HTMLElement;
  const kids = Array.from(el.childNodes).map((child, i) => nodeToReact(child, `${key}-${i}`, t));
  switch (el.tagName) {
    case "BR":
      return <br key={key} />;
    case "P":
      return <p key={key}>{kids}</p>;
    case "DIV":
      return <div className="rich-line" key={key}>{kids}</div>;
    case "STRONG":
    case "B":
      return <strong key={key}>{kids}</strong>;
    case "EM":
    case "I":
      return <em key={key}>{kids}</em>;
    case "A": {
      const href = el.getAttribute("href") || "";
      if (!/^https?:\/\//i.test(href)) return <span key={key}>{kids}</span>;
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {kids}
        </a>
      );
    }
    case "IMG": {
      const src = safeSrc(el.getAttribute("src") || "");
      if (!src) return null;
      return <img key={key} src={src} alt={t(el.getAttribute("alt") || "")} />;
    }
    case "FIGURE":
      return (
        <figure className="blog-figure" key={key}>
          {kids}
        </figure>
      );
    case "FIGCAPTION":
      return <figcaption key={key}>{kids}</figcaption>;
    case "H1":
      return <h1 key={key}>{kids}</h1>;
    case "H2":
      return <h2 key={key}>{kids}</h2>;
    case "H3":
      return <h3 key={key}>{kids}</h3>;
    case "UL":
      return <ul key={key}>{kids}</ul>;
    case "OL":
      return <ol key={key}>{kids}</ol>;
    case "LI":
      return <li key={key}>{kids}</li>;
    case "BLOCKQUOTE":
      return <blockquote key={key}>{kids}</blockquote>;
    case "TABLE":
      return <table key={key}>{kids}</table>;
    case "THEAD":
      return <thead key={key}>{kids}</thead>;
    case "TBODY":
      return <tbody key={key}>{kids}</tbody>;
    case "TR":
      return <tr key={key}>{kids}</tr>;
    case "TH":
      return <th key={key}>{kids}</th>;
    case "TD":
      return <td key={key}>{kids}</td>;
    default:
      return <span key={key}>{kids}</span>;
  }
}

function HtmlBody({ html, t }: { html: string; t: (text: string) => string }) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (
    <div className="blog-body">
      {Array.from(doc.body.childNodes).map((node, i) => nodeToReact(node, `b${i}`, t))}
    </div>
  );
}

export function BlogRichText({ body, translate = false }: { body: string; translate?: boolean }) {
  const { t: localize } = useLanguage();
  const t = translate ? localize : (value: string) => value;
  if (/<(p|div|figure|img|h[1-3]|ul|ol|blockquote|strong|b|em|table)\b/i.test(body)) return <HtmlBody html={body} t={t} />;
  const blocks = body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="blog-body">
      {blocks.map((block) => {
        const image = block.match(IMAGE_LINE);
        const bare = block.match(BARE_IMAGE);
        if (image || bare) {
          const src = image ? image[2] : bare?.[1] || "";
          const caption = image?.[1]?.trim();
          return (
            <figure className="blog-figure" key={src + (caption || "")}>
              <img src={src} alt={t(caption || "")} />
              {caption ? <figcaption>{t(caption)}</figcaption> : null}
            </figure>
          );
        }
        return <p key={block.slice(0, 64)}>{inline(block, t)}</p>;
      })}
    </div>
  );
}
