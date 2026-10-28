/** Estimated duration from PDF metadata, never actual model progress. */
export function estimateAiSeconds({pages=null,bytes=null}={}){
 const count=Number.isFinite(pages)&&pages>0?Math.min(16,pages):1;
 const size=Number.isFinite(bytes)&&bytes>0?Math.min(14*1024*1024,bytes):150000;
 return Math.max(30,Math.min(150,Math.round(22+count*9+size/1048576*2)));
}
export function estimatedPercent(elapsed,estimate){
 const seconds=Math.max(0,Number(elapsed)||0),expected=Math.max(1,Number(estimate)||40);
 return Math.min(95,Math.round(85*Math.min(seconds/expected,1)+Math.max(0,seconds-expected)/8));
}
