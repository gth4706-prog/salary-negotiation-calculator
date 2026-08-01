/* =========================================================
   퇴사 타이밍 계산기 (resignation-timing)
   - 서버 없음. 모든 계산은 브라우저 안에서만 동작.
   - 근속 1년 미만 연차: 매월 개근 시 1일(최대 11일)
   - 근속 1년 이상 연차: 15일 + (근속연수-1)/2(내림), 최대 25일 — 근사치
   KO/EN 공유: window.RESIGN_LANG="en" 이면 동적 문구를 전부 영어 테이블(T.en)에서 고른다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("hire-date"))return;
  var LANG=(window.RESIGN_LANG==="en")?"en":"ko";

  var state={basis:"hire"};

  /* ---------- 날짜 헬퍼 ---------- */
  function parseDate(v){ if(!v)return null; var p=v.split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
  /* d의 n개월 뒤 "응당일".
     대상 월에 같은 날짜가 없으면(예: 1/31 → 2월) 그 달 말일에 1개월이 만료되므로 다음 달 1일을 응당일로 본다.
     (JS의 setMonth는 2/31 → 3/3처럼 넘친 일수만큼 밀려나서 응당일이 3일로 어긋난다)
     ⚠️ 이 규칙은 민법 160조 + 고용노동부 해석(1개월 개근 만료 다음 날 발생)을 따른 것이지만,
     "만료일 당일(2/28)에 발생"으로 운영하는 회사도 실제로 있다. 월말 입사자에게만
     하루 차이가 나므로, 이 부분은 노무사 확인이 필요한 영역으로 남겨둔다. */
  function addMonths(d,n){
    var base=new Date(d.getFullYear(),d.getMonth()+n,1);
    var lastDay=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
    if(d.getDate()>lastDay)return new Date(base.getFullYear(),base.getMonth()+1,1);
    return new Date(base.getFullYear(),base.getMonth(),d.getDate());
  }
  function addYears(d,n){ var r=new Date(d); r.setFullYear(r.getFullYear()+n); return r; }
  function daysBetween(a,b){ return Math.round((b-a)/86400000); }
  function fmt(d){ return d.getFullYear()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0"); }
  function today0(){ var t=new Date(); return new Date(t.getFullYear(),t.getMonth(),t.getDate()); }

  function severanceDate(hire){ return addYears(hire,1); }

  /* 예상 퇴직금 근사치 = 세후 월급 × 근속연수(1일 평균임금×30×근속일수/365 을 월급으로 근사) */
  function estimateSeverance(hire,ref,payManwon){
    if(!payManwon)return 0;
    var tenureDays=daysBetween(hire,ref);
    if(tenureDays<=0)return 0;
    return Math.round(payManwon*(tenureDays/365));
  }

  function nextAccrualDate(hire,basis,ref){
    if(basis==="fiscal"){
      return new Date(ref.getFullYear()+1,0,1);
    }
    var oneYear=severanceDate(hire);
    /* 응당일은 항상 입사일에서 직접 계산한다. 직전 결과에 다시 1개월/1년을 더하면
       월말 입사(1/31 등)에서 어긋난 날짜가 누적돼(1/31→3/3→4/3→5/3) 응당일이 통째로 바뀐다. */
    if(ref<oneYear){
      var n=1, cand=addMonths(hire,n);
      while(cand<=ref){n++;cand=addMonths(hire,n);}
      return cand<oneYear?cand:oneYear;
    }
    var y=1, cand2=addYears(hire,y);
    while(cand2<=ref){y++;cand2=addYears(hire,y);}
    return cand2;
  }

  function annualLeaveDays(serviceYears){
    if(serviceYears<1)return 1; // 1년 미만 매월 발생분(1일)
    var extra=Math.floor((serviceYears-1)/2);
    return Math.min(25,15+extra);
  }

  function nextBatchDays(hire,basis,nextDate){
    if(basis==="fiscal"){
      var yrs=nextDate.getFullYear()-hire.getFullYear();
      return annualLeaveDays(Math.max(1,yrs));
    }
    var oneYear=severanceDate(hire);
    if(nextDate<oneYear)return 1;
    var yrs2=nextDate.getFullYear()-hire.getFullYear();
    return annualLeaveDays(Math.max(1,yrs2));
  }

  /* ---------- 문구 테이블 ---------- */
  var T={
    ko:{
      futureHire:function(hireS,nextS,sevS){return "🗓️ 입력하신 <b>"+hireS+"</b>은 아직 오지 않은 날짜예요. 입사 전에는 근무일수가 0이라 연차도 0일이고 퇴직금 D-day도 셀 수 없어서 계산 결과는 보여드리지 않았어요."+
        "<br>입사 예정일이라면, 실제로 출근을 시작한 뒤 <b>"+nextS+"</b>(1개월 개근)에 첫 연차 1일이, <b>"+sevS+"</b>(근속 1년)에 퇴직금 대상이 돼요. 입사 후에 다시 계산하면 추천 퇴사일까지 알려드릴게요."},
      resultSub:function(hireS){return "입사일 "+hireS+" 기준"},
      severanceTitle:"퇴직금",
      severanceDone:function(sevS,est){return "근속 1년(" + sevS + ") 이상 — 이미 퇴직금 발생 대상이에요." + (est? " 오늘 기준 예상 퇴직금 약 <b>" + est + "만원</b>(세후 월급 기준 근사치)." : "")},
      severancePending:function(sevS,dday,est){return "근속 1년 완성일 " + sevS + " · <b>D-" + dday + "</b> — 그 전에 퇴사하면 퇴직금이 발생하지 않아요." + (est? " 1년을 채우면 예상 퇴직금 약 <b>" + est + "만원</b>(세후 월급 기준 근사치)." : "")},
      nextLeaveTitle:"다음 연차 발생일",
      nextLeaveDesc:function(nextS,dday,days,loss){return nextS + " · <b>D-" + dday + "</b> — 이 날짜에 " + days + "일치 연차가 새로 생겨요." + (loss? " 지금 퇴사하면 약 <b>" + loss + "만원</b> 손해 예상(근사치)." : "")},
      comboLine:function(comboS){return "📌 <b>" + comboS + "</b> 이후 퇴사하면 퇴직금과 다음 연차분을 모두 챙길 수 있어요."},
      targetBeforeHire:function(targetS,hireS){return "퇴사 희망일이 입사일("+hireS+")보다 앞서 있어요. 날짜를 다시 확인해 주세요."},
      targetBeforeHireTitle:function(targetS){return "희망일("+targetS+") 확인이 필요해요"},
      targetSevTitle:function(targetS){return "희망일(" + targetS + ") 기준 퇴직금"},
      targetSevOk:function(est){return "퇴직금 발생 조건을 충족해요." + (est? " 예상 퇴직금 약 <b>" + est + "만원</b>(세후 월급 기준 근사치)." : "")},
      targetSevBad:function(short){return "퇴직금 발생 전이에요 (" + short + "일 부족)."},
      targetLeaveTitle:"희망일 기준 다음 연차",
      targetLeaveOk:"다음 연차분까지 받을 수 있어요.",
      targetLeaveBad:function(short){return "다음 연차 발생 전이에요 (" + short + "일 부족)."},
      psyQ:[
        {id:"reason",t:"어떤 이유로 퇴사를 고민하고 계신가요?",opts:[
          ["people","사람 관계가 힘들어서"],["growth","성장이 정체된 것 같아서"],
          ["pay","보상(연봉)이 불만족스러워서"],["burnout","번아웃·건강 문제로"],
          ["offer","더 나은 기회가 보여서"],["vision","회사 방향성이 안 보여서"]
        ]},
        {id:"since",t:"이 고민, 언제부터 하셨나요?",opts:[["recent","최근에 갑자기"],["long","꽤 오래전부터"]]},
        {id:"ready",t:"지금 갈 곳(다음 계획)이 있으신가요?",opts:[["yes","있어요"],["no","아직 없어요"]]},
        {id:"finance",t:"당장 퇴사해도 재정적으로 여유가 있으신가요?",opts:[["ok","어느 정도 여유 있어요"],["tight","빠듯한 편이에요"]]},
        {id:"tried",t:"고민을 풀어보려고 시도해본 게 있으신가요? (부서이동 요청, 상담 등)",opts:[["yes","이미 해봤어요"],["no","아직 안 해봤어요"]]}
      ],
      reasonBase:{
        people:"사람 때문에 힘든 거라면, 퇴사 전에 부서 이동이나 팀 변경으로 해결되는 경우도 꽤 있어요. 같은 문제가 다음 직장에서도 반복될 수 있으니, 어떤 관계가 힘든지부터 구체적으로 짚어보는 게 도움이 돼요.",
        growth:"성장이 멈췄다고 느껴진다면, 이직 전에 사내에서 새로운 업무나 역할을 요청해본 적이 있는지 점검해보세요. 그래도 안 된다면 이직이 더 확실한 답일 수 있어요.",
        pay:"보상 불만족이라면, 이직 전에 현재 회사에 인상을 요청해본 적이 있나요? <a href=\"../salary-calculator/\">이직 연봉 협상 계산기</a>로 내 시장가부터 확인해보는 것도 방법이에요.",
        burnout:"번아웃이라면 무작정 퇴사보다, 남은 연차를 몰아 써서 며칠 완전히 쉬어보고 다시 판단하는 것도 방법이에요. 건강 문제라면 회복이 최우선이에요.",
        offer:"이미 더 나은 기회가 보인다면, 감정보다 조건 비교가 중요해요. <a href=\"../salary-calculator/\">이직 연봉 협상 계산기</a>로 제안 연봉을 냉정하게 먼저 평가해보세요.",
        vision:"회사 방향성이 안 보인다면, 그 판단이 정확한지 한 번 더 점검해볼 가치가 있어요. 리더십과 직접 대화해본 적이 있는지도 체크포인트예요."
      },
      sinceLong:"오래 고민해오셨다면, 이번엔 미루지 말고 구체적인 날짜를 잡아보는 것도 방법이에요.",
      sinceRecent:"고민을 시작한 지 얼마 안 됐다면, 조금 더 지켜보면서 정보를 모아보는 것도 좋아요.",
      readyYesCalc:"이미 갈 곳이 있으시다면, 위에서 계산한 추천 퇴사일에 맞춰 인수인계 일정만 조율하면 될 것 같아요.",
      readyYesNoCalc:"이미 갈 곳이 있으시다면, 퇴직금·연차 발생일을 먼저 확인하고 인수인계 일정을 조율해보세요.",
      financeTightCalc:"갈 곳이 아직 없고 재정도 빠듯하시다면, 위에서 계산한 퇴직금·연차부터 꼭 챙기고 최소 몇 개월치 생활비를 확보한 뒤 움직이는 걸 권해드려요.",
      financeTightNoCalc:"갈 곳이 아직 없고 재정도 빠듯하시다면, 퇴직금·연차부터 꼭 챙기고 최소 몇 개월치 생활비를 확보한 뒤 움직이는 걸 권해드려요.",
      readyNoCalc:"갈 곳이 아직 없다면, 위에서 계산한 퇴직금·연차 발생일까지는 챙기고 움직이는 게 유리해요.",
      readyNoNoCalc:"갈 곳이 아직 없다면, 퇴직금·연차 발생일까지는 챙기고 움직이는 게 유리해요.",
      triedNo:"아직 시도해본 게 없다면, 결정을 내리기 전에 한 번은 시도해보고 판단해도 늦지 않아요.",
      triedYes:"이미 여러 시도를 해보셨다면, 지금의 고민은 충분히 근거가 있는 신호일 수 있어요.",
      comboReminder:function(comboS){return "위에서 계산한 추천 퇴사일(<b>"+comboS+"</b>)도 함께 참고해보세요."}
    },
    en:{
      futureHire:function(hireS,nextS,sevS){return "🗓️ The date you entered, <b>"+hireS+"</b>, hasn't arrived yet. Before your start date, you have 0 working days, so paid leave is 0 days and there's no severance D-day to count — so we haven't shown a result."+
        "<br>If this is a planned start date, once you actually begin working you'll earn your first day of paid leave on <b>"+nextS+"</b> (one month of perfect attendance), and become eligible for severance on <b>"+sevS+"</b> (one year of service). Run the calculation again after you start and we'll recommend a resignation date."},
      resultSub:function(hireS){return "Based on a start date of "+hireS},
      severanceTitle:"Severance pay",
      severanceDone:function(sevS,est){return "One year of service (" + sevS + ") reached — you're already eligible for severance." + (est? " Estimated severance as of today: about <b>$" + est + "</b> (approximate, based on take-home pay)." : "")},
      severancePending:function(sevS,dday,est){return "You'll hit one year of service on " + sevS + " · <b>D-" + dday + "</b> — leaving before then means no severance pay." + (est? " Once you hit one year, estimated severance is about <b>$" + est + "</b> (approximate, based on take-home pay)." : "")},
      nextLeaveTitle:"Next paid leave accrual",
      nextLeaveDesc:function(nextS,dday,days,loss){return nextS + " · <b>D-" + dday + "</b> — you'll earn " + days + " new day(s) of paid leave on this date." + (loss? " Leaving now means an estimated loss of about <b>$" + loss + "</b> (approximate)." : "")},
      comboLine:function(comboS){return "📌 Leave after <b>" + comboS + "</b> and you'll capture both your severance pay and your next batch of paid leave."},
      targetBeforeHire:function(targetS,hireS){return "Your target resignation date is earlier than your start date ("+hireS+"). Please double-check the date."},
      targetBeforeHireTitle:function(targetS){return "Target date (" + targetS + ") needs a check"},
      targetSevTitle:function(targetS){return "Severance pay as of your target date (" + targetS + ")"},
      targetSevOk:function(est){return "You'd meet the condition for severance pay." + (est? " Estimated severance: about <b>$" + est + "</b> (approximate, based on take-home pay)." : "")},
      targetSevBad:function(short){return "That's before you're eligible for severance (" + short + " day(s) short)."},
      targetLeaveTitle:"Next paid leave as of your target date",
      targetLeaveOk:"You'd still capture the next batch of paid leave.",
      targetLeaveBad:function(short){return "That's before your next leave accrual (" + short + " day(s) short)."},
      psyQ:[
        {id:"reason",t:"What's the main reason you're considering leaving?",opts:[
          ["people","Difficult relationships with people"],["growth","Growth feels stalled"],
          ["pay","Compensation isn't satisfying"],["burnout","Burnout or health issues"],
          ["offer","A better opportunity has come up"],["vision","The company's direction feels unclear"]
        ]},
        {id:"since",t:"How long have you been thinking about this?",opts:[["recent","Just recently"],["long","For quite a while"]]},
        {id:"ready",t:"Do you have somewhere to go next (a plan)?",opts:[["yes","Yes, I do"],["no","Not yet"]]},
        {id:"finance",t:"Could you handle it financially if you left right now?",opts:[["ok","I have some cushion"],["tight","It would be tight"]]},
        {id:"tried",t:"Have you tried to address this already? (asking for a transfer, talking it through, etc.)",opts:[["yes","Yes, already tried"],["no","Not yet"]]}
      ],
      reasonBase:{
        people:"If it's about people, a department or team change can sometimes resolve things before you need to leave entirely. The same issue can follow you to the next job, so it helps to pin down specifically which relationship is the hard part.",
        growth:"If growth feels stalled, check whether you've actually asked for new work or a new role internally before job-hunting. If that doesn't move the needle, changing jobs may be the clearer answer.",
        pay:"If it's about compensation, have you asked your current company for a raise yet? Checking your market rate with the <a href=\"../salary-calculator/\">Salary Negotiation Calculator</a> is also a good first step.",
        burnout:"If it's burnout, rather than resigning outright, using up remaining leave for a real break and then reassessing can be worth trying. If it's a health issue, recovery comes first.",
        offer:"If you already have a better opportunity in sight, comparing the actual terms matters more than the feeling. Coolly evaluate the offer first with the <a href=\"../salary-calculator/\">Salary Negotiation Calculator</a>.",
        vision:"If the company's direction feels unclear, it's worth double-checking whether that read is accurate. Whether you've talked to leadership directly is a good checkpoint too."
      },
      sinceLong:"If you've been thinking about this for a while, it might be worth setting a concrete date this time instead of putting it off again.",
      sinceRecent:"If this is a recent concern, it's also fine to keep watching and gathering information a bit longer.",
      readyYesCalc:"If you already have somewhere to go, it sounds like you just need to line up your handover schedule with the recommended resignation date calculated above.",
      readyYesNoCalc:"If you already have somewhere to go, check your severance and leave accrual dates first, then line up your handover schedule.",
      financeTightCalc:"If you don't have somewhere lined up yet and finances are tight, be sure to capture the severance and leave accrual calculated above, and line up at least a few months of living expenses before you move.",
      financeTightNoCalc:"If you don't have somewhere lined up yet and finances are tight, be sure to capture your severance and leave accrual, and line up at least a few months of living expenses before you move.",
      readyNoCalc:"If you don't have somewhere lined up yet, it's better to wait until the severance and leave accrual dates calculated above before moving.",
      readyNoNoCalc:"If you don't have somewhere lined up yet, it's better to wait until your severance and leave accrual dates before moving.",
      triedNo:"If you haven't tried anything yet, it's not too late to try something before making the final call.",
      triedYes:"If you've already tried several things, this concern is likely a well-founded signal.",
      comboReminder:function(comboS){return "Also worth keeping in mind: the recommended resignation date calculated above is <b>"+comboS+"</b>."}
    }
  };
  var S=T[LANG];

  /* ---------- 기준(입사일/회계연도) 토글 ---------- */
  $("basis-hire").addEventListener("click",function(){setBasis("hire")});
  $("basis-fiscal").addEventListener("click",function(){setBasis("fiscal")});
  function setBasis(b){
    state.basis=b;
    $("basis-hire").classList.toggle("on",b==="hire");
    $("basis-fiscal").classList.toggle("on",b==="fiscal");
  }

  /* ---------- 계산 실행 ---------- */
  function rcard(cls,icon,title,desc){
    return '<div class="rcard '+cls+'"><div class="rt"><span class="ic">'+icon+'</span>'+title+'</div><div class="rd">'+desc+'</div></div>';
  }

  $("calc-btn").addEventListener("click",function(){
    var hire=parseDate($("hire-date").value);
    /* 힌트 정리는 early-return보다 앞에 둔다 — 미래 날짜로 안내를 띄운 뒤
       입력을 지우면, 지운 날짜를 계속 지적하는 문구가 남는다. */
    var hint=$("hire-hint");
    if(hint){hint.hidden=true;hint.innerHTML="";}
    if(!hire){$("hire-date").focus();return;}
    var today=today0();
    var pay=+$("monthly-pay").value||0;
    var target=parseDate($("target-date").value);

    /* 미래 입사일(아직 입사 전) — 근무일수가 0이라 퇴직금·연차 계산 자체가 성립하지 않는다.
       근속 1년 미만 연차는 "매월 개근 시 1일"이므로 근무를 시작하기 전에는 0일이고,
       D-day나 "지금 퇴사하면 얼마 손해" 같은 문구도 의미가 없다 → 결과 카드는 내지 않는다.
       다만 입사 예정일을 미리 넣어보는 사용자를 막지는 않고, 예정일 기준 기준일만 안내 톤으로 알려준다. */
    if(hire>today){
      state.comboDate=null;
      $("stepResult").hidden=true;
      if(hint){
        hint.innerHTML=S.futureHire(fmt(hire),fmt(addMonths(hire,1)),fmt(severanceDate(hire)));
        hint.hidden=false;
      }
      $("hire-date").focus();
      return;
    }

    var sevDate=severanceDate(hire);
    var sevDone=today>=sevDate;
    var sevDday=daysBetween(today,sevDate);

    var nextLeave=nextAccrualDate(hire,state.basis,today);
    var leaveDday=daysBetween(today,nextLeave);
    var batchDays=nextBatchDays(hire,state.basis,nextLeave);
    var dailyWage=pay>0?Math.round(pay*10000/209*8):0;
    var lossAmt=dailyWage?Math.round(dailyWage*batchDays/10000):0;

    var comboDate=sevDate>nextLeave?sevDate:nextLeave;
    state.comboDate=comboDate;
    state.sevDate=sevDate; state.nextLeave=nextLeave;

    $("result-sub").textContent=S.resultSub(fmt(hire));

    var estToday=estimateSeverance(hire,today,pay);
    var estAt1yr=estimateSeverance(hire,sevDate,pay);

    var cards="";
    cards+=rcard(sevDone?"ok":"warn", sevDone?"✅":"⏳", S.severanceTitle,
      sevDone?S.severanceDone(fmt(sevDate),estToday):S.severancePending(fmt(sevDate),sevDday,estAt1yr));
    cards+=rcard("info","📅",S.nextLeaveTitle,
      S.nextLeaveDesc(fmt(nextLeave),leaveDday,batchDays,lossAmt));
    $("result-cards").innerHTML=cards;

    $("combo-line").innerHTML=S.comboLine(fmt(comboDate));

    var tcards="";
    if(target&&target<hire){
      /* 퇴사 희망일이 입사일보다 앞선 경우 — "N일 부족"으로 판정하면 입력 실수를 못 알아챈다. */
      tcards+=rcard("warn","⚠️",S.targetBeforeHireTitle(fmt(target)),S.targetBeforeHire(fmt(target),fmt(hire)));
    }else if(target){
      var tSevOk=target>=sevDate, tLeaveOk=target>=nextLeave;
      var estAtTarget=tSevOk?estimateSeverance(hire,target,pay):0;
      tcards+=rcard(tSevOk?"ok":"warn", tSevOk?"✅":"⛔", S.targetSevTitle(fmt(target)),
        tSevOk? S.targetSevOk(estAtTarget) : S.targetSevBad(daysBetween(target,sevDate)));
      tcards+=rcard(tLeaveOk?"ok":"warn", tLeaveOk?"✅":"⛔", S.targetLeaveTitle,
        tLeaveOk? S.targetLeaveOk : S.targetLeaveBad(daysBetween(target,nextLeave)));
    }
    $("target-cards").innerHTML=tcards;

    $("stepResult").hidden=false;
    $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
  });

  /* ---------- 퇴사 고민 체크 (클릭식 5문항) ---------- */
  var PSY_Q=S.psyQ;
  var REASON_BASE=S.reasonBase;
  var psyState={idx:0,ans:{}};

  function renderPsyProgress(){
    var box=$("psy-progress"); box.innerHTML="";
    for(var i=0;i<PSY_Q.length;i++){
      var s=document.createElement("span");
      if(i<psyState.idx)s.className="done";
      box.appendChild(s);
    }
  }
  function renderPsyQ(){
    if(psyState.idx>=PSY_Q.length){renderPsyResult();return;}
    renderPsyProgress();
    var q=PSY_Q[psyState.idx];
    var box=$("psy-q");
    var html='<div class="pq-t">'+(psyState.idx+1)+'. '+q.t+'</div><div class="psy-opts">';
    q.opts.forEach(function(o){
      html+='<button type="button" class="psy-opt" data-v="'+o[0]+'">'+o[1]+'</button>';
    });
    html+='</div>';
    box.innerHTML=html;
    Array.prototype.forEach.call(box.querySelectorAll(".psy-opt"),function(btn){
      btn.addEventListener("click",function(){
        psyState.ans[q.id]=btn.getAttribute("data-v");
        psyState.idx++;
        renderPsyQ();
      });
    });
  }
  function renderPsyResult(){
    $("psy-q").innerHTML="";
    renderPsyProgress();
    var a=psyState.ans;
    var parts=[REASON_BASE[a.reason]];
    if(a.since==="long")parts.push(S.sinceLong);
    else parts.push(S.sinceRecent);
    /* 위쪽 계산을 안 했거나(미래 입사일 등) 결과가 없으면 "위에서 계산한"을 쓰면 안 된다. */
    var hasCalc=!!state.comboDate;
    if(a.ready==="yes")parts.push(hasCalc?S.readyYesCalc:S.readyYesNoCalc);
    else if(a.finance==="tight")parts.push(hasCalc?S.financeTightCalc:S.financeTightNoCalc);
    else parts.push(hasCalc?S.readyNoCalc:S.readyNoNoCalc);
    if(a.tried==="no")parts.push(S.triedNo);
    else parts.push(S.triedYes);
    if(state.comboDate)parts.push(S.comboReminder(fmt(state.comboDate)));

    $("psy-result").innerHTML=parts.join(" ");
    $("psy-result").hidden=false;
    $("psy-restart").hidden=false;
  }
  $("psy-restart").addEventListener("click",function(){
    psyState={idx:0,ans:{}};
    $("psy-result").hidden=true;
    $("psy-restart").hidden=true;
    renderPsyQ();
  });

  renderPsyQ();
})();
