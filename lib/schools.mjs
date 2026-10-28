/** Discover grade sections from the school's own MinSkole navigation.
 * No guessed section IDs, and never accept a section from another school.
 */
import {siteConfig} from '../public/site-config.mjs';

export const getSchool=(id)=>typeof id==='string'&&Object.hasOwn(siteConfig.schools,id)?siteConfig.schools[id]:null;
export const gradeNumbers=Object.freeze(['1','2','3','4','5','6','7']);
export const validGradeCode=grade=>typeof grade==='string'&&/^[1-7](?:[A-Z])?$/.test(grade);
const entities=value=>String(value).replace(/&(?:amp|quot|apos|#39|#x27|nbsp);/gi,x=>({
  '&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&#x27;':"'",'&nbsp;':' '
})[x.toLowerCase()]||x);
const htmlText=s=>entities(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const gradeLabel=text=>{
  const input=text.trim();
  if(/^\d\s*\.\s*[-–]\s*\d/.test(input))return null;
  const plain=/^([1-7])\s*(?:\.)?\s*(?:trinn|klasse)\b/i.exec(input);
  if(plain)return plain[1];
  const grouped=/^([1-7])\s*([A-F])(?:\s*(?:[.\-–]\s*)?(?:trinn|klasse))?(?:\b|$)/i.exec(input);
  return grouped?grouped[1]+grouped[2].toUpperCase():null;
};
export function isSchoolSectionUrl(url,school,grade=null){
 try{
  const u=new URL(url),root=new URL(school.homepage);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return false;
  if(!siteConfig.allowedSourceHosts.includes(u.hostname)||!siteConfig.allowedSourceHosts.includes(root.hostname))return false;
  const prefix=root.pathname.replace(/\/+$/,'');
  if(!new RegExp('^'+prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/seksjon/[0-9]+/?$','i').test(u.pathname))return false;
  return !(grade&&school.grades?.[grade]&&url!==school.grades[grade]);
 }catch{return false;}
}
export function discoverGradeSections(html,school){
  if(!school||typeof html!=='string')return {};
  const grades={};
  const anchor=/<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi;
  let m;
  while((m=anchor.exec(html))){
    const href=/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1]);
    if(!href)continue;
    const grade=gradeLabel(htmlText(m[2]));
    if(!grade||grades[grade])continue;
    try{
      const url=new URL(entities(href[1]||href[2]||href[3]),school.homepage).href;
      if(isSchoolSectionUrl(url,school,grade))grades[grade]=url;
    }catch{}
  }
  return grades;
}
export function gradesForSchool(school,discovered={}){
  const all={...discovered,...(school.grades||{})};
  for(const key of Object.keys(all)){
    if(/^[1-7]$/.test(key)&&Object.keys(all).some(k=>k.length===2&&k.startsWith(key)))delete all[key];
  }
  return all;
}
/** Get the school's own grade links; site map is a fallback for MinSkole homepages without nav. */
export async function locateGradeSections(school,loadHtml){
  if(school.grades)return school.grades;
  let pages={};
  try{pages=discoverGradeSections(await loadHtml(school.homepage),school);}catch(error){
    console.warn('School homepage navigation unavailable',school.id,error?.message);
  }
  if(Object.keys(pages).length<7){
    try{
      const sitemap=new URL(school.homepage.replace(/\/$/,'')+'/nettstedskart');
      const found=discoverGradeSections(await loadHtml(sitemap.href),school);
      pages={...found,...pages};
    }catch(error){console.warn('School site map unavailable',school.id,error?.message);}
  }
  return gradesForSchool(school,pages);
}

