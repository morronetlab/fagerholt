/** Small source-shaped PDF token fixtures. No children's personal data. */
export const createSjoestrand2Page=()=>{
 const text=(value,y)=>({text:value,x:25,y,width:value.length*5});
 return {width:850,height:780,items:[
  text('Lekser',165),
  text('Til tirsdag: Norsk: Les s. 58-59 i Fabel lesebok.',193),
  text('Til onsdag: Vaksine onsdag morgen.',230),
  text('Til fredag: Ta med gymsko.',265),
  text('Til torsdag: Ukelekse: Gjør eget ark i leksemappa.',300)
 ]};
};

export const createFagerholt5Page=()=>{
 const text=(value,x,y)=>({text:value,x,y,width:Math.min(135,value.length*4)});
 const items=[text('Dag',20,80),text('På skolen',150,80),text('I lekse',540,80)];
 for(const [index,day] of ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].entries()){
  const y=130+index*140;
  items.push(text(day,20,y),text('8.30-14.15',20,y+20),text('Norsk: '+day+' har lesing',150,y+15));
 }
 items.push(text('Lesing/engelsk:',540,145),text('Les minst 20 minutter',540,161),text('hver dag i engelsk bok.',540,178));
 items.push(text('Innegym: Husk gymtøy!',150,285));
 return {width:800,height:950,items};
};

const evidence=quote=>({sourcePage:1,sourceQuote:quote});
export const englishEvidence='Engelske ord: apple - eple, banana - banan.';
export const sampleEnglishAI=()=>({
 days:[],attendance:[],dayNotes:[],homework:[],packing:[],
 notices:[{day:null,text:'Husk skoleboka',...evidence('Beskjed: Husk skoleboka')}],
 learningGoals:[],subjects:[],contacts:[],specialContent:[],
 vocabulary:[{category:'Engelske ord',text:'apple - eple, banana - banan',...evidence(englishEvidence)}],
 weekTheme:{text:null,sourcePage:null,sourceQuote:''},
 optionalMission:{text:null,sourcePage:null,sourceQuote:''},
 coverage:{state:'complete',reason:''}
});
