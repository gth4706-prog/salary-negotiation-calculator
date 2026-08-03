/* =========================================================
   커플 재판 (couple-referee)

   판정은 두 갈래로 나오지만 화면에 그리는 코드는 하나다.
     - AI 판정   : Worker(/couple-verdict)가 자유서술까지 읽고 판정. 기본 경로.
     - 간이 판정 : AI가 안 되면(미배포·할당량 소진·오프라인) 객관식만 보는
                   결정론적 룰 엔진. 화면이 절대 에러로 끝나지 않게 하는 안전망.
   두 갈래 모두 같은 모양의 verdict 객체를 만들고 renderResult() 하나가 그린다.
     verdict = { mode, summary, advice, judges:[{id, side, line, reason}] }
     side: "A" | "B" | "both"  (편을 들어주는 쪽)

   ⚠️ AI 경로에서는 입력 내용이 Worker를 거쳐 AI 제공자로 전송된다(저장은 안 함).
      화면 안내 문구도 이 사실에 맞춰져 있어야 한다 — 임의로 "브라우저 안에서만"
      으로 되돌리지 말 것.

   KO/EN 공유: window.REFEREE_LANG="en" 이면 질문·재판관·안전 키워드·화면 문구를
   전부 영어 테이블에서 고르고, Worker에도 lang:"en"을 실어보내 AI 응답까지 영어로 받는다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("stepForm"))return;
  var LANG=(window.REFEREE_LANG==="en")?"en":"ko";

  var API_BASE="https://bold-dream-f416.gth3941.workers.dev";

  var QUESTIONS_KO=[
    {id:"q1",t:"언성을 높이거나 화를 낸 쪽은?",opts:[["self","나"],["other","상대방"],["both","둘 다"],["none","아무도"]]},
    {id:"q2",t:"비슷한 일이 이전에도 있었나요?",opts:[["first","처음 있는 일"],["sometimes","가끔 있었음"],["often","자주 반복됨"]]},
    {id:"q3",t:"약속이나 선을 어긴 쪽은?",opts:[["self","나"],["other","상대방"],["both","둘 다"],["none","없음"]]},
    {id:"q4",t:"사과나 화해 시도를 한 쪽은?",opts:[["self","나"],["other","상대방"],["both","둘 다"],["none","아무도"]]},
    {id:"q5",t:"지금 얼마나 속상한가요?",type:"scale"},
    {id:"q6",t:"신체적 위협이나 폭력이 있었나요?",opts:[["no","없음"],["yes","있었음"]],safety:true}
  ];
  var QUESTIONS_EN=[
    {id:"q1",t:"Who raised their voice or got angry?",opts:[["self","Me"],["other","The other person"],["both","Both"],["none","Neither"]]},
    {id:"q2",t:"Has something similar happened before?",opts:[["first","First time"],["sometimes","Happened occasionally"],["often","Happens often"]]},
    {id:"q3",t:"Who broke a promise or crossed a line?",opts:[["self","Me"],["other","The other person"],["both","Both"],["none","Neither"]]},
    {id:"q4",t:"Who tried to apologize or make up?",opts:[["self","Me"],["other","The other person"],["both","Both"],["none","Neither"]]},
    {id:"q5",t:"How upset are you right now?",type:"scale"},
    {id:"q6",t:"Was there any physical threat or violence?",opts:[["no","No"],["yes","Yes"]],safety:true}
  ];
  var QUESTIONS=LANG==="en"?QUESTIONS_EN:QUESTIONS_KO;

  var JUDGES_KO=[
    {id:"empathetic",name:"공감형 재판관 다정",img:"empathetic",blurb:"마음이 얼마나 아팠는지를 가장 먼저 봐요.",raiseMul:1.5,breakMul:0.8,repeatMul:1.2,trustOther:true,threshold:1.2},
    {id:"principled",name:"원칙형 재판관 소신",img:"principled",blurb:"약속과 반복되는 패턴을 중요하게 봐요.",raiseMul:0.8,breakMul:1.8,repeatMul:1.5,trustOther:true,threshold:1.2},
    {id:"balanced",name:"저울형 재판관 균형",img:"balanced",blurb:"웬만하면 둘 다에게 몫이 있다고 봐요.",raiseMul:1.0,breakMul:1.0,repeatMul:1.0,trustOther:true,threshold:1.8},
    {id:"blunt",name:"팩폭형 재판관 직진",img:"blunt",blurb:"본인이 인정한 사실만 믿고, 확실하면 확실하게 말해요.",raiseMul:1.0,breakMul:1.0,repeatMul:1.0,trustOther:false,threshold:0.9},
    {id:"reconcile",name:"화해형 재판관 온화",img:"reconcile",blurb:"누구 잘못인지보다 어떻게 풀지가 더 중요해요.",raiseMul:0.7,breakMul:0.7,repeatMul:1.0,trustOther:true,threshold:2.0}
  ];
  var JUDGES_EN=[
    {id:"empathetic",name:"Judge Warmth (Empathetic)",img:"empathetic",blurb:"Looks first at how much it hurt emotionally.",raiseMul:1.5,breakMul:0.8,repeatMul:1.2,trustOther:true,threshold:1.2},
    {id:"principled",name:"Judge Conviction (Principled)",img:"principled",blurb:"Cares most about broken promises and repeat patterns.",raiseMul:0.8,breakMul:1.8,repeatMul:1.5,trustOther:true,threshold:1.2},
    {id:"balanced",name:"Judge Scale (Balanced)",img:"balanced",blurb:"Usually sees fault on both sides.",raiseMul:1.0,breakMul:1.0,repeatMul:1.0,trustOther:true,threshold:1.8},
    {id:"blunt",name:"Judge Straight-Shooter (Blunt)",img:"blunt",blurb:"Only trusts what you admit yourself — direct when it's clear.",raiseMul:1.0,breakMul:1.0,repeatMul:1.0,trustOther:false,threshold:0.9},
    {id:"reconcile",name:"Judge Gentle (Reconciling)",img:"reconcile",blurb:"Cares more about fixing things than who's at fault.",raiseMul:0.7,breakMul:0.7,repeatMul:1.0,trustOther:true,threshold:2.0}
  ];
  var JUDGES=LANG==="en"?JUDGES_EN:JUDGES_KO;
  var JUDGE_BY_ID={};
  JUDGES.forEach(function(j){JUDGE_BY_ID[j.id]=j});

  var DEGENDER_MAP_KO=[
    [/남자\s?친구/g,"애인"],[/여자\s?친구/g,"애인"],[/남친/g,"애인"],[/여친/g,"애인"],
    [/신랑|남편/g,"배우자"],[/신부|아내|와이프/g,"배우자"],
    [/그녀/g,"그 사람"],[/그(?=[\s.,!?]|$)/g,"그 사람"],
    [/오빠|누나|형|언니/g,"상대방"],[/자기야|자기(?=[\s.,!?]|$)/g,"상대방"]
  ];
  var DEGENDER_MAP_EN=[
    [/\bboyfriend\b/gi,"partner"],[/\bgirlfriend\b/gi,"partner"],
    [/\bhusband\b/gi,"spouse"],[/\bwife\b/gi,"spouse"],
    [/\bshe\b/gi,"they"],[/\bhe\b/gi,"they"],
    [/\bhim\b/gi,"them"],[/\bher\b/gi,"them"],
    [/\bhis\b/gi,"their"],[/\bhers\b/gi,"theirs"]
  ];
  var DEGENDER_MAP=LANG==="en"?DEGENDER_MAP_EN:DEGENDER_MAP_KO;

  /* 자유서술 키워드 신호. 반복·화해 신호는 간이 판정 채점에만 쓰고(AI 판정은 글을
     직접 읽는다), 안전 신호는 두 경로 모두에서 판정 전에 먼저 본다.
     방향(누구 탓인지)을 가리는 신호는 오판 위험이 커서 넣지 않는다. */

  /* 안전 게이트 키워드. AI 판정에는 "학대 정황이면 멈춰라"는 지시가 따로 있지만,
     AI가 안 될 때(미배포·할당량 소진·오프라인) 남는 안전망은 이 목록뿐이다.
     즉 안전망이 가장 약해지는 시점이 AI가 죽었을 때라 여기가 넉넉해야 한다.
     놓치는 쪽(위험한데 재미 판정을 보여줌)이 과잉 감지보다 훨씬 나쁘므로
     의심스러우면 잡는 방향으로 둔다. 단 "졸랐"은 '떼썼다'는 뜻으로도 흔히 쓰여
     목/멱살 같은 신체 맥락이 붙을 때만 잡는다.
     영문판은 workers/webtool-proxy/worker.js의 CV_SAFETY_PATTERNS_EN과 같은
     원칙으로 맞춘 목록이다 — 클라이언트는 우회 가능하므로 서버에도 같은 안전망이 있다. */
  var SAFETY_WORDS_KO=[
    /때렸|때리[려겠]|때릴|팼|패버/,/맞았|맞을\s?뻔/,/폭행|구타/,/밀쳤|밀쳐|밀치|밀칩|떠밀/,
    /멱살|머리채/,/협박|위협했/,/죽인다|죽여|죽일|죽는다고/,/손찌검/,/폭력/,
    /목을?\s?(졸|조르|조였|죄)/,
    /발로\s?(찼|차서|밟)|걷어찼/,
    /감금|가뒀|가둬|못\s?나가게|문을?\s?잠그|나가지\s?못하게/,
    /흉기|칼을?\s?(들|겨|휘)/,
    /멍이?\s?들|상처가\s?났/,
    /팔을?\s?(잡아|비틀|꺾)|손목을?\s?(잡아|비틀)/,
    /(카드|월급|통장|돈|휴대폰|핸드폰|차키)를?\s?[^.,!?]{0,6}뺏|생활비를?\s?안\s?[주줘]/,
    /감시|위치를?\s?확인|어디\s?가는지.{0,6}보고|일일이\s?보고/,
    /(물건|의자|핸드폰|폰|컵|그릇|리모컨)을?\s?던[지졌져]|집어\s?던/,
    /벽을?\s?(치|쳤|주먹)|주먹으로/
  ];
  var SAFETY_WORDS_EN=[
    /\bhit\b|\bhits\b|\bhitting\b|\bpunch(ed|ing)?\b|\bslap(ped|ping)?\b|\bbeat(en|ing)?\s+me\b/i,
    /\bpush(ed|ing)?\s+me\b|\bshov(ed|ing)\s+me\b/i,
    /\bchok(ed|ing)\b|\bstrangl(ed|ing)\b/i,
    /\bkick(ed|ing)?\s+me\b/i,
    /\bthrew?\s+(a|the|something)\b.*\bat\s+me\b|\bthrowing\s+things?\b/i,
    /\bthreaten(ed|ing)?\b|\bthreat\b/i,
    /\bkill\s+(you|me|myself|him|her)\b|\bgonna\s+kill\b/i,
    /\bafraid\s+of\s+(him|her|them)\b|\bscared\s+of\s+(him|her|them)\b|\bi'?m\s+scared\b/i,
    /\bdomestic\s+violence\b|\babuse(d|ive)?\b/i,
    /\bwon'?t\s+let\s+me\s+leave\b|\block(ed)?\s+me\s+(in|out)\b|\bwon'?t\s+let\s+me\s+out\b/i,
    /\btook\s+(my\s+)?(phone|wallet|keys|money|card)\b|\bwon'?t\s+give\s+(me\s+)?money\b/i,
    /\btracks?\s+my\s+(phone|location)\b|\bchecks?\s+where\s+i\s+(am|go)\b|\bmonitors?\s+me\b/i,
    /\bweapon\b|\bknife\b|\bpointed\s+a\b/i,
    /\bbruise[sd]?\b|\bhurt\s+me\b/i,
    /\bgrabbed\s+(my\s+)?(arm|wrist)\b|\btwisted\s+(my\s+)?arm\b/i,
    /\bforced\s+me\b|\bwithout\s+my\s+consent\b/i,
    /\bpunched\s+the\s+wall\b/i
  ];
  var SAFETY_WORDS=LANG==="en"?SAFETY_WORDS_EN:SAFETY_WORDS_KO;
  var REPEAT_WORDS=LANG==="en"?[/always/i,/every\s?time/i,/again\s+and\s+again/i,/keeps?\s+happening/i,/not\s+the\s+first\s+time/i]:[/맨날/,/항상/,/매번/,/반복/,/또\s?이런/,/한두\s?번이/];
  var RECONCILE_WORDS=LANG==="en"?[/sorry/i,/apolog/i,/made\s+up/i,/reconcil/i]:[/미안/,/사과/,/화해/,/풀었/];
  function textHas(list,text){ return list.some(function(re){return re.test(text||"")}); }

  /* ---------- 문구 테이블 ---------- */
  var T={
    ko:{
      firstPersonName:"첫 번째 분", secondPersonName:"두 번째 분",
      formTitleB:"두 번째 분, 상황을 알려주세요",
      formSubB:"앞서 적은 내용은 안 보여요. 편하게 적어주세요.",
      formNextB:"판정 받기 →",
      answerAll:"모든 질문에 답해주세요.",
      degenderNote:"완벽하지 않을 수 있어요 — 성별을 짐작하게 하는 표현 일부를 중립적인 말로 바꿨어요.",
      bothLabel:"둘 다 조금씩",
      sideLabel:function(name){return honorific(name)+" 편"},
      bannerA:function(n,votesA,name){return "📌 "+n+"명 중 <b>"+votesA+"명</b>이 <b>"+escapeHtml(honorific(name))+"</b> 편을 들었어요."},
      bannerB:function(n,votesB,name){return "📌 "+n+"명 중 <b>"+votesB+"명</b>이 <b>"+escapeHtml(honorific(name))+"</b> 편을 들었어요."},
      bannerBoth:function(n,votesBoth,tally){return "📌 "+n+"명 중 <b>"+votesBoth+"명</b>이 \"둘 다 조금씩\"이라고 봤어요. "+tally},
      bannerSplit:function(tally){return "📌 재판관들 의견이 <b>팽팽하게 갈렸어요.</b> "+tally},
      tally:function(nameA,votesA,nameB,votesB,votesBoth){return "("+escapeHtml(nameA)+" 편:"+votesA+" · "+escapeHtml(nameB)+" 편:"+votesB+" · 둘 다:"+votesBoth+")"},
      modeAi:"AI 판정", modeRule:"간이 판정",
      modeAiTitle:"AI가 두 분이 적은 글을 직접 읽고 재판관별로 판정했어요.",
      modeRuleTitle:"AI 판정을 못 불러와서 객관식 답변만으로 판정했어요. 잠시 후 다시 시도해보세요.",
      advicePrefix:"💡 <b>이렇게 해보세요</b><br>",
      ruleNoteRepeat:"'반복되는 일'이라는 표현이 감지돼 반영했어요.",
      ruleNoteReconcile:"'사과·화해' 표현이 보였어요."
    },
    en:{
      firstPersonName:"the first person", secondPersonName:"the second person",
      formTitleB:"Second person, tell us what happened",
      formSubB:"What the first person wrote is hidden from you. Write freely.",
      formNextB:"Get the ruling →",
      answerAll:"Please answer every question.",
      degenderNote:"This may not be perfect — we swapped some gendered wording for neutral terms.",
      bothLabel:"Both, a little",
      sideLabel:function(name){return "Sides with "+name},
      bannerA:function(n,votesA,name){return "📌 <b>"+votesA+" out of "+n+" judges</b> sided with <b>"+escapeHtml(name)+"</b>."},
      bannerB:function(n,votesB,name){return "📌 <b>"+votesB+" out of "+n+" judges</b> sided with <b>"+escapeHtml(name)+"</b>."},
      bannerBoth:function(n,votesBoth,tally){return "📌 <b>"+votesBoth+" out of "+n+" judges</b> said \"both share some fault.\" "+tally},
      bannerSplit:function(tally){return "📌 The judges' opinions were <b>split right down the middle.</b> "+tally},
      tally:function(nameA,votesA,nameB,votesB,votesBoth){return "(Sided with "+escapeHtml(nameA)+": "+votesA+" · Sided with "+escapeHtml(nameB)+": "+votesB+" · Both: "+votesBoth+")"},
      modeAi:"AI ruling", modeRule:"Quick ruling",
      modeAiTitle:"An AI read what you both wrote directly and ruled as each judge.",
      modeRuleTitle:"Couldn't reach the AI, so this ruling used only your multiple-choice answers. Try again in a moment.",
      advicePrefix:"💡 <b>Try this</b><br>",
      ruleNoteRepeat:"We picked up on language suggesting this is a repeat pattern and factored it in.",
      ruleNoteReconcile:"We noticed language about apologizing or making up."
    }
  };
  var S=T[LANG];

  /* 이름 뒤에 "님"을 붙일 때 — 기본값이 "첫 번째 분"이라 그냥 붙이면 "첫 번째 분님"이 된다.
     영문판은 존칭 접미사가 없으므로 이름을 그대로 쓴다. */
  function honorific(name){
    if(LANG==="en")return name;
    return /[분님]$/.test(name) ? name : name+"님";
  }

  function escapeHtml(s){
    return String(s==null?"":s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

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
            /* 폭력을 '있었음'으로 고른 순간 바로 지원기관 안내로 넘긴다.
               예전엔 두 사람이 다 입력한 뒤에야 떴는데, 그러면 신고하려는 쪽이
               화면을 상대에게 넘겨야 해서 안내를 못 보고 위험해질 수 있었다. */
            if(q.safety&&o[0]==="yes")showSafety();
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
    $("degender-note").textContent=S.degenderNote;
    $("degender-note").hidden=false;
  });

  /* ---------- 화면 전환 ---------- */
  function show(id){
    ["stepForm","stepHandoff","stepSafety","stepResult"].forEach(function(s){ $(s).hidden = (s!==id); });
    $(id).scrollIntoView({behavior:"smooth",block:"start"});
  }
  function showSafety(){
    setLoading(false);
    show("stepSafety");
  }
  function setLoading(on){
    var el=$("stepLoading");
    if(el)el.hidden=!on;
  }

  /* ---------- 폼 진행 ---------- */
  function collectAnswers(){
    for(var i=0;i<QUESTIONS.length;i++){
      if(current[QUESTIONS[i].id]===undefined)return null;
    }
    return{
      name:($("p-name").value||"").trim().slice(0,10)||(state.phase==="A"?S.firstPersonName:S.secondPersonName),
      text:$("p-text").value||"",
      q1:current.q1,q2:current.q2,q3:current.q3,q4:current.q4,q5:current.q5,q6:current.q6
    };
  }
  function resetFormFields(){
    $("p-name").value=""; $("p-text").value="";
    $("degender-note").hidden=true;
    renderQForm();
  }

  /* 예전엔 alert() 를 썼는데, 네이티브 모달은 화면을 가리고 모바일에서 특히 거칠다.
     (또 자동화·크롤러 환경에서는 페이지를 멈추게 만든다.) 폼 안에서 조용히 알려주고
     답 안 한 첫 문항으로 스크롤해 준다. */
  function showFormError(){
    var el=$("form-error");
    if(el){ el.textContent=S.answerAll; el.hidden=false; }
    /* 객관식(.opt-row)이 있는데 고른 버튼(.on)이 없는 첫 문항으로 데려간다.
       슬라이더 문항은 기본값이 있어 항상 응답 상태다. */
    var blocks=document.querySelectorAll("#qform .qblock"), un=null;
    for(var i=0;i<blocks.length;i++){
      var row=blocks[i].querySelector(".opt-row");
      if(row&&!row.querySelector(".on")){ un=blocks[i]; break; }
    }
    var target=un||el;
    if(target&&target.scrollIntoView) target.scrollIntoView({behavior:"smooth",block:"center"});
  }
  function hideFormError(){ var el=$("form-error"); if(el) el.hidden=true; }

  $("form-next").addEventListener("click",function(){
    var ans=collectAnswers();
    if(!ans){ showFormError(); return; }
    hideFormError();
    /* 자유서술에 폭력 정황이 있으면 상대에게 화면을 넘기기 전에 여기서 멈춘다. */
    if(ans.q6==="yes"||textHas(SAFETY_WORDS,ans.text)){ showSafety(); return; }
    if(state.phase==="A"){
      state.A=ans;
      show("stepHandoff");
    }else{
      state.B=ans;
      finish();
    }
  });

  $("handoff-continue").addEventListener("click",function(){
    state.phase="B";
    resetFormFields();
    $("form-title-text").textContent=S.formTitleB;
    $("form-sub").textContent=S.formSubB;
    $("form-next").textContent=S.formNextB;
    show("stepForm");
  });

  function restart(){
    location.href=location.pathname;
  }
  $("safety-restart").addEventListener("click",restart);
  $("result-restart").addEventListener("click",restart);

  /* =========================================================
     판정 갈래 1 — 간이 판정(룰 엔진). AI가 안 될 때의 안전망.
     ========================================================= */
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
    var f=Math.max(rank[A.q2]||1,rank[B.q2]||1);
    if(textHas(REPEAT_WORDS,A.text)||textHas(REPEAT_WORDS,B.text))f=Math.max(f,1.2);
    return f;
  }
  function reconcileSoftening(A,B){
    return (textHas(RECONCILE_WORDS,A.text)||textHas(RECONCILE_WORDS,B.text))?0.3:0;
  }
  function judgeSide(judge,A,B){
    var rf=repeatFactor(A,B),soften=reconcileSoftening(A,B);
    var faultA=(catWeight("q1",A,B,judge.trustOther)*judge.raiseMul+catWeight("q3",A,B,judge.trustOther)*judge.breakMul)*rf-apologyCredit(A)-soften;
    var faultB=(catWeight("q1",B,A,judge.trustOther)*judge.raiseMul+catWeight("q3",B,A,judge.trustOther)*judge.breakMul)*rf-apologyCredit(B)-soften;
    faultA=Math.max(0,faultA); faultB=Math.max(0,faultB);
    var diff=faultA-faultB;
    if(Math.abs(diff)<judge.threshold)return "both";
    return diff>0?"B":"A"; // A 잘못이 크면(diff>0) B 편을 들어줌
  }
  function ruleVerdict(A,B){
    var notes=[];
    if(textHas(REPEAT_WORDS,A.text)||textHas(REPEAT_WORDS,B.text))notes.push(S.ruleNoteRepeat);
    /* 화해 표현은 양쪽 점수를 똑같이 깎아서 대개 판정 방향을 바꾸지 않는다.
       "완화했다"고 단정하지 말고 감지 사실만 알린다. */
    if(textHas(RECONCILE_WORDS,A.text)||textHas(RECONCILE_WORDS,B.text))notes.push(S.ruleNoteReconcile);
    return {
      mode:"rule",
      summary:notes.join(" "),
      advice:"",
      judges:JUDGES.map(function(j){
        return {id:j.id,side:judgeSide(j,A,B),line:"",reason:""};
      })
    };
  }

  /* =========================================================
     판정 갈래 2 — AI 판정. 자유서술까지 읽고 재판관별로 판정한다.
     실패하면 null을 돌려주고 호출부가 간이 판정으로 넘어간다.
     ========================================================= */
  function payloadOf(p){
    return {name:p.name,text:p.text,q1:p.q1,q2:p.q2,q3:p.q3,q4:p.q4,q5:p.q5};
  }
  function aiVerdict(A,B){
    var ctrl=("AbortController" in window)?new AbortController():null;
    var timer=setTimeout(function(){ if(ctrl)ctrl.abort(); },25000);

    return fetch(API_BASE+"/couple-verdict",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({a:payloadOf(A),b:payloadOf(B),lang:LANG}),
      signal:ctrl?ctrl.signal:undefined
    }).then(function(res){
      if(!res.ok)return null;      // 미배포(404)·AI 없음(503)·할당량 소진 → 간이 판정
      return res.json();
    }).then(function(d){
      if(!d)return null;
      if(d.safety===true)return {mode:"safety"};
      /* 모르는 재판관 id만 오면 필터 후 0명이 된다 — 걸러낸 뒤에 세야 한다. */
      var judges=(d.judges||[]).filter(function(j){
        return j&&JUDGE_BY_ID[j.id]&&(j.side==="A"||j.side==="B"||j.side==="both");
      });
      if(!judges.length)return null;
      return {mode:"ai",summary:d.summary||"",advice:d.advice||"",judges:judges};
    }).catch(function(){
      return null;                 // 타임아웃·네트워크 오류 → 간이 판정
    }).then(function(v){
      clearTimeout(timer);
      return v;
    });
  }

  /* =========================================================
     결과 렌더 — 두 갈래가 만든 같은 모양의 verdict 하나만 받는다.
     ========================================================= */
  function renderResult(v){
    var votes={A:0,B:0,both:0};
    var html="";
    v.judges.forEach(function(j){
      var meta=JUDGE_BY_ID[j.id];
      if(!meta)return;
      votes[j.side]++;
      var label=j.side==="both"?S.bothLabel:S.sideLabel(j.side==="A"?state.A.name:state.B.name);
      html+='<div class="judge-card">'
        +'<img src="../img/judges/'+meta.img+'.svg" alt="'+escapeHtml(meta.name)+'">'
        +'<div><div class="jname">'+escapeHtml(meta.name)+'</div>'
        +'<div class="jblurb">'+escapeHtml(meta.blurb)+'</div>'
        +'<span class="jverdict side-'+j.side.toLowerCase()+'">'+escapeHtml(label)+'</span>'
        +(j.line?'<div class="jline">'+escapeHtml(j.line)+'</div>':"")
        +(j.reason?'<div class="jreason">'+escapeHtml(j.reason)+'</div>':"")
        +'</div></div>';
    });
    $("judge-cards").innerHTML=html;

    var n=v.judges.length;
    var tally=S.tally(state.A.name,votes.A,state.B.name,votes.B,votes.both);
    /* 단독 최다일 때만 그 결과를 헤드라인으로 쓴다. 2:2:1처럼 아무도 단독
       최다가 아닌 경우 "1명이 둘 다라고 봤어요"를 크게 쓰면 실제 결과를
       대표하지 못하므로, 갈렸다고 그대로 말한다. */
    if(votes.A>votes.B&&votes.A>votes.both){
      $("result-banner").innerHTML=S.bannerA(n,votes.A,honorific(state.A.name));
    }else if(votes.B>votes.A&&votes.B>votes.both){
      $("result-banner").innerHTML=S.bannerB(n,votes.B,honorific(state.B.name));
    }else if(votes.both>votes.A&&votes.both>votes.B){
      $("result-banner").innerHTML=S.bannerBoth(n,votes.both,tally);
    }else{
      $("result-banner").innerHTML=S.bannerSplit(tally);
    }
    $("result-sub").textContent=state.A.name+" · "+state.B.name;

    var badge=$("result-mode");
    if(badge){
      badge.textContent=v.mode==="ai"?S.modeAi:S.modeRule;
      badge.title=v.mode==="ai"?S.modeAiTitle:S.modeRuleTitle;
      badge.className="mode-badge "+(v.mode==="ai"?"ai":"rule");
      badge.hidden=false;
    }

    var sum=$("result-summary");
    if(sum){
      if(v.summary){ sum.textContent=v.summary; sum.hidden=false; }
      else sum.hidden=true;
    }
    var adv=$("result-advice");
    if(adv){
      if(v.advice){ adv.innerHTML=S.advicePrefix+escapeHtml(v.advice); adv.hidden=false; }
      else adv.hidden=true;
    }

    setLoading(false);
    show("stepResult");
  }

  function finish(){
    if(state.A.q6==="yes"||state.B.q6==="yes"
      ||textHas(SAFETY_WORDS,state.A.text)||textHas(SAFETY_WORDS,state.B.text)){
      showSafety(); return;
    }
    /* 두 사람이 같은 이름을 적으면 "민수님 편"이 양쪽 다 나와 결과를 구분할 수 없다. */
    if(state.A.name===state.B.name){
      state.A.name=state.A.name+"(1)";
      state.B.name=state.B.name+"(2)";
    }
    $("stepForm").hidden=true;
    setLoading(true);
    $("stepLoading").scrollIntoView({behavior:"smooth",block:"start"});
    aiVerdict(state.A,state.B).then(function(v){
      if(v&&v.mode==="safety"){ showSafety(); return; }
      renderResult(v||ruleVerdict(state.A,state.B));
    }).catch(function(){
      /* 렌더 중 예외가 나도 스피너가 영원히 도는 화면은 만들지 않는다. */
      renderResult(ruleVerdict(state.A,state.B));
    });
  }
})();
