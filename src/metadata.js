export function normalizeDoi(value){
 let s=String(value||'').trim().replace(/^doi\s*:\s*/i,'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
 try{s=decodeURIComponent(s)}catch{}
 s=s.replace(/[.,;:]+$/g,'');
 while(s.endsWith(')')&&(s.match(/\)/g)||[]).length>(s.match(/\(/g)||[]).length)s=s.slice(0,-1);
 return /^10\.\d{4,9}\/\S+$/i.test(s)&&s.length<=300?s:'';
}
export function detectDois(text){
 const normalized=String(text||'').replace(/10\.(\d{4,9})\s*\/\s*/g,'10.$1/');
 const counts=new Map();for(const match of normalized.matchAll(/10\.\d{4,9}\/[^\s<>"\u2020]+/gi)){const doi=normalizeDoi(match[0]);if(!doi)continue;const key=doi.toLowerCase();const old=counts.get(key)||{doi,count:0};old.count++;counts.set(key,old)}
 return [...counts.values()].sort((a,b)=>b.count-a.count).map(x=>x.doi);
}
export function crossrefMeta(m){
 if(!m||!m.DOI||!Array.isArray(m.title)||!m.title[0])throw Error('Search result lacks a title or DOI. Verify manually.');
 const strip=s=>String(s||'').replace(/<[^>]*>/g,'').trim();
 const date=m['published-print']||m.published||m['published-online']||m.issued;
 return {title:strip(m.title[0]),authors:(m.author||[]).map(a=>a.family?[a.family,a.given].filter(Boolean).join(', '):a.name||'').filter(Boolean).join('\n'),year:String(date?.['date-parts']?.[0]?.[0]||''),type:m.type==='book'?'book':m.type==='posted-content'?'report':'article-journal',journal:strip(m['container-title']?.[0]),volume:String(m.volume||''),issue:String(m.issue||''),pages:String(m.page||m['article-number']||''),doi:m.DOI,url:m.URL||'https://doi.org/'+m.DOI,verified:false};
}
export async function fetchCrossref({doi,title},fetcher=fetch){
 const clean=doi?normalizeDoi(doi):'';
 if(doi&&!clean)throw Error('Invalid DOI. Use 10.xxxx/xxxxx or a full DOI URL.');
 if(!clean&&String(title||'').trim().length<8)throw Error('Enter a paper title (at least 8 characters).');
 const endpoint=clean?'https://api.crossref.org/works/'+encodeURIComponent(clean):'https://api.crossref.org/works?'+new URLSearchParams({'query.title':String(title).trim(),rows:'5'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{const r=await fetcher(endpoint,{headers:{Accept:'application/json'},signal:controller.signal});if(r.status===404)throw Error('DOI not found in Crossref. Check it or search by title. Some preprints are not indexed.');if(r.status===429)throw Error('Metadata search rate limit reached. Try again later.');if(!r.ok)throw Error('Metadata service unavailable ('+r.status+'）。');const data=await r.json();if(data.status!=='ok')throw Error('The metadata service returned no valid result.');return clean?[data.message]:(data.message?.items||[])}catch(e){if(e.name==='AbortError')throw Error('Search timed out. Retry later; existing metadata is unchanged.');if(e instanceof TypeError)throw Error('Could not connect to Crossref. Check your connection or enter metadata manually.');throw e}finally{clearTimeout(timer)}
}
