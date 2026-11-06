// PDF layout whitespace is not semantic paragraph structure. Keep raw text on the
// highlight record so the source extraction remains available without altering notes.
export function cleanHighlightText(value){
 return String(value||'')
  .replace(/\r\n?/g,'\n')
  .replace(/\u00ad/g,'')
  .replace(/([a-zA-Z])[-‐][\t ]*\n[\t ]*([a-z])/g,'$1$2')
  .replace(/([\u3400-\u9fff])[\t ]*\n[\t ]*(?=[\u3400-\u9fff])/g,'$1')
  .replace(/[\s\u00a0]+/g,' ')
  .trim();
}
