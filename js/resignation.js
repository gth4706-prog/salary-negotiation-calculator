/* =========================================================
   퇴사 타이밍 계산기 (resignation-timing)
   - 서버 없음. 모든 계산은 브라우저 안에서만 동작.
   - 근속 1년 미만 연차: 매월 개근 시 1일(최대 11일)
   - 근속 1년 이상 연차: 15일 + (근속연수-1)/2(내림), 최대 25일 — 근사치
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("hire-date"))return;

  var state={basis:"hire"};

  /* ---------- 날짜 헬퍼 ---------- */
  function parseDate(v){ if(!v)return null; var p=v.split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
  function addMonths(d,n){ var r=new Date(d); r.setMonth(r.getMonth()+n); return r; }
  function addYears(d,n){ var r=new Date(d); r.setFullYear(r.getFullYear()+n); return r; }
  function daysBetween(a,b){ return Math.round((b-a)/86400000); }
  function fmt(d){ return d.getFullYear()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0"); }
  function today0(){ var t=new Date(); return new Date(t.getFullYear(),t.getMonth(),t.getDate()); }

  function severanceDate(hire){ return addYears(hire,1); }

  function nextAccrualDate(hire,basis,ref){
    if(basis==="fiscal"){
      return new Date(ref.getFullYear()+1,0,1);
    }
    var oneYear=severanceDate(hire);
    if(ref<oneYear){
      var cand=new Date(hire);
      while(cand<=ref)cand=addMonths(cand,1);
      return cand<oneYear?cand:oneYear;
    }
    var cand2=new Date(hire);
    while(cand2<=ref)cand2=addYears(cand2,1);
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
    if(!hire){$("hire-date").focus();return;}
    var today=today0();
    var pay=+$("monthly-pay").value||0;
    var target=parseDate($("target-date").value);

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

    $("result-sub").textContent="입사일 "+fmt(hire)+" 기준";

    var cards="";
    cards+=rcard(sevDone?"ok":"warn", sevDone?"✅":"⏳", "퇴직금",
      sevDone? "근속 1년(" + fmt(sevDate) + ") 이상 — 이미 퇴직금 발생 대상이에요."
             : "근속 1년 완성일 " + fmt(sevDate) + " · <b>D-" + sevDday + "</b> — 그 전에 퇴사하면 퇴직금이 발생하지 않아요.");
    cards+=rcard("info","📅","다음 연차 발생일",
      fmt(nextLeave) + " · <b>D-" + leaveDday + "</b> — 이 날짜에 " + batchDays + "일치 연차가 새로 생겨요." +
      (dailyWage? " 지금 퇴사하면 약 <b>" + lossAmt + "만원</b> 손해 예상(근사치)." : ""));
    $("result-cards").innerHTML=cards;

    $("combo-line").innerHTML="📌 <b>" + fmt(comboDate) + "</b> 이후 퇴사하면 퇴직금과 다음 연차분을 모두 챙길 수 있어요.";

    var tcards="";
    if(target){
      var tSevOk=target>=sevDate, tLeaveOk=target>=nextLeave;
      tcards+=rcard(tSevOk?"ok":"warn", tSevOk?"✅":"⛔", "희망일(" + fmt(target) + ") 기준 퇴직금",
        tSevOk? "퇴직금 발생 조건을 충족해요." : "퇴직금 발생 전이에요 (" + daysBetween(target,sevDate) + "일 부족).");
      tcards+=rcard(tLeaveOk?"ok":"warn", tLeaveOk?"✅":"⛔", "희망일 기준 다음 연차",
        tLeaveOk? "다음 연차분까지 받을 수 있어요." : "다음 연차 발생 전이에요 (" + daysBetween(target,nextLeave) + "일 부족).");
    }
    $("target-cards").innerHTML=tcards;

    $("stepResult").hidden=false;
    $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
    if($("adwrap"))$("adwrap").hidden=false;
  });

  /* ---------- 퇴사 고민 체크 (클릭식 5문항) ---------- */
  var PSY_Q=[
    {id:"reason",t:"어떤 이유로 퇴사를 고민하고 계신가요?",opts:[
      ["people","사람 관계가 힘들어서"],["growth","성장이 정체된 것 같아서"],
      ["pay","보상(연봉)이 불만족스러워서"],["burnout","번아웃·건강 문제로"],
      ["offer","더 나은 기회가 보여서"],["vision","회사 방향성이 안 보여서"]
    ]},
    {id:"since",t:"이 고민, 언제부터 하셨나요?",opts:[["recent","최근에 갑자기"],["long","꽤 오래전부터"]]},
    {id:"ready",t:"지금 갈 곳(다음 계획)이 있으신가요?",opts:[["yes","있어요"],["no","아직 없어요"]]},
    {id:"finance",t:"당장 퇴사해도 재정적으로 여유가 있으신가요?",opts:[["ok","어느 정도 여유 있어요"],["tight","빠듯한 편이에요"]]},
    {id:"tried",t:"고민을 풀어보려고 시도해본 게 있으신가요? (부서이동 요청, 상담 등)",opts:[["yes","이미 해봤어요"],["no","아직 안 해봤어요"]]}
  ];
  var REASON_BASE={
    people:"사람 때문에 힘든 거라면, 퇴사 전에 부서 이동이나 팀 변경으로 해결되는 경우도 꽤 있어요. 같은 문제가 다음 직장에서도 반복될 수 있으니, 어떤 관계가 힘든지부터 구체적으로 짚어보는 게 도움이 돼요.",
    growth:"성장이 멈췄다고 느껴진다면, 이직 전에 사내에서 새로운 업무나 역할을 요청해본 적이 있는지 점검해보세요. 그래도 안 된다면 이직이 더 확실한 답일 수 있어요.",
    pay:"보상 불만족이라면, 이직 전에 현재 회사에 인상을 요청해본 적이 있나요? <a href=\"../salary-calculator/\">이직 연봉 협상 계산기</a>로 내 시장가부터 확인해보는 것도 방법이에요.",
    burnout:"번아웃이라면 무작정 퇴사보다, 남은 연차를 몰아 써서 며칠 완전히 쉬어보고 다시 판단하는 것도 방법이에요. 건강 문제라면 회복이 최우선이에요.",
    offer:"이미 더 나은 기회가 보인다면, 감정보다 조건 비교가 중요해요. <a href=\"../salary-calculator/\">이직 연봉 협상 계산기</a>로 제안 연봉을 냉정하게 먼저 평가해보세요.",
    vision:"회사 방향성이 안 보인다면, 그 판단이 정확한지 한 번 더 점검해볼 가치가 있어요. 리더십과 직접 대화해본 적이 있는지도 체크포인트예요."
  };
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
    if(a.since==="long")parts.push("오래 고민해오셨다면, 이번엔 미루지 말고 구체적인 날짜를 잡아보는 것도 방법이에요.");
    else parts.push("고민을 시작한 지 얼마 안 됐다면, 조금 더 지켜보면서 정보를 모아보는 것도 좋아요.");
    if(a.ready==="yes")parts.push("이미 갈 곳이 있으시다면, 위에서 계산한 추천 퇴사일에 맞춰 인수인계 일정만 조율하면 될 것 같아요.");
    else if(a.finance==="tight")parts.push("갈 곳이 아직 없고 재정도 빠듯하시다면, 위에서 계산한 퇴직금·연차부터 꼭 챙기고 최소 몇 개월치 생활비를 확보한 뒤 움직이는 걸 권해드려요.");
    else parts.push("갈 곳이 아직 없다면, 위에서 계산한 퇴직금·연차 발생일까지는 챙기고 움직이는 게 유리해요.");
    if(a.tried==="no")parts.push("아직 시도해본 게 없다면, 결정을 내리기 전에 한 번은 시도해보고 판단해도 늦지 않아요.");
    else parts.push("이미 여러 시도를 해보셨다면, 지금의 고민은 충분히 근거가 있는 신호일 수 있어요.");
    if(state.comboDate)parts.push("위에서 계산한 추천 퇴사일(<b>"+fmt(state.comboDate)+"</b>)도 함께 참고해보세요.");

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
