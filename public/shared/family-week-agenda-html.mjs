/** Escape all school PDF text and user-entered family activity content. */
const esc=s=>String(s??'').replace(/[&<>"']/gu,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
import {contentCategory,contentCategoryLabel} from './content-categories.mjs';
const link=url=>{try{
 const u=new URL(url);
 return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;
}catch{return null;}};
export function familyAgendaItemHtml(item){
 const kind=['homework','school','municipal','family'].includes(item.kind)?item.kind:'school';
 const category=contentCategory(kind);
 const source=link(item.source?.url);
 const title=esc(item.title);
 const symbol={homework:'📚',school:'📌',municipal:'🏫',family:'⚽'}[kind];
 const compactLine=[item.timeLabel||'',item.scope||''].filter(Boolean).join(' · ');
 return '<article class="family-agenda-item kind-'+kind+' content-kind-'+category+(item.checked?' checked':'')+'">'+
  '<span class="family-agenda-type kind-'+kind+' content-type-label content-kind-'+category+'">'+contentCategoryLabel(kind)+
  (item.kind==='family'&&item.timeLabel?' · '+esc(item.timeLabel):'')+'</span>'+
  '<div class="family-agenda-compact-main"><span class="family-agenda-compact-icon" aria-hidden="true">'+symbol+'</span>'+
  '<span class="family-agenda-compact-text"><strong>'+title+'</strong>'+
  '<span class="family-agenda-compact-line">'+esc(compactLine||contentCategoryLabel(kind,{short:true}))+
  (item.checked?' · ✓ Ferdig':'')+'</span></span></div>'+
  '<div class="family-agenda-item-more">'+
  '<small>'+esc(item.scope||'')+'</small>'+
  (item.details?'<div class="family-agenda-meta">'+esc(item.details)+'</div>':'')+
  (source?'<a class="family-agenda-source" target="_blank" rel="noopener noreferrer" href="'+
    esc(source)+'">Kilde: '+esc(item.source?.name||'Offisiell kilde')+' ↗</a>':
   item.kind==='family'?'<span class="family-agenda-meta">Lagt inn av familien</span>':'')+
  (item.checked?'<span class="family-agenda-meta">✓ Fullført</span>':'')+
  (item.kind==='family'&&item.activityId?
   '<button type="button" class="family-agenda-edit" data-family-agenda-edit="'+
    esc(item.activityId)+'">Endre aktivitet</button>':'')+
  '</div>'+
  '<button type="button" class="family-agenda-expand" data-family-agenda-details aria-expanded="false">Mer info</button>'+
 '</article>';
}
export function familyAgendaMarkup(model,{today=''}={}){
 const days=model.days.map(d=>
  '<section class="family-agenda-day'+(today===d.date?' today':'')+
   (!d.items.length?' is-empty':'')+'" aria-label="'+esc(d.title)+'">'+
   '<h3>'+esc(d.title)+'</h3>'+
   (d.items.length?d.items.map(familyAgendaItemHtml).join(''):
    '<p class="family-agenda-quiet">Ingen registrerte hendelser</p>')+
  '</section>').join('');
 const undated=model.undated.map(familyAgendaItemHtml).join('');
 return {days,undated};
}
