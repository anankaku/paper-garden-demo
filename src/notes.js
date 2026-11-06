export function validateAdditionalNotes(p){
 if(p.noteTitle!==undefined&&typeof p.noteTitle!=='string')throw Error('Invalid note title');
 if(p.extraNotes===undefined)return;
 if(!Array.isArray(p.extraNotes))throw Error('Invalid additional notes');
 const ids=new Set(['main']);
 for(const note of p.extraNotes){
  if(typeof note?.id!=='string'||!/^[-a-z0-9]+$/i.test(note.id)||ids.has(note.id)||
     typeof note.title!=='string'||typeof note.text!=='string')throw Error('Invalid additional note');
  ids.add(note.id);
 }
}
