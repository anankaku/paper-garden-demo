import test from 'node:test';import assert from 'node:assert/strict';import {markdownHtml} from '../src/markdown.js';
test('inline dollar math preserves LaTeX before Markdown escapes it',()=>{const h=markdownHtml(String.raw`Force $\mathbf{F}_i=-\nabla V$ acts here.`);assert.match(h,/class="katex"/);assert.doesNotMatch(h,/katex-error/);assert.match(h,/msub/)});
test('display math supports vectors, projection, fractions and boxed equations',()=>{const h=markdownHtml(String.raw`$$\boxed{\mathbf{F}_i^\parallel=(\mathbf{F}_i\cdot\hat{\boldsymbol{\tau}}_i)\hat{\boldsymbol{\tau}}_i}$$`);assert.match(h,/katex-display/);assert.doesNotMatch(h,/katex-error/)});
test('parenthesis and bracket delimiters survive Markdown parsing',()=>{const h=markdownHtml(String.raw`Inline \(x_i^2\).

\[
\frac{\partial V}{\partial x}=0
\]`);assert.equal((h.match(/class="katex"/g)||[]).length,2);assert.doesNotMatch(h,/katex-error/)});
test('matrix line breaks and align environments are preserved',()=>{const h=markdownHtml(String.raw`$$\begin{pmatrix}1 & 0 \\ 0 & 1\end{pmatrix}$$

\begin{align}
a &= b \\
c &= d
\end{align}`);assert.match(h,/mtable/);assert.equal((h.match(/katex-display/g)||[]).length,2);assert.doesNotMatch(h,/katex-error/)});
test('Markdown code fences and inline code remain literal',()=>{const h=markdownHtml('```latex\n$$x_i$$\n```\n\n`$y$`');assert.doesNotMatch(h,/class="katex"/);assert.match(h,/<code class="language-latex">/)});
test('malformed formulas do not prevent the rest of the note rendering',()=>{const h=markdownHtml(String.raw`$\notacommand{x}$

## Next section`);assert.match(h,/cc0000|katex-error/);assert.match(h,/<h2>Next section/)});
test('ordinary currency and links remain readable',()=>{const h=markdownHtml('Cost is $5 and $10.\n\n[Original](#paper=abc&page=1)');assert.doesNotMatch(h,/class="katex"/);assert.match(h,/href="#paper=abc/)});

test('note preview renders wiki targets and leaves code literal',()=>{
 const html=markdownHtml('[[Flow Matching]] · [[MolGEN#Flow Matching]] · '+
  String.fromCharCode(96)+'[[Literal]]'+String.fromCharCode(96),{noteLinks:true});
 assert.match(html,/href="#wikilink=Flow\+Matching"/);
 assert.match(html,/href="#wikilink=MolGEN&amp;heading=Flow\+Matching"/);
 assert.match(html,/<code>\[\[Literal\]\]<\/code>/);
 assert.match(markdownHtml('[[Flow Matching]]'),/\[\[Flow Matching\]\]/);
});

test('wiki labels and query parameters cannot inject markup',()=>{
 const html=markdownHtml('[[<img src=x>#A & B]]',{noteLinks:true});
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/%3Cimg\+src%3Dx%3E&amp;heading=A\+%26\+B/);
});

test('heading slugs preserve Unicode and remove punctuation',async()=>{
 const {headingSlug}=await import('../src/markdown.js');
 assert.equal(headingSlug('Flow Matching!'),'flow-matching');
 assert.equal(headingSlug('方法：能量 路徑'),'方法能量-路徑');
});
