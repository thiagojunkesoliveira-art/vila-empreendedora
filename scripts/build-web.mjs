// Builds the single-file web version (web/ultimo-abrigo.html) from src/:
// inlines style.css and every script listed in index.html, in order.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const html = read('index.html');
const body = html.slice(html.indexOf('<!-- GAME:BODY:START -->') + 24, html.indexOf('<!-- GAME:BODY:END -->')).trim();
const css = read('style.css').trim();
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = scripts.map((s) => `// ---- ${s} ----\n` + read(s).trim()).join('\n\n');
if (js.includes('</script') || css.includes('</style')) throw new Error('source contains a closing tag that would break inlining');

// The claude.ai artifact wraps this in its own <html>/<head>/<body> skeleton.
const page = `<title>Último Abrigo</title>
<style>
${css}
</style>

${body}

<script>
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'web', 'ultimo-abrigo.html'), page);
console.log('web/ultimo-abrigo.html', page.length, 'bytes,', scripts.length, 'scripts');
