function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const safeHref = String(href).replace(/"/g, '%22');
    return `<a href="${safeHref}">${escapeHtml(String(label))}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

function renderMarkdownBody(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    parts.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    parts.push(`<ul>${listItems.map((li) => `<li>${inlineMarkdown(li)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [head, ...body] = tableRows;
    const thead = head
      ? `<thead><tr>${head.map((c) => `<th>${inlineMarkdown(c)}</th>`).join('')}</tr></thead>`
      : '';
    const tbody = body.length
      ? `<tbody>${body
          .map((row) => `<tr>${row.map((c) => `<td>${inlineMarkdown(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody>`
      : '';
    parts.push(`<table>${thead}${tbody}</table>`);
    tableRows = [];
    inTable = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('|') && line.endsWith('|')) {
      flushParagraph();
      flushList();
      inTable = true;
      if (/^\|\s*-/.test(line)) continue;
      tableRows.push(
        line
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim()),
      );
      continue;
    }
    if (inTable) flushTable();

    if (line === '' || line === '---') {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      parts.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      parts.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      parts.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  if (inTable) flushTable();

  return parts.join('\n');
}

export function renderLegalHtml(title: string, markdown: string): string {
  const body = renderMarkdownBody(markdown);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — LoreBook</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.65;
      background: linear-gradient(160deg, #050505 0%, #1a0b2e 55%, #050505 100%);
      color: rgba(255,255,255,0.88);
      min-height: 100vh;
    }
    .wrap { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
    .brand { font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 1rem; }
    h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 1rem; background: linear-gradient(90deg, #c084fc, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    h2 { font-size: 1.25rem; margin: 2rem 0 0.75rem; color: #fff; }
    h3 { font-size: 1.05rem; margin: 1.25rem 0 0.5rem; color: rgba(255,255,255,0.92); }
    p, li { color: rgba(255,255,255,0.78); }
    p { margin: 0.75rem 0; }
    ul { margin: 0.5rem 0 1rem; padding-left: 1.25rem; }
    li { margin: 0.35rem 0; }
    a { color: #c084fc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { color: #fff; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0 1.25rem; font-size: 0.92rem; }
    th, td { border: 1px solid rgba(255,255,255,0.12); padding: 0.55rem 0.65rem; text-align: left; vertical-align: top; }
    th { background: rgba(255,255,255,0.06); color: #fff; }
    .footer { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem; color: rgba(255,255,255,0.45); }
    .nav { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">LoreBook · lorebookai.com</div>
    <nav class="nav">
      <a href="https://lorebookai.com">Home</a>
      <a href="/api/legal/terms">Terms</a>
      <a href="/api/legal/privacy">Privacy</a>
    </nav>
    ${body}
    <div class="footer">© Abel Mendoza — Omega Technologies</div>
  </div>
</body>
</html>`;
}
