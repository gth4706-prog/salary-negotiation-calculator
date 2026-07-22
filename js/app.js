/* =========================================================
   이직 연봉 협상 계산기 — 계산 로직 (index 전용)
   ⚠️ 실수령액은 2026 요율 근사(1인·식대20만). 실제 서비스는 국세청 간이세액표로 대체.
   ⚠️ 평균/포지션은 예시 데이터. 실제는 고용노동부 공공데이터로 대체.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("job"))return;
  var YEAR=2026;

  // 직군 (확장) — 실제는 고용노동부 직종분류 매핑 [이름, 0년차 중위(만원), 연차당 증가(만원)]
  var JOBS=[["개발·IT",3400,250],["디자인",3000,190],["기획·PM",3200,240],["마케팅·광고",3050,210],
    ["영업·영업관리",3100,230],["무역·해외영업",3200,220],["인사·HR",3050,200],["총무·경영지원",2950,170],
    ["회계·세무·재무",3200,215],["금융·보험",3500,300],["법률·법무",3800,340],["연구·R&D",3500,260],
    ["생산·제조",2950,175],["품질·안전·환경",3050,190],["물류·유통·구매",2950,180],["건설·건축·토목",3200,230],
    ["의료·보건",3400,240],["교육",2900,180],["미디어·콘텐츠",2900,200],["고객상담·CS",2700,140],
    ["공공·행정",3000,160],["서비스(요식·뷰티 등)",2600,130]];
  var sel=$("job");
  JOBS.forEach(function(j){var o=document.createElement("option");o.value=j[0];o.textContent=j[0];sel.appendChild(o);});
  function jobData(){var v=sel.value;for(var i=0;i<JOBS.length;i++)if(JOBS[i][0]===v)return JOBS[i];return JOBS[0];}
  function median(yr){var j=jobData();return j[1]+j[2]*Math.min(yr,25);}
  var ANCH=[[0.55,2],[0.68,10],[0.82,25],[1.0,50],[1.26,75],[1.6,90],[2.2,98]];
  function belowPct(r){if(r<=ANCH[0][0])return 1;if(r>=ANCH[6][0])return 99;for(var i=0;i<6;i++){var a=ANCH[i],b=ANCH[i+1];if(r>=a[0]&&r<=b[0])return a[1]+(b[1]-a[1])*(r-a[0])/(b[0]-a[0]);}return 50;}

  function won(man){man=Math.round(man);var e=Math.floor(man/10000),m=man%10000;if(e>0)return e+"억"+(m?" "+m.toLocaleString()+"만":"")+"원";return m.toLocaleString()+"만원";}
  function wonRaw(w){return Math.round(w).toLocaleString()+"원";}
  function estTax(man){var P=[[0,0],[2000,12000],[3000,63700],[5000,303600],[7000,600000],[10000,1227800],[15000,2600000]];if(man<=0)return 0;if(man>=15000){var l=P[6],p=P[5];return l[1]+(l[1]-p[1])/(l[0]-p[0])*(man-l[0]);}for(var i=0;i<6;i++){var a=P[i],b=P[i+1];if(man>=a[0]&&man<=b[0])return a[1]+(b[1]-a[1])*(man-a[0])/(b[0]-a[0]);}return 0;}
  function takeHome(cashMan){var G=cashMan*10000/12,tax=Math.max(0,G-200000);var np=Math.min(tax,6370000)*0.045,hi=tax*0.03545,ltc=hi*0.1295,ei=tax*0.009,it=estTax(cashMan);var ins=np+hi+ltc+ei,ded=ins+it;return{G:G,net:G-ded,ded:ded,rate:G>0?ded/G*100:0,ins:ins,tax:it};}
  function val(id){return +$(id).value||0;}

  // 연차 슬라이더
  var yr=$("year");
  function syncYear(){var v=+yr.value;$("year-v").textContent=v+"년차";yr.style.setProperty("--p",(v/20*100)+"%");}
  yr.addEventListener("input",function(){syncYear();updateWish();});
  // 나이
  $("birth").addEventListener("input",function(){var b=+$("birth").value||YEAR;$("age").innerHTML="만 <b>"+Math.max(0,YEAR-b)+"</b>세";});

  // 현재 연봉 구성 + 실시간 실수령
  function updateComp(){
    var base=val("c-base"),bonus=val("c-bonus"),wel=val("c-welfare"),etc=val("c-etc");
    var move=base+bonus+wel, tc=move+etc||1;
    $("s-base").style.width=(base/tc*100)+"%";$("s-bonus").style.width=(bonus/tc*100)+"%";
    $("s-welfare").style.width=(wel/tc*100)+"%";$("s-etc").style.width=(etc/tc*100)+"%";
    $("s-mark").style.left=(move/tc*100)+"%";
    $("v-move").textContent=won(move);$("v-tc").textContent=won(move+etc);
    var t=takeHome(move);
    $("th-net").textContent=wonRaw(t.net);$("th-net-y").textContent="· 연 "+won(t.net*12/10000);
    $("th-rate").textContent=t.rate.toFixed(1)+"%";$("th-ded").textContent=wonRaw(t.ded);
    $("th-ins").textContent=wonRaw(t.ins);$("th-tax").textContent=wonRaw(t.tax);
    updateWish();
  }
  Array.prototype.forEach.call(document.querySelectorAll(".cur"),function(el){el.addEventListener("input",updateComp);});
  sel.addEventListener("change",function(){updateComp();updateWish();});

  // 희망연봉 (선택)
  function curMove(){return val("c-base")+val("c-bonus")+val("c-welfare");}
  function updateWish(){
    var w=val("wish");if(w<=0){$("wish-out").hidden=true;return;}
    var M=median(+yr.value),top=Math.max(1,Math.round(100-belowPct(w/M)));
    var cm=curMove(),rate=cm>0?(w-cm)/cm*100:0,t=takeHome(w);
    $("wish-pos").textContent="상위 "+top+"%";
    $("wish-rate").textContent=(rate>=0?"+":"")+rate.toFixed(1)+"%";
    $("wish-net").textContent=wonRaw(t.net);
    $("wish-out").hidden=false;
  }
  $("wish").addEventListener("input",updateWish);

  // 제안 평가 → 광고 → 결과
  $("run").addEventListener("click",function(){$("result").hidden=true;$("adwrap").hidden=false;$("adwrap").scrollIntoView({behavior:"smooth",block:"center"});});
  $("showres").addEventListener("click",function(){
    $("adwrap").hidden=true;
    var oMove=val("o-base")+val("o-bonus")+val("o-welfare");
    var M=median(+yr.value),top=Math.max(1,Math.round(100-belowPct(oMove/M))),avg=(oMove/M-1)*100;
    var cm=curMove(),curT=takeHome(cm),newT=takeHome(oMove),dM=newT.net-curT.net;
    var vc,vbg,vt,vd;
    if(top<=30){vc="var(--good)";vbg="var(--good-bg)";vt="좋은 제안";vd="같은 직군·연차 평균보다 뚜렷이 높습니다.";}
    else if(top<=55){vc="var(--warn)";vbg="var(--warn-bg)";vt="무난한 제안";vd="평균 언저리 — 협상 여지가 있습니다.";}
    else{vc="var(--bad)";vbg="var(--bad-bg)";vt="아쉬운 제안";vd="평균보다 낮은 편 — 그대로 수락은 재고 필요.";}
    var v=$("verdict");v.style.setProperty("--vc",vc);v.style.setProperty("--vbg",vbg);
    $("v-t").style.color=vc;$("v-t").textContent=vt;$("v-d").textContent=vd;
    $("r-pos").textContent="상위 "+top+"%";
    $("r-sub").textContent=sel.value+" "+yr.value+"년차 평균 "+won(M)+" · 평균 대비 "+(avg>=0?"+":"")+avg.toFixed(0)+"%";
    $("r-cur").textContent=wonRaw(curT.net);$("r-new").textContent=wonRaw(newT.net);
    var d=$("r-delta");
    if(dM>=0){d.style.background="var(--good-bg)";d.style.color="var(--good)";d.textContent="월 실수령 +"+wonRaw(dM)+" · 연 +"+won(dM*12/10000);}
    else{d.style.background="var(--bad-bg)";d.style.color="var(--bad)";d.textContent="월 실수령 "+wonRaw(dM)+" · 연 "+won(dM*12/10000);}
    $("result").hidden=false;$("result").scrollIntoView({behavior:"smooth",block:"center"});
  });

  syncYear();updateComp();
})();
