/** Keep focused form controls accessible above mobile software keyboards.
 * visualViewport is smaller than the layout viewport when iOS/Android shows
 * the keyboard. The layout itself is never forced to a fixed pixel height.
 */
export const KEYBOARD_THRESHOLD_PX=130;
export function keyboardViewport({baseline,visibleHeight,offsetTop=0,focused=false}){
 const height=Math.max(0,Number(visibleHeight)||0);
 const top=Math.max(0,Number(offsetTop)||0);
 const layout=Math.max(height,Number(baseline)||height);
 const occluded=Math.max(0,layout-height-top);
 return {open:Boolean(focused&&layout-height>=KEYBOARD_THRESHOLD_PX),
  height,top,occluded};
}
const editable=node=>Boolean(node?.matches?.(
 'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="hidden"]), [contenteditable="true"]'
 )&&!node.disabled&&!node.readOnly);
export function initMobileKeyboardGuard({win=window,doc=document}={}){
 const viewport=win.visualViewport;
 if(!viewport||!doc.body)return ()=>{};
 let baseline=Math.max(win.innerHeight,viewport.height),scrollTimer=0,focusTimer=0;
 let closingTimer=0,disposed=false,applied=false;
 const mobile=()=>win.matchMedia('(max-width: 1024px)').matches;
 const restore=()=>{
  if(!applied)return;
  delete doc.body.dataset.mobileKeyboard;
  doc.body.style.removeProperty('--mobile-vv-height');
  doc.body.style.removeProperty('--mobile-vv-top');
  doc.body.style.removeProperty('--mobile-keyboard-inset');
  applied=false;
 };
 const focused=()=>editable(doc.activeElement)?doc.activeElement:null;
 function keepVisible(){
  const field=focused();
  if(!field||!applied||!field.isConnected)return;
  const viewportTop=Math.max(0,viewport.offsetTop||0),viewportBottom=viewportTop+viewport.height;
  const dialog=field.closest('dialog[open]');
  // On modal screens, scroll only inside the modal; never move the
  // underlying body, which is deliberately locked while a dialog is open.
  const bounds=dialog?.getBoundingClientRect();
  const top=Math.max(viewportTop+16,bounds?bounds.top+16:0);
  let bottom=Math.min(viewportBottom-24,bounds?bounds.bottom-16:Infinity);
  if(field.closest('.account-panel .onboard-child-form, .account-panel #onboard-child-form'))
   bottom-=80; // sticky onboarding actions occupy some of the visible space
  if(dialog?.matches('.family-child-dialog'))
   bottom-=70; // keep the sticky Save button clear of the active child field
  if(bottom<=top+30)return;
  const r=field.getBoundingClientRect();
  const delta=r.bottom>bottom?Math.ceil(r.bottom-bottom+10):
   r.top<top?Math.floor(r.top-top-10):0;
  if(delta){
   if(dialog)dialog.scrollTop+=delta;
   else win.scrollBy({top:delta,behavior:'instant'});
  }
 }
 function scheduleVisible(){
  win.clearTimeout(scrollTimer);
  scrollTimer=win.setTimeout(keepVisible,75);
 }
 function update(){
  if(disposed)return;
  const field=focused();
  if(!field||!mobile()){
   restore();
   // Do not memorize the keyboard-sized viewport during its closing
   // animation. The reference stays at the largest keyboard-free height.
   if(viewport.height>=baseline-80)baseline=viewport.height;
   return;
  }
  const state=keyboardViewport({baseline,visibleHeight:viewport.height,
   offsetTop:viewport.offsetTop,focused:true});
  if(!state.open){restore();return;}
  doc.body.dataset.mobileKeyboard='open';
  doc.body.style.setProperty('--mobile-vv-height',state.height+'px');
  doc.body.style.setProperty('--mobile-vv-top',state.top+'px');
  doc.body.style.setProperty('--mobile-keyboard-inset',state.occluded+'px');
  applied=true;
  scheduleVisible();
 }
 function onFocus(){
  win.clearTimeout(closingTimer);
  update();
  // Keyboard animations usually finish after focusin. Re-measure even
  // when the browser does not dispatch a reliable viewport resize event.
  win.clearTimeout(focusTimer);
  focusTimer=win.setTimeout(update,250);
 }
 function onBlur(){
  win.clearTimeout(closingTimer);
  closingTimer=win.setTimeout(update,180);
 }
 function onOrientation(){
  win.clearTimeout(focusTimer);
  win.clearTimeout(scrollTimer);
  restore();
  baseline=viewport.height;
  focusTimer=win.setTimeout(()=>{baseline=viewport.height;update();},400);
 }
 doc.addEventListener('focusin',onFocus);
 doc.addEventListener('focusout',onBlur);
 viewport.addEventListener('resize',update);
 viewport.addEventListener('scroll',update);
 win.addEventListener('resize',update);
 win.addEventListener('orientationchange',onOrientation);
 win.addEventListener('pagehide',restore);
 return ()=>{
  disposed=true;
  for(const timer of [scrollTimer,focusTimer,closingTimer])win.clearTimeout(timer);
  doc.removeEventListener('focusin',onFocus);
  doc.removeEventListener('focusout',onBlur);
  viewport.removeEventListener('resize',update);
  viewport.removeEventListener('scroll',update);
  win.removeEventListener('resize',update);
  win.removeEventListener('orientationchange',onOrientation);
  win.removeEventListener('pagehide',restore);
  restore();
 };
}
if(typeof window!=='undefined'&&typeof document!=='undefined')
 initMobileKeyboardGuard();
