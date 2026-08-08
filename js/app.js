/* =========================================================
   이직 연봉 협상 계산기 — 포지션·매력도 플로우 (index 전용)
   흐름: STEP1(직군+지금연봉[기본급/성과급]+희망연봉, 실시간 실수령) → STEP2(연차)
        → STEP2r(지금·희망 연봉 포지션: 상위%·현실성) → STEP3(제안연봉[기본급/성과급], 실시간 실수령)
        → STEP4(지금 vs 제안 위치 + 기본급 우선 매력도 판정 + 희망연봉 과다 시 커리어 조언)
   ⚠️ 실수령액 = 2026년 확정 요율(국민연금 4.75% / 건강보험 3.595% /
      장기요양 건보료의 13.14% / 고용보험 0.9%) + 국세청 간이세액표 근사.
      1인·비과세식대 20만원 기준.
      ⚠️ 요율은 매년 바뀐다. 여기와 salary-calculator/index.html 의 정적 표,
         llms.txt 세 곳이 **같은 값**이어야 한다.
   ⚠️ 평균/포지션은 예시 데이터. 정식은 고용노동부 공공데이터로 대체 예정.
   ⚠️ 업계 평균 인상률(5%)·후보자 기대 인상률(10%)·기본급 기준선(2%/7%)은 통용 참고치. 실통계 확보 시 교체.
   KO/EN 공유: window.SALARY_LANG="en" 이면 동적 문구를 전부 영어 테이블(T.en)에서 고른다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("job"))return;
  var LANG=(window.SALARY_LANG==="en")?"en":"ko";
  var AVG_RAISE_PCT=5, CANDIDATE_EXPECT_PCT=10, BASE_OK_PCT=2, BASE_GOOD_PCT=7;

  // 4번째 값 = 같은 직업 대분류 종사자 수(만명, 통계청 경제활동인구조사 2023~2024 근사) — 22개 직군을 KSCO 대분류에 매핑
  var JOBS=[
    [{ko:"개발·IT",en:"Development / IT"},3400,250,625],[{ko:"디자인",en:"Design"},3000,190,625],
    [{ko:"기획·PM",en:"Planning / PM"},3200,240,625],[{ko:"마케팅·광고",en:"Marketing / Advertising"},3050,210,625],
    [{ko:"영업·영업관리",en:"Sales / Sales management"},3100,230,257],[{ko:"무역·해외영업",en:"Trade / International sales"},3200,220,257],
    [{ko:"인사·HR",en:"HR"},3050,200,502],[{ko:"총무·경영지원",en:"General affairs / Business support"},2950,170,502],
    [{ko:"회계·세무·재무",en:"Accounting / Tax / Finance"},3200,215,502],[{ko:"금융·보험",en:"Finance / Insurance"},3500,300,502],
    [{ko:"법률·법무",en:"Legal"},3800,340,625],[{ko:"연구·R&D",en:"Research / R&D"},3500,260,625],
    [{ko:"생산·제조",en:"Production / Manufacturing"},2950,175,280],[{ko:"품질·안전·환경",en:"Quality / Safety / Environment"},3050,190,625],
    [{ko:"물류·유통·구매",en:"Logistics / Distribution / Purchasing"},2950,180,502],[{ko:"건설·건축·토목",en:"Construction / Architecture / Civil engineering"},3200,230,231],
    [{ko:"의료·보건",en:"Medical / Healthcare"},3400,240,625],[{ko:"교육",en:"Education"},2900,180,625],
    [{ko:"미디어·콘텐츠",en:"Media / Content"},2900,200,625],[{ko:"고객상담·CS",en:"Customer support / CS"},2700,140,502],
    [{ko:"공공·행정",en:"Public sector / Administration"},3000,160,502],[{ko:"서비스(요식·뷰티 등)",en:"Service (F&B, beauty, etc.)"},2600,130,347]
  ];
  var sel=$("job");
  JOBS.forEach(function(j){var o=document.createElement("option");var nm=j[0][LANG]||j[0].ko;o.value=nm;o.textContent=nm;sel.appendChild(o);});
  function jobIndex(){return sel.selectedIndex<0?0:sel.selectedIndex;}
  function median(yr){var j=JOBS[jobIndex()]||JOBS[0];return j[1]+j[2]*Math.min(yr,25);}
  var ANCH=[[0.55,2],[0.68,10],[0.82,25],[1.0,50],[1.26,75],[1.6,90],[2.2,98]];
  function belowPct(r){if(r<=ANCH[0][0])return 1;if(r>=ANCH[6][0])return 99;for(var i=0;i<6;i++){var a=ANCH[i],b=ANCH[i+1];if(r>=a[0]&&r<=b[0])return a[1]+(b[1]-a[1])*(r-a[0])/(b[0]-a[0]);}return 50;}
  function topPct(v,yr){return Math.max(1,Math.round(100-belowPct(v/median(yr))));}
  function diffPct(v,yr){return (v/median(yr)-1)*100;}

  /* ---------- 문구 테이블 ---------- */
  var T={
    ko:{
      posTop:function(top){return "상위 "+top+"%"},
      curNetPlaceholder:"기본급만 입력해도 예상 월 실수령액이 표시됩니다. (성과급은 선택)",
      wishRatePlaceholder:"지금 연봉과 희망 연봉을 입력하면 인상률이 표시됩니다.",
      netLine:function(w,bonusZero){return "예상 월 실수령 <b>"+w+"</b>"+(bonusZero?" <span style=\"color:var(--faint)\">(기본급 기준)</span>":"")},
      wishRateLine:function(p){return "지금보다 <b>"+p+"</b> "+((p.indexOf("+")===0)?"인상":"삭감")+" 희망"},
      yearLabel:function(v){return v+"년차"},
      rankWithHeadcount:function(hc,top){return "같은 직업 대분류 종사자 약 <b>"+hc+"만 명</b> 중 상위 <b>"+top+"%</b>대(근사치)"},
      rankNoHeadcount:function(top){return "비슷한 조건 100명 중 약 <b>"+top+"등</b>"},
      posLabel:function(top){
        if(top<=10)return{tag:"최상위권",vc:"var(--good)",desc:"같은 직군·연차에서 매우 높은 편입니다."};
        if(top<=30)return{tag:"상위권",vc:"var(--good)",desc:"평균보다 뚜렷이 높습니다."};
        if(top<=55)return{tag:"평균 수준",vc:"var(--warn)",desc:"딱 평균 언저리입니다."};
        if(top<=80)return{tag:"평균 이하",vc:"var(--bad)",desc:"평균보다 낮은 편입니다."};
        return{tag:"하위권",vc:"var(--bad)",desc:"평균에 크게 못 미칩니다."};
      },
      posDescSuffix:function(cd){return " (직군 평균 대비 <b>"+(cd>=0?"+":"")+cd.toFixed(0)+"%</b>)"},
      wishRealism:function(raiseReq,top){
        if(raiseReq>35||top<=8)return{lv:"bad",vc:"var(--bad)",tag:"과도한 목표",txt:"지금 단계에선 다소 높은 목표입니다. 한 번의 이동으로 도달하기는 어렵습니다."};
        if(raiseReq>18||top<=25)return{lv:"mid",vc:"var(--warn)",tag:"도전적",txt:"강한 성과 근거나 이직을 통해서만 가능한 수준입니다."};
        return{lv:"ok",vc:"var(--good)",tag:"현실적",txt:"성과 근거를 갖추면 협상으로 충분히 노려볼 만합니다."};
      },
      wpDesc:function(p,txt){return "지금보다 <b>"+p+"</b> "+((p.indexOf("+")===0)?"인상":"삭감")+" 요구 · "+txt},
      guideLink:'<a href="guide/negotiation-scripts.html">협상 실전 문구</a>',
      baseTxt:function(p,curB,offB,up){return "기본급은 지금보다 <b>"+p+"</b>("+curB+" → "+offB+") "+(up?"오릅니다.":"내려갑니다.")},
      totalTxt:function(p,up,oTop,cTop){return "총액 기준으로는 <b>"+p+"</b> "+(up?"인상":"삭감")+"이고, 같은 직군·연차에서 <b>상위 "+oTop+"%</b>(지금은 상위 "+cTop+"%)입니다."},
      vCut:{vt:"삭감 제안",vd:"지금보다 총액이 줄어드는 제안이에요"},
      bodyCut:function(totalTxt,baseTxt,guideLink){return totalTxt+" "+baseTxt+" <b>연봉이 줄어드는 이동</b>이라는 점을 먼저 분명히 봐주세요. 직무 전환·근무 조건·성장 기회처럼 <b>연봉 외에 확실히 얻는 것</b>이 있고 그게 이 감소분을 감수할 만한지가 판단 기준입니다. 그런 이유 없이 단순히 옮기는 자리라면 다시 협의하시길 권합니다. → "+guideLink+"을 참고해보세요."},
      vBaseDown:{vt:"따져볼 처우",vd:"총액은 유지·상승이지만 기본급이 줄어요"},
      bodyBaseDown:function(totalTxt,baseTxt,guideLink){return totalTxt+" 다만 "+baseTxt+" 기본급이 줄면 퇴직금·성과급 산정 기준과 다음 이직의 출발선이 함께 낮아집니다. 총액이 성과급에 기대는 구조라 <b>목표를 못 채우면 실제 수령액은 지금보다 적어질 수 있어요.</b> 기본급을 지금 수준 이상으로 맞춰달라고 요청해보시길 권합니다. → "+guideLink+"에서 실제로 쓸 수 있는 문구를 확인해보세요."},
      vGood:{vt:"매력적인 처우",vd:"기본급이 안정적으로 올라요"},
      bodyGood:function(baseTxt,totalTxt){return baseTxt+" 기본급이 이 정도 오르면 장기적으로도 든든합니다. "+totalTxt+" 망설이지 마세요 — <b>원하시던 직무라면 충분히 이동해도 좋은 수</b>입니다."},
      vOk:{vt:"괜찮은 처우",vd:"기본급도 소폭 올라요"},
      bodyOk:function(baseTxt,totalTxt,guideLink){return baseTxt+" 소폭이지만 기본급이 오르는 방향은 긍정적입니다. "+totalTxt+" <b>원하시던 직무라면 진행</b>하셔도 좋고, 조금 더 욕심이 난다면 기본급을 살짝 더 올려달라고 협의해볼 수 있어요. → "+guideLink+"을 참고해보세요."},
      vMid:{vt:"고민되는 처우",vd:"총액은 올랐지만 기본급은 제자리"},
      bodyMid:function(totalTxt,baseTxt,guideLink){return totalTxt+" 다만 "+baseTxt+" 성과급 비중이 커서 총액만큼 안정적이진 않을 수 있어요. <b>정말 원하는 직무이거나 성장 가능성이 크다면 진행</b>해도 좋고, 그렇지 않다면 기본급 비중을 높여달라고 다시 협의해보시길 권합니다. → "+guideLink+"에서 실제로 쓸 수 있는 문구를 확인해보세요."},
      vBad:{vt:"아쉬운 처우",vd:"기본급·총액 모두 인상폭이 작아요"},
      bodyBad:function(baseTxt,totalTxt,guideLink){return "솔직히 말씀드리면, "+baseTxt+" "+totalTxt+" 인상 폭이 크지 않은 제안입니다. 그래도 <b>정말 원하시던 직무이거나 성장 가능성이 확실하다면</b> 진행해볼 수 있고, 그게 아니라면 지금 다시 한번 협의를 시도해보시는 걸 권합니다. → "+guideLink+"을 참고해 기본급 조정을 요청해보세요."},
      careerAdvice:function(wish,wTop){return "참고로 입력하신 <b>희망 연봉("+wish+")</b>은 같은 직군·연차 기준 <b>상위 "+wTop+"%</b>로 지금 단계에선 다소 높은 목표입니다. 이 수준에 도달하려면 <b>희소 기술·직무 전문성 심화</b>, <b>리드·매니저 등 직급 상승</b>, <b>성과의 수치화된 증명</b>, <b>고연봉 산업·회사로의 단계적 이동</b> 같은 커리어 빌드업이 필요해요. 이번 제안은 그 경로의 중간 단계로 볼 수 있습니다."},
      noOffer:function(cTop,tag,guideLink){return "제안받은 연봉은 입력하지 않았습니다. 지금 연봉은 같은 직군·연차에서 <b>상위 "+cTop+"%</b>("+tag+")입니다. 이직 제안을 받으면 다시 계산해 비교해 보세요. 미리 준비하고 싶다면 → "+guideLink+"을 읽어보세요."},
      shareCopied:"✓ 링크 복사됨",
      copyPrompt:"아래 링크를 복사하세요:"
    },
    en:{
      posTop:function(top){return "Top "+top+"%"},
      curNetPlaceholder:"Enter just a base salary and we'll show your estimated monthly take-home. (Bonus is optional)",
      wishRatePlaceholder:"Enter your current and target salary to see the raise percentage.",
      netLine:function(w,bonusZero){return "Est. monthly take-home <b>"+w+"</b>"+(bonusZero?" <span style=\"color:var(--faint)\">(base salary only)</span>":"")},
      wishRateLine:function(p){return "<b>"+p+"</b> "+((p.indexOf("+")===0)?"raise":"cut")+" vs. current"},
      yearLabel:function(v){return "Year "+v},
      rankWithHeadcount:function(hc,top){return "Among roughly <b>"+hc+"0k workers</b> in the same broad occupation category — top <b>"+top+"%</b> (approximate)"},
      rankNoHeadcount:function(top){return "About <b>#"+top+"</b> out of 100 in similar conditions"},
      posLabel:function(top){
        if(top<=10)return{tag:"Top tier",vc:"var(--good)",desc:"Very high for this role and experience level."};
        if(top<=30)return{tag:"Above average",vc:"var(--good)",desc:"Clearly above the average."};
        if(top<=55)return{tag:"Around average",vc:"var(--warn)",desc:"Right around the average."};
        if(top<=80)return{tag:"Below average",vc:"var(--bad)",desc:"On the lower side of average."};
        return{tag:"Low tier",vc:"var(--bad)",desc:"Well below the average."};
      },
      posDescSuffix:function(cd){return " (<b>"+(cd>=0?"+":"")+cd.toFixed(0)+"%</b> vs. role average)"},
      wishRealism:function(raiseReq,top){
        if(raiseReq>35||top<=8)return{lv:"bad",vc:"var(--bad)",tag:"Ambitious target",txt:"A stretch goal at this stage — hard to reach in a single move."};
        if(raiseReq>18||top<=25)return{lv:"mid",vc:"var(--warn)",tag:"Challenging",txt:"Only realistic with strong proof of impact or a job change."};
        return{lv:"ok",vc:"var(--good)",tag:"Realistic",txt:"Well within reach through negotiation if you have solid proof of impact."};
      },
      wpDesc:function(p,txt){return "Asking for a <b>"+p+"</b> "+((p.indexOf("+")===0)?"raise":"cut")+" vs. current · "+txt},
      guideLink:'<a href="guide/negotiation-scripts.html">Real negotiation scripts</a>',
      baseTxt:function(p,curB,offB,up){return "Base salary "+(up?"rises":"falls")+" by <b>"+p+"</b> ("+curB+" → "+offB+") vs. now."},
      totalTxt:function(p,up,oTop,cTop){return "In total, that's a <b>"+p+"</b> "+(up?"raise":"cut")+", putting you in the <b>top "+oTop+"%</b> for this role and experience level (currently top "+cTop+"%)."},
      vCut:{vt:"Pay cut offer",vd:"This offer's total is lower than what you make now"},
      bodyCut:function(totalTxt,baseTxt,guideLink){return totalTxt+" "+baseTxt+" First, be clear-eyed that this is <b>a move with a lower salary</b>. The real question is whether you're getting something concrete outside of pay — a role change, better working conditions, growth opportunity — that's worth accepting the cut for. If there's no such reason, we'd recommend negotiating further. → Check out "+guideLink+"."},
      vBaseDown:{vt:"Worth scrutinizing",vd:"Total pay holds or rises, but base salary drops"},
      bodyBaseDown:function(totalTxt,baseTxt,guideLink){return totalTxt+" That said, "+baseTxt+" When base salary drops, your severance and bonus baseline — and your starting point for the next negotiation — drop with it. Since the total leans on bonus, <b>if you miss targets your actual take-home could end up lower than it is now.</b> We'd recommend asking them to match your current base salary or better. → See "+guideLink+" for wording you can actually use."},
      vGood:{vt:"Attractive offer",vd:"Base salary rises solidly"},
      bodyGood:function(baseTxt,totalTxt){return baseTxt+" A raise like this is a solid foundation long-term. "+totalTxt+" Don't hesitate — <b>if it's the role you wanted, this is a good move.</b>"},
      vOk:{vt:"Decent offer",vd:"Base salary rises a bit too"},
      bodyOk:function(baseTxt,totalTxt,guideLink){return baseTxt+" A modest rise in base salary is still a positive direction. "+totalTxt+" <b>Go for it if it's the role you wanted</b>, or if you want to push a bit further, you could negotiate a slightly higher base. → Check out "+guideLink+"."},
      vMid:{vt:"Worth thinking over",vd:"Total pay rose, but base salary stayed flat"},
      bodyMid:function(totalTxt,baseTxt,guideLink){return totalTxt+" That said, "+baseTxt+" Since bonus makes up a large share, it may not be as stable as the total suggests. <b>Go for it if it's genuinely the role you want or growth potential is high</b> — otherwise, we'd recommend negotiating for a larger base salary share. → See "+guideLink+" for wording you can actually use."},
      vBad:{vt:"Underwhelming offer",vd:"Both base salary and total barely move"},
      bodyBad:function(baseTxt,totalTxt,guideLink){return "Honestly, "+baseTxt+" "+totalTxt+" This isn't a large raise. Still, <b>if it's genuinely the role you wanted or growth potential is clear</b>, it's worth considering — otherwise, we'd recommend trying to negotiate again. → Use "+guideLink+" to ask for a base salary adjustment."},
      careerAdvice:function(wish,wTop){return "For reference, your <b>target salary ("+wish+")</b> puts you in the <b>top "+wTop+"%</b> for this role and experience level — an ambitious target at this stage. Reaching that range usually takes career moves like <b>deepening scarce skills or domain expertise</b>, <b>moving up to lead/manager roles</b>, <b>quantifiable proof of impact</b>, or <b>step-by-step moves to higher-paying industries or companies</b>. This offer can be seen as one step along that path."},
      noOffer:function(cTop,tag,guideLink){return "You haven't entered an offer yet. Your current salary is <b>top "+cTop+"%</b> ("+tag+") for this role and experience level. Once you get an offer, run the numbers again to compare. Want to prepare ahead of time? → Read "+guideLink+"."},
      shareCopied:"✓ Link copied",
      copyPrompt:"Copy this link:"
    }
  };
  var S=T[LANG];

  function won(man){
    man=Math.round(man);
    if(LANG==="en")return "₩"+(man*10000).toLocaleString();
    var e=Math.floor(man/10000),m=man%10000;if(e>0)return e+"억"+(m?" "+m.toLocaleString()+"만":"")+"원";return m.toLocaleString()+"만원";
  }
  function wonRaw(w){return (LANG==="en"?"₩":"")+Math.round(w).toLocaleString()+(LANG==="en"?"":"원");}
  function estTax(man){var P=[[0,0],[2000,12000],[3000,63700],[5000,303600],[7000,600000],[10000,1227800],[15000,2600000]];if(man<=0)return 0;if(man>=15000){var l=P[6],p=P[5];return l[1]+(l[1]-p[1])/(l[0]-p[0])*(man-l[0]);}for(var i=0;i<6;i++){var a=P[i],b=P[i+1];if(man>=a[0]&&man<=b[0])return a[1]+(b[1]-a[1])*(man-a[0])/(b[0]-a[0]);}return 0;}
  function takeHome(cashMan){var G=cashMan*10000/12,taxable=Math.max(0,G-200000);var np=Math.min(taxable,6370000)*0.0475,hi=taxable*0.03595,ltc=hi*0.1314,ei=taxable*0.009,it=estTax(cashMan);return G-(np+hi+ltc+ei+it);}
  function val(id){return +$(id).value||0;}
  /* 부호를 항상 붙인 퍼센트 문자열. 옆에 오는 서술어(인상/삭감, 오릅니다/내려갑니다)도
     반드시 부호에 맞춰야 한다 — 연봉이 줄어드는 이직 제안이 드물지 않다. */
  function pct(p){return (p>=0?"+":"")+p.toFixed(1)+"%";}
  function curTotal(){return val("c-base")+val("c-bonus");}
  function offTotal(){return val("o-base")+val("o-bonus");}
  function reveal(id){var el=$(id);el.hidden=false;el.classList.remove("reveal");void el.offsetWidth;el.classList.add("reveal");el.scrollIntoView({behavior:"smooth",block:"start"});}

  var VBG={"var(--good)":"var(--good-bg)","var(--warn)":"var(--warn-bg)","var(--bad)":"var(--bad-bg)"};

  /* ---------- 연봉 구성 그래프 (기본급/성과급) ---------- */
  function updBar(baseId,bonusId,segBaseId,segBonusId){
    var b=val(baseId),n=val(bonusId),tc=b+n||1;
    $(segBaseId).style.width=(b/tc*100)+"%";
    $(segBonusId).style.width=(n/tc*100)+"%";
  }

  /* ---------- STEP1: 실시간 실수령 + 인상률 ---------- */
  function netLine(v,bonusZero){return S.netLine(wonRaw(takeHome(v)),bonusZero);}
  function updCurNet(){
    updBar("c-base","c-bonus","c-seg-base","c-seg-bonus");
    var c=curTotal();$("cur-net-line").innerHTML=c>0?netLine(c,val("c-bonus")<=0):S.curNetPlaceholder;
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
    if(cur<=0||wish<=0){$("wish-rate-line").textContent=S.wishRatePlaceholder;Array.prototype.forEach.call(btns,function(b){b.classList.remove("on")});return;}
    var rate=(wish-cur)/cur*100;
    $("wish-rate-line").innerHTML=S.wishRateLine(pct(rate));
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

  /* ---------- 포지션 바(가로 막대 + N명 중 등수) ---------- */
  function setPct(top,markerId,rankId){
    var m=$(markerId),r=$(rankId);
    if(m)m.style.left=Math.max(2,Math.min(98,100-top))+"%";
    if(r){
      var j=JOBS[jobIndex()]||JOBS[0],headcount=j[3];
      r.innerHTML=headcount?S.rankWithHeadcount(headcount,top):S.rankNoHeadcount(top);
    }
  }

  /* ---------- STEP2 → STEP2r: 포지션 ---------- */
  var yr=$("year");
  function syncYear(){var v=+yr.value;$("year-v").textContent=S.yearLabel(v);yr.style.setProperty("--p",(v/20*100)+"%");}
  yr.addEventListener("input",function(){syncYear();if(!$("step2r").hidden)renderPos();});

  function renderPos(){
    var yrN=+yr.value,cur=curTotal(),wish=val("wish");
    var cTop=topPct(cur,yrN),cl=S.posLabel(cTop),cd=diffPct(cur,yrN);
    $("cp-pos").textContent=S.posTop(cTop);
    setPct(cTop,"cp-bar","cp-rank");
    $("cp-tag").textContent=cl.tag;$("cp-tag").style.color=cl.vc;
    $("cp-desc").innerHTML=cl.desc+S.posDescSuffix(cd);
    var wTop=topPct(wish,yrN),raiseReq=cur>0?(wish-cur)/cur*100:0,wr=S.wishRealism(raiseReq,wTop);
    $("wp-pos").textContent=S.posTop(wTop);
    setPct(wTop,"wp-bar","wp-rank");
    $("wp-tag").textContent=wr.tag;$("wp-tag").style.color=wr.vc;
    $("wp-desc").innerHTML=S.wpDesc(pct(raiseReq),wr.txt);
  }
  $("go2").addEventListener("click",function(){renderPos();reveal("step2r");});
  $("go3").addEventListener("click",function(){reveal("step3");setTimeout(function(){$("o-base").focus()},400);});

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
  function renderResult(){
    var yrN=+yr.value,cur=curTotal(),wish=val("wish"),off=offTotal();
    var curBase=val("c-base"),offBase=val("o-base");
    var cTop=topPct(cur,yrN);
    $("r-cur-amt").textContent=won(cur);$("r-cur-pos").textContent=S.posTop(cTop);$("r-cur-net").textContent=wonRaw(takeHome(cur));
    setPct(cTop,"r-cur-bar","r-cur-rank");
    var verdict=$("verdict"),line=[];
    if(hasOffer&&off>0){
      $("r-offer-card").hidden=false;
      var oTop=topPct(off,yrN),offRaise=cur>0?(off-cur)/cur*100:0;
      var baseRaise=curBase>0?(offBase-curBase)/curBase*100:(offBase>0?100:0);
      $("r-off-amt").textContent=won(off);$("r-off-pos").textContent=S.posTop(oTop);$("r-off-net").textContent=wonRaw(takeHome(off));
      setPct(oTop,"r-off-bar","r-off-rank");

      var vc,vt,vd,body;
      /* 이직 제안이 늘 인상인 건 아니다 — 임금이 줄어드는 이동도 흔하다.
         부호를 안 보고 서술어를 고정하면 "-10.0% 오릅니다" 같은 문장이 나온다. */
      var baseTxt=S.baseTxt(pct(baseRaise),won(curBase),won(offBase),baseRaise>=0);
      var totalTxt=S.totalTxt(pct(offRaise),offRaise>=0,oTop,cTop);

      if(offRaise<0){
        /* 총액이 줄어드는 제안. "인상폭이 작다"고 뭉뚱그리지 않고 삭감이라고 분명히 말한다. */
        vc="var(--bad)";vt=S.vCut.vt;vd=S.vCut.vd;
        body=S.bodyCut(totalTxt,baseTxt,S.guideLink);
      }else if(baseRaise<0){
        /* 총액은 유지·상승인데 기본급만 깎이는 경우 — 성과급 비중이 커진 구조다. */
        vc="var(--warn)";vt=S.vBaseDown.vt;vd=S.vBaseDown.vd;
        body=S.bodyBaseDown(totalTxt,baseTxt,S.guideLink);
      }else if(baseRaise>=BASE_GOOD_PCT){
        vc="var(--good)";vt=S.vGood.vt;vd=S.vGood.vd;
        body=S.bodyGood(baseTxt,totalTxt);
      }else if(baseRaise>=BASE_OK_PCT){
        vc="var(--good)";vt=S.vOk.vt;vd=S.vOk.vd;
        body=S.bodyOk(baseTxt,totalTxt,S.guideLink);
      }else if(offRaise>=AVG_RAISE_PCT){
        vc="var(--warn)";vt=S.vMid.vt;vd=S.vMid.vd;
        body=S.bodyMid(totalTxt,baseTxt,S.guideLink);
      }else{
        vc="var(--bad)";vt=S.vBad.vt;vd=S.vBad.vd;
        body=S.bodyBad(baseTxt,totalTxt,S.guideLink);
      }
      verdict.hidden=false;
      verdict.style.setProperty("--vc",vc);verdict.style.setProperty("--vbg",VBG[vc]);
      $("v-t").style.color=vc;$("v-t").textContent=vt;$("v-d").textContent=vd;
      line.push(body);

      // 희망 연봉이 과도했고 제안이 그보다 크게 낮으면 → 커리어 조언
      var raiseReq=cur>0?(wish-cur)/cur*100:0,wTop=topPct(wish,yrN),wr=S.wishRealism(raiseReq,wTop);
      if(wr.lv==="bad"&&off<wish*0.92){
        line.push(S.careerAdvice(won(wish),wTop));
      }
    }else{
      $("r-offer-card").hidden=true;verdict.hidden=true;
      var cl=S.posLabel(cTop);
      line.push(S.noOffer(cTop,cl.tag,S.guideLink));
    }
    $("verdict-line").innerHTML=line.join("<br><br>");
  }

  $("restart").addEventListener("click",function(){
    ["step2r","step3","result"].forEach(function(id){$(id).hidden=true});
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
    function done(){btn.textContent=S.shareCopied;setTimeout(function(){btn.textContent=old},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt(S.copyPrompt,url)});
    else prompt(S.copyPrompt,url);
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
