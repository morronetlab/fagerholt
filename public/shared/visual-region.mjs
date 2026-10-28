/** Safe normalized PDF crop bounds, thousandths of a page, top-left origin. */
export function normalizeVisualRegion(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 if(!['x','y','width','height'].every(k=>Number.isInteger(raw[k])))return null;
 const {x,y,width,height}=raw;
 // Reject whole pages, oversized or unreliable regions.
 if(x<0||y<0||width<65||height<65||x+width>1000||y+height>1000)return null;
 if(width>920||height>750||width*height>450000)return null;
 return {x,y,width,height};
}
const area=r=>r.width*r.height;
/** Two cards must not show substantially the same underlying visual. */
export function duplicateVisualRegion(a,b){
 if(!a||!b)return false;
 const left=Math.max(a.x,b.x),top=Math.max(a.y,b.y);
 const right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);
 const shared=Math.max(0,right-left)*Math.max(0,bottom-top);
 if(!shared)return false;
 return shared/(area(a)+area(b)-shared)>=.48||shared/Math.min(area(a),area(b))>=.80;
}
/** Dimensions and transform for a cropped PDF.js canvas (not a full-page render). */
export function visualCropGeometry(region,pageWidth,pageHeight,boxWidth=460,deviceScale=1){
 const safe=normalizeVisualRegion(region);
 if(!safe||pageWidth<=0||pageHeight<=0)return null;
 const pdfWidth=pageWidth*safe.width/1000,pdfHeight=pageHeight*safe.height/1000;
 const maxDisplay=Math.max(100,Math.min(720,boxWidth));
 const scale=Math.min(2.4,maxDisplay/pdfWidth);
 const cssWidth=Math.max(1,Math.round(pdfWidth*scale)),cssHeight=Math.max(1,Math.round(pdfHeight*scale));
 const pixelRatio=Math.max(1,Math.min(2,deviceScale));
 return {cssWidth,cssHeight,pixelWidth:Math.ceil(cssWidth*pixelRatio),pixelHeight:Math.ceil(cssHeight*pixelRatio),
  viewportScale:scale,transform:[pixelRatio,0,0,pixelRatio,-pageWidth*(safe.x/1000)*scale*pixelRatio,-pageHeight*(safe.y/1000)*scale*pixelRatio]};
}