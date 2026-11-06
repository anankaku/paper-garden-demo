export function setupKeyboard(ctx){
 const $=s=>document.querySelector(s),help=$('#keyboard-help');let caretLayer=null;
 const visibleCaret=document.createElement('div');visibleCaret.className='pdf-visible-caret';visibleCaret.hidden=true;visibleCaret.setAttribute('aria-hidden','true');document.body.append(visibleCaret);
 let caretFrame=0,bookmark=null,resumeCaret=false;
 function textNodes(layer){const walker=document.createTreeWalker(layer,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);return nodes}
 function rememberCaret(){const selection=getSelection();if(!caretLayer?.isConnected||!selection?.focusNode||!caretLayer.contains(selection.focusNode))return;const nodes=textNodes(caretLayer);bookmark={paper:ctx.current()?.id,page:Number(caretLayer.closest('.pdf-sheet').dataset.page),anchor:nodes.indexOf(selection.anchorNode),anchorOffset:selection.anchorOffset,focus:nodes.indexOf(selection.focusNode),focusOffset:selection.focusOffset}}
 function restoreCaretSelection(){if(!bookmark||bookmark.paper!==ctx.current()?.id)return;const nodes=textNodes(caretLayer),same=bookmark.page===Number(caretLayer.closest('.pdf-sheet').dataset.page);const a=nodes[same?bookmark.anchor:0]||nodes[0],f=nodes[same?bookmark.focus:0]||a;if(a&&f)getSelection().setBaseAndExtent(a,Math.min(same?bookmark.anchorOffset:0,a.length),f,Math.min(same?bookmark.focusOffset:0,f.length))}
 document.addEventListener('pdf-before-render',()=>{resumeCaret=!!caretLayer;rememberCaret()});
 document.addEventListener('pdf-rendered',()=>{if(!resumeCaret||!ctx.sheet()?.classList.contains('rendered'))return;resumeCaret=false;if(bookmark?.paper!==ctx.current()?.id){leaveCaret();return}const active=document.activeElement,shouldFocus=active===document.body||active===caretLayer||active===$('#pdf-scroll');enterCaret(false,shouldFocus).then(()=>{if(shouldFocus){restoreCaretSelection();scheduleCaret()}}).catch(()=>{})});

 function updateCaret(){
  visibleCaret.hidden=true;const selection=window.getSelection();if(selection&&!selection.isCollapsed)return;
  if(!caretLayer?.isConnected||!selection?.focusNode||!caretLayer.contains(selection.focusNode)||!caretLayer.contains(document.activeElement))return;
  rememberCaret();const node=selection.focusNode,offset=selection.focusOffset,range=document.createRange();range.setStart(node,offset);range.collapse(true);
  let rect=[...range.getClientRects()].find(r=>r.height>0),x=rect?.left;
  // Transparent, absolutely positioned PDF text can have no native caret rectangle.
  if(!rect&&node.nodeType===Node.TEXT_NODE&&node.length){const previous=offset>0;range.setStart(node,previous?offset-1:0);range.setEnd(node,previous?offset:1);rect=[...range.getClientRects()].find(r=>r.height>0);x=previous?rect?.right:rect?.left}
  if(!rect){const element=node.nodeType===1?node:node.parentElement;rect=element?.getBoundingClientRect();x=rect?.left}if(!rect||!Number.isFinite(x))return;const bounds=$('#pdf-scroll').getBoundingClientRect(),top=Math.max(rect.top,bounds.top),bottom=Math.min(rect.bottom,bounds.bottom);
  if(x<bounds.left||x>bounds.right||bottom<=top)return;
  Object.assign(visibleCaret.style,{left:`${x}px`,top:`${top}px`,height:`${Math.max(2,bottom-top)}px`});visibleCaret.hidden=false;
 }
 function scheduleCaret(){cancelAnimationFrame(caretFrame);caretFrame=requestAnimationFrame(updateCaret)}
 document.addEventListener('selectionchange',scheduleCaret);document.addEventListener('keyup',scheduleCaret);document.addEventListener('pointerup',scheduleCaret);document.addEventListener('focusin',scheduleCaret);document.addEventListener('focusout',scheduleCaret);document.addEventListener('scroll',scheduleCaret,true);window.addEventListener('resize',scheduleCaret);
 const shortcuts=[['F','Toggle focus mode'],['B','Show / hide sidebar'],['L','Focus paper library'],['S','Search papers'],['R','Focus PDF reader'],['N','Focus Markdown notes'],['P','Toggle Markdown preview'],['H','PDF text cursor / save highlight'],['I','Import PDF'],['K','Keyboard help']];
 $('#keyboard-shortcut-list').innerHTML=shortcuts.map(([key,label])=>`<tr><td><kbd>Alt + Shift + ${key}</kbd></td><td>${label}</td></tr>`).join('');
 function focus(selector){const el=$(selector);if(el&&!el.disabled)el.focus()}
 function showLibrary(search=false){ctx.leaveFocus();ctx.showSidebar();$('#library-folders').open=true;focus(search?'#search':'#papers [data-id]');if(!search&&!$('#papers [data-id]'))focus('#upload-label')}
 function leaveCaret(){visibleCaret.hidden=true;if(caretLayer){caretLayer.removeAttribute('contenteditable');caretLayer.removeAttribute('tabindex');caretLayer.removeAttribute('role');caretLayer.removeAttribute('aria-label');caretLayer.classList.remove('pdf-caret-mode')}caretLayer=null;$('#keyboard-text-open').setAttribute('aria-pressed','false')}
 async function enterCaret(announce=true,focusLayer=true){if(!ctx.current())return ctx.toast('Select a paper first.');let sheet=ctx.sheet();if(!sheet?.classList.contains('rendered')){await ctx.render();sheet=ctx.sheet()}const layer=sheet?.querySelector('.textLayer'),span=[...layer?.querySelectorAll('span')||[]].find(s=>s.firstChild?.nodeType===3&&s.textContent);if(!span)return ctx.toast('This page has no selectable text. Scanned PDFs need OCR.');leaveCaret();caretLayer=layer;layer.tabIndex=0;layer.setAttribute('role','region');layer.setAttribute('aria-label','PDF text cursor. Up and Down scroll; Left and Right move by character; Shift plus Left or Right selects text; Page Up and Page Down change pages; Alt Shift H saves a highlight; Escape exits.');layer.classList.add('pdf-caret-mode');$('#keyboard-text-open').setAttribute('aria-pressed','true');if(focusLayer)layer.focus({preventScroll:true});const selected=window.getSelection();if(focusLayer&&(!selected?.rangeCount||!layer.contains(selected.anchorNode))){const range=document.createRange();range.setStart(span.firstChild,0);range.collapse(true);selected.removeAllRanges();selected.addRange(range)}scheduleCaret();if(announce)ctx.toast('Text cursor: Left / Right moves the cursor. Up / Down scrolls. Alt + Shift + H saves a highlight. Page Up / Down changes pages.')}
 async function cursorOrHighlight(){const selected=window.getSelection();if(selected?.rangeCount&&!selected.isCollapsed){const range=selected.getRangeAt(0),node=range.commonAncestorContainer,layer=(node.nodeType===1?node:node.parentElement).closest('.textLayer');if(layer&&$('#pdf-page').contains(layer)){const sheet=layer.closest('.pdf-sheet'),base=sheet.getBoundingClientRect(),rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>({x:(r.left-base.left)/base.width,y:(r.top-base.top)/base.height,w:r.width/base.width,h:r.height/base.height}));await ctx.highlight({rawText:selected.toString(),page:Number(sheet.dataset.page),rects});selected.collapseToEnd();ctx.toast('Highlight saved. Continue moving the PDF cursor.');return}}await enterCaret()}
 $('#keyboard-help-open').onclick=()=>help.showModal();$('#keyboard-text-open').onclick=()=>cursorOrHighlight().catch(e=>ctx.toast(e.message));$('#keyboard-text-open').onmousedown=e=>e.preventDefault();
 const scroller=$('#pdf-scroll');scroller.addEventListener('focusin',e=>{if(e.target===caretLayer){scheduleCaret()}});for(const name of ['beforeinput','paste','cut','drop'])scroller.addEventListener(name,e=>{if(e.target.closest('.pdf-caret-mode'))e.preventDefault()});
 let pageTurning=false;
 async function turnCursorPage(direction){
  if(pageTurning)return;pageTurning=true;
  const sourcePage=caretLayer?.isConnected?Number(caretLayer.closest('.pdf-sheet').dataset.page):ctx.page();
  rememberCaret();leaveCaret();
  try{await ctx.goPage(sourcePage+direction);await enterCaret(false);scheduleCaret()}catch(e){ctx.toast(e.message)}finally{pageTurning=false}
 }
 scroller.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&e.target.closest('.pdf-caret-mode')){e.preventDefault();e.stopPropagation();leaveCaret();scroller.focus();return}
  const inCaret=!!e.target.closest('.pdf-caret-mode');
  if(inCaret&&['ArrowLeft','ArrowRight'].includes(e.key)&&!e.metaKey){
   e.preventDefault();e.stopPropagation();const selected=getSelection(),forward=e.key==='ArrowRight';
   if(selected?.rangeCount){
    if(!e.shiftKey&&!selected.isCollapsed){if(forward)selected.collapseToEnd();else selected.collapseToStart()}
    else selected.modify(e.shiftKey?'extend':'move',forward?'forward':'backward',(e.ctrlKey||e.altKey)?'word':'character');
    // Keep movement inside the active PDF text layer.
    if(!caretLayer.contains(selected.focusNode))restoreCaretSelection();else rememberCaret();
    const node=selected.focusNode?.nodeType===1?selected.focusNode:selected.focusNode?.parentElement;node?.scrollIntoView({block:'nearest',inline:'nearest'});scheduleCaret();
   }return;
  }
  if(!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&['ArrowDown','ArrowUp'].includes(e.key)){
   e.preventDefault();
   scroller.scrollBy({top:e.key==='ArrowDown'?48:-48});
   return;
  }
  const explicit=(e.altKey&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&['ArrowDown','ArrowUp'].includes(e.key))||(inCaret&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&['PageDown','PageUp'].includes(e.key));
  if(explicit){e.preventDefault();e.stopPropagation();turnCursorPage(['ArrowDown','PageDown'].includes(e.key)?1:-1);return}

 });
 // File-upload labels expose the same operation to Enter and Space.
 for(const label of document.querySelectorAll('label.button')){label.tabIndex=0;label.setAttribute('role','button');label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const input=label.querySelector('input[type=file]')||document.getElementById(label.htmlFor);input?.click()}})}
 document.addEventListener('keydown',e=>{if(e.repeat||e.isComposing)return;const dialog=document.querySelector('dialog[open]');if(e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey){const code=e.code.slice(3);if(code==='F')return;if(dialog)return;const actions={B:()=>$('#sidebar-toggle').click(),L:()=>showLibrary(),S:()=>showLibrary(true),R:()=>{if(caretLayer?.isConnected){caretLayer.focus({preventScroll:true});restoreCaretSelection();scheduleCaret()}else focus('#pdf-scroll')},N:()=>{$('#edit-tab').click();focus('#editor')},P:()=>{const show=$('#preview').hidden;$(show?'#preview-tab':'#edit-tab').click();focus(show?'#preview':'#editor')},H:()=>cursorOrHighlight().catch(e=>ctx.toast(e.message)),I:()=>$('#upload').click(),K:()=>help.showModal()};if(actions[code]){e.preventDefault();actions[code]()}}else if(e.key==='?'&&!dialog&&!e.target.closest('input,textarea,select,[contenteditable=true]')){e.preventDefault();help.showModal()}});
 $('#pdf-scroll').addEventListener('keydown',e=>{if(e.target!==$('#pdf-scroll')||e.altKey||e.ctrlKey||e.metaKey)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();$(e.key==='ArrowLeft'?'#prev':'#next').click()}else if(e.key==='Home'&&!e.shiftKey){e.preventDefault();ctx.goPage(1)}else if(e.key==='End'&&!e.shiftKey){e.preventDefault();ctx.goPage(Infinity)}});
}
