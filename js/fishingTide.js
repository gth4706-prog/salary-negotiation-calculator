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
  /* 결과 위 안전 고지. 실측 근거(1,076곳):
       접근성 — 배 필요 648곳 / 차로 가능 277곳 / 불명 151곳
       발판   — 갯바위 534곳 / 평평 85곳 / 위험(여·직벽) 53곳 / 불명 404곳
     "모두 갯바위"라고 쓰면 안 되고("갯바위" 명시는 428곳뿐), 반대로 발판만
     보고 권해도 안 된다 — 발판이 평평해도 배로 3~4시간 가는 섬이 섞여 있다.
     그래서 전역 고지는 짧게, 판단 근거는 카드마다 개별 배지로 내린다. */
  var SAFETY_HTML='<div class="ft-safety">'
    +'<b>⚠️ 곳마다 성격이 많이 달라요.</b> 절반은 갯바위라 파도·너울 위험이 있고, '
    +'<b>60%는 배를 타야 하는 섬</b>이에요. 카드마다 <b>가는 방법·발판·수심</b>을 적어뒀으니 꼭 보고 고르세요. '
    +'처음이라면 <b>차로 갈 수 있고 발판이 평평한 곳</b>부터, 그리고 <b>경험자와 함께</b> 가세요. '
    +'구명조끼와 미끄럼 방지(펠트창) 신발은 어디를 가든 챙기시고요.'
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
  /* "아직 모르겠어요"용 초보 적합도 점수. 높을수록 앞에 둔다.
     ⚠️ 발판만 보면 안 된다 — 발판이 평평해도 배로 3~4시간 가는 섬(굴업도·대청도)이
     섞여 있어서, 접근성을 발판보다 무겁게 잡는다. 위험 신호는 뒤로 민다. */
  function beginnerScore(s){
    var sc=0;
    if(s.access==="drive")sc+=5;
    else if(s.access==="ferry")sc-=2;
    if(s.footing==="flat"||s.footing==="sand")sc+=3;
    else if(s.footing==="danger")sc-=6;
    var d=s.deepM;
    if(d!=null){
      if(d<=6)sc+=2;
      else if(d>=15)sc-=4;
    }
    if(s.stationKm!=null&&s.stationKm<=20)sc+=1;   // 물때 시각이 정확한 편
    return sc;
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

  /* ══ 지도 ══════════════════════════════════════════════════════════════
     지역을 고르면 그 지역 포인트를 전부 찍고, 선택을 좁힐 때마다 마커를 줄인다.
     마커를 누르면 그 자리의 상세 정보와 오늘 물때가 팝업으로 뜬다.

     Leaflet + OSM 타일 — API 키가 필요 없어 태현님이 등록할 게 없다.
     ⚠️ Leaflet이 안 뜨면(CDN 차단·구형 브라우저) 지도만 접고 카드 목록으로
     그대로 쓸 수 있어야 한다. 지도는 덤이지 필수 경로가 아니다. */
  var map=null, markerLayer=null, mapFailed=false;

  function mapReady(){ return typeof L!=="undefined" && !mapFailed; }

  function initMap(){
    if(map||!mapReady())return map;
    try{
      map=L.map("ft-map",{scrollWheelZoom:false, attributionControl:true});
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:18,
        attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      markerLayer=L.layerGroup().addTo(map);
    }catch(e){ mapFailed=true; map=null; }
    return map;
  }

  /* 마커 색 = 초보에게 어떤 곳인지. 범례와 짝을 이룬다. */
  function markerStyle(s){
    if(s.footing==="danger"||(s.deepM!=null&&s.deepM>=15))
      return {color:"#FF4B3E", label:"초보에겐 어려운 곳"};
    if(s.access==="drive"&&(s.footing==="flat"||s.footing==="sand"))
      return {color:"#2EC4B6", label:"처음 가기 좋은 곳"};
    if(s.access==="drive") return {color:"#FFC93C", label:"차로 갈 수 있는 곳"};
    return {color:"#9FB3C8", label:"배를 타야 하거나 확인 필요"};
  }
  var LEGEND=[
    ["#2EC4B6","처음 가기 좋아요"],
    ["#FFC93C","차로 갈 수 있어요"],
    ["#9FB3C8","배를 타야 하거나 확인 필요"],
    ["#FF4B3E","초보에겐 어려워요"]
  ];
  function renderLegend(){
    var el=$("ft-legend");
    if(!el)return;
    el.innerHTML=LEGEND.map(function(l){
      return '<span class="ft-lg"><i style="background:'+l[0]+'"></i>'+escapeHtml(l[1])+'</span>';
    }).join("");
  }

  /* 팝업 안에서 물때 시각을 채운다. 카드와 같은 캐시를 쓰므로 관측소당 1회. */
  function popupHtml(s){
    var tide=tideNumberOf(new Date());
    var head='<div class="ft-pop-name">'+escapeHtml(s.name)+'</div>'
      +'<div class="ft-pop-sub">'+escapeHtml(s.region+(s.sigungu?" "+s.sigungu:""))+'</div>';
    var chips="";
    if(tide)chips+='<span class="ft-pop-chip">오늘 '+escapeHtml(tide.label)+'</span>';
    (s.species||[]).slice(0,4).forEach(function(sp){
      chips+='<span class="ft-pop-chip">'+escapeHtml(sp)+'</span>';
    });
    return head
      +(chips?'<div class="ft-pop-chips">'+chips+'</div>':'')
      +guideHtml(s)
      +'<div class="ft-pop-time" data-pop-station="'+escapeHtml(s.station||"")+'">만조·간조 불러오는 중…</div>'
      +'<a class="ft-pop-map" href="'+mapLink(s)+'" target="_blank" rel="noopener">🗺️ 카카오맵으로 열기</a>';
  }

  function showMap(spots, title, sub){
    var sec=$("stepMap");
    if(!sec)return;
    if(!mapReady()){ sec.hidden=true; return; }
    sec.hidden=false;
    if($("ft-map-title"))$("ft-map-title").textContent=title||"포인트 위치";
    if($("ft-map-sub"))$("ft-map-sub").textContent=sub||"마커를 누르면 그 자리의 정보와 오늘 물때가 나와요.";
    renderLegend();
    if(!initMap()){ sec.hidden=true; return; }

    markerLayer.clearLayers();
    var pts=[];
    spots.forEach(function(s){
      if(!(isFinite(s.lat)&&isFinite(s.lon)))return;
      var st=markerStyle(s);
      var m=L.circleMarker([s.lat,s.lon],{
        radius:6, weight:2, color:st.color, fillColor:st.color, fillOpacity:.65
      });
      m.bindPopup(function(){ return popupHtml(s); },{maxWidth:300, className:"ft-pop"});
      m.on("popupopen",function(e){
        var node=e.popup.getElement();
        var slot=node&&node.querySelector("[data-pop-station]");
        if(!slot)return;
        var station=slot.getAttribute("data-pop-station");
        if(!station){ slot.remove(); return; }
        fetchTideTimes(station).then(function(ex){
          if(!slot.parentNode)return;
          if(!ex){ slot.remove(); return; }
          slot.textContent="🌊 "+ex.map(function(x){return x.type+" "+x.time}).join(" · ");
          slot.className="ft-pop-time on";
        });
      });
      m.addTo(markerLayer);
      pts.push([s.lat,s.lon]);
    });
    if(pts.length){
      try{ map.fitBounds(pts,{padding:[24,24], maxZoom:12}); }catch(e){}
      /* 섹션이 hidden이었다가 열리면 Leaflet이 크기를 잘못 잡는다. */
      setTimeout(function(){ try{ map.invalidateSize(); }catch(e){} },60);
    }
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
        if(q.id==="region"){
          var pool=DATA.filter(function(x){return x.region===o[0]});
          showMap(pool, o[0]+" 낚시 포인트 "+pool.length+"곳",
            "고르실수록 이 지도가 좁혀져요. 마커를 누르면 상세 정보가 나와요.");
        }
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
      /* "아직 모르겠어요" — 초보 적합도 순으로 정렬한다. 동점이면 원래 순서 유지. */
      fallbackLevel=0;
      return region.map(function(s,i){return {s:s,i:i,sc:beginnerScore(s)}})
        .sort(function(a,b){ return b.sc-a.sc || a.i-b.i; })
        .map(function(x){return x.s});
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


  /* ── 초보에게 "여기가 어떤 곳인지" 설명하는 조각들 ──────────────────────
     발판·주차·화장실 같은 정보는 국내 어느 공개 데이터에도 없다. 지어내지 않고,
     이름·좌표·수심에서 확실히 읽히는 것만 말한다. 모르면 모른다고 쓴다. */

  var ACCESS_INFO={
    drive:  {ic:"🚗", txt:"차로 갈 수 있어요", cls:"good"},
    ferry:  {ic:"⛴️", txt:"섬이라 배를 타야 해요", cls:"warn"},
    unknown:{ic:"🗺️", txt:"가는 방법은 지도로 확인하세요", cls:""}
  };
  var FOOTING_INFO={
    flat:   {ic:"🧱", txt:"발판이 평평해요 (방파제·제방 계열)", cls:"good"},
    sand:   {ic:"🏖️", txt:"모래 해변이라 발이 편해요", cls:"good"},
    rock:   {ic:"🪨", txt:"울퉁불퉁한 갯바위 — 펠트창 신발 필수", cls:"warn"},
    danger: {ic:"⛔", txt:"물에 잠기는 바위나 직벽 — 초보에겐 권하지 않아요", cls:"bad"},
    unknown:{ic:"❓", txt:"발판은 이름만으론 알 수 없어요", cls:""}
  };
  /* 수심을 "2.1~5.0m"로 던지지 말고 발밑이 어떤지로 번역한다. */
  function depthAdvice(s){
    var d=s.deepM;
    if(d==null)return null;
    if(d>=15)return {ic:"🌊", txt:"발밑이 "+Math.round(d)+"m — 빠지면 혼자 못 올라와요", cls:"bad"};
    if(d>=8) return {ic:"🌊", txt:"발밑이 "+Math.round(d)+"m로 깊은 편이에요", cls:"warn"};
    if(d>=3) return {ic:"🌊", txt:"발밑 수심 "+Math.round(d)+"m 정도예요", cls:""};
    return {ic:"🌊", txt:"수심이 얕아요 ("+d+"m 안팎)", cls:"good"};
  }

  /* ── 오늘 이 포인트가 맞는 날인가 ────────────────────────────────────────
     포인트마다 "언제 좋은지"(조수물때내용)가 데이터에 있는데 지금까지
     "물때 메모: 초들물~중날물"이라고 날것으로 뿌리고 있었다. 초보는 못 읽는다.
     이미 계산하는 오늘 물때번호·만조간조 시각과 대조해 판정으로 바꾼다.
     ⚠️ 동해는 조차가 10~20cm라 물때 판정이 사실상 무의미하다 → 하지 않는다. */
  var EAST_COAST=["강원","경북","울산","부산"];
  var PHASE_KO={early_flood:"물이 차오르기 시작할 때", mid_flood:"물이 한창 차오를 때",
    early_ebb:"물이 빠지기 시작할 때", mid_ebb:"물이 한창 빠질 때",
    late_ebb:"물이 다 빠질 무렵", high:"물이 가장 많이 찼을 때", low:"물이 가장 많이 빠졌을 때"};

  function tideVerdict(s, tide){
    if(EAST_COAST.indexOf(s.region)!==-1)
      return {cls:"", txt:"동해는 물이 드나드는 폭이 작아서 물때 영향이 적어요"};
    if(s.tideAny) return {cls:"good", txt:"물때를 크게 안 타는 곳이에요"};
    if(!tide||!s.tideNums) return null;
    var n=tide.n, list=s.tideNums;
    if(list.indexOf(n)!==-1) return {cls:"good", txt:"오늘 물때가 잘 맞아요"};
    var near=list.some(function(x){ var d=Math.abs(x-n); return Math.min(d,15-d)<=1; });
    if(near) return {cls:"", txt:"오늘도 나쁘진 않아요"};
    return {cls:"warn", txt:"오늘은 물때가 잘 안 맞아요"};
  }
  /* 만조·간조 시각에서 "몇 시에 가면 되는지"를 뽑는다. */
  function bestHours(s, extremes){
    if(!s.tidePhase||!extremes||!extremes.length)return null;
    if(EAST_COAST.indexOf(s.region)!==-1)return null;
    var high=extremes.filter(function(e){return e.type==="고조"});
    var low=extremes.filter(function(e){return e.type==="저조"});
    function plus(t,h){
      var p=t.split(":"); var m=(+p[0])*60+(+p[1])+h*60;
      m=((m%1440)+1440)%1440;
      return (m/60|0<10?"0":"")+String(m/60|0).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
    }
    var out=[];
    s.tidePhase.forEach(function(ph){
      if(ph==="early_flood"&&low[0]) out.push(low[0].time+"~"+plus(low[0].time,2));
      if(ph==="mid_flood"&&low[0])   out.push(plus(low[0].time,2)+"~"+plus(low[0].time,4));
      if(ph==="early_ebb"&&high[0])  out.push(high[0].time+"~"+plus(high[0].time,2));
      if(ph==="mid_ebb"&&high[0])    out.push(plus(high[0].time,2)+"~"+plus(high[0].time,4));
      if(ph==="high"&&high[0])       out.push(plus(high[0].time,-1)+"~"+plus(high[0].time,1));
      if(ph==="low"&&low[0])         out.push(plus(low[0].time,-1)+"~"+plus(low[0].time,1));
    });
    return out.length?out.slice(0,2):null;
  }
  function phaseWords(s){
    if(!s.tidePhase)return "";
    return s.tidePhase.map(function(p){return PHASE_KO[p]}).filter(Boolean).slice(0,2).join(", ");
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
        fillBestHours(el, st, ex);
      });
    });
  }

  /* 같은 카드 안의 "몇 시에 가면 되는지" 자리를 실제 시각으로 채운다. */
  function fillBestHours(timeEl, station, extremes){
    var card=timeEl.closest? timeEl.closest(".ft-card") : null;
    if(!card)return;
    var slot=card.querySelector('[data-best-station="'+station+'"]');
    if(!slot)return;
    var fake={region:"", tidePhase:slot.getAttribute("data-best-phase").split(",")};
    var hours=bestHours(fake, extremes);
    if(!hours){ slot.remove(); return; }
    slot.className="ft-guide-line good";
    slot.innerHTML='<span class="gi">🕐</span><span>'+escapeHtml("오늘은 "+hours.join(", ")+"에 가면 좋아요")+'</span>';
    slot.hidden=false;
  }

  function timeHtml(s){
    if(!s.station)return "";
    return '<span class="ft-tag" data-tide-station="'+escapeHtml(s.station)+'"'
      +' data-tide-name="'+escapeHtml(s.stationName||"")+'"'
      +' data-tide-km="'+escapeHtml(String(s.stationKm||""))+'">🌊 만조·간조 불러오는 중…</span>';
  }

  /* 카드 하단 — 초보에게 "여기가 어떤 곳인지"를 문장으로 설명한다.
     확실한 것만 말하고, 모르는 건 모른다고 쓴다. */
  function line(o){
    if(!o)return "";
    return '<div class="ft-guide-line '+(o.cls||"")+'"><span class="gi">'+o.ic+'</span>'
      +'<span>'+escapeHtml(o.txt)+'</span></div>';
  }
  function guideHtml(s){
    var out="";
    out+=line(ACCESS_INFO[s.access]||ACCESS_INFO.unknown);
    out+=line(FOOTING_INFO[s.footing]||FOOTING_INFO.unknown);
    out+=line(depthAdvice(s));

    var v=tideVerdict(s, tideNumberOf(new Date()));
    if(v)out+=line({ic:"🌗", txt:v.txt, cls:v.cls});
    var ph=phaseWords(s);
    if(ph)out+=line({ic:"⏰", txt:"이 포인트는 "+ph+" 입질이 좋아요", cls:""});
    /* 만조·간조 시각을 받아온 뒤 "몇 시에 가면 되는지"로 채운다(fillTideTimes에서). */
    if(s.tidePhase&&s.station&&EAST_COAST.indexOf(s.region)===-1)
      out+='<div class="ft-guide-line" data-best-station="'+escapeHtml(s.station)+'"'
        +' data-best-phase="'+escapeHtml(s.tidePhase.join(","))+'" hidden></div>';
    if(s.bottom)out+=line({ic:"🐚", txt:"물속 바닥은 "+s.bottom+" — 여기 사는 고기가 모여요", cls:""});
    return '<div class="ft-guide">'+out+'</div>';
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
      +'<div class="ft-meta">'+tideHtml()+timeHtml(s)+'<span class="ft-tag">'+escapeHtml(s.region+(s.sigungu?" "+s.sigungu:""))+'</span>'+(depth?'<span class="ft-tag">수심 '+escapeHtml(depth)+'</span>':'')+'</div>'
      +'<div class="ft-meta" style="margin-top:6px">'+speciesChips+techChips+'</div>'
      +guideHtml(s)
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
      showMap(ranked, "추천 포인트 "+ranked.length+"곳",
        "아래 카드는 이 중 앞에서 3곳이에요. 지도에서 아무 마커나 눌러도 상세 정보가 나와요.");
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
    if($("stepMap"))$("stepMap").hidden=true;
    $("stepQuiz").hidden=false;
    renderQuestion();
    $("stepQuiz").scrollIntoView({behavior:"smooth",block:"start"});
  });
})();
