/* =========================================================
   이직 연봉 협상 계산기 — 포지션·매력도 플로우 (index 전용)
   흐름: STEP1(직군+지금연봉[기본급/성과급]+희망연봉, 실시간 실수령) → STEP2(연차)
        → STEP2r(지금·희망 연봉 포지션: 상위%·현실성) → STEP3(제안연봉[기본급/성과급], 실시간 실수령)
        → STEP4(지금 vs 제안 위치 + 기본급 우선 매력도 판정 + 희망연봉 과다 시 커리어 조언)
   ⚠️ 실수령액은 2026 요율 근사(1인·비과세식대20만). 정식은 국세청 간이세액표로 대체 예정.
   ⚠️ 평균/포지션은 예시 데이터. 정식은 고용노동부 공공데이터로 대체 예정.
   ⚠️ 업계 평균 인상률(5%)·후보자 기대 인상률(10%)·기본급 기준선(2%/7%)은 통용 참고치. 실통계 확보 시 교체.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("job"))return;
  var AVG_RAISE_PCT=5, CANDIDATE_EXPECT_PCT=10, BASE_OK_PCT=2, BASE_GOOD_PCT=7;

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
  function curTotal(){return val("c-base")+val("c-bonus");}
  function offTotal(){return val("o-base")+val("o-bonus");}
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

  /* ---------- 연봉 구성 그래프 (기본급/성과급) ---------- */
  function updBar(baseId,bonusId,segBaseId,segBonusId){
    var b=val(baseId),n=val(bonusId),tc=b+n||1;
    $(segBaseId).style.width=(b/tc*100)+"%";
    $(segBonusId).style.width=(n/tc*100)+"%";
  }

  /* ---------- STEP1: 실시간 실수령 + 인상률 ---------- */
  function netLine(v,bonusZero){return "예상 월 실수령 <b>"+wonRaw(takeHome(v))+"</b>"+(bonusZero?" <span style=\"color:var(--faint)\">(기본급 기준)</span>":"");}
  function updCurNet(){
    updBar("c-base","c-bonus","c-seg-base","c-seg-bonus");
    var c=curTotal();$("cur-net-line").innerHTML=c>0?netLine(c,val("c-bonus")<=0):"기본급만 입력해도 예상 월 실수령액이 표시됩니다. (성과급은 선택)";
  }
  function updWishNet(){var w=val("wish");$("wish-net-line").innerHTML=w>0?netLine(w):"";}

  var PCTS=[5,10,15,20,25,30,35,40],pctRow=$("pct-row");
  PCTS.forEach(function(p){
    var b=document.createElement("button");
    b.type="button";b.className="pct-btn";b.textContent="+"+p+"%";b.dataset.pct=p;
    b.addEventListener("click",function(){var cur=curTotal();if(cur<=0){$("c-base").focus();return;}$("wish").value=Math.round(cur*(1+p/100));updWishNet();updWishRate();});
    pctRow.appendChild(b);
  });
  function updWishRate(){
    var cur=curTotal(),wish=val("wish"),btns=pctRow.querySelectorAll(".pct-btn");
    if(cur<=0||wish<=0){$("wish-rate-line").textContent="지금 연봉과 희망 연봉을 입력하면 인상률이 표시됩니다.";Array.prototype.forEach.call(btns,function(b){b.classList.remove("on")});return;}
    var rate=(wish-cur)/cur*100;
    $("wish-rate-line").innerHTML="지금보다 <b>"+(rate>=0?"+":"")+rate.toFixed(1)+"%</b> 인상 희망";
    Array.prototype.forEach.call(btns,function(b){b.classList.toggle("on",Math.abs(rate-(+b.dataset.pct))<0.3)});
  }
  ["c-base","c-bonus"].forEach(function(id){$(id).addEventListener("input",function(){updCurNet();updWishRate();});});
  $("wish").addEventListener("input",function(){updWishNet();updWishRate();});

  function submitStep1(){
    if(curTotal()<=0){$("c-base").focus();return;}
    if(val("wish")<=0){$("wish").focus();return;}
    reveal("step2");
  }
  $("go1").addEventListener("click",submitStep1);
  $("c-base").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();$("c-bonus").focus();}});
  $("c-bonus").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();$("wish").focus();}});
  $("wish").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();submitStep1();}});

  /* ---------- STEP2 → STEP2r: 포지션 ---------- */
  var yr=$("year");
  function syncYear(){var v=+yr.value;$("year-v").textContent=v+"년차";yr.style.setProperty("--p",(v/20*100)+"%");}
  yr.addEventListener("input",function(){syncYear();if(!$("step2r").hidden)renderPos();});

  function renderPos(){
    var yrN=+yr.value,cur=curTotal(),wish=val("wish");
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
  $("go3").addEventListener("click",function(){$("adwrap").hidden=false;reveal("step3");setTimeout(function(){$("o-base").focus()},400);});

  /* ---------- STEP3: 제안 (기본급/성과급) 실시간 실수령 ---------- */
  function updOffNet(){
    updBar("o-base","o-bonus","o-seg-base","o-seg-bonus");
    var o=offTotal();$("off-net-line").innerHTML=o>0?netLine(o,val("o-bonus")<=0):"";
  }
  ["o-base","o-bonus"].forEach(function(id){$(id).addEventListener("input",updOffNet);});
  $("o-base").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();$("o-bonus").focus();}});
  $("o-bonus").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();toStep4(offTotal()>0);}});

  var hasOffer=false;
  function toStep4(withOffer){hasOffer=withOffer;renderResult();reveal("result");}
  $("go3b").addEventListener("click",function(){toStep4(offTotal()>0);});
  $("skip3").addEventListener("click",function(){toStep4(false);});

  /* ---------- STEP4: 결과 (기본급 인상을 1순위로, 긍정 우선 프레이밍) ---------- */
  var GUIDE_LINK='<a href="guide/negotiation-scripts.html">협상 실전 문구</a>';
  function renderResult(){
    var yrN=+yr.value,cur=curTotal(),wish=val("wish"),off=offTotal();
    var curBase=val("c-base"),offBase=val("o-base");
    var cTop=topPct(cur,yrN);
    $("r-cur-amt").textContent=won(cur);$("r-cur-pos").textContent="상위 "+cTop+"%";$("r-cur-net").textContent=wonRaw(takeHome(cur));
    var verdict=$("verdict"),line=[];
    if(hasOffer&&off>0){
      $("r-offer-card").hidden=false;
      var oTop=topPct(off,yrN),offRaise=cur>0?(off-cur)/cur*100:0;
      var baseRaise=curBase>0?(offBase-curBase)/curBase*100:(offBase>0?100:0);
      $("r-off-amt").textContent=won(off);$("r-off-pos").textContent="상위 "+oTop+"%";$("r-off-net").textContent=wonRaw(takeHome(off));

      var vc,vt,vd,body;
      var baseTxt="기본급은 지금보다 <b>"+(baseRaise>=0?"+":"")+baseRaise.toFixed(1)+"%</b>("+won(curBase)+" → "+won(offBase)+") 오릅니다.";
      var totalTxt="총액 기준으로는 <b>"+(offRaise>=0?"+":"")+offRaise.toFixed(1)+"%</b> 인상이고, 같은 직군·연차에서 <b>상위 "+oTop+"%</b>(지금은 상위 "+cTop+"%)입니다.";

      if(baseRaise>=BASE_GOOD_PCT){
        vc="var(--good)";vt="매력적인 처우";vd="기본급이 안정적으로 올라요";
        body=baseTxt+" 기본급이 이 정도 오르면 장기적으로도 든든합니다. "+totalTxt+" 망설이지 마세요 — <b>원하시던 직무라면 충분히 이동해도 좋은 수</b>입니다.";
      }else if(baseRaise>=BASE_OK_PCT){
        vc="var(--good)";vt="괜찮은 처우";vd="기본급도 소폭 올라요";
        body=baseTxt+" 소폭이지만 기본급이 오르는 방향은 긍정적입니다. "+totalTxt+" <b>원하시던 직무라면 진행</b>하셔도 좋고, 조금 더 욕심이 난다면 기본급을 살짝 더 올려달라고 협의해볼 수 있어요. → "+GUIDE_LINK+"을 참고해보세요.";
      }else if(offRaise>=AVG_RAISE_PCT){
        vc="var(--warn)";vt="고민되는 처우";vd="총액은 올랐지만 기본급은 제자리";
        body=totalTxt+" 다만 "+baseTxt+" 성과급 비중이 커서 총액만큼 안정적이진 않을 수 있어요. <b>정말 원하는 직무이거나 성장 가능성이 크다면 진행</b>해도 좋고, 그렇지 않다면 기본급 비중을 높여달라고 다시 협의해보시길 권합니다. → "+GUIDE_LINK+"에서 실제로 쓸 수 있는 문구를 확인해보세요.";
      }else{
        vc="var(--bad)";vt="아쉬운 처우";vd="기본급·총액 모두 인상폭이 작아요";
        body="솔직히 말씀드리면, "+baseTxt+" "+totalTxt+" 인상 폭이 크지 않은 제안입니다. 그래도 <b>정말 원하시던 직무이거나 성장 가능성이 확실하다면</b> 진행해볼 수 있고, 그게 아니라면 지금 다시 한번 협의를 시도해보시는 걸 권합니다. → "+GUIDE_LINK+"을 참고해 기본급 조정을 요청해보세요.";
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
      line.push("제안받은 연봉은 입력하지 않았습니다. 지금 연봉은 같은 직군·연차에서 <b>상위 "+cTop+"%</b>("+cl.tag+")입니다. 이직 제안을 받으면 다시 계산해 비교해 보세요. 미리 준비하고 싶다면 → "+GUIDE_LINK+"을 읽어보세요.");
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
    var p=["j="+jobIndex(),"y="+val("year"),"cb="+val("c-base"),"cn="+val("c-bonus"),"w="+val("wish"),"ob="+val("o-base"),"on="+val("o-bonus"),"s=1"];
    return location.origin+location.pathname+"?"+p.join("&");
  }
  function applyParams(){
    var q=location.search.replace(/^\?/,"");if(!q)return false;
    var o={};q.split("&").forEach(function(kv){var a=kv.split("=");o[a[0]]=decodeURIComponent(a[1]||"")});
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
    function done(){btn.textContent="✓ 링크 복사됨";setTimeout(function(){btn.textContent=old},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt("아래 링크를 복사하세요:",url)});
    else prompt("아래 링크를 복사하세요:",url);
  });

  /* ---------- 초기화 ---------- */
  syncYear();updCurNet();updWishNet();updWishRate();
  var shared=applyParams();
  if(shared){
    syncYear();updCurNet();updWishNet();updWishRate();updOffNet();
    renderPos();
    toStep4(offTotal()>0);
  }
})();
