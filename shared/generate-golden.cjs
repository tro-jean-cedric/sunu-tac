const fs=require('fs');
const html=fs.readFileSync(process.argv[2],'utf8');
const js=html.split('<script>')[1].split('</script>')[0];
const core=js.slice(0,js.indexOf('/* =======================================================================\n   CONFIGURATION'));
const enc=js.slice(js.indexOf('function encoder(){'),js.indexOf('/* ---------- navigation'));
const btoa=s=>Buffer.from(s,'binary').toString('base64'), atob=s=>Buffer.from(s,'base64').toString('binary');
const f=new Function('btoa','atob',core+'\nlet S;\n'+enc+'\nreturn {SITUATIONS,BLOCS,LIKERT,LIKALL,calcul,decode,encoder,setS:s=>{S=s}};');
const L=f(btoa,atob);
let seed=42; const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};
const ri=n=>Math.floor(rnd()*n);
function mk(kind){
  const sit={},bloc={},lik={};
  L.SITUATIONS.forEach(q=>sit[q.id]=kind==='uniform'?0:ri(4));
  L.BLOCS.forEach(b=>{const m=ri(3);let l=ri(3);if(l===m)l=(m+1)%3;bloc[b.id]={most:m,least:l}});
  L.LIKALL.forEach(it=>lik[it.id]=1+ri(5));
  if(kind==='uniform')L.LIKALL.forEach(it=>lik[it.id]=4);
  if(kind==='inconsistent'){lik.C9=5;lik.I1=1;lik.C16=5;lik.I2=5;lik.C19=1;lik.I3=5;lik.C23=1;lik.I4=5}
  if(['coherent','dshigh','partial'].includes(kind)){lik.C9=4;lik.I1=4;lik.C16=2;lik.I2=4;lik.C19=5;lik.I3=5;lik.C23=4;lik.I4=2;['D1','D2','D3','D4','D5'].forEach(k=>lik[k]=2)}
    if(kind==='partial'){delete sit.A3;delete bloc.B5;['C1','C2','C3','C4','C5','C6','I1'].forEach(k=>delete lik[k])}
  if(kind==='dshigh')['D1','D2','D3','D4'].forEach(k=>lik[k]=5);
  return {sit,bloc,lik};
}
const kinds=['coherent','random1','random2','random3','dshigh','uniform','inconsistent','partial'];
const cases=kinds.map((kind,i)=>{
  const a=mk(kind); const dureeS=kind==='random3'?600:1500+i;
  const ident={matricule:'T'+(1000+i),filiale:'SUNU Services',categorie:'Manager',famille:'Support (RH, finance, IT, communication, juridique)',campagne:'T0'};
  L.setS({ident,sit:a.sit,bloc:a.bloc,lik:a.lik,t0:Date.now()-dureeS*1000});
  const code=L.encoder();
  return {name:kind,ident,dureeS,...a,expected:L.calcul(a.sit,a.bloc,a.lik,dureeS),code,decoded:L.decode(code)};
});
// unicode check in code
L.setS({ident:{matricule:'é1',filiale:"SUNU Assurances Vie Côte d'Ivoire",categorie:'Manager',famille:'Métier',campagne:'T+12'},sit:{},bloc:{},lik:{},t0:Date.now()});
const ucode=L.encoder();
fs.writeFileSync(process.argv[3],JSON.stringify({cases,unicode:{code:ucode,decoded:L.decode(ucode)}},null,1));
cases.forEach(c=>console.log(c.name,c.expected.global&&c.expected.global.toFixed(2),'inv',c.expected.invalide,'ds',c.expected.ds,'inc',c.expected.inc));
