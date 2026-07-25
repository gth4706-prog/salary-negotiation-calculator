/* =========================================================
   커플 재판 (couple-referee)
   - 서버 없음. AI/LLM 호출 없음 — 100% 결정론적 규칙(룰) 기반.
   - 자유서술은 화면 표시/감정정리용일 뿐 채점에는 쓰이지 않음.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("stepForm"))return;

  var QUESTIONS=[
    {id:"q1",t:"언성을 높이거나 화를 낸 쪽은?",opts:[["self","나"],["other","상대방"],["both","둘 다"],["none","아무도"]]},
    {id:"q2",t:"비슷한 일이 이전에도 있었나요?",opts:[["first","처음 있는 일"],["sometimes","가끔 있었음"],["often","자주 반복됨"]]},
    {id:"q3",t:"약속이나 선을 어긴 쪽은?",opts:[["self","나"],["other","상대방"],["both","둘 다"],["none","없음"]]},
    {id:"q4",t:"사과나 화해 시도를 한 쪽은?",opts:[["self","나"],["other","상대방"],["both","둘 다"],["none","아무도"]]},
    {id:"q5",t:"지금 얼마나 속상한가요?",type:"scale"},
    {id:"q6",t:"신체적 위협이나 폭력이 있었나요?",opts:[["no","없음"],["yes","있었음"]],safety:true}
  ];

  var JUDGES=[
    {id:"empathetic",name:"공감형 재판관 다정",img:"empathetic",blurb:"마음이 얼마나 아팠는지를 가장 먼저 봐요.",raiseMul:1.5,breakMul:0.8,repeatMul:1.2,trustOther:true,threshold:1.2},
    {id:"principled",name:"원칙형 재판관 소신",img:"principled",blurb:"약속과 반복되는 패턴을 중요하게 봐요.",raiseMul:0.8,breakMul:1.8,repeatMul:1.5,trustOther:true,threshold:1.2},
    {id:"balanced",name:"저울형 재판관 균형",img:"balanced",blurb:"웬만하면 둘 다에게 몫이 있다고 봐요.",raiseMul:1.0,breakMul:1.0,repeatMul:1.0,trustOther:true,threshold:1.8},
    {id:"blunt",name:"팩폭형 재판관 직진",img:"blunt",blurb:"본인이 인정한 사실만 믿고, 확실하면 확실하게 말해요.",raiseMul:1.0,breakMul:1.0,repeatMul:1.0,trustOther:false,threshold:0.9},
    {id:"reconcile",name:"화해형 재판관 온화",img:"reconcile",blurb:"누구 잘못인지보다 어떻게 풀지가 더 중요해요.",raiseMul:0.7,breakMul:0.7,repeatMul:1.0,trustOther:true,threshold:2.0}
  ];

  var DEGENDER_MAP=[
    [/남자\s?친구/g,"애인"],[/여자\s?친구/g,"애인"],[/남친/g,"애인"],[/여친/g,"애인"],
    [/신랑|남편/g,"배우자"],[/신부|아내|와이프/g,"배우자"],
    [/그녀/g,"그 사람"],[/그(?=[\s.,!?]|$)/g,"그 사람"],
    [/오빠|누나|형|언니/g,"상대방"],[/자기야|자기(?=[\s.,!?]|$)/g,"상대방"]
  ];

  var state={phase:"A",A:{},B:{}};

  /* ---------- 객관식 폼 렌더 ---------- */
  var current={}; // 현재 작성 중인 사람의 답변
  function renderQForm(){
    var box=$("qform"); box.innerHTML="";
    current={};
    QUESTIONS.forEach(function(q){
      var wrap=document.createElement("div"); wrap.className="qblock";
      var t=document.createElement("div"); t.className="qt"; t.textContent=q.t; wrap.appendChild(t);
      if(q.type==="scale"){
        var row=document.createElement("div"); row.className="scale-row";
        row.innerHTML='<input type="range" min="1" max="5" value="3" id="q-'+q.id+'"><span class="scale-out" id="q-'+q.id+'-out">3</span>';
        wrap.appendChild(row);
        current[q.id]=3;
        setTimeout(function(){
          var inp=$("q-"+q.id);
          inp.addEventListener("input",function(){current[q.id]=+inp.value; $("q-"+q.id+"-out").textContent=inp.value;});
        },0);
      }else{
        var opts=document.createElement("div"); opts.className="opt-row";
        q.opts.forEach(function(o){
          var b=document.createElement("button");
          b.type="button"; b.className="opt-btn"+(q.safety?" safety":""); b.textContent=o[1];
          b.addEventListener("click",function(){
            Array.prototype.forEach.call(opts.children,function(c){c.classList.remove("on")});
            b.classList.add("on");
            current[q.id]=o[0];
          });
          opts.appendChild(b);
        });
        wrap.appendChild(opts);
      }
      box.appendChild(wrap);
    });
  }
  renderQForm();

  /* ---------- 성별추정 표현 제거 ---------- */
  $("degender-btn").addEventListener("click",function(){
    var ta=$("p-text");
    var v=ta.value;
    DEGENDER_MAP.forEach(function(pair){ v=v.replace(pair[0],pair[1]); });
    ta.value=v;
    $("degender-note").hidden=false;
  });

  /* ---------- 폼 진행 ---------- */
  function collectAnswers(){
    for(var i=0;i<QUESTIONS.length;i++){
      if(current[QUESTIONS[i].id]===undefined)return null;
    }
    return{
      name:($("p-name").value||"").trim().slice(0,10)||(state.phase==="A"?"첫 번째 분":"두 번째 분"),
      text:$("p-text").value||"",
      q1:current.q1,q2:current.q2,q3:current.q3,q4:current.q4,q5:current.q5,q6:current.q6
    };
  }
  function resetFormFields(){
    $("p-name").value=""; $("p-text").value="";
    $("degender-note").hidden=true;
    renderQForm();
  }

  $("form-next").addEventListener("click",function(){
    var ans=collectAnswers();
    if(!ans){alert("모든 질문에 답해주세요.");return;}
    if(state.phase==="A"){
      state.A=ans;
      $("stepForm").hidden=true;
      $("stepHandoff").hidden=false;
      $("stepHandoff").scrollIntoView({behavior:"smooth",block:"start"});
    }else{
      state.B=ans;
      finish();
    }
  });

  $("handoff-continue").addEventListener("click",function(){
    state.phase="B";
    resetFormFields();
    $("form-title").textContent="두 번째 분, 상황을 알려주세요";
    $("form-sub").textContent="앞서 적은 내용은 안 보여요. 편하게 적어주세요.";
    $("form-next").textContent="판정 받기 →";
    $("stepHandoff").hidden=true;
    $("stepForm").hidden=false;
    $("stepForm").scrollIntoView({behavior:"smooth",block:"start"});
  });

  function restart(){
    location.href=location.pathname;
  }
  $("safety-restart").addEventListener("click",restart);
  $("result-restart").addEventListener("click",restart);

  /* ---------- 채점 엔진 ---------- */
  function catWeight(qid,target,other,trustOther){
    var selfAdmit=target[qid]==="self"||target[qid]==="both";
    var otherBlame=other[qid]==="other"||other[qid]==="both";
    if(!trustOther)return selfAdmit?1:0;
    if(selfAdmit&&otherBlame)return 1;
    if(selfAdmit||otherBlame)return 0.5;
    return 0;
  }
  function apologyCredit(p){ return (p.q4==="self"||p.q4==="both")?0.3:0; }
  function repeatFactor(A,B){
    var rank={first:1,sometimes:1.15,often:1.3};
    return Math.max(rank[A.q2]||1,rank[B.q2]||1);
  }
  function judgeVerdict(judge,A,B){
    var rf=repeatFactor(A,B);
    var faultA=(catWeight("q1",A,B,judge.trustOther)*judge.raiseMul+catWeight("q3",A,B,judge.trustOther)*judge.breakMul)*rf-apologyCredit(A);
    var faultB=(catWeight("q1",B,A,judge.trustOther)*judge.raiseMul+catWeight("q3",B,A,judge.trustOther)*judge.breakMul)*rf-apologyCredit(B);
    faultA=Math.max(0,faultA); faultB=Math.max(0,faultB);
    var diff=faultA-faultB;
    if(Math.abs(diff)<judge.threshold)return{side:"both"};
    return{side:diff>0?"B":"A"}; // A 잘못이 크면(diff>0) B 편을 들어줌
  }

  function finish(){
    if(state.A.q6==="yes"||state.B.q6==="yes"){
      $("stepForm").hidden=true;
      $("stepSafety").hidden=false;
      $("stepSafety").scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    var votes={A:0,B:0,both:0};
    var cardsHtml="";
    JUDGES.forEach(function(j){
      var v=judgeVerdict(j,state.A,state.B);
      votes[v.side]++;
      var label=v.side==="both"?"둘 다 조금씩":(v.side==="A"?state.A.name+"님 편":state.B.name+"님 편");
      cardsHtml+='<div class="judge-card">'
        +'<img src="../img/judges/'+j.img+'.svg" alt="'+j.name+'">'
        +'<div><div class="jname">'+j.name+'</div><div class="jblurb">'+j.blurb+'</div>'
        +'<span class="jverdict side-'+v.side.toLowerCase()+'">'+label+'</span></div>'
        +'</div>';
    });
    $("judge-cards").innerHTML=cardsHtml;

    var winner="both";
    if(votes.A>votes.B&&votes.A>votes.both)winner="A";
    else if(votes.B>votes.A&&votes.B>votes.both)winner="B";
    var bannerText;
    if(winner==="both"){
      bannerText="📌 5명 중 <b>"+votes.both+"명</b>이 \"둘 다 조금씩\"이라고 봤어요. ("+state.A.name+" 편:"+votes.A+" · "+state.B.name+" 편:"+votes.B+")";
    }else{
      var sidedWith=winner==="A"?state.A.name:state.B.name;
      bannerText="📌 5명 중 <b>"+votes[winner]+"명</b>이 <b>"+sidedWith+"님</b> 편을 들었어요.";
    }
    $("result-banner").innerHTML=bannerText;
    $("result-sub").textContent=state.A.name+" · "+state.B.name;

    $("stepForm").hidden=true;
    $("stepResult").hidden=false;
    $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
    if($("adwrap"))$("adwrap").hidden=false;
  }
})();
