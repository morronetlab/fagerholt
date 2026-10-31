/** Email-client compatible, escaped, inline-styled family briefing. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shorten=(value,max=320)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const field=(label,value)=>'<tr><td style="padding:0 0 9px;font:14px/1.55 Arial,sans-serif;color:#273548;vertical-align:top;"><strong style="color:#152b44;">'+esc(label)+'</strong> '+esc(value)+'</td></tr>';
const collection=(items,empty)=>items.length?'<table role="presentation" cellpadding="0" cellspacing="0" width="100%">'+items.map(item=>field(item.day?item.day+' ·':'',item.text)).join('')+'</table>':'<p style="margin:0;color:#68778b;font:14px/1.5 Arial,sans-serif;">'+esc(empty)+'</p>';
function panel(heading,items,empty){
 return '<tr><td style="padding:0 0 19px;"><h3 style="font:700 13px/1.4 Arial,sans-serif;color:#294b67;margin:0 0 9px;">'+esc(heading)+'</h3>'+collection(items,empty)+'</td></tr>';
}
export function renderWeeklyDigestHtml(digest,{test=false}={}){
 const title='Skoleuka · Uke '+esc(digest.week);
 const subtitle=esc(digest.range||'');
 const cards=(digest.sections||[]).map(section=>{
  const valid=section.ready;
  const stateLabel=section.state==='unpublished'?'Ukeplanen er ikke publisert ennå':
   section.state==='processing'?'Ukeplanen behandles':'Ukeplanen er ikke klar';
  return '<tr><td style="padding:0 0 18px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #dce7ed;border-radius:14px;background:#ffffff;"><tr><td style="padding:22px 22px 6px;"><h2 style="font:700 20px/1.35 Arial,sans-serif;margin:0 0 6px;color:#162d45;">'+esc(section.name)+'</h2><p style="font:13px/1.5 Arial,sans-serif;color:'+(valid?'#37725e':'#98622b')+';margin:0 0 18px;">'+(valid?(section.partial?'Delvis kontrollert – sjekk originalen':'Ukeplanen er behandlet'):stateLabel)+'</p></td></tr>'+
  (section.auditNote?'<tr><td style="padding:0 22px 18px;"><p style="margin:0;background:#fff6e8;padding:12px 14px;border-radius:9px;font:13px/1.6 Arial,sans-serif;color:#825518;">'+esc(section.auditNote)+'</p></td></tr>':'')+
  (valid?'<tr><td style="padding:0 22px 5px;"><table role="presentation" width="100%">'+
    panel('VIKTIG Å HUSKE',section.notices,section.partial?'Ingen individuelt verifiserte beskjeder. Sjekk skolens PDF.':'Ingen særskilte beskjeder registrert.')+
    panel('LEKSER OG FRISTER',section.homework,'Ingen registrerte lekser i den verifiserte planen.')+
    panel('HUSK Å TA MED',section.gear,'Ingen spesielt utstyr registrert.')+
    '</table></td></tr>':'<tr><td style="padding:0 22px 20px;font:14px/1.6 Arial,sans-serif;color:#52647a;">'+esc(section.reason||'Innholdet er ennå ikke verifisert.')+'</td></tr>')+
  (section.pdf?'<tr><td style="padding:0 22px 22px;"><a style="color:#126a8e;text-decoration:underline;font:13px Arial,sans-serif;" href="'+esc(section.pdf)+'">Se original ukeplan (PDF)</a></td></tr>':
   section.source?'<tr><td style="padding:0 22px 22px;"><a style="color:#126a8e;text-decoration:underline;font:13px Arial,sans-serif;" href="'+esc(section.source)+'">Se skolens trinnside</a></td></tr>':'')+
  '</table></td></tr>';
 }).join('');
 const facts=(digest.municipal||[]).map(x=>'<tr><td style="padding:0 0 12px;font:14px/1.5 Arial,sans-serif;color:#24384b;">'+esc(x)+'</td></tr>').join('');
 const warning=digest.missingPlans>0?'<tr><td style="padding:13px 16px;border-radius:10px;background:#fff6e8;color:#86571c;font:13px/1.6 Arial,sans-serif;">'+esc(digest.missingPlans)+' '+(digest.missingPlans===1?'ukeplan er ikke klar.':'ukeplaner er ikke klare.')+' Se Skoleuka for oppdatert informasjon.</td></tr>':'';
 return '<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>'+title+'</title></head>'+
 '<body style="margin:0;padding:0;background:#f1f5f8;color:#173047;">'+
 '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Lekser, utstyr og viktige beskjeder for '+subtitle+'.</div>'+
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f8;"><tr><td align="center" style="padding:24px 12px 36px;">'+
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">'+
 '<tr><td style="background:#123951;padding:30px 26px;border-radius:16px 16px 0 0;"><p style="color:#9fdfd4;font:700 12px Arial,sans-serif;letter-spacing:2px;margin:0 0 10px;">SKOLEUKA</p><h1 style="font:700 30px/1.2 Arial,sans-serif;color:#fff;margin:0 0 8px;">'+title+'</h1><p style="font:15px/1.5 Arial,sans-serif;color:#dceaf3;margin:0;">'+subtitle+'</p></td></tr>'+
 '<tr><td style="background:#ffffff;padding:22px 22px 4px;border-radius:0 0 16px 16px;">'+
 (test?'<p style="background:#e8f5f3;border-radius:8px;padding:10px 14px;font:700 13px Arial,sans-serif;color:#116451;margin:0 0 18px;">Dette er en testutsending.</p>':'')+
 '<p style="font:14px/1.6 Arial,sans-serif;color:#495a6d;margin:0 0 22px;">Her er det viktigste fra barnas skoleuke – hentet fra publiserte ukeplaner. Sjekk originalen ved endringer.</p>'+
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'+
 (facts?'<tr><td style="padding:9px 0 18px;"><h2 style="font:700 18px Arial,sans-serif;color:#162d45;margin:0 0 12px;">Skolerute og fridager</h2><table role="presentation">'+facts+'</table></td></tr>':'')+
 cards+warning+'</table>'+
 '<table role="presentation" width="100%"><tr><td align="center" style="padding:24px 0 28px;"><a href="https://skoleuka.no/" style="display:inline-block;background:#147d83;color:#fff;font:700 15px Arial,sans-serif;text-decoration:none;padding:15px 23px;border-radius:10px;">Åpne hele ukeplanen</a></td></tr></table>'+
 '</td></tr><tr><td style="padding:20px 16px;text-align:center;font:12px/1.7 Arial,sans-serif;color:#66788a;">Du får denne e-posten fordi du meldte deg på søndagsoppsummering.<br>Slå av under <a style="color:#126a8e;" href="https://skoleuka.no/">Min konto → Søndagsoppsummering</a>.<br>Skolens egne beskjeder og PDF har alltid forrang.</td></tr>'+
 '</table></td></tr></table></body></html>';
}
