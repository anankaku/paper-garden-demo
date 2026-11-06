import {setupKeyboard} from './keyboard.js';
import {createPDFViewer} from './pdf-viewer.js';
import {validateAdditionalNotes} from './notes.js';
import {cleanHighlightText} from './highlight-text.js';
import {normalizeDoi,detectDois,crossrefMeta,fetchCrossref} from './metadata.js';
import * as pdfjs from 'pdfjs-dist';
import {headingSlug,renderMarkdown} from './markdown.js';
import DOMPurify from 'dompurify';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-csl';
pdfjs.GlobalWorkerOptions.workerSrc='./assets/pdf.worker.min.mjs';
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let activeNoteId="main";
for(const id of ['library-folders']){const el=$('#'+id);try{el.open=localStorage.getItem('pg-open-'+id)!=='false'}catch{}el.addEventListener('toggle',()=>{try{localStorage.setItem('pg-open-'+id,String(el.open))}catch{}})}

let activeCollection='*';
let collections=[];try{collections=JSON.parse(localStorage.getItem('pg-collections')||'[]').filter(x=>typeof x==='string')}catch{}
function saveCollections(){localStorage.setItem('pg-collections',JSON.stringify(collections))}
function collectionOptions(){return [...new Set([...collections,...papers.map(p=>p.collection).filter(Boolean)])].sort()}
function drawCollections(){const el=$('#collections');el.innerHTML='<option value="*">All papers</option><option value="">Unfiled</option>'+collectionOptions().map(x=>`<option value="${esc(x)}">📁 ${esc(x)}</option>`).join('');el.value=activeCollection;if(el.selectedIndex<0){activeCollection='*';el.value='*'}}
$('#collections').onchange=e=>{activeCollection=e.target.value;list()};
$('#new-collection').onclick=()=>{const name=prompt('Folder name (for example NEB or Atropisomers):')?.trim();if(!name)return;if(name==='*')return toast('Please choose another name');collections.push(name.slice(0,100));saveCollections();activeCollection=name.slice(0,100);list()};
$('#move-paper').onclick=()=>{if(!current)return toast('Select a paper first');$('#paper-destination').innerHTML='<option value="">Unfiled</option>'+collectionOptions().map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');$('#paper-destination').value=current.collection||'';$('#move-dialog').showModal()};
$('#confirm-move-paper').onclick=async()=>{if(!current)return;current.collection=$('#paper-destination').value;await put(current);activeCollection=current.collection;list();$('#move-dialog').close();toast('Paper moved.')};
$('#delete-paper').onclick=async()=>{if(!current)return toast('Select a paper first');const p=current;if(!confirm(`Delete from this browser: “${p.meta.title}”?\nThis removes the local PDF, notes and highlights.`))return;try{await flush();await saveQueue;await new Promise((resolve,reject)=>{const tx=db.transaction('papers','readwrite');tx.objectStore('papers').delete(p.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});clearTimeout(notesTimer);current=null;renderEpoch++;renderTask?.cancel();viewer.reset();doc?.destroy();doc=null;selection=null;papers=papers.filter(x=>x.id!==p.id);$('#editor').value='';$('#editor').disabled=true;drawNoteControls();$('#title').textContent='Select a paper to start reading';$('#pdf-page').hidden=true;$('#empty').hidden=false;$('#pages').textContent='—';preview();drawHighlights();list();if(papers.length)await openPaper(papers[0].id);toast('Local paper deleted.')}catch(e){toast(e.message)}};

let db, papers=[],current=null,doc=null,page=1,renderTask=null,renderEpoch=0,saveQueue=Promise.resolve(),notesTimer,selection=null;
function setSidebarCollapsed(collapsed){const sidebar=$('#library-sidebar'),button=$('#sidebar-toggle');sidebar.hidden=collapsed;document.body.classList.toggle('sidebar-collapsed',collapsed);button.setAttribute('aria-expanded',String(!collapsed));button.textContent=collapsed?'☰ Show sidebar':'☰ Hide sidebar';button.title=collapsed?'Show sidebar':'Hide sidebar';try{localStorage.setItem('pg-sidebar-collapsed',String(collapsed))}catch{}if(doc&&$('#zoom').value==='fit')requestAnimationFrame(()=>render().catch(e=>toast(e.message)))}
$('#sidebar-toggle').onclick=()=>setSidebarCollapsed(!$('#library-sidebar').hidden);
let focusMode=false;
function setFocusMode(enabled){focusMode=enabled;document.body.classList.toggle('focus-mode',enabled);$('#focus-toggle').setAttribute('aria-pressed',String(enabled));$('#focus-exit').hidden=!enabled;requestAnimationFrame(()=>{if(doc&&$('#zoom').value==='fit')render().catch(e=>toast(e.message))});if(enabled)$('#focus-exit').focus();else $('#focus-toggle').focus()}
$('#focus-toggle').onclick=()=>setFocusMode(!focusMode);
$('#focus-exit').onclick=()=>setFocusMode(false);
document.addEventListener('keydown',e=>{if(e.repeat||e.isComposing)return;if(e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.code==='KeyF'){e.preventDefault();setFocusMode(!focusMode)}else if(e.key==='Escape'&&focusMode&&!document.querySelector('dialog[open]')){e.preventDefault();setFocusMode(false)}});

try{setSidebarCollapsed(localStorage.getItem('pg-sidebar-collapsed')==='true')}catch{}

const ready=new Promise((res,rej)=>{const r=indexedDB.open('paper-garden-demo',1);r.onupgradeneeded=()=>r.result.createObjectStore('papers',{keyPath:'id'});r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)});
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4000)}
async function put(p){const snapshot=structuredClone(p);saveQueue=saveQueue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const tx=db.transaction('papers','readwrite');tx.objectStore('papers').put(snapshot);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}));try{await saveQueue;$('#save-state').textContent='✓ Saved in this browser · '+new Date().toLocaleTimeString()}catch(e){$('#save-state').textContent='Save failed: export a backup now';toast('Save failed: '+e.message);throw e}}
async function all(){await ready;return new Promise((res,rej)=>{const r=db.transaction('papers').objectStore('papers').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function list(){drawCollections();const q=$('#search').value.toLowerCase();$('#count').textContent=papers.length;$('#papers').innerHTML=papers.filter(p=>(activeCollection==='*'||(p.collection||'')===activeCollection)).filter(p=>[p.meta.title,p.meta.authors,p.meta.tags].join(' ').toLowerCase().includes(q)).map(p=>`<div class="paper ${p.id===current?.id?'selected':''}" role="button" tabindex="0" data-id="${esc(p.id)}"><b>▤ ${esc(p.meta.title)}</b><small>${esc(p.meta.authors?.split('\n')[0]||'Metadata incomplete')} ${esc(p.meta.year||'')}</small>${(p.meta.tags||'').split(',').filter(Boolean).map(t=>`<span class="tag">${esc(t.trim())}</span>`).join('')}<small>${esc(p.collection||'Unfiled')} · ${p.highlights.length} highlights · ${p.meta.verified?'Verified':'Unverified metadata'}</small></div>`).join('')||'<p class="muted">No matching papers.</p>';$('#papers').querySelectorAll('[data-id]').forEach(el=>{el.onclick=()=>{const retain=el.contains(document.activeElement);openPaper(el.dataset.id).then(()=>{if(retain)$('#papers [data-id=\"'+el.dataset.id+'\"]')?.focus()})};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();(e.key==='ArrowDown'?el.nextElementSibling:el.previousElementSibling)?.focus()}}})}
async function openPaper(id,noteId="main"){if(current)await flush();const chosen=papers.find(p=>p.id===id);if(!chosen)return;current=chosen;viewer.reset();doc?.destroy();doc=null;const epoch=++renderEpoch;page=1;selection=null;$('#title').textContent=current.meta.title;$('#editor').disabled=false;activeNoteId=noteId;loadNote();$('#save-state').textContent='✓ Local notes loaded';$('#empty').hidden=true;$('#pdf-page').hidden=false;list();drawHighlights();preview();try{const loadedDoc=await pdfjs.getDocument({data:new Uint8Array(await chosen.pdf.arrayBuffer()),cMapUrl:'./assets/cmaps/',cMapPacked:true,standardFontDataUrl:'./assets/standard_fonts/'}).promise;if(epoch!==renderEpoch){loadedDoc.destroy();return}doc=loadedDoc;$('#pages').textContent=doc.numPages;await render()}catch(e){toast('Could not open PDF: '+e.message)}}
const viewer=createPDFViewer({host:$('#pdf-page'),scroller:$('#pdf-scroll'),onPage(n){page=n;selection=null;updatePageControls()},marks:()=>current?.highlights||[],onError:e=>toast('PDF rendering failed: '+e.message)});
function updatePageControls(){$('#page').value=page;$('#prev').disabled=page===1;$('#next').disabled=page===doc?.numPages}
async function render(){if(!doc)return;document.dispatchEvent(new Event('pdf-before-render'));await viewer.show(doc,page,$('#reading-mode').value,$('#zoom').value);updatePageControls();document.dispatchEvent(new Event('pdf-rendered'))}
function drawMarks(){viewer.drawMarks()}
let fitResizeTimer,lastReaderWidth=0;new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(Math.abs(width-lastReaderWidth)<1)return;lastReaderWidth=width;clearTimeout(fitResizeTimer);if(doc&&$('#zoom').value==='fit')fitResizeTimer=setTimeout(()=>render().catch(e=>toast(e.message)),100)}).observe($('#pdf-scroll'));

