/** Safe normalized PDF crop bounds in thousandths of the page (top-left origin).
 * Crop data are evidence hints from the AI, never a license to show a full page.
 */
export function normalizeVisualRegion(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const keys=['x','y','width','height'];
 if(!keys.every(k=>Number.isInteger(raw[k])))return null;
 const {x,y,width,height}=raw;
 // Tight crops only. An uncertain/overly broad box is better omitted.
 if(x<0||y<0||width<65||height<65||x+width>1000||y+height>1000)return null;
 if(width>920||height>750||width*height>450000)return null;
 return {x,y,width,height};
}

const area=r=>r.width*r.height;
/** Reject a second crop if it would essentially display an already shown crop. */
export function duplicateVisualRegion(a,b){
 if(!a||!b)return false;
 const left=Math.max(a.x,b.x),top=Math.max(a.y,b.y);
 const right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);
 const shared=Math.max(0,right-left)*Math.max(0,bottom-top);
 if(!shared)return false;
 return shared/(area(a)+area(b)-shared)>=.48||shared/Math.min(area(a),area(b))>=.80;
}

/** Return dimensions and an affine transform for PDF.js to draw *only* the crop. */
export function visualCropGeometry(region,pageWidth,pageHeight,boxWidth=460,deviceScale=1){
 const safe=normalizeVisualRegion(region)||(
  region&&['x','y','width','height'].every(k=>Number.isFinite(region[k]))&&
  region.x>=0&&region.y>=0&&region.width>=65&&region.height>=65&&
  region.x+region.width<=1000&&region.y+region.height<=1000?region:null);
 if(!safe||pageWidth<=0||pageHeight<=0)return null;
 const pdfWidth=pageWidth*safe.width/1000;
 const pdfHeight=pageHeight*safe.height/1000;
 const maxDisplay=Math.max(100,Math.min(720,boxWidth));
 const scale=Math.min(2.4,maxDisplay/pdfWidth);
 const cssWidth=Math.max(1,Math.round(pdfWidth*scale));
 const cssHeight=Math.max(1,Math.round(pdfHeight*scale));
 const pixelRatio=Math.max(1,Math.min(2,deviceScale));
 return {cssWidth,cssHeight,pixelWidth:Math.ceil(cssWidth*pixelRatio),pixelHeight:Math.ceil(cssHeight*pixelRatio),
   viewportScale:scale,
   // PDF.js uses a top-left oriented viewport; offset the page into the crop canvas.
   transform:[pixelRatio,0,0,pixelRatio,-pageWidth*(safe.x/1000)*scale*pixelRatio,-pageHeight*(safe.y/1000)*scale*pixelRatio]};
}

/** Broaden an AI estimate to reduce accidental clipping of illustrations/captions.
 * Exact complete page is always separately accessible on user request. */
export function paddedVisualRegion(raw,padX=45,padY=65){
 const r=normalizeVisualRegion(raw);if(!r)return null;
 const x=Math.max(0,r.x-padX),y=Math.max(0,r.y-padY);
 const right=Math.min(1000,r.x+r.width+padX),bottom=Math.min(1000,r.y+r.height+padY);
 const expanded={x,y,width:right-x,height:bottom-y};
 return normalizeVisualRegion(expanded)||r;
}
export function fullPageGeometry(pageWidth,pageHeight,boxWidth=460,deviceScale=1){
 if(!(pageWidth>0&&pageHeight>0))return null;
 const maxDisplay=Math.max(100,Math.min(720,boxWidth));
 const scale=Math.min(1.5,maxDisplay/pageWidth);
 const cssWidth=Math.max(1,Math.round(pageWidth*scale)),cssHeight=Math.max(1,Math.round(pageHeight*scale));
 const pixelRatio=Math.max(1,Math.min(2,deviceScale));
 return {cssWidth,cssHeight,pixelWidth:Math.ceil(cssWidth*pixelRatio),pixelHeight:Math.ceil(cssHeight*pixelRatio),viewportScale:scale,
   transform:[pixelRatio,0,0,pixelRatio,0,0]};
}

/** User-controlled width and height expansion, independent of AI's tight box. */
export function adjustableVisualRegion(raw,{horizontal=0,vertical=0}={}){
 const r=normalizeVisualRegion(raw);if(!r)return null;
 const xPad=40+Math.max(0,Math.min(4,horizontal))*95;
 const yPad=35+Math.max(0,Math.min(4,vertical))*75;
 const x=Math.max(0,r.x-xPad),y=Math.max(0,r.y-yPad);
 const right=Math.min(1000,r.x+r.width+xPad),bottom=Math.min(1000,r.y+r.height+yPad);
 const wide={x,y,width:right-x,height:bottom-y};
 if(wide.width<=0||wide.height<=0)return null;
 return wide;
}
