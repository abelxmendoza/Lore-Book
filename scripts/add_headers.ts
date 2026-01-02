// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import fs from 'fs';
import path from 'path';

const HEADER = '© 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.';
const commentStyles: Record<string, (text: string) => string> = {
  '.ts': (text) => `// ${text}\n`,
  '.tsx': (text) => `// ${text}\n`,
  '.js': (text) => `// ${text}\n`,
  '.py': (text) => `# ${text}\n`,
  '.sql': (text) => `-- ${text}\n`,
  '.md': (text) => `<!-- ${text} -->\n\n`,
  '.json': (text) => `// ${text}\n`,
};

const shouldSkip = (filePath: string) => {
  const parts = filePath.split(path.sep);
  return parts.includes('node_modules') || parts.includes('dist') || parts.includes('build') || parts.includes('.git');
};

const hasHeader = (content: string, prefix: string) => content.startsWith(prefix);

const processFile = (filePath: string) => {
  const ext = path.extname(filePath) as keyof typeof commentStyles;
  const commentFn = commentStyles[ext];
  if (!commentFn) return;

  const prefix = commentFn(HEADER);
  const content = fs.readFileSync(filePath, 'utf-8');
  if (hasHeader(content, prefix.trim() === `// ${HEADER}` ? prefix : prefix)) return;

  fs.writeFileSync(filePath, `${prefix}${content}`);
  console.log(`Added header to ${filePath}`);
};

const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (shouldSkip(fullPath)) continue;
    if (entry.isDirectory()) {
      walk(fullPath);
    } else {
      processFile(fullPath);
    }
  }
};

walk(process.cwd());
