// Builds the single-file web version (the claude.ai link) from src/:
// inlines style.css and game.js and loads the fonts from Google Fonts instead of src/fonts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const html = read('index.html');
const body = html.slice(html.indexOf('<!-- GAME:BODY:START -->') + 24, html.indexOf('<!-- GAME:BODY:END -->')).trim();
const css = read('style.css').trim();
const js = read('game.js').trim();
if (js.includes('</script>') || css.includes('</style>')) throw new Error('source contains a closing tag that would break inlining');

const page = `<meta charset="utf-8">
<title>Vila Empreendedora</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=Press+Start+2P&display=swap">
<style>
${css}
</style>

${body}

<script>
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'web', 'vila-empreendedora.html'), page);
console.log('web/vila-empreendedora.html', page.length, 'bytes');
