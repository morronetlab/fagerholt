/** Mobile-only card visibility preference. Does not change or fetch family data. */
const cards=document.getElementById('family-cards');
const openButton=document.getElementById('family-overview-child-open');
const picker=document.getElementById('family-overview-child-picker');
const dialog=document.getElementById('family-overview-child-dialog');
const options=document.getElementById('family-overview-child-options');
let selected='';
function children(){
 return [...cards.querySelectorAll(':scope > .family-child[data-child-id]')];
}
function sync(){
 const list=children();
 if(!list.some(card=>card.dataset.childId===selected))selected='';
 picker.hidden=list.length<2;
 const label=list.find(card=>card.dataset.childId===selected)
  ?.querySelector('.family-child-heading h3')?.textContent||'Alle barn';
 openButton.firstChild.textContent='Vis barnekort: '+label+' ';
 for(const card of list)
  card.classList.toggle('family-overview-child-hidden',Boolean(selected&&card.dataset.childId!==selected));
}
function makeChoice(id,label){
 const button=document.createElement('button');
 button.type='button';
 button.className='family-overview-child-choice sk-action sk-action--choice';
 button.dataset.overviewChild=id;
 button.textContent=label;
 button.setAttribute('aria-pressed',String(selected===id));
 return button;
}
function show(){
 if(picker.hidden)return;
 options.replaceChildren(makeChoice('','👪 Alle barn'));
 for(const card of children()){
  const name=card.querySelector('.family-child-heading h3')?.textContent||'Barn';
  options.append(makeChoice(card.dataset.childId,'👤 '+name));
 }
 dialog.showModal();
}
openButton.addEventListener('click',show);
document.getElementById('family-overview-child-close').addEventListener('click',()=>dialog.close());
options.addEventListener('click',event=>{
 const target=event.target.closest('[data-overview-child]');
 if(!target)return;
 selected=target.dataset.overviewChild;
 dialog.close();sync();
});
dialog.addEventListener('close',()=>openButton.focus({preventScroll:true}));
// Family cards are replaced after PDF progress and plan refreshes. React only
// to direct child-list changes, not class mutations made by sync().
new MutationObserver(sync).observe(cards,{childList:true});
sync();
