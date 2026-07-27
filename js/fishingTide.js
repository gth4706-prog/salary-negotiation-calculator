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
  /* 예전 문구는 "갯바위·너울·펠트창"으로 겁만 주고 뭘 하라는 말이 없었다.
     초보가 실제로 사고 나는 상황(물이 차올라 서 있던 바위가 잠겨 고립)을
     이 도구는 만조 시각까지 계산해놓고 말하지 않고 있었다. */
  var SAFETY_HTML='<div class="ft-safety">'
    +'<b>⚠️ 처음이라면 이 3가지만 지키세요.</b>'
    +'<div class="ft-safe-l"><b>① 구명조끼는 무조건.</b> 낚시점에서 5~8만원, 대여는 1만원대예요. 방파제여도 입으세요.</div>'
    +'<div class="ft-safe-l"><b>② 물이 차오르는 시간을 꼭 보세요.</b> 서 있던 바위가 잠겨서 못 나오는 사고가 가장 많아요. '
    +'카드에 적힌 <b>"물 가장 많이 찰 때"</b> 시각 2시간 전에는 뭍으로 나오세요.</div>'
    +'<div class="ft-safe-l"><b>③ 가기 전날 밤 날씨 확인.</b> 풍랑주의보가 뜨면 가지 마세요. 사고가 나면 <b>해양경찰 122</b>.</div>'
    +'<div class="ft-safe-l">배를 타고 들어가는 섬은 처음엔 권하지 않아요. 아래는 <b>차로 갈 수 있는 곳부터</b> 보여드려요.</div>'
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

  /* 목표를 골랐든 안 골랐든 항상 초보 적합도 순으로 정렬한다.
     예전엔 "아직 모르겠어요"일 때만 정렬해서, 성실하게 어종을 고른 사람이
     오히려 배로만 가는 섬을 먼저 보게 됐다. 동점이면 원래 순서를 지킨다. */
  function sortForBeginner(list){
    return list.map(function(s,i){return {s:s,i:i,sc:beginnerScore(s)}})
      .sort(function(a,b){ return b.sc-a.sc || a.i-b.i; })
      .map(function(x){return x.s});
  }
  function driveCount(list){
    var n=0;
    for(var i=0;i<list.length;i++){ if(list[i].access==="drive")n++; }
    return n;
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
      return {color:"#FF4B3E"};
    if(s.access==="drive"&&(s.footing==="flat"||s.footing==="sand"))
      return {color:"#2EC4B6"};
    if(s.access==="drive") return {color:"#FFC93C"};
    if(s.access==="ferry") return {color:"#7A9BB8"};
    return {color:"#4A6480"};   // 정보 부족 — 배 필요와 섞으면 안 된다
  }
  /* "배를 타야 함"과 "정보가 부족함"은 완전히 다른 얘긴데 같은 회색이었다.
     전남 505곳 중 355곳(70%)이 그 애매한 회색이라 지도를 켜는 의미가 없었다. */
  var LEGEND=[
    ["#2EC4B6","처음 가기 좋아요"],
    ["#FFC93C","차로 갈 수 있어요"],
    ["#7A9BB8","배를 타야 해요"],
    ["#4A6480","정보가 부족해요"],
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
    if(tide)chips+='<span class="ft-pop-chip" title="1~15물은 물이 얼마나 세게 드나드는지예요. 숫자가 클수록 세게 드나들고 고기가 잘 뭅니다.">오늘 '+escapeHtml(tide.label)+'</span>';
    (s.species||[]).slice(0,4).forEach(function(sp){
      chips+='<span class="ft-pop-chip">'+escapeHtml(sp)+'</span>';
    });
    return head
      +(chips?'<div class="ft-pop-chips">'+chips+'</div>':'')
      +guideHtml(s)
      +'<div class="ft-pop-time" data-pop-station="'+escapeHtml(s.station||"")+'"'
        +' data-pop-phase="'+escapeHtml((s.tidePhase||[]).join(","))+'"'
        +' data-pop-region="'+escapeHtml(s.region)+'">물때 시각 불러오는 중…</div>'
      +'<a class="ft-pop-map" href="'+mapLink(s)+'" target="_blank" rel="noopener">🗺️ 카카오맵으로 열기</a>';
  }

  /* 지도를 지역 전체에 맞추면(fitBounds) 너무 멀어진다 — 전남은 좌표가 244km,
     경북 193km, 인천 164km에 걸쳐 있어서 점 수백 개가 좁쌀로 보인다.
     그래서 "가장 갈 만한 곳" 하나를 중심으로 확대해서 시작하고,
     전체를 보고 싶으면 버튼으로 넓히게 한다. */
  var mapAll=[], mapPicks=[];

  function fitAll(){
    if(!map||!mapAll.length)return;
    try{ map.fitBounds(mapAll.map(function(s){return [s.lat,s.lon]}),{padding:[24,24], maxZoom:12}); }catch(e){}
  }
  /* 추천 3곳이 전부 화면에 들어오게 맞춘다. 한 곳만 확대하면 나머지 두 곳이
     화면 밖으로 나가서 "①②③를 보세요"라고 써놓고 ①만 보이게 된다.
     3곳이 멀리 떨어져 있으면 자동으로 넓게, 가까우면 가깝게 잡힌다. */
  function fitPicks(){
    if(!map||!mapPicks.length)return;
    if(mapPicks.length===1){ try{ map.setView([mapPicks[0].lat,mapPicks[0].lon],13); }catch(e){} return; }
    try{ map.fitBounds(mapPicks.map(function(s){return [s.lat,s.lon]}),{padding:[45,45], maxZoom:13}); }catch(e){}
  }
  function bindMapButtons(){
    var a=$("ft-map-all"), b=$("ft-map-focus");
    if(a&&!a.__b){ a.__b=1; a.addEventListener("click",fitAll); }
    if(b&&!b.__b){ b.__b=1; b.addEventListener("click",fitPicks); }
  }

  function showMap(spots, title, sub, picks){
    var sec=$("stepMap");
    if(!sec)return;
    if(!mapReady()){ sec.hidden=true; return; }
    sec.hidden=false;
    if($("ft-map-title"))$("ft-map-title").textContent=title||"포인트 위치";
    if($("ft-map-sub"))$("ft-map-sub").textContent=sub||"마커를 누르면 그 자리의 정보와 오늘 물때가 나와요.";
    renderLegend();
    bindMapButtons();
    if(!initMap()){ sec.hidden=true; return; }

    markerLayer.clearLayers();
    mapAll=spots.filter(function(s){return isFinite(s.lat)&&isFinite(s.lon)});
    mapPicks=(picks||[]).filter(function(s){return isFinite(s.lat)&&isFinite(s.lon)});
    var pickIdx={};
    mapPicks.forEach(function(s,i){ pickIdx[s.lat+","+s.lon]=i+1; });
    var pts=[];
    spots.forEach(function(s){
      if(!(isFinite(s.lat)&&isFinite(s.lon)))return;
      var st=markerStyle(s);
      /* 번호는 카드에 실제로 나온 곳에만 붙인다. 지역만 고른 단계에서
         파일 순서대로 ①②③을 붙이면 아무 의미도 없는데 제일 눈에 띈다. */
      var top=pickIdx[s.lat+","+s.lon]||0;
      var m=top
        ? L.circleMarker([s.lat,s.lon],{radius:11, weight:3, color:"#fff", fillColor:st.color, fillOpacity:.95})
        : L.circleMarker([s.lat,s.lon],{radius:6, weight:2, color:st.color, fillColor:st.color, fillOpacity:.65});
      if(top)m.bindTooltip(String(top),{permanent:true, direction:"center", className:"ft-mk-num"});
      m.bindPopup(function(){ return popupHtml(s); },{maxWidth:300, className:"ft-pop"});
      m.on("popupopen",function(e){
        var node=e.popup.getElement();
        var slot=node&&node.querySelector("[data-pop-station]");
        if(!slot)return;
        var station=slot.getAttribute("data-pop-station");
        if(!station){ slot.remove(); return; }
        var phase=(slot.getAttribute("data-pop-phase")||"").split(",").filter(Boolean);
        var region=slot.getAttribute("data-pop-region")||"";
        fetchTideTimes(station).then(function(ex){
          if(!slot.parentNode)return;
          if(!ex){ slot.remove(); return; }
          var html="🌊 "+ex.map(function(x){return tideWord(x.type)+" "+x.time}).join(" · ");
          /* 카드에는 있는 "몇 시에 가면 좋아요"가 팝업엔 빠져 있었다.
             숫자 네 개만 던지고 뭘 하라는 말이 없으면 초보에겐 쓸모가 없다. */
          var hrs=bestHours({region:region, tidePhase:phase}, ex);
          if(hrs)html+='<div class="ft-pop-go">🕐 오늘은 '+escapeHtml(hrs.join(", "))+'에 가면 좋아요</div>';
          slot.innerHTML=html;
          slot.className="ft-pop-time on";
        });
      });
      m.addTo(markerLayer);
      pts.push([s.lat,s.lon]);
    });
    if(pts.length){
      if(mapPicks.length)fitPicks(); else fitAll();
      /* 섹션이 hidden이었다가 열리면 Leaflet이 크기를 잘못 잡는다. */
      setTimeout(function(){
        try{ map.invalidateSize(); if(mapPicks.length)fitPicks(); else fitAll(); }catch(e){}
      },60);
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
            "초록색이 처음 가기 좋은 곳이에요. 다음 질문에 답하면 추천 3곳으로 좁혀드려요.");
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
      fallbackLevel=0;
      return sortForBeginner(region);
    }
    var pool=region.filter(function(s){return hasTarget(s,t)});
    if(!pool.length){ fallbackLevel=2; return sortForBeginner(region); }
    fallbackLevel=0;
    return sortForBeginner(pool);
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
    if(/-/.test(t))return "";           // 음수 수심(60건)은 태그로 보여주지 않는다
    t=t.replace(/\.(?=\s*$|\s*[~\-])/g,"");   // "0.1~3." 처럼 소수점만 남은 값 정리
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
    rock:   {ic:"🪨", txt:"울퉁불퉁한 바닷가 바위(갯바위)예요 — 바닥이 융단(펠트) 재질인 미끄럼 방지 신발이 꼭 필요해요", cls:"warn"},
    danger: {ic:"⛔", txt:"물이 차면 잠기는 바위거나 벽처럼 깎아지른 곳이에요 — 초보는 가지 마세요", cls:"bad"},
    unknown:{ic:"❓", txt:"발판은 이름만으론 알 수 없어요", cls:""}
  };
  /* 수심을 "2.1~5.0m"로 던지지 말고 발밑이 어떤지로 번역한다. */
  function depthAdvice(s){
    var d=s.deepM;
    /* 원본에 음수 수심이 60건 있다. 물 깊이가 마이너스면 말이 안 되므로
       추측해서 보정하지 않고 "확인 필요"로 넘긴다. */
    if(d==null||d<0)return {ic:"🌊", txt:"수심 정보가 정확하지 않아요 — 현장에서 확인하세요", cls:""};
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

  /* "고조/저조"는 초보가 모른다. 안내문에서 쓰는 말과도 달랐다. */
  function tideWord(t){
    return t==="고조" ? "물 가장 많이 찰 때" : t==="저조" ? "가장 많이 빠질 때" : t;
  }
  var WEEKDAY=["일","월","화","수","목","금","토"];
  /* 오늘이 안 맞으면 "언제 가라"까지 말해준다. 예전엔 "별로예요"에서 끝나
     사용자가 막다른 길에 놓였다. 물때번호는 음력 기반이라 앞날도 계산된다. */
  function nextGoodDay(s, maxDays){
    if(!s.tideNums)return null;
    for(var i=1;i<=(maxDays||14);i++){
      var d=new Date(); d.setDate(d.getDate()+i);
      var t=tideNumberOf(d);
      if(t&&s.tideNums.indexOf(t.n)!==-1)
        return (d.getMonth()+1)+"월 "+d.getDate()+"일("+WEEKDAY[d.getDay()]+")";
    }
    return null;
  }
  function tideVerdict(s, tide){
    if(EAST_COAST.indexOf(s.region)!==-1)
      return {cls:"", txt:"동해는 물이 드나드는 폭이 작아서 물때 영향이 적어요"};
    if(s.tideAny) return {cls:"good", txt:"물때를 크게 안 타는 곳이에요"};
    if(!tide||!s.tideNums) return null;
    var n=tide.n, list=s.tideNums;
    if(list.indexOf(n)!==-1) return {cls:"good", txt:"오늘 물때가 잘 맞아요"};
    var near=list.some(function(x){ var d=Math.abs(x-n); return Math.min(d,15-d)<=1; });
    if(near) return {cls:"", txt:"오늘도 나쁘진 않아요"};
    var when=nextGoodDay(s);
    return {cls:"warn", txt:"오늘은 물때가 잘 안 맞아요"
      +(when?" — 이 자리는 "+when+"이 더 좋아요":"")};
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
      /* (m/60|0<10) 은 0<10 이 먼저 평가돼 항상 참이 된다 — "012:00"이 나오던 원인. */
      return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
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
    if(!out.length)return null;
    out=out.filter(function(v,i,a){return a.indexOf(v)===i})
           .sort(function(a,b){return a.localeCompare(b)});
    return out.slice(0,2);
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
        el.textContent="🌊 "+ex.map(function(e){return tideWord(e.type)+" "+e.time}).join(" · ");
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
  /* "암", "펄/ 조개껍질" 같은 원본 표기는 초보가 못 읽는다(오타나 병 이름처럼 보임). */
  var BOTTOM_KO={"암":"바위","바위":"바위","펄":"갯벌 진흙","모래":"모래","자갈":"자갈",
    "조개껍질":"조개껍질","가는 모래":"고운 모래","침니":"진흙"};
  function bottomKo(b){
    return String(b||"").split("/").map(function(x){
      x=x.trim(); return BOTTOM_KO[x]||x;
    }).filter(Boolean).join("·");
  }
  function guideHtml(s){
    var out="";
    out+=line(ACCESS_INFO[s.access]||ACCESS_INFO.unknown);
    out+=line(FOOTING_INFO[s.footing]||FOOTING_INFO.unknown);
    out+=line(depthAdvice(s));

    var today=new Date();
    var v=tideVerdict(s, tideNumberOf(today));
    if(v)out+=line({ic:"🌗", txt:v.txt, cls:v.cls});
    var ph=phaseWords(s);
    if(ph)out+=line({ic:"⏰", txt:"여기는 "+ph+" 고기가 잘 물어요", cls:""});
    /* 만조·간조 시각을 받아온 뒤 "몇 시에 가면 되는지"로 채운다(fillTideTimes에서). */
    if(s.tidePhase&&s.station&&EAST_COAST.indexOf(s.region)===-1)
      out+='<div class="ft-guide-line" data-best-station="'+escapeHtml(s.station)+'"'
        +' data-best-phase="'+escapeHtml(s.tidePhase.join(","))+'" hidden></div>';
    if(s.bottom)out+=line({ic:"🐚", txt:"물속 바닥이 "+bottomKo(s.bottom)+"예요 — 여기 사는 고기가 모여요", cls:""});
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
        var dc=driveCount(ranked);
        $("ft-result-sub").textContent = dc
          ? "처음이시니까 차로 갈 수 있는 곳부터 보여드려요. (이 조건에서 차로 갈 수 있는 곳 "+dc+"곳)"
          : "이 조건은 전부 배를 타고 들어가야 하는 곳이에요. 처음이라면 다른 지역을 눌러보세요.";
      }
      var d=new Date();
      var stamp='<div class="ft-datestamp">📅 '+(d.getMonth()+1)+'월 '+d.getDate()+'일('
        +WEEKDAY[d.getDay()]+') 기준이에요</div>';
      $("ft-results").innerHTML=stamp+SAFETY_HTML+picks.map(cardHtml).join("");
      showMap(ranked, "추천 포인트 "+ranked.length+"곳",
        "①②③ 번호가 아래 카드와 같은 곳이에요. 마커를 누르면 상세 정보가 나와요.",
        picks);
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
    ["원투","무거운 추를 멀리 던져 바닥에 두고 기다리는 방식이에요. 던져놓고 기다리기만 하면 돼서 <b>처음 시작하기 가장 쉬워요.</b> 우럭·붕장어·광어처럼 바닥에 있는 고기를 노릴 때 씁니다."],
    ["찌낚시","물에 뜨는 <b>찌</b>를 띄워 중간 깊이를 노려요. 찌가 쑥 잠기는 순간이 눈에 보여서 재미있고, <b>감성돔·참돔 같은 돔 종류</b>가 주 대상이에요. 원투보다 준비가 조금 복잡해요."],
    ["맥낚시","릴 없이 긴 대만 써서 발밑을 노려요. 가장 단순해서 <b>장비 부담이 제일 적어요.</b> 대신 멀리 못 던져서 자리를 잘 골라야 해요."],
    ["루어","물고기 모양 가짜 미끼를 던지고 감아 들여요. <b>살아있는 미끼(지렁이 등)를 만질 필요가 없어서</b> 처음 하는 분들이 좋아해요. 농어·삼치처럼 빠르게 움직이는 고기에 씁니다."],
    ["에깅","오징어용 가짜 미끼를 쓰는 루어낚시예요. 장비가 간단하고 시즌에 맞춰 가면 초보도 잡을 수 있어요."]
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
      + '<div class="ft-tip-item ft-tip-buy"><b>처음 한 번은 이 정도면 됩니다 — 대략 8~12만원</b>'
      + '<br>· 낚싯대+릴 세트 5~8만원. 낚시점에서 <b>"'+escapeHtml(methodName(picked[0]))+' 초보 세트 주세요"</b>라고 하면 됩니다. 하루 5천~1만원에 빌릴 수도 있어요.'
      + '<br>· 미끼 5천~1만원. '+(picked[0]==="루어"||picked[0]==="에깅"
          ? '가짜 미끼를 쓰니까 <b>살아있는 벌레를 만질 일이 없어요.</b>'
          : '보통 <b>갯지렁이</b>를 씁니다. 손으로 만지기 싫으면 가짜 미끼를 쓰는 <b>루어</b> 쪽으로 바꾸셔도 돼요.')
      + '<br>· 구명조끼 5~8만원 (대여 가능)'
      + '<br>낚시점은 <b>포인트 근처 항구 앞</b>에 대부분 있어요. 가서 "○○ 갈 건데요"라고 하면 그날 뭐가 잡히는지도 알려줍니다.</div>'
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
