/** Escape all school PDF text and user-entered family activity content. */
const esc=s=>String(s??'').replace(/[&<>"']/gu,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const icon={homework:'📖',school:'📌',municipal:'📅',family:'🎵'};
const label={homework:'Leksefrist',school:'Skolen',municipal:'Skolerute',family:'Familieaktivitet'};
const link=url=>{try{
 const u=new URL(url);
 return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;
}catch{return null;}};
export function familyAgendaItemHtml(item){
 const kind=Object.hasOwn(label,item.kind)?item.kind:'school';
 const source=link(item.source?.url);
 const title=esc(item.title);
 return '<article class="family-agenda-item kind-'+kind+(item.checked?' checked':'')+'">'+
  '<span class="family-agenda-type kind-'+kind+'">'+icon[kind]+' '+label[kind]+
  (item.kind==='family'&&item.timeLabel?' · '+esc(item.timeLabel):'')+'</span>'+
  '<strong>'+title+'</strong>'+
  '<small>'+esc(item.scope||'')+'</small>'+
  (item.details?'<div class="family-agenda-meta">'+esc(item.details)+'</div>':'')+
  (source?'<a class="family-agenda-source" target="_blank" rel="noopener noreferrer" href="'+
    esc(source)+'">Kilde: '+esc(item.source?.name||'Offisiell kilde')+' ↗</a>':
   item.kind==='family'?'<span class="family-agenda-meta">Lagt inn av familien</span>':'')+
  (item.checked?'<span class="family-agenda-meta">✓ Fullført</span>':'')+
  (item.kind==='family'&&item.activityId?
   '<button type="button" class="family-agenda-edit" data-family-agenda-edit="'+
    esc(item.activityId)+'">Endre aktivitet</button>':'')+
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
 const undated=model.undated.length?
  '<h3>Hele uka · ingen bestemt dag oppgitt</h3>'+
  '<div class="family-agenda-undated-list">'+model.undated.map(familyAgendaItemHtml).join('')+'</div>':'';
 return {days,undated};
}
