import {cp, mkdir} from 'node:fs/promises';
import {build} from 'esbuild';

await mkdir('dist/assets/katex', {recursive: true});
await Promise.all([
  ...['index.html', 'style.css', 'favicon.svg'].map(path => cp(path, 'dist/' + path)),
  cp('node_modules/pdfjs-dist/cmaps', 'dist/assets/cmaps', {recursive: true}),
  cp('node_modules/pdfjs-dist/standard_fonts', 'dist/assets/standard_fonts', {recursive: true}),
  cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/assets/pdf.worker.min.mjs'),
  cp('node_modules/pdfjs-dist/web/pdf_viewer.css', 'dist/assets/pdf_viewer.css'),
  cp('node_modules/pdfjs-dist/LICENSE', 'dist/assets/PDFJS-LICENSE'),
  cp('node_modules/katex/dist/katex.min.css', 'dist/assets/katex/katex.min.css'),
  cp('node_modules/katex/dist/fonts', 'dist/assets/katex/fonts', {recursive: true}),
  cp('node_modules/katex/LICENSE', 'dist/assets/katex/LICENSE'),
  build({entryPoints: ['src/app.js'], bundle: true, format: 'esm', outfile: 'dist/app.js', legalComments: 'linked'}),
]);
