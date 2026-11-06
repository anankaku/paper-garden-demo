import {Marked} from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';
function math(source,displayMode){return katex.renderToString(source.trim(),{displayMode,throwOnError:false,trust:false,strict:'ignore',output:'htmlAndMathml',maxExpand:1000,maxSize:20})}
const blockMath={name:'blockMath',level:'block',start(src){const m=src.match(/\$\$|\\\[|\\begin\{(?:equation\*?|align\*?|gather\*?)\}/);return m?.index},tokenizer(src){let match=src.match(/^\$\$([\s\S]+?)\$\$(?:[ \t]*\n)?/);if(!match)match=src.match(/^\\\[([\s\S]+?)\\\](?:[ \t]*\n)?/);if(match)return {type:'blockMath',raw:match[0],text:match[1]};match=src.match(/^\\begin\{(equation\*?|align\*?|gather\*?)\}([\s\S]+?)\\end\{\1\}(?:[ \t]*\n)?/);if(match){const type=match[1].startsWith('align')?'aligned':match[1].startsWith('gather')?'gathered':null;return {type:'blockMath',raw:match[0],text:type?'\\begin{'+type+'}'+match[2]+'\\end{'+type+'}':match[2]}}},renderer(token){return '<div class="math-block">'+math(token.text,true)+'</div>\n'}};
const inlineMath={name:'inlineMath',level:'inline',start(src){const m=src.match(/\$|\\\(/);return m?.index},tokenizer(src){let match=src.match(/^\\\(([\s\S]+?)\\\)/);if(!match)match=src.match(/^\$(?!\$)(?=\S)([^\n$]*?\S)\$(?!\$)/);if(match)return {type:'inlineMath',raw:match[0],text:match[1]}},renderer(token){return math(token.text,false)}};
const parser=new Marked({extensions:[blockMath,inlineMath]});
export function markdownHtml(source){return parser.parse(String(source||''))}
export function renderMarkdown(source){return DOMPurify.sanitize(markdownHtml(source))}
