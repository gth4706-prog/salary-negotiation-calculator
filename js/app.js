/* =========================================================
   이직 연봉 협상 계산기 — 포지션·매력도 플로우 (index 전용)
   흐름: STEP1(직군+지금연봉+희망연봉, 실시간 실수령) → STEP2(연차)
        → STEP2r(지금·희망 연봉 포지션: 상위%·현실성) → STEP3(제안연봉, 실시간 실수령)
        → STEP4(지금 vs 제안 위치 + 매력도 판정 + 희망연봉 과다 시 커리어 조언)
   ⚠️ 실수령액은 2026 요율 근사(1인·비과세식대20만). 정식은 국세청 간이세액표로 대체 예정.
   ⚠️ 평균/포지션은 예시 데이터. 정식은 고용노동부 공공데이터로 대체 예정.
   ⚠️ 업계 평균 인상률(5%)·후보자 기대 인상률(10%)은 통용 참고치. 실통계 확보 시 교체.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("job"))return;
  var AVG_RAISE_PCT=5, CANDIDATE_EXPECT_PCT=10;

  var JOBS=[["개발·IT",3400,250],["디자인",3000,190],["기획·PM",3200,240],["마케팅·광고",3050,210],
    ["영업·영업관리",3100,230],["무역·해외영업",3200,220],["인사·HR",3050,200],["총무·경영지원",2950,170],
    ["회계·세무·재무",3200,215],["금융·보험",3500,300],["법률·법무",3800,340],["연구·R&D",3500,260],
    ["생산·제조",2950,175],["품질·안전·환경",3050,190],["물류·유통·구매",2950,180],["건설·건축·토목",3200,230],
    ["의료·보건",3400,240],["교육",2900,180],["미디어·콘텐츠",2900,200],["고객상담·CS",2700,140],
    ["공공·행정",3000,160],["서비스(요식·뷰티 등)",2600,130]];
  var sel=$("job");
  JOBS.forEach(function(j){var o=document.createElement("option");o.value=j[0];o.textContent=j[0];sel.appendChild(o);});
  function jobIndex(){return sel.selectedIndex<0?0:sel.selectedIndex;}
  function median(yr){var j=JOBS[jobIndex()]||JOBS[0];return j[1]+j[2]*Math.min(yr,25);}
  var ANCH=[[0.55,2],[0.68,10],[0.82,25],[1.0,50],[1.26,75],[1.6,90],[2.2,98]];
  function belowPct(r){if(r<=ANCH[0][0])return 1;if(r>=ANCH[6][0])return 99;for(var i=0;i<6;i++){var a=ANCH[i],b=ANCH[i+1];if(r>=a[0]&&r<=b[0])return a[1]+(b[1]-a[1])*(r-a[0])/(b[0]-a[0]);}return 50;}
  function topPct(v,yr){return Math.max(1,Math.round(100-belowPct(v/median(yr))));}
  function diffPct(v,yr){return (v/median(yr)-1)*100;}

  function won(man){man=Math.round(man);var e=Math.floor(man/10000),m=man%10000;if(e>0)return e+"억"+(m?" "+m.toLocaleString()+"만":"")+"원";return m.toLocaleString()+"만원";}
  function wonRaw(w){return Math.round(w).toLocaleString()+"원";}
  function estTax(man){var P=[[0,0],[2000,12000],[3000,63700],[5000,303600],[7000,600000],[10000,1227800],[15000,2600000]];if(man<=0)return 0;if(man>=15000){var l=P[6],p=P[5];return l[1]+(l[1]-p[1])/(l[0]-p[0])*(man-l[0]);}for(var i=0;i<6;i++){var a=P[i],b=P[i+1];if(man>=a[0]&&man<=b[0])return a[1]+(b[1]-a[1])*(man-a[0])/(b[0]-a[0]);}return 0;}
  function takeHome(cashMan){var G=cashMan*10000/12,taxable=Math.max(0,G-200000);var np=Math.min(taxable,6370000)*0.045,hi=taxable*0.03545,ltc=hi*0.1295,ei=taxable*0.009,it=estTax(cashMan);return G-(np+hi+ltc+ei+it);}
  function val(id){return +$(id).value||0;}
  function reveal(id){var el=$(id);el.hidden=false;el.classList.remove("reveal");void el.offsetWidth;el.classList.add("reveal");el.scrollIntoView({behavior:"smooth",block:"start"});}

  var VBG={"var(--good)":"var(--good-bg)","var(--warn)":"var(--warn-bg)","var(--bad)":"var(--bad-bg)"};

  // 포지션 라벨(상위 % 기준)
  function posLabel(top){
    if(top<=10)return{tag:"최상위권",vc:"var(--good)",desc:"같은 직군·연차에서 매우 높은 편입니다."};
    if(top<=30)return{tag:"상위권",vc:"var(--good)",desc:"평균보다 뚜렷이 높습니다."};
    if(top<=55)return{tag:"평균 수준",vc:"var(--warn)",desc:"딱 평균 언저리입니다."};
    if(top<=80)return{tag:"평균 이하",vc:"var(--bad)",desc:"평균보다 낮은 편입니다."};
    return{tag:"하위권",vc:"var(--bad)",desc:"평균에 크게 못 미칩니다."};
  }
  // 희망 연봉 현실성
  function wishRealism(raiseReq,top){
    if(raiseReq>35||top<=8)return{lv:"bad",vc:"var(--bad)",tag:"과도한 목표",txt:"지금 단계에선 다소 높은 목표입니다. 한 번의 이동으로 도달하기는 어렵습니다."};
    if(raiseReq>18||top<=25)return{lv:"mid",vc:"var(--warn)",tag:"도전적",txt:"강한 성과 근거나 이직을 통해서만 가능한 수준입니다."};
    return{lv:"ok",vc:"var(--good)",tag:"현실적",txt:"성과 근거를 갖추면 협상으로 충분히 노려볼 만합니다."};
  }

  /* ---------- STEP1: 실시간 실수령 + 인상률 ---------- */
  function netLine(v){return "예상 월 실수령 <b>"+wonRaw(takeHome(v))+"</b>";}
  function updCurNet(){var c=val("c-total");$("cur-net-line").innerHTML=c>0?netLine(c):"연봉을 입력하면 예상 월 실수령액이 표시됩니다.";}
  function updWishNet(){var w=val("wish");$("wish-net-line").innerHTML=w>0?netLine(w):"";}

  var PCTS=[5,10,15,20,25,30,35,40],pctRow=$("pct-row");
  PCTS.forEach(function(p){
    var b=document.createElement("button");
    b.type="button";b.className="pct-btn";b.textContent="+"+p+"%";b.dataset.pct=p;
    b.addEventListener("click",function(){var cur=val("c-total");if(cur<=0){$("c-total").focus();return;}$("wish").value=Math.round(cur*(1+p/100));updWishNet();updWishRate();});
    pctRow.appendChild(b);
  });
  function updWishRate(){
    var cur=val("c-total"),wish=val("wish"),btns=pctRow.querySelectorAll(".pct-btn");
    if(cur<=0||wish<=0){$("wish-rate-line").textContent="지금 연봉과 희망 연봉을 입력하면 인상률이 표시됩니다.";Array.prototype.forEach.call(btns,function(b){b.classList.remove("on")});return;}
    var rate=(wish-cur)/cur*100;
    $("wish-rate-line").innerHTML="지금보다 <b>"+(rate>=0?"+":"")+rate.toFixed(1)+"%</b> 인상 희망";
    Array.prototype.forEach.call(btns,function(b){b.classList.toggle("on",Math.abs(rate-(+b.dataset.pct))<0.3)});
  }
  $("c-total").addEventListener("input",function(){updCurNet();updWishRate();});
  $("wish").addEventListener("input",function(){updWishNet();updWishRate();});

  function submitStep1(){
    if(val("c-total")<=0){$("c-total").focus();return;}
    if(val("wish")<=0){$("wish").focus();return;}
    reveal("step2");
  }
  $("go1").addEventListener("click",submitStep1);
  $("c-total").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();$("wish").focus();}});
  $("wish").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();submitStep1();}});

  /* ---------- STEP2 → STEP2r: 포지션 ---------- */
  var yr=$("year");
  function syncYear(){var v=+yr.value;$("year-v").textContent=v+"년차";yr.style.setProperty("--p",(v/20*100)+"%");}
  yr.addEventListener("input",function(){syncYear();if(!$("step2r").hidden)renderPos();});

  function renderPos(){
    var yrN=+yr.value,cur=val("c-total"),wish=val("wish");
    var cTop=topPct(cur,yrN),cl=posLabel(cTop),cd=diffPct(cur,yrN);
    $("cp-pos").textContent="상위 "+cTop+"%";
    $("cp-tag").textContent=cl.tag;$("cp-tag").style.color=cl.vc;
    $("cp-desc").innerHTML=cl.desc+" (직군 평균 대비 <b>"+(cd>=0?"+":"")+cd.toFixed(0)+"%</b>)";
    var wTop=topPct(wish,yrN),raiseReq=cur>0?(wish-cur)/cur*100:0,wr=wishRealism(raiseReq,wTop);
    $("wp-pos").textContent="상위 "+wTop+"%";
    $("wp-tag").textContent=wr.tag;$("wp-tag").style.color=wr.vc;
    $("wp-desc").innerHTML="지금보다 <b>"+(raiseReq>=0?"+":"")+raiseReq.toFixed(1)+"%</b> 인상 요구 · "+wr.txt;
  }
  $("go2").addEventListener("click",function(){renderPos();reveal("step2r");});
  $("go3").addEventListener("click",function(){$("adwrap").hidden=false;reveal("step3");setTimeout(function(){$("o-total").focus()},400);});

  /* ---------- STEP3: 제안 실시간 실수령 ---------- */
  function updOffNet(){var o=val("o-total");$("off-net-line").innerHTML=o>0?netLine(o):"";}
  $("o-total").addEventListener("input",updOffNet);
  $("o-total").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();toStep4(val("o-total")>0);}});

  var hasOffer=false;
  function toStep4(withOffer){hasOffer=withOffer;renderResult();reveal("result");}
  $("go3b").addEventListener("click",function(){toStep4(val("o-total")>0);});
  $("skip3").addEventListener("click",function(){toStep4(false);});

  /* ---------- STEP4: 결과 ---------- */
  function renderResult(){
    var yrN=+yr.value,cur=val("c-total"),wish=val("wish"),off=val("o-total");
    var cTop=topPct(cur,yrN);
    $("r-cur-amt").textContent=won(cur);$("r-cur-pos").textContent="상위 "+cTop+"%";$("r-cur-net").textContent=wonRaw(takeHome(cur));
    var verdict=$("verdict"),line=[];
    if(hasOffer&&off>0){
      $("r-offer-card").hidden=false;
      var oTop=topPct(off,yrN),offRaise=cur>0?(off-cur)/cur*100:0;
      $("r-off-amt").textContent=won(off);$("r-off-pos").textContent="상위 "+oTop+"%";$("r-off-net").textContent=wonRaw(takeHome(off));
      var vc,vt,vd,body;
      if(offRaise>=CANDIDATE_EXPECT_PCT){
        vc="var(--good)";vt="매력적인 처우";vd="후보자 기대치(10%+) 이상 인상";
        body="제안 연봉은 지금보다 <b>+"+offRaise.toFixed(1)+"%</b> 인상으로, 후보자들이 통상 기대하는 10% 이상입니다. 같은 직군·연차 기준 <b>상위 "+oTop+"%</b>(지금은 상위 "+cTop+"%)에 해당해요. 망설이지 마세요 — <b>원하던 직무라면 충분히 이동해도 좋은 수</b>입니다.";
      }else if(offRaise>=AVG_RAISE_PCT){
        vc="var(--warn)";vt="고민되는 처우";vd="평균은 넘지만 기대치엔 못 미침";
        body="제안 연봉은 지금보다 <b>+"+offRaise.toFixed(1)+"%</b>로, 업계 평균(약 5%)은 넘지만 이직 기대치(10%)엔 못 미칩니다. 연봉만 보고 결정하기보단 <b>정말 원하는 직무인지</b>와 <b>성장 가능성</b>을 함께 저울질하세요.";
      }else{
        vc="var(--bad)";vt="아쉬운 처우";vd="평균 인상률에도 못 미침";
        body="제안 연봉은 지금보다 <b>+"+offRaise.toFixed(1)+"%</b>로 평균 인상률(약 5%)에도 못 미칩니다. 연봉 외에 <b>직무 적합성·성장 가능성</b>이 확실할 때만 이동을 고려하세요.";
      }
      verdict.hidden=false;
      verdict.style.setProperty("--vc",vc);verdict.style.setProperty("--vbg",VBG[vc]);
      $("v-t").style.color=vc;$("v-t").textContent=vt;$("v-d").textContent=vd;
      line.push(body);
      // 희망 연봉이 과도했고 제안이 그보다 크게 낮으면 → 커리어 조언
      var raiseReq=cur>0?(wish-cur)/cur*100:0,wTop=topPct(wish,yrN),wr=wishRealism(raiseReq,wTop);
      if(wr.lv==="bad"&&off<wish*0.92){
        line.push("참고로 입력하신 <b>희망 연봉("+won(wish)+")</b>은 같은 직군·연차 기준 <b>상위 "+wTop+"%</b>로 지금 단계에선 다소 높은 목표입니다. 이 수준에 도달하려면 <b>희소 기술·직무 전문성 심화</b>, <b>리드·매니저 등 직급 상승</b>, <b>성과의 수치화된 증명</b>, <b>고연봉 산업·회사로의 단계적 이동</b> 같은 커리어 빌드업이 필요해요. 이번 제안은 그 경로의 중간 단계로 볼 수 있습니다.");
      }
    }else{
      $("r-offer-card").hidden=true;verdict.hidden=true;
      var cl=posLabel(cTop);
      line.push("제안받은 연봉은 입력하지 않았습니다. 지금 연봉은 같은 직군·연차에서 <b>상위 "+cTop+"%</b>("+cl.tag+")입니다. 이직 제안을 받으면 다시 계산해 비교해 보세요.");
    }
    $("verdict-line").innerHTML=line.join("<br><br>");
  }

  $("restart").addEventListener("click",function(){
    ["step2r","step3","result"].forEach(function(id){$(id).hidden=true});
    $("adwrap").hidden=true;
    reveal("step1");
  });

  /* ---------- 공유(URL 상태) ---------- */
  function buildShareURL(){
    var p=["j="+jobIndex(),"y="+val("year"),"c="+val("c-total"),"w="+val("wish"),"o="+val("o-total"),"s=1"];
    return location.origin+location.pathname+"?"+p.join("&");
  }
  function applyParams(){
    var q=location.search.replace(/^\?/,"");if(!q)return false;
    var o={};q.split("&").forEach(function(kv){var a=kv.split("=");o[a[0]]=decodeURIComponent(a[1]||"")});
    if(o.j!=null&&JOBS[+o.j])sel.selectedIndex=+o.j;
    if(o.y!=null)$("year").value=o.y;
    if(o.c!=null)$("c-total").value=o.c;
    if(o.w!=null)$("wish").value=o.w;
    if(o.o!=null)$("o-total").value=o.o;
    return o.s==="1";
  }
  $("share-btn").addEventListener("click",function(){
    var url=buildShareURL(),btn=$("share-btn"),old=btn.textContent;
    function done(){btn.textContent="✓ 링크 복사됨";setTimeout(function(){btn.textContent=old},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt("아래 링크를 복사하세요:",url)});
    else prompt("아래 링크를 복사하세요:",url);
  });

  /* ---------- 초기화 ---------- */
  syncYear();updCurNet();updWishNet();updWishRate();
  var shared=applyParams();
  if(shared){
    syncYear();updCurNet();updWishNet();updWishRate();
    renderPos();
    toStep4(val("o-total")>0);
  }
})();