$('#reading-mode').onchange=()=>{selection=null;try{localStorage.setItem('pg-reading-mode',$('#reading-mode').value)}catch{}render().catch(e=>toast(e.message))};
try{$('#reading-mode').value=localStorage.getItem('pg-reading-mode')==='continuous'?'continuous':'single'}catch{}
function capturePDFSelection(){const s=window.getSelection();if(!s?.rangeCount||s.isCollapsed)return;const range=s.getRangeAt(0),layer=(range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement).closest('.textLayer');if(!layer||!$('#pdf-page').contains(layer))return;const sheet=layer.closest('.pdf-sheet');page=Number(sheet.dataset.page);updatePageControls();const base=sheet.getBoundingClientRect();selection={rawText:s.toString().trim(),text:cleanHighlightText(s.toString()),page,rects:[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>({x:(r.left-base.left)/base.width,y:(r.top-base.top)/base.height,w:r.width/base.width,h:r.height/base.height}))}}
$('#pdf-scroll').addEventListener('pointerup',capturePDFSelection);$('#pdf-scroll').addEventListener('keyup',capturePDFSelection);
// Normalize ordinary PDF copy as well; leave the Markdown editor untouched.
document.addEventListener('copy',e=>{const selected=window.getSelection();if(!selected?.rangeCount||selected.isCollapsed||!e.clipboardData)return;const container=selected.getRangeAt(0).commonAncestorContainer;if(!$('#pdf-page').contains(container)&&!$('#highlights').contains(container))return;e.clipboardData.setData('text/plain',cleanHighlightText(selected.toString()));e.preventDefault()});
$('#highlight').onmousedown=e=>e.preventDefault();$('#highlight').onclick=async()=>{if(!current||!selection?.text||selection.page!==page)return toast('Select text within one PDF page first. Scanned PDFs need OCR.');current.highlights.push({id:uid(),...selection,comment:''});selection=null;window.getSelection()?.removeAllRanges();await put(current);drawHighlights();drawMarks();list();toast('Highlight saved. Click ＋ Notes to add it to Markdown.')};
function drawHighlights(){$('#highlights').innerHTML=current?.highlights.map(h=>`<div class="highlight-card" data-h="${h.id}"><blockquote>${esc(cleanHighlightText(h.text))}</blockquote><input aria-label="My reflection on this passage" placeholder="This passage inspires me to…" value="${esc(h.comment)}"><button data-go="${h.id}">p. ${h.page} ↗</button><button data-insert="${h.id}">＋ Notes</button><button data-copy="${h.id}">Copy</button><button data-delete="${h.id}">Delete</button></div>`).join('')||'<p class="muted">Select PDF text, then click Highlight to save it.</p>';$('#highlights').querySelectorAll('input').forEach(input=>input.oninput=async()=>{const h=current.highlights.find(h=>h.id===input.parentElement.dataset.h);h.comment=input.value;await put(current)});$('#highlights').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>goHighlight(b.dataset.go));$('#highlights').querySelectorAll('[data-insert]').forEach(b=>b.onclick=async()=>{const h=current.highlights.find(h=>h.id===b.dataset.insert);const quote='> '+cleanHighlightText(h.text);const insert=`\n\n${quote}\n\n[↗ Source p. ${h.page}](#paper=${current.id}&page=${h.page}&highlight=${h.id})\n\n${h.comment?'**My reflection：** '+h.comment+'\n':''}`;const ed=$('#editor'),pos=ed.selectionStart;ed.value=ed.value.slice(0,pos)+insert+ed.value.slice(pos);setNoteText(ed.value);await put(current);preview();toast('Added to notes. Click the source link in Preview to return to the PDF.')});$('#highlights').querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{const h=current.highlights.find(h=>h.id===b.dataset.copy);try{await navigator.clipboard.writeText(cleanHighlightText(h.text));toast('Copied as continuous text')}catch{toast('Could not copy automatically. Select and copy the card text instead.')}});$('#highlights').querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this highlight? Quotes already inserted in notes will remain.'))return;current.highlights=current.highlights.filter(h=>h.id!==b.dataset.delete);await put(current);drawHighlights();drawMarks();list()})}
async function goHighlight(id){const h=current.highlights.find(h=>h.id===id);if(h){page=h.page;await render();const sheet=viewer.sheet(h.page);if(sheet)$('#pdf-scroll').scrollTop=sheet.offsetTop-$('#pdf-page').offsetTop+(h.rects[0]?.y||0)*sheet.clientHeight}}
function noteList(p){
 return [{id:'main',title:p.noteTitle||'Reading notes'},...(p.extraNotes||[])];
}
function activeExtraNote(){
 return current.extraNotes?.find(note=>note.id===activeNoteId);
}
function noteText(){
 return activeExtraNote()?.text??current.note;
}
function setNoteText(text){
 const note=activeExtraNote();
 if(note)note.text=text;
 else current.note=text;
}
function drawNoteControls(){
 const select=$('#note-select');
 const options=current?noteList(current):[];
 select.replaceChildren(...options.map(note=>new Option(note.title,note.id)));
 select.value=activeNoteId;
 for(const id of ['note-select','new-note','rename-note','link-note'])$('#'+id).disabled=!current;
}
function loadNote(){
 $('#editor').value=noteText();
 drawNoteControls();
 preview();
}
async function switchNote(id){
 if(!current||id===activeNoteId)return;
 const saving=flush();
 activeNoteId=id;
 loadNote();
 await saving;
}
$('#note-select').onchange=()=>switchNote($('#note-select').value).catch(e=>toast(e.message));
function openNoteTitleDialog(rename){
 if(!current)return;
 const dialog=$('#note-title-dialog');
 dialog.dataset.mode=rename?'rename':'new';
 $('#note-title-heading').textContent=rename?'Rename note':'New note';
 $('#note-title-input').value=rename?noteList(current).find(note=>note.id===activeNoteId).title:'';
 dialog.showModal();
 $('#note-title-input').select();
}
$('#new-note').onclick=()=>openNoteTitleDialog(false);
$('#rename-note').onclick=()=>openNoteTitleDialog(true);
$('#note-title-form').onsubmit=async e=>{
 e.preventDefault();
 const p=current;
 const title=$('#note-title-input').value.trim();
 if(!p||!title)return;
 const dialog=$('#note-title-dialog');
 const rename=dialog.dataset.mode==='rename';
 dialog.close();
 try{
  if(rename){
   const note=activeExtraNote();
   if(note)note.title=title;
   else p.noteTitle=title;
   drawNoteControls();
  }else{
   setNoteText($('#editor').value);
   clearTimeout(notesTimer);
   const note={id:uid(),title,text:''};
   (p.extraNotes??=[]).push(note);
   activeNoteId=note.id;
   loadNote();
   $('#edit-tab').click();
   $('#editor').focus();
  }
  await put(p);
 }catch(e){toast(e.message)}
};
$('#link-note').onclick=()=>{
 if(!current)return;
 const select=$('#note-link-target');
 select.replaceChildren();
 for(const p of papers){
  const group=document.createElement('optgroup');
  group.label=p.meta.title;
  for(const note of noteList(p)){
   if(p===current&&note.id===activeNoteId)continue;
   group.append(new Option(note.title,new URLSearchParams({paper:p.id,note:note.id}).toString()));
  }
  if(group.children.length)select.append(group);
 }
 if(!select.options.length)return toast('Create another note to link to first.');
 $('#note-link-dialog').showModal();
};
$('#note-link-form').onsubmit=async e=>{
 e.preventDefault();
 const option=$('#note-link-target').selectedOptions[0];
 if(!current||!option)return;
 const label=Array.from(option.text,c=>/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(c)?'\\'+c:c).join('');
 const editor=$('#editor');
 editor.setRangeText('['+label+'](#'+option.value+')',editor.selectionStart,editor.selectionEnd,'end');
 setNoteText(editor.value);
 preview();
 $('#note-link-dialog').close();
 $('#edit-tab').click();
 editor.focus();
 await put(current).catch(err=>toast(err.message));
};
async function flush(){clearTimeout(notesTimer);if(current){setNoteText($('#editor').value);await put(current)}}
$('#editor').oninput=()=>{setNoteText($('#editor').value);$('#save-state').textContent='Saving…';clearTimeout(notesTimer);const p=current;notesTimer=setTimeout(()=>put(p).catch(()=>{}),500);preview()};function preview(){
 const pane=$('#preview');
 pane.innerHTML=renderMarkdown($('#editor').value,{noteLinks:true});
 const used=new Set();
 for(const heading of pane.querySelectorAll('h1,h2,h3,h4,h5,h6')){
  const base=headingSlug(heading.textContent)||'section';
  let slug=base;
  for(let suffix=1;used.has(slug);suffix++)slug=base+'-'+suffix;
  used.add(slug);
  heading.id='note-heading-'+slug;
 }
}
function jumpToHeading(slug){
 const pane=$('#preview');
 const heading=pane.querySelector('#'+CSS.escape('note-heading-'+slug));
 if(!heading)return toast('Heading not found in this note.');
 heading.tabIndex=-1;
 heading.focus({preventScroll:true});
 pane.scrollTop+=heading.getBoundingClientRect().top-pane.getBoundingClientRect().top-12;
}
function resolveNoteTitle(title){
 const normalize=value=>value.trim().normalize('NFC').toLowerCase();
 const query=normalize(title);
 const matches=papers.flatMap(paper=>noteList(paper)
  .filter(note=>normalize(note.title)===query).map(note=>({paper,note})));
 const local=matches.filter(({paper})=>paper.id===current?.id);
 const candidates=local.length?local:matches;
 if(candidates.length>1){
  toast('More than one note has that title. Use Insert note link to choose one.');
  return;
 }
 if(!candidates.length)return toast('No note found named “'+title+'”.');
 return candidates[0];
}
async function followNoteLink(paper,noteId,heading){
 if(current?.id===paper.id)await switchNote(noteId);
 else await openPaper(paper.id,noteId);
 if(current?.id!==paper.id||activeNoteId!==noteId)return;
 $('#preview-tab').click();
 $('#preview').scrollTop=0;
 $('#preview').focus({preventScroll:true});
 if(heading)jumpToHeading(headingSlug(heading));
}
$('#preview').onclick=async e=>{
 const href=e.target.closest('a')?.getAttribute('href');
 if(!href?.startsWith('#')||href==='#')return;
 e.preventDefault();
 const target=new URLSearchParams(href.slice(1));
 if(href.startsWith('#wikilink=')){
  const match=resolveNoteTitle(target.get('wikilink'));
  if(match)await followNoteLink(match.paper,match.note.id,target.get('heading'));
  return;
 }
 if(!href.startsWith('#paper=')){
  try{jumpToHeading(decodeURIComponent(href.slice(1)))}
  catch{toast('Invalid heading link.')}
  return;
 }
 const paper=papers.find(p=>p.id===target.get('paper'));
 if(!paper)return toast('This paper is not in your library. Restore a backup containing that paper.');
 const noteId=target.get('note');
 if(noteId){
  if(!noteList(paper).some(note=>note.id===noteId))return toast('This note is not available in your library.');
  await followNoteLink(paper,noteId,target.get('heading'));
  return;
 }
 if(current?.id!==paper.id)await openPaper(paper.id);
 if(doc){
  page=Math.max(1,Math.min(Number(target.get('page'))||1,doc.numPages));
  if(target.get('highlight'))await goHighlight(target.get('highlight'));
  else await render();
 }
};
$('#edit-tab').onclick=()=>{$('#editor').hidden=false;$('#preview').hidden=true;$('#edit-tab').classList.add('active');$('#preview-tab').classList.remove('active')};$('#preview-tab').onclick=()=>{$('#editor').hidden=true;$('#preview').hidden=false;$('#preview-tab').classList.add('active');$('#edit-tab').classList.remove('active');preview()};
$('#prev').onclick=()=>{if(page>1){page--;selection=null;render()}};$('#next').onclick=()=>{if(doc&&page<doc.numPages){page++;selection=null;render()}};$('#page').onchange=()=>{if(doc){page=Math.max(1,Math.min(doc.numPages,Number($('#page').value)||1));selection=null;render()}};$('#zoom').onchange=()=>{selection=null;render()};$('#search').oninput=list;
$('#upload').onchange=async e=>{for(const file of e.target.files){if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))continue;const p={id:uid(),collection:activeCollection==='*'?'':activeCollection,pdf:file,filename:file.name,meta:{title:file.name.replace(/\.pdf$/i,''),authors:'',year:'',type:'article-journal',journal:'',volume:'',issue:'',pages:'',doi:'',url:'',tags:'',verified:false},note:'',highlights:[]};await put(p);papers.push(p)}list();if(papers.length)await openPaper(papers.at(-1).id);e.target.value='';toast('Imported. Open Edit metadata to detect a DOI and find bibliographic details.')};
let lookupEpoch=0;
function formFill(meta){const f=$('#meta-form');for(const [k,v]of Object.entries(meta)){if(f.elements[k]){if(k==='verified')f.elements[k].checked=!!v;else f.elements[k].value=v}}}
function lookupStatus(t){$('#lookup-status').textContent=t}
function lookupBusy(b){$('#lookup-doi').disabled=b;$('#detect-doi').disabled=b;$('#lookup-query').disabled=b}
function applyLookup(record){const mapped=crossrefMeta(record);formFill(mapped);lookupStatus('✓ Filled from Crossref, not yet saved. Verify authors, year and journal before saving.');$('#lookup-results').innerHTML='';}
async function lookup(query){const token=++lookupEpoch;const id=current?.id;const doi=normalizeDoi(query);lookupBusy(true);lookupStatus(doi?'Looking up DOI in Crossref…':'Searching paper titles…');$('#lookup-results').innerHTML='';try{const results=await fetchCrossref(doi?{doi}:{title:query});if(token!==lookupEpoch||id!==current?.id||!$('#meta-dialog').open)return;if(doi){if(!results.length)throw Error('No metadata found.');applyLookup(results[0]);}else{lookupStatus(results.length?'Choose the article matching your PDF; titles may overlap.':'No results. Try a DOI or a more complete title.');for(const record of results){const m=crossrefMeta(record);const b=document.createElement('button');b.type='button';b.className='lookup-result';b.innerHTML='<b>'+esc(m.title)+'</b><small>'+esc(m.authors.split('\n')[0])+' · '+esc(m.year)+' · '+esc(m.journal)+'</small><small>'+esc(m.doi)+'　↳ Use metadata</small>';b.onclick=()=>{try{applyLookup(record)}catch(e){lookupStatus(e.message)}};$('#lookup-results').append(b)}}}catch(e){if(token===lookupEpoch)lookupStatus('Search incomplete: '+e.message)}finally{if(token===lookupEpoch)lookupBusy(false)}}
async function detectPdfDoi(autoLookup=true){if(!current)return;const id=current.id,token=++lookupEpoch;lookupBusy(true);lookupStatus('Detecting DOI on the first page…');$('#lookup-results').innerHTML='';try{let pdf=doc;if(!pdf)throw Error('The PDF is still loading. Try again shortly.');const pg=await pdf.getPage(1),content=await pg.getTextContent();if(token!==lookupEpoch||id!==current?.id||!$('#meta-dialog').open)return;const text=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('');const candidates=detectDois(text);if(candidates.length===1){$('#lookup-query').value=candidates[0];lookupBusy(false);if(autoLookup){await lookup(candidates[0]);return}lookupStatus('DOI detected. Click Search online to fill metadata.')}else if(candidates.length>1){lookupStatus('Multiple DOIs found. Select the DOI of this paper:');for(const doi of candidates){const b=document.createElement('button');b.type='button';b.className='doi-candidate';b.textContent=doi;b.onclick=()=>{$('#lookup-query').value=doi;lookup(doi)};$('#lookup-results').append(b)}}else{lookupStatus('No DOI detected on the first page. Paste a DOI or search by title. Scanned PDFs need OCR.')}}catch(e){lookupStatus('Detection incomplete: '+e.message)}finally{if(token===lookupEpoch)lookupBusy(false)}}
$('#metadata').onclick=()=>{if(!current)return toast('Import or select a paper first.');lookupEpoch++;lookupBusy(false);formFill(current.meta);$('#lookup-query').value=current.meta.doi||'';$('#lookup-results').innerHTML='';lookupStatus('');$('#meta-dialog').showModal();if(!current.meta.verified&&!current.meta.authors)detectPdfDoi(true)};
$('#lookup-doi').onclick=()=>{const q=$('#lookup-query').value.trim();if(!q)return lookupStatus('Paste a DOI or enter a paper title.');if(/^https?:|^doi:|^10\./i.test(q)&&!normalizeDoi(q))return lookupStatus('Invalid DOI format. Check and retry.');lookup(q)};
$('#lookup-query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#lookup-doi').click()}};
$('#detect-doi').onclick=()=>detectPdfDoi(true);
$('#meta-dialog').addEventListener('close',()=>{lookupEpoch++;lookupBusy(false)});
$('#meta-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.verified=e.target.elements.verified.checked;current.meta=data;await put(current);$('#title').textContent=data.title;list();$('#meta-dialog').close()};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#export-md').onclick=async()=>{if(!current)return toast('Select a paper first');await flush();download(new Blob([noteText()],{type:'text/markdown;charset=utf-8'}),(activeNoteId==='main'&&!current.noteTitle?current.meta.title:noteList(current).find(n=>n.id===activeNoteId).title).replace(/[/\\:*?"<>|]/g,'_')+'.md')};
$('#backup').onclick=async()=>{await flush();await saveQueue;const records=await Promise.all(papers.map(async p=>({...p,pdf:await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(p.pdf)})})));download(new Blob([JSON.stringify({format:'paper-garden',version:1,collections:collectionOptions(),papers:records})],{type:'application/json'}),'paper-garden-backup.json');toast('Full backup downloaded, including PDFs, metadata, notes and highlights.')};
$('#restore').onchange=async e=>{try{const b=JSON.parse(await e.target.files[0].text());if(b.format!=='paper-garden'||b.version!==1||!Array.isArray(b.papers))throw Error('Invalid Paper Garden backup');const imported=[];for(const raw of b.papers){if(typeof raw.id!=='string'||!raw.meta||typeof raw.note!=='string'||!Array.isArray(raw.highlights)||typeof raw.pdf!=='string'||!raw.pdf.startsWith('data:application/pdf;base64,'))throw Error('Incomplete backup data');validateAdditionalNotes(raw);const {pdf,...rest}=raw;const bytes=Uint8Array.from(atob(pdf.split(',')[1]),c=>c.charCodeAt(0));imported.push({...rest,pdf:new Blob([bytes],{type:'application/pdf'})})}if(!confirm(`Restore ${imported.length} papers? Matching IDs will be replaced; other papers will remain.`))return;collections=[...new Set([...collections,...(Array.isArray(b.collections)?b.collections.filter(x=>typeof x==='string'):[])])];saveCollections();for(const p of imported)await put(p);papers=await all();current=null;list();if(papers.length)await openPaper(papers[0].id);toast('Backup restored.')}catch(err){toast('Restore failed: '+err.message)}finally{e.target.value=''}};
function csl(p){const m=p.meta;const author=m.authors.split('\n').filter(x=>x.trim()).map(s=>{const i=s.indexOf(',');return i<0?{literal:s.trim()}:{family:s.slice(0,i).trim(),given:s.slice(i+1).trim()}});return {id:p.id,type:m.type,title:m.title,author,...(m.year?{'issued':{'date-parts':[[Number(m.year)]]}}:{}),'container-title':m.journal,volume:m.volume,issue:m.issue,page:m.pages,DOI:m.doi.replace(/^https?:\/\/(dx\.)?doi.org\//,''),URL:m.url}}
$('#citations').onclick=()=>{$('#cite-list').innerHTML=papers.map(p=>`<label class="check"><input type="checkbox" value="${esc(p.id)}" ${p.meta.verified?'checked':''}> ${esc(p.meta.title)} ${p.meta.verified?'✓':'(unverified)'}</label>`).join('')||'<p>Import a paper first.</p>';$('#cite-output').innerHTML='';$('#cite-dialog').showModal()};
$('#generate').onclick=()=>{const ids=[...$('#cite-list').querySelectorAll('input:checked')].map(e=>e.value),selected=papers.filter(p=>ids.includes(p.id));if(!selected.length)return toast('Select at least one paper');if(selected.some(p=>!p.meta.verified||!p.meta.authors.trim()||!p.meta.year))return toast('Verify the selected papers and add authors and years first.');try{$('#cite-output').innerHTML=DOMPurify.sanitize(new Cite(selected.map(csl)).format('bibliography',{format:'html',template:'apa',lang:'en-US'}))}catch(e){toast('Could not generate citations: '+e.message)}};$('#copy-cites').onclick=async()=>{if(!$('#cite-output').textContent)return toast('Generate references first');try{await navigator.clipboard.writeText($('#cite-output').innerText);toast('References copied')}catch{toast('Could not copy automatically. Select the reference text to copy.')}};$('#download-cites').onclick=()=>{if(!$('#cite-output').textContent)return toast('Generate references first');download(new Blob(['<!doctype html><meta charset="utf-8"><title>References</title><style>body{font:12pt/2 "Times New Roman";max-width:800px;margin:60px auto}.csl-entry{padding-left:0.5in;text-indent:-0.5in}</style><h1>References</h1>'+$('#cite-output').innerHTML],{type:'text/html;charset=utf-8'}),'references-APA7.html')};
window.addEventListener('beforeunload',e=>{if(notesTimer){clearTimeout(notesTimer);if(current){setNoteText($('#editor').value);const tx=db.transaction('papers','readwrite');tx.objectStore('papers').put(current)}}});
setupKeyboard({current:()=>current,page:()=>page,sheet:()=>viewer.sheet(page),render,toast,showSidebar:()=>setSidebarCollapsed(false),leaveFocus:()=>{if(focusMode)setFocusMode(false)},goPage:n=>{if(doc){page=Math.max(1,Math.min(doc.numPages,n));return render().catch(e=>toast(e.message))}},async highlight(data){current.highlights.push({id:uid(),...data,text:cleanHighlightText(data.rawText),comment:''});await put(current);drawHighlights();drawMarks();list()}});
try{papers=await all();list();if(papers.length)await openPaper(papers[0].id);navigator.storage?.persist?.().catch(()=>{})}catch(e){toast('Browser storage unavailable: '+e.message)}
