/* =========================================================
   낚시 물때 가이드 (fishing-tide)
   - data/fishing-spots.json(해양수산부 갯바위낚시포인트 가공본)을 fetch
   - 지역 → 목표 어종 2문항으로 좁혀서 실제 포인트 추천.
     기법은 묻지 않고 고른 목표에서 정해 알려준다(아래 TARGETS 주석 참조)
   - 물때번호(사리/조금)는 korean-lunar-calendar(음력 변환, KASI 표준)로
     그 자리에서 계산 — 서버 불필요, 항상 정확
   - 만조/간조 "시각"은 Worker(/tide) 경유 국립해양조사원 조석예보.
     포인트마다 가장 가까운 조위관측소 코드가 데이터에 들어있다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("ft-opts"))return;

  // webtool-proxy Worker (/transcript, /seo-keywords, /couple-verdict와 공용)
  var API_BASE="https://bold-dream-f416.gth3941.workers.dev";

  var REGION_EMOJI={인천:"🌊",경기:"🌊",충남:"⛵",전북:"🌾",전남:"🏝️",부산:"🌉",울산:"🏭",경남:"⛴️",경북:"⛰️",강원:"🏔️",제주:"🌴"};
  /* 원본 데이터의 기법명을 초보가 알아듣는 말로. 값이 없으면 카드에 안 띄운다.
     - 릴찌/부력/잠수/목줄 → 전부 찌를 쓰는 계열이라 "찌낚시"로 묶는다
     - 장대/민장대 → 입문 가이드의 정식 용어는 "맥낚시"
     - 훌치기/홀치기 → 지역·수면에 따라 금지되는 방식이라 초보에게 노출하지 않는다
     - 카드/처박기/외줄 → 입문 대상이 아니고 데이터도 20곳 미만 */
  var TECH_LABEL={
    "원투":"원투", "루어":"루어", "에깅":"에깅", "지깅":"지깅",
    "릴찌":"찌낚시", "부력":"찌낚시", "잠수":"찌낚시", "목줄":"찌낚시",
    "장대":"맥낚시", "민장대":"맥낚시"
  };
  /* 이 데이터는 전부 '갯바위'인데 타깃은 초보다. 입문 가이드들은 초보에게
     방파제를 먼저 권하고 갯바위는 경험자 동행을 조건으로 단다.
     그 간극을 하단 팁 한 줄로 흘리지 말고 결과 맨 위에서 먼저 말한다. */
  var SAFETY_HTML='<div class="ft-safety">'
    +'<b>⚠️ 여기 나오는 곳은 모두 갯바위예요.</b> 파도·너울 위험이 있어서 '
    +'<b>처음이라면 경험자와 함께</b> 가세요. 구명조끼와 미끄럼 방지(펠트창) 신발은 꼭 챙기시고요. '
    +'혼자 첫 출조라면 발판이 안정적인 <b>방파제</b>부터 권합니다. 가시기 전 물때와 기상 특보를 꼭 확인하세요.'
    +'</div>';

  var QUESTIONS=[
    {id:"region", t:"어느 바다로 가세요?"},
    {id:"target", t:"오늘 뭘 노려볼까요?"}
  ];

  /* 지역 버튼을 바다별 지리순으로 — 포인트 수 내림차순은 사용자 눈엔 무작위로 보인다. */
  var REGION_GROUPS=[
    {sea:"서해", list:["인천","경기","충남","전북"]},
    {sea:"남해", list:["전남","경남","부산","제주"]},
    {sea:"동해", list:["울산","경북","강원"]}
  ];

  /* 목표(어종 묶음). 기법을 묻는 대신 목표를 묻고 기법은 결과로 알려준다.
     기법 축은 필터로 작동하지 않았다 — 1,076곳 중 922곳이 릴찌·원투·장대·루어를
     전부 달고 있어서 뭘 골라도 950곳이 남았고, 기법별 어종 상위권도 동일했다.
     반면 어종은 실제로 갈린다. 부력·잠수·목줄·훌치기는 기법이 아니라
     특정 어종 포인트의 별명이라 여기에 흡수된다. */
  var TARGETS=[
    {id:"any", ic:"🤷", label:"아직 모르겠어요", sub:"처음이면 여기", tech:"원투", beginner:true},
    {id:"bottom", ic:"🐟", label:"바닥에 있는 고기", sub:"우럭·볼락·붕장어", tech:"원투",
     species:["우럭","노래미","넙치","붕장어","도다리","볼락","망둑어","망둥어","짱뚱어","쏨뱅이","열기","양태","보구치","쥐치","망상어","부세","장대","간재미","백조기","다금바리"]},
    {id:"bream", ic:"🎣", label:"돔 종류", sub:"감성돔·참돔·돌돔", tech:"찌낚시",
     species:["감성돔","참돔","돌돔","벵에돔","독가시치","자리돔","벤자리","뱅어돔"]},
    {id:"fast", ic:"🐠", label:"빠르게 헤엄치는 고기", sub:"농어·삼치·전갱이", tech:"루어",
     species:["농어","삼치","부시리","방어","고등어","전갱이","숭어","학공치","민어","전어","망농어","농어/  삼치"]},
    {id:"ceph", ic:"🦑", label:"오징어·문어", sub:"무늬오징어·주꾸미", tech:"에깅",
     species:["무늬오징어","갑오징어","주꾸미","문어","한치"]}
  ];
  var TARGET_BY_ID={};
  TARGETS.forEach(function(t){TARGET_BY_ID[t.id]=t});
  /* 버튼을 눌렀는데 3장도 안 나오면 안 고르느니만 못하다. 이 미만이면 버튼을 숨긴다. */
  var MIN_SPOTS_FOR_BUTTON=5;

  function hasTarget(s,t){
    if(!t||!t.species)return true;
    var sp=s.species||[];
    for(var i=0;i<sp.length;i++){ if(t.species.indexOf(sp[i])!==-1)return true; }
    return false;
  }
  /* "아직 모르겠어요"용 — 얕고(6m 이하) 조위관측소가 가까운(20km 이내) 곳을 앞에 둔다.
     초보에게는 발판·수심이 어종보다 중요하고, 관측소가 가까울수록 물때 시각도 정확하다. */
  function beginnerFriendly(s){
    var m=String(s.depth||"").match(/[\d.]+/g);
    var deep=m?Math.max.apply(null,m.map(Number)):null;
    return (deep===null||deep<=6) && (s.stationKm==null||s.stationKm<=20);
  }

  var DATA=[], REGION_LIST=[], answers={}, qIdx=0, ranked=[], shownFrom=0, fallbackLevel=0;

  fetch("../data/fishing-spots.json").then(function(r){return r.json()}).then(function(rows){
    DATA=rows||[];
    if($("ft-total"))$("ft-total").textContent=DATA.length.toLocaleString();

    // 데이터에 실제로 있는 지역인지 확인하는 용도. 화면 순서는 REGION_GROUPS가 정한다.
    var regionCount={};
    DATA.forEach(function(s){ regionCount[s.region]=(regionCount[s.region]||0)+1; });
    REGION_LIST=Object.keys(regionCount).sort(function(a,b){return regionCount[b]-regionCount[a];});


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
  function regionCount(r){
    var n=0;
    for(var i=0;i<DATA.length;i++){ if(DATA[i].region===r)n++; }
    return n;
  }
  /* 이 지역에서 목표별로 몇 곳이 나오는지. 버튼을 보여줄지 판단하는 근거. */
  function targetCount(region,t){
    var n=0;
    for(var i=0;i<DATA.length;i++){
      if(DATA[i].region===region && hasTarget(DATA[i],t))n++;
    }
    return n;
  }
  function availableTargets(region){
    return TARGETS.filter(function(t){
      return !t.species || targetCount(region,t)>=MIN_SPOTS_FOR_BUTTON;
    });
  }
  function optsForCurrentQuestion(){
    var q=QUESTIONS[qIdx];
    if(q.id==="region"){
      var opts=[];
      REGION_GROUPS.forEach(function(g){
        g.list.forEach(function(r){
          if(REGION_LIST.indexOf(r)===-1)return;      // 데이터에 없는 지역은 안 띄운다
          opts.push([r, REGION_EMOJI[r]||"📍", r, g.sea+" · "+regionCount(r)+"곳"]);
        });
      });
      // REGION_GROUPS에 안 적힌 지역이 생기면 뒤에 붙여 빠지지 않게 한다
      REGION_LIST.forEach(function(r){
        if(!opts.some(function(o){return o[0]===r})) opts.push([r, REGION_EMOJI[r]||"📍", r, regionCount(r)+"곳"]);
      });
      return opts;
    }
    // target: 이 지역에서 실제로 결과가 나오는 목표만
    return availableTargets(answers.region).map(function(t){
      return [t.id, t.ic, t.label, t.beginner?"처음이면 여기":t.sub];
    });
  }
  function renderQuestion(){
    if(qIdx>=QUESTIONS.length){ finish(); return; }
    var q=QUESTIONS[qIdx];
    /* 어종 데이터가 아예 없는 지역(강원·울산 등)은 목표를 물어봐야 답이 안 나온다.
       물어보고 무시하느니 질문 자체를 건너뛰고 지역 추천으로 간다. */
    if(q.id==="target" && availableTargets(answers.region).length<=1){
      answers.target="any";
      qIdx++;
      renderQuestion();
      return;
    }
    renderProgress();
    $("ft-q-title").textContent=(qIdx+1)+". "+q.t;
    var box=$("ft-opts"); box.innerHTML="";
    optsForCurrentQuestion().forEach(function(o){
      var b=document.createElement("button");
      b.type="button"; b.className="ft-opt";
      b.innerHTML='<span class="ic">'+o[1]+'</span><span class="lb">'+escapeHtml(o[2])+'</span>'
        +(o[3]?'<span class="sub">'+escapeHtml(o[3])+'</span>':'');
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
  /* 버튼을 5곳 미만이면 아예 숨기므로, 고른 조합이 0건이 되는 경우가 구조적으로 없다.
     그래도 데이터가 바뀔 수 있으니 지역 전체 폴백은 남겨둔다. */
  function computeRanked(){
    var t=TARGET_BY_ID[answers.target]||TARGET_BY_ID.any;
    var region=DATA.filter(function(s){return s.region===answers.region});

    if(!t.species){
      /* "아직 모르겠어요" — 초보가 가기 좋은 곳(얕고 관측소 가까움)을 앞으로. */
      fallbackLevel=0;
      var easy=[], rest=[];
      region.forEach(function(s){ (beginnerFriendly(s)?easy:rest).push(s); });
      return easy.concat(rest);
    }
    var pool=region.filter(function(s){return hasTarget(s,t)});
    if(pool.length){ fallbackLevel=0; return pool; }
    fallbackLevel=2;
    return region;
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
  /* depth 원본값은 출처가 섞여 있어 1,076건 중 748건은 이미 "0.4m~0.6m"처럼
     끝에 단위 m이 붙어 있고, 328건은 "3~5"처럼 붙여야 한다. 데이터는 그대로 두고
     렌더 시점에 "끝에 단위가 있는지"만 보고 붙여 "0.6mm" 중복 표기를 막는다.
     끝 기준으로 판단해야 "8m~10"처럼 앞쪽에만 단위가 붙은 값도
     "8m~10m"으로 정상 표기된다. 대문자 M·꼬리 공백·"m 내외" 같은 변형도 흡수. */
  function depthText(v){
    var t=(v==null?"":String(v)).replace(/^\s+|\s+$/g,"");
    if(!t)return "";
    // 마지막 숫자 뒤에 오는 꼬리 문자열에 m이 있으면 이미 단위가 붙은 값
    var tail=t.replace(/^[\s\S]*[0-9]/,"");
    return /m/i.test(tail) ? t : t+"m";
  }

  function tideHtml(){
    var tide=tideNumberOf(new Date());
    if(!tide)return "";
    // label이 이미 "5물" 형태면 번호를 또 붙이면 "5물 (5물)"이 된다.
    // 숫자가 안 드러나는 "사리"/"조금"일 때만 괄호로 물때 번호를 덧붙인다.
    var txt="오늘 "+tide.label;
    if(!/^[0-9]+물$/.test(tide.label))txt+=" ("+tide.n+"물)";
    return '<span class="ft-tag tide">'+escapeHtml(txt)+'</span>';
  }
  /* ---------- 만조·간조 시각 (국립해양조사원 조석예보) ----------
     포인트마다 가장 가까운 조위관측소(station)가 데이터에 박혀 있다.
     카드를 먼저 그려놓고 관측소별로 한 번씩만 조회해 나중에 채워 넣는다
     — 같은 관측소를 쓰는 포인트가 여러 개여도 호출은 1번이다.
     실패하면 그 자리만 조용히 비운다. 추천 자체는 서버 없이도 동작해야 한다. */
  var tideTimeCache={};   // station -> Promise<extremes[] | null>
  function todayYmd(){
    var d=new Date(), p=function(n){return (n<10?"0":"")+n};
    return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate());
  }
  function fetchTideTimes(station){
    if(!station)return Promise.resolve(null);
    if(!tideTimeCache[station]){
      tideTimeCache[station]=fetch(API_BASE+"/tide?station="+encodeURIComponent(station)+"&date="+todayYmd())
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(d){ return (d&&d.extremes&&d.extremes.length)?d.extremes:null; })
        .catch(function(){ return null; });
    }
    return tideTimeCache[station];
  }
  /* 카드가 DOM에 붙은 뒤 호출. 자리표시자를 실제 시각으로 바꾼다. */
  function fillTideTimes(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-tide-station]"),function(el){
      var st=el.getAttribute("data-tide-station");
      fetchTideTimes(st).then(function(ex){
        if(!ex){ el.remove(); return; }   // 못 가져오면 빈 자리로 두는 게 낫다
        var km=el.getAttribute("data-tide-km");
        var nm=el.getAttribute("data-tide-name");
        el.className="ft-tag time";
        el.textContent="🌊 "+ex.map(function(e){return e.type+" "+e.time}).join(" · ");
        el.title=nm+" 관측소 기준"+(km?" (약 "+km+"km 떨어짐)":"");
      });
    });
  }
  function timeHtml(s){
    if(!s.station)return "";
    return '<span class="ft-tag" data-tide-station="'+escapeHtml(s.station)+'"'
      +' data-tide-name="'+escapeHtml(s.stationName||"")+'"'
      +' data-tide-km="'+escapeHtml(String(s.stationKm||""))+'">🌊 만조·간조 불러오는 중…</span>';
  }
  function cardHtml(s){
    var speciesChips=(s.species||[]).slice(0,6).map(function(sp){return '<span class="ft-tag match">'+escapeHtml(sp)+'</span>'}).join("");
    var techChips=(s.techniques||[])
      .map(function(t){return TECH_LABEL[t]})
      .filter(function(t,i,arr){return t&&arr.indexOf(t)===i})
      .slice(0,4)
      .map(function(t){return '<span class="ft-tag">'+escapeHtml(t)+'</span>'}).join("");
    var depth=depthText(s.depth);
    return '<div class="ft-card">'
      +'<div class="ft-name-row"><span class="ft-name">'+escapeHtml(s.name)+'</span><button type="button" class="ft-copy" data-name="'+escapeHtml(s.name)+'">📋 이름 복사</button></div>'
      +'<div class="ft-meta">'+tideHtml()+timeHtml(s)+'<span class="ft-tag">'+escapeHtml(s.region)+'</span>'+(depth?'<span class="ft-tag">수심 '+escapeHtml(depth)+'</span>':'')+(s.bottom?'<span class="ft-tag">해저 '+escapeHtml(s.bottom)+'</span>':'')+'</div>'
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
      var tg=TARGET_BY_ID[answers.target]||TARGET_BY_ID.any;
      if(fallbackLevel!==0){
        $("ft-result-title").textContent="이 지역 포인트예요";
        $("ft-result-sub").textContent="조건에 딱 맞는 데가 없어서 지역 기준으로 넓혔어요.";
      }else if(!tg.species){
        $("ft-result-title").textContent="처음 가기 좋은 포인트예요";
        $("ft-result-sub").textContent="수심이 얕고 물때 시각이 정확한 곳을 앞에 뒀어요.";
      }else{
        $("ft-result-title").textContent=tg.label+" 노리기 좋은 포인트예요";
        $("ft-result-sub").textContent=tg.sub+" 같은 고기가 잡히는 실제 포인트예요.";
      }
      $("ft-results").innerHTML=SAFETY_HTML+picks.map(cardHtml).join("");
      $("ft-more").hidden = !(ranked.length>shownFrom+3);
      bindCopy();
      fillTideTimes();
    }

    $("stepResult").hidden=false;
    $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
    if($("adwrap"))$("adwrap").hidden=false;
  }

  /* 입문 가이드들이 공통으로 쓰는 바다낚시 4분류. 버튼으로 묻지 않고 여기서 알려준다. */
  var BASIC_METHODS=[
    ["원투","봉돌을 멀리 던져 바닥에 두고 기다리는 방식이에요. 던져놓고 입질을 기다리면 돼서 <b>처음 시작하기 가장 쉬워요.</b> 우럭·붕장어·광어처럼 바닥에 있는 고기를 노릴 때 씁니다."],
    ["찌낚시","찌를 띄워 중간 수심을 노려요. 찌가 쑥 들어가는 순간이 보여서 재미있고, <b>감성돔·참돔 같은 돔 종류</b>가 주 대상이에요. 원투보다 채비가 조금 복잡해요."],
    ["맥낚시","릴 없이 긴 대만 써서 발밑을 노려요. 구조가 가장 단순해서 <b>장비 부담이 제일 적어요.</b> 대신 던질 수 있는 거리가 짧아 포인트를 잘 골라야 해요."],
    ["루어","가짜 미끼를 던지고 감아 들여요. <b>살아있는 미끼를 만질 필요가 없어서</b> 처음 하는 분들이 좋아해요. 농어·삼치처럼 빠르게 움직이는 고기에 씁니다."],
    ["에깅","에기라는 가짜 미끼로 오징어류를 노리는 루어낚시예요. 장비가 간단하고 시즌에 맞춰 가면 초보도 잡을 수 있어요."]
  ];
  function methodName(n){ return /낚시$/.test(n) ? n : n+"낚시"; }
  function renderTips(){
    var box=$("ft-tips");
    var tg=TARGET_BY_ID[answers.target]||TARGET_BY_ID.any;
    var picked=BASIC_METHODS.filter(function(m){return m[0]===tg.tech})[0]||BASIC_METHODS[0];
    var others=BASIC_METHODS.filter(function(m){return m[0]!==picked[0]});

    box.innerHTML =
      '<h3 style="margin:0 0 8px">이렇게 준비하세요</h3>'
      /* "찌낚시"·"맥낚시"는 이미 낚시로 끝난다 — 그냥 붙이면 "찌낚시낚시"가 된다. */
      + '<div class="ft-tip-item"><b>'+escapeHtml(methodName(picked[0]))+'</b>로 하시면 돼요. '+picked[1]+'</div>'
      + '<details class="ft-more-tips"><summary>바다낚시 다른 방법도 볼래요</summary>'
      + others.map(function(m){
          return '<div class="ft-tip-item"><b>'+escapeHtml(methodName(m[0]))+'</b> — '+m[1]+'</div>';
        }).join("")
      + '</details>';
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
