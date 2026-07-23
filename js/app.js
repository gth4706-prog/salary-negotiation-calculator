/* =========================================================
   이직 연봉 협상 계산기 — 엘리베이터 플로우 로직 (index 전용)
   ⚠️ 실수령액은 2026 요율 근사(1인·비과세식대20만 가정). 정식은 국세청 간이세액표로 대체.
   ⚠️ 평균/포지션은 예시 데이터. 정식은 고용노동부 공공데이터로 대체.
   흐름: STEP1(직군+희망) → STEP2(연차+기본급+성과급) → STEP2r(그래프+예상실수령)
        → STEP3(제안, 선택) → STEP4(지금·희망·제안 비교)
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("job"))return;

  var JOBS=[["개발·IT",3400,250],["디자인",3000,190],["기획·PM",3200,240],["마케팅·광고",3050,210],
    ["영업·영업관리",3100,230],["무역·해외영업",3200,220],["인사·HR",3050,200],["총무·경영지원",2950,170],
    ["회계·세무·재무",3200,215],["금융·보험",3500,300],["법률·법무",3800,340],["연구·R&D",3500,260],
    ["생산·제조",2950,175],["품질·안전·환경",3050,190],["물류·유통·구매",2950,180],["건설·건축·토목",3200,230],
    ["의료·보건",3400,240],["교육",2900,180],["미디어·콘텐츠",2900,200],["고객상담·CS",2700,140],
    ["공공·행정",3000,160],["서비스(요식·뷰티 등)",2600,130]];
  var sel=$("job");
  JOBS.forEach(function(j){var o=document.createElement("option");o.value=j[0];o.textContent=j[0];sel.appendChild(o);});
  function jobIndex(){return sel.selectedIndex<0?0:sel.selectedIndex;}
  function jobData(){return JOBS[jobIndex()]||JOBS[0];}
  function median(yr){var j=jobData();return j[1]+j[2]*Math.min(yr,25);}
  var ANCH=[[0.55,2],[0.68,10],[0.82,25],[1.0,50],[1.26,75],[1.6,90],[2.2,98]];
  function belowPct(r){if(r<=ANCH[0][0])return 1;if(r>=ANCH[6][0])return 99;for(var i=0;i<6;i++){var a=ANCH[i],b=ANCH[i+1];if(r>=a[0]&&r<=b[0])return a[1]+(b[1]-a[1])*(r-a[0])/(b[0]-a[0]);}return 50;}
  function topPct(v,yr){return Math.max(1,Math.round(100-belowPct(v/median(yr))));}

  function won(man){man=Math.round(man);var e=Math.floor(man/10000),m=man%10000;if(e>0)return e+"억"+(m?" "+m.toLocaleString()+"만":"")+"원";return m.toLocaleString()+"만원";}
  function wonRaw(w){return Math.round(w).toLocaleString()+"원";}
  function estTax(man){
    var P=[[0,0],[2000,12000],[3000,63700],[5000,303600],[7000,600000],[10000,1227800],[15000,2600000]];
    if(man<=0)return 0;
    if(man>=15000){var l=P[6],p=P[5];return l[1]+(l[1]-p[1])/(l[0]-p[0])*(man-l[0]);}
    for(var i=0;i<6;i++){var a=P[i],b=P[i+1];if(man>=a[0]&&man<=b[0])return a[1]+(b[1]-a[1])*(man-a[0])/(b[0]-a[0]);}
    return 0;
  }
  function takeHome(cashMan){ // 월, 1인가구·비과세식대20만 가정
    var G=cashMan*10000/12, taxable=Math.max(0,G-200000);
    var np=Math.min(taxable,6370000)*0.045, hi=taxable*0.03545, ltc=hi*0.1295, ei=taxable*0.009, it=estTax(cashMan);
    var ded=np+hi+ltc+ei+it;
    return G-ded;
  }
  function val(id){return +$(id).value||0;}
  function curTotal(){return val("c-base")+val("c-bonus");}
  function offerTotal(){return val("o-base")+val("o-bonus");}

  function reveal(id){var el=$(id);if(!el)return;el.hidden=false;el.classList.remove("reveal");void el.offsetWidth;el.classList.add("reveal");el.scrollIntoView({behavior:"smooth",block:"start"});}

  // ---- STEP1: 직군 + 희망연봉 ----
  function submitStep1(){
    if(val("wish")<=0){$("wish").focus();return;}
    reveal("step2");
    setTimeout(function(){$("c-base").focus();},400);
  }
  $("go1").addEventListener("click",submitStep1);
  $("wish").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();submitStep1();}});

  // ---- STEP2: 연차 + 기본급/성과급 ----
  var yr=$("year");
  function syncYear(){var v=+yr.value;$("year-v").textContent=v+"년차";yr.style.setProperty("--p",(v/20*100)+"%");}
  yr.addEventListener("input",syncYear);

  function renderStep2r(){
    var base=val("c-base"),bonus=val("c-bonus"),tc=base+bonus||1;
    $("s-base").style.width=(base/tc*100)+"%";
    $("s-bonus").style.width=(bonus/tc*100)+"%";
    var net=takeHome(curTotal());
    $("th-net").textContent=wonRaw(net);
    $("th-net-y").textContent=won(net*12/10000);
    var big=$("th-net").parentNode;if(big){big.classList.remove("pop");void big.offsetWidth;big.classList.add("pop");}
  }
  function submitStep2(){
    renderStep2r();
    reveal("step2r");
  }
  $("go2").addEventListener("click",submitStep2);
  Array.prototype.forEach.call(document.querySelectorAll("#step2 .cur"),function(el){
    el.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();submitStep2();}});
  });

  function goStep3(){
    if($("adwrap")){$("adwrap").hidden=false;}
    reveal("step3");
    setTimeout(function(){$("o-base").focus();},400);
  }
  $("go3").addEventListener("click",goStep3);

  // ---- STEP3: 제안 처우 (선택) ----
  var hasOffer=false;
  function toStep4(withOffer){
    hasOffer=withOffer;
    renderResult();
    reveal("result");
  }
  $("go3b").addEventListener("click",function(){toStep4(offerTotal()>0);});
  $("skip3").addEventListener("click",function(){toStep4(false);});

  // ---- STEP4: 결과 ----
  function renderResult(){
    var yrN=+yr.value, cur=curTotal(), wish=val("wish"), off=offerTotal();
    var curNet=takeHome(cur), wishNet=takeHome(wish);
    $("r-cur-amt").textContent=won(cur);
    $("r-cur-pos").textContent="상위 "+topPct(cur,yrN)+"%";
    $("r-cur-net").textContent=wonRaw(curNet);
    $("r-wish-amt").textContent=won(wish);
    $("r-wish-pos").textContent="상위 "+topPct(wish,yrN)+"%";
    $("r-wish-net").textContent=wonRaw(wishNet);

    var offerCard=$("r-offer-card");
    var lines=[];
    var wishRate=cur>0?(wish-cur)/cur*100:0;
    lines.push("희망 연봉은 지금보다 <b>"+(wishRate>=0?"+":"")+wishRate.toFixed(1)+"%</b>이고, 같은 직군·연차에서 <b>상위 "+topPct(wish,yrN)+"%</b> 수준입니다.");

    if(hasOffer&&off>0){
      offerCard.hidden=false;
      var offNet=takeHome(off);
      $("r-off-amt").textContent=won(off);
      $("r-off-pos").textContent="상위 "+topPct(off,yrN)+"%";
      $("r-off-net").textContent=wonRaw(offNet);
      var offRate=cur>0?(off-cur)/cur*100:0;
      var vs = off>=wish ? "제안이 희망 연봉 이상입니다 — 좋은 신호입니다." : "제안이 희망 연봉에는 못 미칩니다("+won(wish-off)+" 부족).";
      lines.push("제안 연봉은 지금보다 <b>"+(offRate>=0?"+":"")+offRate.toFixed(1)+"%</b>이며, 월 실수령은 <b>"+(offNet-curNet>=0?"+":"")+wonRaw(offNet-curNet)+"</b> 변화합니다. "+vs);
    }else{
      offerCard.hidden=true;
      lines.push("제안받은 처우는 입력하지 않았습니다. 나중에 제안을 받으면 다시 계산해 비교해 보세요.");
    }
    $("verdict-line").innerHTML=lines.join(" ");
  }

  $("restart").addEventListener("click",function(){
    ["step2r","step3","result"].forEach(function(id){var el=$(id);if(el)el.hidden=true;});
    if($("adwrap"))$("adwrap").hidden=true;
    reveal("step1");
  });

  // ---- 공유(URL 상태) ----
  function buildShareURL(){
    var p=["j="+jobIndex(),"y="+val("year"),"cb="+val("c-base"),"cn="+val("c-bonus"),
      "w="+val("wish"),"ob="+val("o-base"),"on="+val("o-bonus"),"s=1"];
    return location.origin+location.pathname+"?"+p.join("&");
  }
  function applyParams(){
    var q=location.search.replace(/^\?/,"");if(!q)return false;
    var o={};q.split("&").forEach(function(kv){var a=kv.split("=");o[a[0]]=decodeURIComponent(a[1]||"");});
    if(o.j!=null&&JOBS[+o.j])sel.selectedIndex=+o.j;
    if(o.y!=null)$("year").value=o.y;
    if(o.cb!=null)$("c-base").value=o.cb;
    if(o.cn!=null)$("c-bonus").value=o.cn;
    if(o.w!=null)$("wish").value=o.w;
    if(o.ob!=null)$("o-base").value=o.ob;
    if(o.on!=null)$("o-bonus").value=o.on;
    return o.s==="1";
  }
  $("share-btn").addEventListener("click",function(){
    var url=buildShareURL(),btn=$("share-btn"),old=btn.textContent;
    function done(){btn.textContent="✓ 링크 복사됨";setTimeout(function(){btn.textContent=old;},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(done,function(){prompt("아래 링크를 복사하세요:",url);});}
    else{prompt("아래 링크를 복사하세요:",url);}
  });

  // ---- 초기화 ----
  syncYear();
  var shared=applyParams();
  syncYear();
  if(shared){
    renderStep2r();
    $("step2").hidden=true;$("step2r").hidden=true;$("step3").hidden=true;
    toStep4(offerTotal()>0);
    $("step1").hidden=false;
  }
})();
