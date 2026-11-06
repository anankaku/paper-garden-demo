import {Marked} from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';
function math(source,displayMode){return katex.renderToString(source.trim(),{displayMode,throwOnError:false,trust:false,strict:'ignore',output:'htmlAndMathml',maxExpand:1000,maxSize:20})}
const blockMath={name:'blockMath',level:'block',start(src){const m=src.match(/\$\$|\\\[|\\begin\{(?:equation\*?|align\*?|gather\*?)\}/);return m?.index},tokenizer(src){let match=src.match(/^\$\$([\s\S]+?)\$\$(?:[ \t]*\n)?/);if(!match)match=src.match(/^\\\[([\s\S]+?)\\\](?:[ \t]*\n)?/);if(match)return {type:'blockMath',raw:match[0],text:match[1]};match=src.match(/^\\begin\{(equation\*?|align\*?|gather\*?)\}([\s\S]+?)\\end\{\1\}(?:[ \t]*\n)?/);if(match){const type=match[1].startsWith('align')?'aligned':match[1].startsWith('gather')?'gathered':null;return {type:'blockMath',raw:match[0],text:type?'\\begin{'+type+'}'+match[2]+'\\end{'+type+'}':match[2]}}},renderer(token){return '<div class="math-block">'+math(token.text,true)+'</div>\n'}};
const inlineMath={name:'inlineMath',level:'inline',start(src){const m=src.match(/\$|\\\(/);return m?.index},tokenizer(src){let match=src.match(/^\\\(([\s\S]+?)\\\)/);if(!match)match=src.match(/^\$(?!\$)(?=\S)([^\n$]*?\S)\$(?!\$)/);if(match)return {type:'inlineMath',raw:match[0],text:match[1]}},renderer(token){return math(token.text,false)}};
export function headingSlug(text){
 return text.trim().normalize('NFC').toLowerCase()
  .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu,'').replace(/\s+/g,'-');
}
const noteLink={
 name:'noteLink',
 level:'inline',
 start:src=>src.indexOf('[['),
 tokenizer(src){
  const match=/^\[\[([^\[\]\n#]+)(?:#([^\[\]\n]+))?\]\]/.exec(src);
  if(!match?.[1].trim()||(match[2]!==undefined&&!match[2].trim()))return;
  return {type:'noteLink',raw:match[0],title:match[1].trim(),heading:match[2]?.trim()};
 },
 renderer(token){
  const target=new URLSearchParams({wikilink:token.title});
  if(token.heading)target.set('heading',token.heading);
  const label=token.heading?token.title+'#'+token.heading:token.title;
  const safeLabel=label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return '<a href="#'+target.toString().replace(/&/g,'&amp;')+'">'+safeLabel+'</a>';
 }
};
const parser=new Marked({extensions:[blockMath,inlineMath]});
const noteParser=new Marked({extensions:[blockMath,inlineMath,noteLink]});
export function markdownHtml(source,{noteLinks=false}={}){
 return (noteLinks?noteParser:parser).parse(String(source||''));
}
export function renderMarkdown(source,options){return DOMPurify.sanitize(markdownHtml(source,options))}
