/* =========================================================
   낚시 물때 가이드 (fishing-tide)
   - data/fishing-spots.json(해양수산부 갯바위낚시포인트 가공본)을 fetch
   - 지역 → 낚시기법 → 대상어종 순서로 좁혀서 실제 포인트 추천
   - 물때번호(사리/조금)는 korean-lunar-calendar(음력 변환, KASI 표준)로
     그 자리에서 계산 — 서버 불필요, 항상 정확
   - 정확한 만조/간조 "시각"만 서버(Worker) 필요 — 배포 전까지 안내 문구로 대체
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("ft-opts"))return;

  // 배포 후 실제 Worker URL로 교체 필요 (webtool-proxy — /transcript, /seo-keywords와 공용)
  var API_BASE="https://webtool-proxy.YOUR-SUBDOMAIN.workers.dev";
  var API_READY=API_BASE.indexOf("YOUR-SUBDOMAIN")===-1;

  var REGION_EMOJI={인천:"🌊",경기:"🌊",충남:"⛵",전북:"🌾",전남:"🏝️",부산:"🌉",울산:"🏭",경남:"⛴️",경북:"⛰️",강원:"🏔️",제주:"🌴"};
  var TECH_EMOJI={릴찌:"🎣",원투:"🪝",장대:"🎋",민장대:"🎋",루어:"🐟",부력:"🛟",잠수:"🤿",목줄:"🪢",훌치기:"🪤",홀치기:"🪤",에깅:"🦑",지깅:"⚓"};
  var TECH_TIPS={
    릴찌:"릴대+찌+미끼로 하는 기본 채비예요. 다루기 쉬운 편이라 낚시가 처음이면 가장 먼저 배우기 좋아요.",
    원투:"봉돌을 멀리 던져 바닥 쪽을 노리는 방식이에요. 처음엔 짧게 던지는 연습부터 — 무리해서 세게 던지다 채비를 잃어버리는 경우가 많아요.",
    장대:"릴 없이 긴 대만 써요. 구조가 단순해서 배우기 제일 쉽지만, 던질 수 있는 거리가 짧아서 포인트 접근성이 중요해요.",
    민장대:"장대낚시와 같은 계열이에요. 릴 조작이 없어 초보자가 접근하기 좋아요.",
    루어:"가짜 미끼를 던지고 감아 들이는 방식이에요. 살아있는 미끼를 준비할 필요가 없어서 편하지만, 감는 속도·리듬에 약간의 연습이 필요해요.",
    부력:"부력찌를 띄워 표층~중층을 노려요. 채비가 릴찌보다 조금 복잡해서 기본기를 익힌 다음 시도하는 걸 추천해요.",
    잠수:"조류에 미끼를 자연스럽게 흘려보내는 방식이에요. 물살을 읽는 눈이 필요해서 초중급자 이상에게 맞아요.",
    목줄:"채비 끝단을 조합하는 세팅 방식이에요. 단독 기법이라기보단 다른 낚시와 함께 쓰는 경우가 많아요.",
    훌치기:"계절에 따라 무리 지어 오는 어종을 노리는 특수 기법이에요. 타이밍이 관건이라 현지 정보를 같이 확인하는 게 좋아요.",
    홀치기:"훌치기와 같은 기법이에요. 타이밍이 중요해서 현지 정보를 같이 확인하세요.",
    에깅:"에기(가짜 미끼)로 오징어류를 노리는 루어낚시의 한 종류예요. 장비가 간단해서 초보자도 접근하기 좋아요.",
    지깅:"금속 지그를 빠르게 감아올리는 방식이에요. 체력 소모가 커서 상급자에게 더 맞는 기법이에요."
  };
  var SAFETY_TIP="구명조끼는 항상 착용하고, 갯바위는 파도·너울에 따라 위험할 수 있으니 물때·기상 특보를 미리 확인하세요. 처음이라면 혼자보다는 동행과 함께 가는 걸 추천해요.";

  var QUESTIONS=[
    {id:"region", t:"어느 지역으로 가고 싶으세요?"},
    {id:"technique", t:"어떤 낚시기법으로 하실 거예요?"},
    {id:"species", t:"어떤 물고기를 노리고 싶으세요?"}
  ];

  var DATA=[], REGION_LIST=[], TECH_LIST=[], answers={}, qIdx=0, ranked=[], shownFrom=0, fallbackLevel=0;

  fetch("../data/fishing-spots.json").then(function(r){return r.json()}).then(function(rows){
    DATA=rows||[];
    if($("ft-total"))$("ft-total").textContent=DATA.length.toLocaleString();

    // 지역 목록: 실제 데이터에 존재하는 지역만, 건수 많은 순
    var regionCount={};
    DATA.forEach(function(s){ regionCount[s.region]=(regionCount[s.region]||0)+1; });
    REGION_LIST=Object.keys(regionCount).sort(function(a,b){return regionCount[b]-regionCount[a];});

    // 기법 목록: 15건 미만인 희귀 기법은 선택지에서 제외(거의 없는데 옵션만 차지)
    var techCount={};
    DATA.forEach(function(s){ (s.techniques||[]).forEach(function(t){ techCount[t]=(techCount[t]||0)+1; }); });
    TECH_LIST=Object.keys(techCount).filter(function(t){return techCount[t]>=15;}).sort(function(a,b){return techCount[b]-techCount[a];});

    renderQuestion();
  }).catch(function(){
    $("ft-opts").innerHTML='<div class="helper">낚시 포인트 데이터를 불러오지 못했어요. 새로고침해 주세요.</div>';
  });

  /* ---------- 물때번호 계산 (음력 기반, 남해안 관습 공식) ---------- */
  function tideNumberOf(date){
    if(typeof KoreanLunarCalendar==="undefined")return null;
    var cal=new KoreanLunarCalendar();
    var ok=cal.setSolarDate(date.getFullYear(), date.getMonth()+1, date.getDate());
    if(!ok)return null;
    var lunar=cal.getLunarCalendar();
    var d=lunar.day;
    var eff=d>15 ? d-15 : d;
    var n=((eff-1+7)%15)+1;
    var label=(d===15||d===30) ? "사리" : (d===8||d===23) ? "조금" : (n+"물");
    return {lunarDay:d, n:n, label:label};
  }

  /* ---------- 질문 렌더 ---------- */
  function renderProgress(){
    var box=$("ft-progress"); box.innerHTML="";
    for(var i=0;i<QUESTIONS.length;i++){
      var s=document.createElement("span");
      if(i<qIdx)s.className="done";
      box.appendChild(s);
    }
  }
  function optsForCurrentQuestion(){
    var q=QUESTIONS[qIdx];
    if(q.id==="region"){
      return REGION_LIST.map(function(r){ return [r, REGION_EMOJI[r]||"📍", r]; });
    }
    if(q.id==="technique"){
      var opts=TECH_LIST.map(function(t){ return [t, TECH_EMOJI[t]||"🎣", t]; });
      opts.push(["any","🤷","상관없어요"]);
      return opts;
    }
    // species: 앞서 고른 지역+기법에 실제로 있는 어종만
    var pool=DATA.filter(function(s){
      if(s.region!==answers.region)return false;
      if(answers.technique!=="any" && (s.techniques||[]).indexOf(answers.technique)===-1)return false;
      return true;
    });
    var speciesCount={};
    pool.forEach(function(s){ (s.species||[]).forEach(function(sp){ speciesCount[sp]=(speciesCount[sp]||0)+1; }); });
    var list=Object.keys(speciesCount).sort(function(a,b){return speciesCount[b]-speciesCount[a];}).slice(0,12);
    var opts=list.map(function(sp){ return [sp, "🐟", sp]; });
    opts.push(["any","🤷","상관없어요"]);
    return opts;
  }
  function renderQuestion(){
    if(qIdx>=QUESTIONS.length){ finish(); return; }
    renderProgress();
    var q=QUESTIONS[qIdx];
    $("ft-q-title").textContent=(qIdx+1)+". "+q.t;
    var box=$("ft-opts"); box.innerHTML="";
    optsForCurrentQuestion().forEach(function(o){
      var b=document.createElement("button");
      b.type="button"; b.className="ft-opt";
      b.innerHTML='<span class="ic">'+o[1]+'</span><span class="lb">'+o[2]+'</span>';
      b.addEventListener("click",function(){
        answers[q.id]=o[0];
        qIdx++;
        renderQuestion();
      });
      box.appendChild(b);
    });
    $("ft-back").hidden=qIdx===0;
  }
  $("ft-back").addEventListener("click",function(){
    if(qIdx>0){ qIdx--; renderQuestion(); }
  });

  /* ---------- 필터링(조건 완화 폴백 포함) ---------- */
  function matchesAll(s){
    if(s.region!==answers.region)return false;
    if(answers.technique!=="any" && (s.techniques||[]).indexOf(answers.technique)===-1)return false;
    if(answers.species!=="any" && (s.species||[]).indexOf(answers.species)===-1)return false;
    return true;
  }
  function matchesTechniqueOnly(s){
    if(s.region!==answers.region)return false;
    if(answers.technique!=="any" && (s.techniques||[]).indexOf(answers.technique)===-1)return false;
    return true;
  }
  function matchesRegionOnly(s){
    return s.region===answers.region;
  }
  function computeRanked(){
    var pool=DATA.filter(matchesAll);
    if(pool.length){ fallbackLevel=0; return pool; }
    pool=DATA.filter(matchesTechniqueOnly);
    if(pool.length){ fallbackLevel=1; return pool; }
    pool=DATA.filter(matchesRegionOnly);
    fallbackLevel=2;
    return pool;
  }

  function finish(){
    renderProgress();
    $("stepQuiz").hidden=true;
    runScan(function(){
      ranked=computeRanked();
      shownFrom=0;
      showResult();
      renderTips();
    });
  }
  function runScan(cb){
    var overlay=$("ft-loading");
    overlay.hidden=false;
    overlay.scrollIntoView({behavior:"smooth",block:"start"});
    setTimeout(function(){ overlay.hidden=true; cb(); },900);
  }

  function escapeHtml(s){
    return (s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});
  }

  function bindCopy(){
    Array.prototype.forEach.call($("ft-results").querySelectorAll(".ft-copy"),function(btn){
      btn.addEventListener("click",function(){
        var name=btn.getAttribute("data-name");
        var done=function(){var old=btn.textContent;btn.textContent="✓ 복사됨";setTimeout(function(){btn.textContent=old},1400);};
        if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(name).then(done,function(){prompt("복사하세요:",name)});
        else prompt("복사하세요:",name);
      });
    });
  }
  function mapLink(s){
    return "https://map.kakao.com/link/map/"+encodeURIComponent(s.name)+","+s.lat+","+s.lon;
  }
  function tideHtml(){
    var tide=tideNumberOf(new Date());
    if(!tide)return "";
    return '<span class="ft-tag tide">오늘 '+escapeHtml(tide.label)+' ('+tide.n+'물)</span>';
  }
  function timeHtml(){
    if(API_READY)return '<span class="ft-tag">만조·간조 시각 연동중</span>';
    return '<span class="ft-tag unknown">만조·간조 시각은 서버 배포 후 제공</span>';
  }
  function cardHtml(s){
    var speciesChips=(s.species||[]).slice(0,6).map(function(sp){return '<span class="ft-tag match">'+escapeHtml(sp)+'</span>'}).join("");
    var techChips=(s.techniques||[]).slice(0,6).map(function(t){return '<span class="ft-tag">'+escapeHtml(t)+'</span>'}).join("");
    return '<div class="ft-card">'
      +'<div class="ft-name-row"><span class="ft-name">'+escapeHtml(s.name)+'</span><button type="button" class="ft-copy" data-name="'+escapeHtml(s.name)+'">📋 이름 복사</button></div>'
      +'<div class="ft-meta">'+tideHtml()+timeHtml()+'<span class="ft-tag">'+escapeHtml(s.region)+'</span>'+(s.depth?'<span class="ft-tag">수심 '+escapeHtml(s.depth)+'m</span>':'')+(s.bottom?'<span class="ft-tag">해저 '+escapeHtml(s.bottom)+'</span>':'')+'</div>'
      +'<div class="ft-meta" style="margin-top:6px">'+speciesChips+techChips+'</div>'
      +(s.tideNote?'<div class="ft-desc">물때 메모: '+escapeHtml(s.tideNote)+'</div>':'')
      +'<div class="ft-actions"><a class="ft-maplink" href="'+mapLink(s)+'" target="_blank" rel="noopener">🗺️ 지도에서 위치 보기</a></div>'
      +'<div class="ft-src">출처: <a href="'+escapeHtml(s.sourceUrl)+'" target="_blank" rel="noopener">해양수산부 공공데이터</a></div>'
      +'</div>';
  }

  function showResult(){
    var picks=ranked.slice(shownFrom,shownFrom+3);

    if(!ranked.length){
      $("ft-result-title").textContent="이 지역 데이터가 아직 부족해요";
      $("ft-result-sub").textContent="다른 지역으로 다시 시도해보세요.";
      $("ft-results").innerHTML="";
      $("ft-more").hidden=true;
    }else{
      if(fallbackLevel===0){
        $("ft-result-title").textContent="조건에 맞는 포인트예요";
        $("ft-result-sub").textContent="지역·기법·어종 조건에 맞는 실제 포인트예요.";
      }else if(fallbackLevel===1){
        $("ft-result-title").textContent="어종 조건은 맞는 데가 없어서 기법 기준으로 넓혔어요";
        $("ft-result-sub").textContent="같은 지역·기법에서 다른 어종도 잡히는 포인트예요.";
      }else{
        $("ft-result-title").textContent="이 지역 인기 포인트예요";
        $("ft-result-sub").textContent="조건에 딱 맞는 데가 없어서 지역 기준으로 넓혔어요.";
      }
      $("ft-results").innerHTML=picks.map(cardHtml).join("");
      $("ft-more").hidden = !(ranked.length>shownFrom+3);
      bindCopy();
    }

    $("stepResult").hidden=false;
    $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
    if($("adwrap"))$("adwrap").hidden=false;
  }

  function renderTips(){
    var box=$("ft-tips");
    var techTip = answers.technique!=="any" ? (TECH_TIPS[answers.technique]||"") : "선택하신 기법이 딱히 없어도 위 포인트에서 실제로 쓰는 기법들을 참고해서 장비를 준비해보세요.";
    box.innerHTML = '<h3 style="margin:0 0 8px">낚시 기본 팁</h3>'
      + '<div class="ft-tip-item">'+escapeHtml(techTip)+'</div>'
      + '<div class="ft-tip-item">'+escapeHtml(SAFETY_TIP)+'</div>';
  }

  $("ft-more").addEventListener("click",function(){
    shownFrom+=3;
    showResult();
  });
  $("ft-restart").addEventListener("click",function(){
    answers={}; qIdx=0; ranked=[]; shownFrom=0; fallbackLevel=0;
    $("stepResult").hidden=true;
    $("stepQuiz").hidden=false;
    renderQuestion();
    $("stepQuiz").scrollIntoView({behavior:"smooth",block:"start"});
  });
})();
