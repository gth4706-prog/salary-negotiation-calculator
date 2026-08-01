/* =========================================================
   낚시 물때 가이드 (fishing-tide)
   - data/fishing-spots.json(해양수산부 갯바위낚시포인트 가공본)을 fetch
   - 지역 → 목표 어종 2문항으로 좁혀서 실제 포인트 추천.
     기법은 묻지 않고 고른 목표에서 정해 알려준다(아래 TARGETS 주석 참조)
   - 물때번호(사리/조금)는 korean-lunar-calendar(음력 변환, KASI 표준)로
     그 자리에서 계산 — 서버 불필요, 항상 정확
   - 만조/간조 "시각"은 Worker(/tide) 경유 국립해양조사원 조석예보.
     포인트마다 가장 가까운 조위관측소 코드가 데이터에 들어있다.

   KO/EN 공유: window.FT_LANG="en" 이면 화면 문구를 영어 테이블에서 고른다.
   ⚠️ 지역명(s.region)·어종(s.species)·물때 계산 등 데이터 매칭 로직은 전부
   한국어 원문 그대로 유지한다 — REGION_GROUPS·EAST_COAST·TARGETS.species처럼
   비교에 쓰이는 문자열을 바꾸면 필터링이 깨진다. REGION_DISPLAY_EN·SPECIES_EN처럼
   "표시용" 사전만 별도로 두고, 매칭에는 항상 원본 한국어 키를 쓴다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("ft-opts"))return;
  var LANG=(window.FT_LANG==="en")?"en":"ko";

  // webtool-proxy Worker (/transcript, /seo-keywords, /couple-verdict와 공용)
  var API_BASE="https://bold-dream-f416.gth3941.workers.dev";

  var REGION_EMOJI={인천:"🌊",경기:"🌊",충남:"⛵",전북:"🌾",전남:"🏝️",부산:"🌉",울산:"🏭",경남:"⛴️",경북:"⛰️",강원:"🏔️",제주:"🌴"};
  /* 표시용 영문 지역명 — 매칭에는 절대 쓰지 않는다(원본 s.region은 항상 한국어). */
  var REGION_DISPLAY_EN={인천:"Incheon",경기:"Gyeonggi",충남:"Chungnam",전북:"Jeonbuk",전남:"Jeonnam",부산:"Busan",울산:"Ulsan",경남:"Gyeongnam",경북:"Gyeongbuk",강원:"Gangwon",제주:"Jeju"};
  function regionDisp(r){ return LANG==="en"?(REGION_DISPLAY_EN[r]||r):r; }
  var SEA_DISPLAY_EN={서해:"West Sea",남해:"South Sea",동해:"East Sea"};
  function seaDisp(sea){ return LANG==="en"?(SEA_DISPLAY_EN[sea]||sea):sea; }

  /* 원본 데이터의 기법명을 초보가 알아듣는 말로. 값이 없으면 카드에 안 띄운다.
     - 릴찌/부력/잠수/목줄 → 전부 찌를 쓰는 계열이라 "찌낚시"로 묶는다
     - 장대/민장대 → 입문 가이드의 정식 용어는 "맥낚시"
     - 훌치기/홀치기 → 지역·수면에 따라 금지되는 방식이라 초보에게 노출하지 않는다
     - 카드/처박기/외줄 → 입문 대상이 아니고 데이터도 20곳 미만 */
  var TECH_LABEL_KO={
    "원투":"원투", "루어":"루어", "에깅":"에깅", "지깅":"지깅",
    "릴찌":"찌낚시", "부력":"찌낚시", "잠수":"찌낚시", "목줄":"찌낚시",
    "장대":"맥낚시", "민장대":"맥낚시"
  };
  var TECH_LABEL_EN={
    "원투":"Bottom casting", "루어":"Lure", "에깅":"Eging (squid jigging)", "지깅":"Jigging",
    "릴찌":"Float fishing", "부력":"Float fishing", "잠수":"Float fishing", "목줄":"Float fishing",
    "장대":"Pole fishing", "민장대":"Pole fishing"
  };
  var TECH_LABEL=LANG==="en"?TECH_LABEL_EN:TECH_LABEL_KO;

  /* 어종 표시명 사전(표시 전용). s.species 매칭(hasTarget 등)은 항상 원본 한국어로 한다. */
  var SPECIES_EN={
    "우럭":"Rockfish","노래미":"Fat greenling","넙치":"Flounder","붕장어":"Conger eel","도다리":"Marbled flounder",
    "볼락":"Dark-banded rockfish","망둑어":"Goby","망둥어":"Goby","짱뚱어":"Mudskipper","쏨뱅이":"Scorpionfish",
    "열기":"Golden eye rockfish","양태":"Flathead","보구치":"White croaker","쥐치":"Filefish","망상어":"Surfperch",
    "부세":"Yellow croaker","장대":"Lizardfish","간재미":"Skate","백조기":"Small yellow croaker","다금바리":"Grouper",
    "감성돔":"Black porgy","참돔":"Red seabream","돌돔":"Rock bream","벵에돔":"Rudderfish","독가시치":"Rabbitfish",
    "자리돔":"Damselfish","벤자리":"Chicken grunt","뱅어돔":"Largescale blackfish",
    "농어":"Sea bass","삼치":"Spanish mackerel","부시리":"Yellowtail amberjack","방어":"Yellowtail","고등어":"Mackerel",
    "전갱이":"Jack mackerel","숭어":"Mullet","학공치":"Halfbeak","민어":"Croaker","전어":"Gizzard shad","망농어":"Sea bass",
    "무늬오징어":"Bigfin reef squid","갑오징어":"Cuttlefish","주꾸미":"Webfoot octopus","문어":"Octopus","한치":"Swordtip squid"
  };
  function speciesDisp(sp){ return LANG==="en"?(SPECIES_EN[sp]||sp):sp; }

  var T={
    ko:{
      safetyHtml:'<div class="ft-safety">'
        +'<b>⚠️ 처음이라면 이 3가지만 지키세요.</b>'
        +'<div class="ft-safe-l"><b>① 구명조끼는 무조건.</b> 낚시점에서 5~8만원, 대여는 1만원대예요. 방파제여도 입으세요.</div>'
        +'<div class="ft-safe-l"><b>② 물이 차오르는 시간을 꼭 보세요.</b> 서 있던 바위가 잠겨서 못 나오는 사고가 가장 많아요. '
        +'카드에 적힌 <b>"물 가장 많이 찰 때"</b> 시각 2시간 전에는 뭍으로 나오세요.</div>'
        +'<div class="ft-safe-l"><b>③ 가기 전날 밤 날씨 확인.</b> 풍랑주의보가 뜨면 가지 마세요. 사고가 나면 <b>해양경찰 122</b>.</div>'
        +'<div class="ft-safe-l">배를 타고 들어가는 섬은 처음엔 권하지 않아요. 아래는 <b>차로 갈 수 있는 곳부터</b> 보여드려요.</div>'
        +'</div>',
      questions:[{id:"day", t:"언제 가세요?"},{id:"region", t:"어느 바다로 가세요?"},{id:"target", t:"뭘 노려볼까요?"}],
      weekday:["일","월","화","수","목","금","토"],
      dayName:function(i,d){ return i===0?"오늘":i===1?"내일":this.weekday[d.getDay()]+"요일"; },
      dayLabel:function(d,weekday){ return (d.getMonth()+1)+"월 "+d.getDate()+"일("+weekday[d.getDay()]+")"; },
      targets:[
        {id:"any", ic:"🤷", label:"아직 모르겠어요", sub:"처음이면 여기", tech:"원투", beginner:true},
        {id:"bottom", ic:"🐟", label:"바닥에 있는 고기", sub:"우럭·볼락·붕장어", tech:"원투"},
        {id:"bream", ic:"🎣", label:"돔 종류", sub:"감성돔·참돔·돌돔", tech:"찌낚시"},
        {id:"fast", ic:"🐠", label:"빠르게 헤엄치는 고기", sub:"농어·삼치·전갱이", tech:"루어"},
        {id:"ceph", ic:"🦑", label:"오징어·문어", sub:"무늬오징어·주꾸미", tech:"에깅"}
      ],
      regionSuffix:"곳",
      loadFail:'<div class="helper">낚시 포인트 데이터를 불러오지 못했어요. 새로고침해 주세요.</div>',
      mapDefaultTitle:"포인트 위치",
      mapDefaultSub:"마커를 누르면 지도 아래에 그 자리 정보가 펼쳐져요.",
      regionMapTitle:function(r,n){ return r+" 낚시 포인트 "+n+"곳"; },
      regionMapSub:"초록색이 처음 가기 좋은 곳이에요. 마커를 누르면 지도 아래에 정보가 펼쳐져요.",
      resultMapTitle:function(n){ return "추천 포인트 "+n+"곳"; },
      resultMapSub:"①②③ 번호가 아래 카드와 같은 곳이에요. 마커를 누르면 지도 아래에 상세 정보가 나와요.",
      legend:[["#2EC4B6","처음 가기 좋아요"],["#FFC93C","차로 갈 수 있어요"],["#7A9BB8","배를 타야 해요"],["#4A6480","정보가 부족해요"],["#FF4B3E","초보에겐 어려워요"]],
      tideChipTitle:"1~15물은 물이 얼마나 세게 드나드는지예요. 숫자가 클수록 세게 드나들고 고기가 잘 뭅니다.",
      todayPrefix:"오늘 ",
      mapOpenLabel:"🗺️ 카카오맵으로 열기",
      copyBtn:"📋 이름 복사",
      copied:"✓ 복사됨",
      copyPrompt:"복사하세요:",
      whereIcon:"📍 ",
      depthLabel:"수심 ",
      sourceLabel:"출처: ",
      sourceName:"해양수산부 공공데이터",
      mapLinkLabel:"🗺️ 지도에서 위치 보기",
      noDataTitle:"이 지역 데이터가 아직 부족해요",
      noDataSub:"다른 지역으로 다시 시도해보세요.",
      fallbackTitle:"이 지역 포인트예요",
      fallbackSub:"조건에 딱 맞는 데가 없어서 지역 기준으로 넓혔어요.",
      beginnerTitle:"처음 가기 좋은 포인트예요",
      beginnerSub:"수심이 얕고 물때 시각이 정확한 곳을 앞에 뒀어요.",
      targetTitle:function(label){ return label+" 노리기 좋은 포인트예요"; },
      targetSubDrive:function(dayS,dc){ return dayS+" 기준이고, 차로 갈 수 있는 곳부터 보여드려요. (이 조건에서 차로 갈 수 있는 곳 "+dc+"곳)"; },
      targetSubFerry:"이 조건은 전부 배를 타고 들어가야 하는 곳이에요. 처음이라면 다른 지역을 눌러보세요.",
      dateStamp:function(dayS){ return '<div class="ft-datestamp">📅 '+dayS+' 기준이에요</div>'; },
      moreNext:"다음 후보 보기 →",
      restart:"↺ 처음부터",
      access:{
        drive:  {ic:"🚗", txt:"차로 갈 수 있어요", cls:"good"},
        ferry:  {ic:"⛴️", txt:"섬이라 배를 타야 해요", cls:"warn"},
        unknown:{ic:"🗺️", txt:"가는 방법은 지도로 확인하세요", cls:""}
      },
      footing:{
        flat:   {ic:"🧱", txt:"발판이 평평해요 (방파제·제방 계열)", cls:"good"},
        sand:   {ic:"🏖️", txt:"모래 해변이라 발이 편해요", cls:"good"},
        rock:   {ic:"🪨", txt:"울퉁불퉁한 바닷가 바위(갯바위)예요 — 바닥이 융단(펠트) 재질인 미끄럼 방지 신발이 꼭 필요해요", cls:"warn"},
        danger: {ic:"⛔", txt:"물이 차면 잠기는 바위거나 벽처럼 깎아지른 곳이에요 — 초보는 가지 마세요", cls:"bad"},
        unknown:{ic:"❓", txt:"발판은 이름만으론 알 수 없어요", cls:""}
      },
      depthUnknown:{ic:"🌊", txt:"수심 정보가 정확하지 않아요 — 현장에서 확인하세요", cls:""},
      depthDeep:function(m){ return {ic:"🌊", txt:"발밑이 "+m+"m — 빠지면 혼자 못 올라와요", cls:"bad"}; },
      depthWarn:function(m){ return {ic:"🌊", txt:"발밑이 "+m+"m로 깊은 편이에요", cls:"warn"}; },
      depthMid:function(m){ return {ic:"🌊", txt:"발밑 수심 "+m+"m 정도예요", cls:""}; },
      depthShallow:function(d){ return {ic:"🌊", txt:"수심이 얕아요 ("+d+"m 안팎)", cls:"good"}; },
      phase:{early_flood:"물이 차오르기 시작할 때", mid_flood:"물이 한창 차오를 때",
        early_ebb:"물이 빠지기 시작할 때", mid_ebb:"물이 한창 빠질 때",
        late_ebb:"물이 다 빠질 무렵", high:"물이 가장 많이 찼을 때", low:"물이 가장 많이 빠졌을 때"},
      tideWordHigh:"물 가장 많이 찰 때", tideWordLow:"가장 많이 빠질 때",
      eastCoastNote:"동해는 물이 드나드는 폭이 작아서 물때 영향이 적어요",
      tideAnyGood:"물때를 크게 안 타는 곳이에요",
      tideGood:"이 날 물때가 잘 맞아요",
      tideSoso:"이 날도 나쁘진 않아요",
      tideWarn:function(when){ return "이 날은 물때가 잘 안 맞아요"+(when?" — 이 자리는 "+when+"이 더 좋아요":""); },
      biteWords:function(ph){ return "여기는 "+ph+" 고기가 잘 물어요"; },
      bottomWords:function(b){ return "물속 바닥이 "+b+"예요 — 여기 사는 고기가 모여요"; },
      goodHours:function(dayS,hrs){ return dayS+"은 "+hrs+"에 가면 좋아요"; },
      bottomKo:{"암":"바위","바위":"바위","펄":"갯벌 진흙","모래":"모래","자갈":"자갈",
        "조개껍질":"조개껍질","가는 모래":"고운 모래","침니":"진흙"},
      weekLabel:"앞으로 7일",
      basicMethods:[
        ["원투","무거운 추를 멀리 던져 바닥에 두고 기다리는 방식이에요. 던져놓고 기다리기만 하면 돼서 <b>처음 시작하기 가장 쉬워요.</b> 우럭·붕장어·광어처럼 바닥에 있는 고기를 노릴 때 씁니다."],
        ["찌낚시","물에 뜨는 <b>찌</b>를 띄워 중간 깊이를 노려요. 찌가 쑥 잠기는 순간이 눈에 보여서 재미있고, <b>감성돔·참돔 같은 돔 종류</b>가 주 대상이에요. 원투보다 준비가 조금 복잡해요."],
        ["맥낚시","릴 없이 긴 대만 써서 발밑을 노려요. 가장 단순해서 <b>장비 부담이 제일 적어요.</b> 대신 멀리 못 던져서 자리를 잘 골라야 해요."],
        ["루어","물고기 모양 가짜 미끼를 던지고 감아 들여요. <b>살아있는 미끼(지렁이 등)를 만질 필요가 없어서</b> 처음 하는 분들이 좋아해요. 농어·삼치처럼 빠르게 움직이는 고기에 씁니다."],
        ["에깅","오징어용 가짜 미끼를 쓰는 루어낚시예요. 장비가 간단하고 시즌에 맞춰 가면 초보도 잡을 수 있어요."]
      ],
      methodName:function(n){ return /낚시$/.test(n) ? n : n+"낚시"; },
      tipsTitle:"이렇게 준비하세요",
      tipsPicked:function(nm,desc){ return '<div class="ft-tip-item"><b>'+nm+'</b>로 하시면 돼요. '+desc+'</div>'; },
      tipsBuyTitle:"처음 한 번은 이 정도면 됩니다 — 대략 8~12만원",
      tipsRod:function(nm){ return '· 낚싯대+릴 세트 5~8만원. 낚시점에서 <b>"'+nm+' 초보 세트 주세요"</b>라고 하면 됩니다. 하루 5천~1만원에 빌릴 수도 있어요.'; },
      tipsBaitLure:'가짜 미끼를 쓰니까 <b>살아있는 벌레를 만질 일이 없어요.</b>',
      tipsBaitWorm:'보통 <b>갯지렁이</b>를 씁니다. 손으로 만지기 싫으면 가짜 미끼를 쓰는 <b>루어</b> 쪽으로 바꾸셔도 돼요.',
      tipsBaitPrefix:'· 미끼 5천~1만원. ',
      tipsVest:'<br>· 구명조끼 5~8만원 (대여 가능)',
      tipsShopNote:'<br>낚시점은 <b>포인트 근처 항구 앞</b>에 대부분 있어요. 가서 "○○ 갈 건데요"라고 하면 그날 뭐가 잡히는지도 알려줍니다.',
      moreMethodsSummary:"바다낚시 다른 방법도 볼래요",
      previousQ:"← 이전 질문"
    },
    en:{
      safetyHtml:'<div class="ft-safety">'
        +'<b>⚠️ First time? Just stick to these 3 rules.</b>'
        +'<div class="ft-safe-l"><b>① Always wear a life vest.</b> Tackle shops sell them for $40-65, or rent one for around $8. Wear it even on a breakwater.</div>'
        +'<div class="ft-safe-l"><b>② Always check when the tide is coming in.</b> The most common accident is getting stranded when the rock you\'re standing on gets submerged. '
        +'Head back to shore at least 2 hours before the <b>"highest tide"</b> time shown on the card.</div>'
        +'<div class="ft-safe-l"><b>③ Check the weather the night before you go.</b> Don\'t go if there\'s a small craft advisory. In an emergency, call the <b>coast guard.</b></div>'
        +'<div class="ft-safe-l">We don\'t recommend islands you need to take a boat to for your first time. Below, we show <b>spots you can drive to first.</b></div>'
        +'</div>',
      questions:[{id:"day", t:"When are you going?"},{id:"region", t:"Which coast are you headed to?"},{id:"target", t:"What are you targeting?"}],
      weekday:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],
      dayName:function(i,d){ return i===0?"Today":i===1?"Tomorrow":this.weekday[d.getDay()]; },
      dayLabel:function(d,weekday){ return (d.getMonth()+1)+"/"+d.getDate()+" ("+weekday[d.getDay()]+")"; },
      targets:[
        {id:"any", ic:"🤷", label:"Not sure yet", sub:"Start here", tech:"원투", beginner:true},
        {id:"bottom", ic:"🐟", label:"Bottom-dwelling fish", sub:"Rockfish, greenling, conger eel", tech:"원투"},
        {id:"bream", ic:"🎣", label:"Bream / porgy types", sub:"Black porgy, red seabream, rock bream", tech:"찌낚시"},
        {id:"fast", ic:"🐠", label:"Fast-swimming fish", sub:"Sea bass, Spanish mackerel, jack mackerel", tech:"루어"},
        {id:"ceph", ic:"🦑", label:"Squid / octopus", sub:"Reef squid, webfoot octopus", tech:"에깅"}
      ],
      regionSuffix:" spots",
      loadFail:'<div class="helper">Couldn\'t load fishing spot data. Please refresh the page.</div>',
      mapDefaultTitle:"Spot locations",
      mapDefaultSub:"Click a marker to see that spot's info below the map.",
      regionMapTitle:function(r,n){ return regionDisp(r)+" — "+n+" fishing spots"; },
      regionMapSub:"Green means good for a first trip. Click a marker to see details below the map.",
      resultMapTitle:function(n){ return "Recommended spots — "+n; },
      resultMapSub:"Numbers ①②③ match the cards below. Click a marker for details below the map.",
      legend:[["#2EC4B6","Good for beginners"],["#FFC93C","Reachable by car"],["#7A9BB8","Requires a boat"],["#4A6480","Not enough info"],["#FF4B3E","Tough for beginners"]],
      tideChipTitle:"Tide phase runs 1-15 — a higher number means stronger tidal movement and better biting.",
      todayPrefix:"Today: ",
      mapOpenLabel:"🗺️ Open in Kakao Map",
      copyBtn:"📋 Copy name",
      copied:"✓ Copied",
      copyPrompt:"Copy this:",
      whereIcon:"📍 ",
      depthLabel:"Depth ",
      sourceLabel:"Source: ",
      sourceName:"Korea Ministry of Oceans and Fisheries open data",
      mapLinkLabel:"🗺️ View location on map",
      noDataTitle:"Not enough data for this region yet",
      noDataSub:"Please try a different region.",
      fallbackTitle:"Spots in this region",
      fallbackSub:"Nothing matched your exact criteria, so we widened the search to the whole region.",
      beginnerTitle:"Good spots for a first trip",
      beginnerSub:"We put shallow spots with accurate tide timing first.",
      targetTitle:function(label){ return "Good spots for "+label.toLowerCase(); },
      targetSubDrive:function(dayS,dc){ return "As of "+dayS+", showing spots you can drive to first. ("+dc+" of these are reachable by car)"; },
      targetSubFerry:"Every spot matching this is only reachable by boat. If it's your first time, try a different region.",
      dateStamp:function(dayS){ return '<div class="ft-datestamp">📅 As of '+dayS+'</div>'; },
      moreNext:"See next candidates →",
      restart:"↺ Start over",
      access:{
        drive:  {ic:"🚗", txt:"Reachable by car", cls:"good"},
        ferry:  {ic:"⛴️", txt:"It's an island — you'll need a boat", cls:"warn"},
        unknown:{ic:"🗺️", txt:"Check the map for how to get there", cls:""}
      },
      footing:{
        flat:   {ic:"🧱", txt:"Flat footing (breakwater/embankment type)", cls:"good"},
        sand:   {ic:"🏖️", txt:"Sandy beach — easy underfoot", cls:"good"},
        rock:   {ic:"🪨", txt:"Uneven rocky shore — you'll need felt-soled non-slip shoes", cls:"warn"},
        danger: {ic:"⛔", txt:"Rocks that submerge at high tide or a steep cliff — not for beginners", cls:"bad"},
        unknown:{ic:"❓", txt:"Footing can't be determined from the name alone", cls:""}
      },
      depthUnknown:{ic:"🌊", txt:"Depth data isn't reliable here — check on site", cls:""},
      depthDeep:function(m){ return {ic:"🌊", txt:"About "+m+"m deep underfoot — you couldn't climb out alone if you fell in", cls:"bad"}; },
      depthWarn:function(m){ return {ic:"🌊", txt:"About "+m+"m deep underfoot — on the deeper side", cls:"warn"}; },
      depthMid:function(m){ return {ic:"🌊", txt:"About "+m+"m deep underfoot", cls:""}; },
      depthShallow:function(d){ return {ic:"🌊", txt:"Shallow water (around "+d+"m)", cls:"good"}; },
      phase:{early_flood:"as the tide starts coming in", mid_flood:"while the tide is rising fast",
        early_ebb:"as the tide starts going out", mid_ebb:"while the tide is falling fast",
        late_ebb:"as the tide finishes going out", high:"at the highest tide", low:"at the lowest tide"},
      tideWordHigh:"Highest tide", tideWordLow:"Lowest tide",
      eastCoastNote:"Tidal range is small on the East Sea, so tide phase matters less here",
      tideAnyGood:"This spot doesn't depend much on tide phase",
      tideGood:"Tide phase lines up well for this day",
      tideSoso:"Not a bad day for this spot either",
      tideWarn:function(when){ return "Tide phase doesn't line up well for this day"+(when?" — "+when+" would be better for this spot":""); },
      biteWords:function(ph){ return "Fish tend to bite here "+ph; },
      bottomWords:function(b){ return "The bottom here is "+b+" — fish that live there tend to gather"; },
      goodHours:function(dayS,hrs){ return "On "+dayS+", "+hrs+" would be a good time to go"; },
      bottomKo:{"암":"rock","바위":"rock","펄":"tidal mudflat","모래":"sand","자갈":"gravel",
        "조개껍질":"shell fragments","가는 모래":"fine sand","침니":"silt/mud"},
      weekLabel:"Next 7 days",
      basicMethods:[
        ["원투","You cast a heavy weight far out and let it sit on the bottom while you wait. Just cast and wait, which makes it <b>the easiest way to start.</b> Used for bottom-dwellers like rockfish, conger eel, and flounder."],
        ["찌낚시","You float a bobber (jji) to fish a middle depth. It's fun to watch the float suddenly dip under, and it's mainly used for <b>bream/porgy types like black porgy and red seabream.</b> A bit more setup than bottom casting."],
        ["맥낚시","You use just a long pole with no reel, fishing right at your feet. The simplest method, so it has <b>the least gear to worry about.</b> You can't cast far though, so picking the right spot matters."],
        ["루어","You cast a fish-shaped artificial lure and reel it in. Beginners like it because <b>you never have to touch live bait (like worms).</b> Used for fast-moving fish like sea bass and Spanish mackerel."],
        ["에깅","Lure fishing using a fake bait made for squid. Simple gear, and even beginners can catch something if they go in season."]
      ],
      methodName:function(nKo){
        var map={"원투":"Bottom casting","찌낚시":"Float fishing","맥낚시":"Pole fishing","루어":"Lure fishing","에깅":"Eging"};
        return map[nKo]||nKo;
      },
      tipsTitle:"How to gear up",
      tipsPicked:function(nm,desc){ return '<div class="ft-tip-item">Go with <b>'+nm+'</b>. '+desc+'</div>'; },
      tipsBuyTitle:"For your first time, this is plenty — roughly $60-90 total",
      tipsRod:function(nm){ return '· Rod + reel set, $35-60. At a tackle shop, just say <b>"I need a beginner '+nm.toLowerCase()+' set."</b> You can also rent one for $4-8 a day.'; },
      tipsBaitLure:'Since it uses artificial lures, <b>you never have to touch a live worm.</b>',
      tipsBaitWorm:'Most people use <b>sandworms.</b> If you'+"'"+'d rather not touch them by hand, switch to <b>lure fishing</b> instead.',
      tipsBaitPrefix:'· Bait, $4-8. ',
      tipsVest:'<br>· Life vest, $35-60 (rental available)',
      tipsShopNote:'<br>Tackle shops are usually right by the harbor near the fishing spot. Ask them what\'s biting that day when you stop in.',
      moreMethodsSummary:"See other saltwater fishing methods",
      previousQ:"← Previous question"
    }
  };
  var S=T[LANG];

  var SAFETY_HTML=S.safetyHtml;
  var QUESTIONS=S.questions;
  var WEEKDAY=S.weekday;

  function midnight(d){ var x=new Date(d); x.setHours(0,0,0,0); return x; }
  function addDays(d,n){ var x=midnight(d); x.setDate(x.getDate()+n); return x; }
  function ymd(d){ var p=function(n){return (n<10?"0":"")+n};
    return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate()); }
  function dayLabel(d){ return S.dayLabel(d,WEEKDAY); }

  var pickedDate=midnight(new Date());
  function goDate(){ return pickedDate; }

  /* 앞으로 7일 선택지. 오늘·내일은 그대로 부르고, 나머지는 요일로 부른다. */
  function dayOptions(){
    var out=[], base=midnight(new Date());
    for(var i=0;i<7;i++){
      var d=addDays(base,i);
      var name=S.dayName(i,d);
      out.push([String(i), i===0?"📅":(d.getDay()===0||d.getDay()===6?"🌤️":"📆"),
                name, (d.getMonth()+1)+"/"+d.getDate()]);
    }
    return out;
  }

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
     특정 어종 포인트의 별명이라 여기에 흡수된다.
     ⚠️ species 배열은 데이터 매칭용이라 언어와 무관하게 항상 한국어 원본을 쓴다. */
  var TARGET_SPECIES={
    bottom:["우럭","노래미","넙치","붕장어","도다리","볼락","망둑어","망둥어","짱뚱어","쏨뱅이","열기","양태","보구치","쥐치","망상어","부세","장대","간재미","백조기","다금바리"],
    bream:["감성돔","참돔","돌돔","벵에돔","독가시치","자리돔","벤자리","뱅어돔"],
    fast:["농어","삼치","부시리","방어","고등어","전갱이","숭어","학공치","민어","전어","망농어","농어/  삼치"],
    ceph:["무늬오징어","갑오징어","주꾸미","문어","한치"]
  };
  var TARGETS=S.targets.map(function(t){
    var o={id:t.id, ic:t.ic, label:t.label, sub:t.sub, tech:t.tech, beginner:t.beginner};
    if(TARGET_SPECIES[t.id])o.species=TARGET_SPECIES[t.id];
    return o;
  });
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

  /* KO 페이지(fishing-tide/)는 사이트 루트에서 한 단계 아래, EN 페이지(fishing-tide/en/)는
     두 단계 아래라 data/ 로 가는 상대경로 깊이가 다르다. */
  var DATA_PREFIX=LANG==="en"?"../../data/":"../data/";
  fetch(DATA_PREFIX+"fishing-spots.json").then(function(r){return r.json()}).then(function(rows){
    DATA=rows||[];
    if($("ft-total"))$("ft-total").textContent=DATA.length.toLocaleString();

    // 데이터에 실제로 있는 지역인지 확인하는 용도. 화면 순서는 REGION_GROUPS가 정한다.
    var regionCount={};
    DATA.forEach(function(s){ regionCount[s.region]=(regionCount[s.region]||0)+1; });
    REGION_LIST=Object.keys(regionCount).sort(function(a,b){return regionCount[b]-regionCount[a];});


    renderQuestion();
  }).catch(function(){
    $("ft-opts").innerHTML=S.loadFail;
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

  /* ══ 지도 ══════════════════════════════════════════════════════════════ */
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
  function renderLegend(){
    var el=$("ft-legend");
    if(!el)return;
    el.innerHTML=S.legend.map(function(l){
      return '<span class="ft-lg"><i style="background:'+l[0]+'"></i>'+escapeHtml(l[1])+'</span>';
    }).join("");
  }

  /* 팝업 안에서 물때 시각을 채운다. 카드와 같은 캐시를 쓰므로 관측소당 1회. */
  function detailHtml(s){
    var tide=tideNumberOf(goDate());
    var head='<div class="ft-pop-name">'+escapeHtml(spotName(s))+'</div>'
      +'<div class="ft-pop-sub">'+S.whereIcon+escapeHtml(spotWhere(s))+'</div>';
    var chips="";
    if(tide)chips+='<span class="ft-pop-chip" title="'+escapeHtml(S.tideChipTitle)+'">'+escapeHtml(S.todayPrefix+tide.label)+'</span>';
    (s.species||[]).slice(0,4).forEach(function(sp){
      chips+='<span class="ft-pop-chip">'+escapeHtml(speciesDisp(sp))+'</span>';
    });
    return head
      +(chips?'<div class="ft-pop-chips">'+chips+'</div>':'')
      +guideHtml(s)
      +'<div class="ft-pop-time" data-pop-station="'+escapeHtml(s.station||"")+'"'
        +' data-pop-phase="'+escapeHtml((s.tidePhase||[]).join(","))+'"'
        +' data-pop-region="'+escapeHtml(s.region)+'">'+(LANG==="en"?"Loading tide times…":"물때 시각 불러오는 중…")+'</div>'
      +'<a class="ft-pop-map" href="'+mapLink(s)+'" target="_blank" rel="noopener">'+S.mapOpenLabel+'</a>';
  }

  var mapAll=[], mapPicks=[];

  function fitAll(){
    if(!map||!mapAll.length)return;
    try{ map.fitBounds(mapAll.map(function(s){return [s.lat,s.lon]}),{padding:[24,24], maxZoom:12}); }catch(e){}
  }
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

  var selectedMarker=null;
  function paintMarker(m, on){
    if(!m||!m.setStyle)return;
    try{
      m.setStyle(on
        ? {color:"#FFC93C", weight:4, radius:m.__top?13:9, fillOpacity:1}
        : (m.__top ? {color:"#fff", weight:3, radius:11, fillOpacity:.95}
                   : {color:m.__base, weight:2, radius:6, fillOpacity:.65}));
    }catch(e){}
  }
  function selectSpot(m, s){
    var box=$("ft-map-detail");
    if(!box)return;
    if(selectedMarker&&selectedMarker!==m)paintMarker(selectedMarker,false);
    selectedMarker=m; paintMarker(m,true);

    box.innerHTML=detailHtml(s);
    box.hidden=false;
    var slot=box.querySelector("[data-pop-station]");
    if(slot){
      var station=slot.getAttribute("data-pop-station");
      if(!station){ slot.remove(); }
      else{
        var phase=(slot.getAttribute("data-pop-phase")||"").split(",").filter(Boolean);
        var region=slot.getAttribute("data-pop-region")||"";
        fetchTideTimes(station).then(function(ex){
          if(!slot.parentNode)return;
          if(!ex){ slot.remove(); return; }
          var html="🌊 "+ex.map(function(x){return tideWord(x.type)+" "+x.time}).join(" · ");
          var hrs=bestHours({region:region, tidePhase:phase}, ex);
          if(hrs)html+='<div class="ft-pop-go">🕐 '+escapeHtml(S.goodHours(dayLabel(goDate()),hrs.join(", ")))+'</div>';
          slot.innerHTML=html;
          slot.className="ft-pop-time on";
        });
      }
    }
    if(box.scrollIntoView)box.scrollIntoView({behavior:"smooth", block:"nearest"});
  }
  function clearSelection(){
    if(selectedMarker)paintMarker(selectedMarker,false);
    selectedMarker=null;
    var box=$("ft-map-detail");
    if(box){ box.hidden=true; box.innerHTML=""; }
  }

  function showMap(spots, title, sub, picks){
    var sec=$("stepMap");
    if(!sec)return;
    if(!mapReady()){ sec.hidden=true; return; }
    sec.hidden=false;
    if($("ft-map-title"))$("ft-map-title").textContent=title||S.mapDefaultTitle;
    if($("ft-map-sub"))$("ft-map-sub").textContent=sub||S.mapDefaultSub;
    renderLegend();
    bindMapButtons();
    if(!initMap()){ sec.hidden=true; return; }

    markerLayer.clearLayers();
    clearSelection();
    mapAll=spots.filter(function(s){return isFinite(s.lat)&&isFinite(s.lon)});
    mapPicks=(picks||[]).filter(function(s){return isFinite(s.lat)&&isFinite(s.lon)});
    var pickIdx={};
    mapPicks.forEach(function(s,i){ pickIdx[s.lat+","+s.lon]=i+1; });
    var pts=[];
    spots.forEach(function(s){
      if(!(isFinite(s.lat)&&isFinite(s.lon)))return;
      var st=markerStyle(s);
      var top=pickIdx[s.lat+","+s.lon]||0;
      var m=top
        ? L.circleMarker([s.lat,s.lon],{radius:11, weight:3, color:"#fff", fillColor:st.color, fillOpacity:.95})
        : L.circleMarker([s.lat,s.lon],{radius:6, weight:2, color:st.color, fillColor:st.color, fillOpacity:.65});
      if(top)m.bindTooltip(String(top),{permanent:true, direction:"center", className:"ft-mk-num"});
      m.__spot=s; m.__base=st.color; m.__top=top;
      m.on("click",function(){ selectSpot(m,s); });
      m.addTo(markerLayer);
      pts.push([s.lat,s.lon]);
    });
    if(pts.length){
      if(mapPicks.length)fitPicks(); else fitAll();
      setTimeout(function(){
        try{ map.invalidateSize(); if(mapPicks.length)fitPicks(); else fitAll(); }catch(e){}
      },60);
    }
  }

  function optsForCurrentQuestion(){
    var q=QUESTIONS[qIdx];
    if(q.id==="day")return dayOptions();
    if(q.id==="region"){
      var opts=[];
      REGION_GROUPS.forEach(function(g){
        g.list.forEach(function(r){
          if(REGION_LIST.indexOf(r)===-1)return;      // 데이터에 없는 지역은 안 띄운다
          opts.push([r, REGION_EMOJI[r]||"📍", regionDisp(r), seaDisp(g.sea)+" · "+regionCount(r)+S.regionSuffix]);
        });
      });
      // REGION_GROUPS에 안 적힌 지역이 생기면 뒤에 붙여 빠지지 않게 한다
      REGION_LIST.forEach(function(r){
        if(!opts.some(function(o){return o[0]===r})) opts.push([r, REGION_EMOJI[r]||"📍", regionDisp(r), regionCount(r)+S.regionSuffix]);
      });
      return opts;
    }
    // target: 이 지역에서 실제로 결과가 나오는 목표만
    return availableTargets(answers.region).map(function(t){
      return [t.id, t.ic, t.label, t.beginner?(LANG==="en"?"Start here":"처음이면 여기"):t.sub];
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
        if(q.id==="day")pickedDate=addDays(new Date(), +o[0]||0);
        qIdx++;
        if(q.id==="region"){
          var pool=DATA.filter(function(x){return x.region===o[0]});
          showMap(pool, S.regionMapTitle(o[0],pool.length), S.regionMapSub);
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
  if($("ft-back"))$("ft-back").textContent=S.previousQ;

  /* ---------- 필터링(조건 완화 폴백 포함) ---------- */
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
        var done=function(){var old=btn.textContent;btn.textContent=S.copied;setTimeout(function(){btn.textContent=old},1400);};
        if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(name).then(done,function(){prompt(S.copyPrompt,name)});
        else prompt(S.copyPrompt,name);
      });
    });
  }
  function mapLink(s){
    return "https://map.kakao.com/link/map/"+encodeURIComponent(s.name)+","+s.lat+","+s.lon;
  }
  function depthText(v){
    var t=(v==null?"":String(v)).replace(/^\s+|\s+$/g,"");
    if(!t)return "";
    if(/-/.test(t))return "";           // 음수 수심(60건)은 태그로 보여주지 않는다
    t=t.replace(/\.(?=\s*$|\s*[~\-])/g,"");   // "0.1~3." 처럼 소수점만 남은 값 정리
    var tail=t.replace(/^[\s\S]*[0-9]/,"");
    return /m/i.test(tail) ? t : t+"m";
  }

  var ACCESS_INFO=S.access;
  var FOOTING_INFO=S.footing;
  function depthAdvice(s){
    var d=s.deepM;
    if(d==null||d<0)return S.depthUnknown;
    if(d>=15)return S.depthDeep(Math.round(d));
    if(d>=8) return S.depthWarn(Math.round(d));
    if(d>=3) return S.depthMid(Math.round(d));
    return S.depthShallow(d);
  }

  var EAST_COAST=["강원","경북","울산","부산"];
  var PHASE_KO=S.phase;

  function tideWord(t){
    return t==="고조" ? S.tideWordHigh : t==="저조" ? S.tideWordLow : t;
  }
  function nextGoodDay(s, maxDays){
    if(!s.tideNums)return null;
    var base=midnight(new Date()), picked=ymd(goDate());
    for(var i=0;i<=(maxDays||14);i++){
      var d=addDays(base,i);
      if(ymd(d)===picked)continue;          // 고른 날은 이미 "안 맞는다"고 말했다
      var t=tideNumberOf(d);
      if(t&&s.tideNums.indexOf(t.n)!==-1)return dayLabel(d);
    }
    return null;
  }
  function tideVerdict(s, tide){
    if(EAST_COAST.indexOf(s.region)!==-1)
      return {cls:"", txt:S.eastCoastNote};
    if(s.tideAny) return {cls:"good", txt:S.tideAnyGood};
    if(!tide||!s.tideNums) return null;
    var n=tide.n, list=s.tideNums;
    if(list.indexOf(n)!==-1) return {cls:"good", txt:S.tideGood};
    var near=list.some(function(x){ var d=Math.abs(x-n); return Math.min(d,15-d)<=1; });
    if(near) return {cls:"", txt:S.tideSoso};
    var when=nextGoodDay(s);
    return {cls:"warn", txt:S.tideWarn(when)};
  }
  function bestHours(s, extremes){
    if(!s.tidePhase||!extremes||!extremes.length)return null;
    if(EAST_COAST.indexOf(s.region)!==-1)return null;
    var high=extremes.filter(function(e){return e.type==="고조"});
    var low=extremes.filter(function(e){return e.type==="저조"});
    function plus(t,h){
      var p=t.split(":"); var m=(+p[0])*60+(+p[1])+h*60;
      m=((m%1440)+1440)%1440;
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
    var tide=tideNumberOf(goDate());
    if(!tide)return "";
    var txt=S.todayPrefix+tide.label;
    if(!/^[0-9]+물$/.test(tide.label))txt+=" ("+tide.n+"물)";
    return '<span class="ft-tag tide">'+escapeHtml(txt)+'</span>';
  }
  var tideTimeCache={};   // "station|date" -> Promise<extremes[] | null>
  function fetchTideTimes(station, date){
    if(!station)return Promise.resolve(null);
    var d=ymd(date||goDate()), key=station+"|"+d;
    if(!tideTimeCache[key]){
      tideTimeCache[key]=fetch(API_BASE+"/tide?station="+encodeURIComponent(station)+"&date="+d)
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(d){ return (d&&d.extremes&&d.extremes.length)?d.extremes:null; })
        .catch(function(){ return null; });
    }
    return tideTimeCache[key];
  }
  function fillTideTimes(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-tide-station]"),function(el){
      var st=el.getAttribute("data-tide-station");
      fetchTideTimes(st).then(function(ex){
        if(!ex){ el.remove(); return; }   // 못 가져오면 빈 자리로 두는 게 낫다
        var km=el.getAttribute("data-tide-km");
        var nm=el.getAttribute("data-tide-name");
        el.className="ft-tag time";
        el.textContent="🌊 "+ex.map(function(e){return tideWord(e.type)+" "+e.time}).join(" · ");
        el.title=nm+(LANG==="en"?" tide station":" 관측소 기준")+(km?(LANG==="en"?" (about "+km+"km away)":" (약 "+km+"km 떨어짐)"):"");
        fillBestHours(el, st, ex);
      });
    });
  }

  function fillBestHours(timeEl, station, extremes){
    var card=timeEl.closest? timeEl.closest(".ft-card") : null;
    if(!card)return;
    var slot=card.querySelector('[data-best-station="'+station+'"]');
    if(!slot)return;
    var fake={region:"", tidePhase:slot.getAttribute("data-best-phase").split(",")};
    var hours=bestHours(fake, extremes);
    if(!hours){ slot.remove(); return; }
    slot.className="ft-guide-line good";
    slot.innerHTML='<span class="gi">🕐</span><span>'+escapeHtml(S.goodHours(dayLabel(goDate()),hours.join(", ")))+'</span>';
    slot.hidden=false;
  }

  function timeHtml(s){
    if(!s.station)return "";
    return '<span class="ft-tag" data-tide-station="'+escapeHtml(s.station)+'"'
      +' data-tide-name="'+escapeHtml(s.stationName||"")+'"'
      +' data-tide-km="'+escapeHtml(String(s.stationKm||""))+'">🌊 '+(LANG==="en"?"Loading tide times…":"만조·간조 불러오는 중…")+'</span>';
  }

  function line(o){
    if(!o)return "";
    return '<div class="ft-guide-line '+(o.cls||"")+'"><span class="gi">'+o.ic+'</span>'
      +'<span>'+escapeHtml(o.txt)+'</span></div>';
  }
  var BOTTOM_KO=S.bottomKo;
  function bottomKo(b){
    return String(b||"").split("/").map(function(x){
      x=x.trim(); return BOTTOM_KO[x]||x;
    }).filter(Boolean).join(LANG==="en"?", ":"·");
  }
  function dayFit(s, d){
    if(!s.tideNums)return null;
    var t=tideNumberOf(d);
    if(!t)return null;
    if(s.tideNums.indexOf(t.n)!==-1)return "good";
    var near=s.tideNums.some(function(x){var g=Math.abs(x-t.n);return Math.min(g,15-g)<=1;});
    return near?"soso":"bad";
  }
  function weekStrip(s){
    if(EAST_COAST.indexOf(s.region)!==-1)return "";
    if(!s.tideNums)return "";
    var base=midnight(new Date()), picked=ymd(goDate()), cells="";
    for(var i=0;i<7;i++){
      var d=addDays(base,i), f=dayFit(s,d);
      var mark=f==="good"?"◎":f==="soso"?"○":"·";
      cells+='<span class="ft-day '+(f||"")+(ymd(d)===picked?" on":"")+'"'
        +' title="'+escapeHtml(dayLabel(d))+'">'
        +'<b>'+WEEKDAY[d.getDay()]+'</b><i>'+mark+'</i></span>';
    }
    return '<div class="ft-week"><span class="ft-week-t">'+S.weekLabel+'</span>'+cells+'</div>';
  }

  function guideHtml(s){
    var out="";
    out+=line(ACCESS_INFO[s.access]||ACCESS_INFO.unknown);
    out+=line(FOOTING_INFO[s.footing]||FOOTING_INFO.unknown);
    out+=line(depthAdvice(s));

    var v=tideVerdict(s, tideNumberOf(goDate()));
    if(v)out+=line({ic:"🌗", txt:v.txt, cls:v.cls});
    var ph=phaseWords(s);
    if(ph)out+=line({ic:"⏰", txt:S.biteWords(ph), cls:""});
    if(s.tidePhase&&s.station&&EAST_COAST.indexOf(s.region)===-1)
      out+='<div class="ft-guide-line" data-best-station="'+escapeHtml(s.station)+'"'
        +' data-best-phase="'+escapeHtml(s.tidePhase.join(","))+'" hidden></div>';
    if(s.bottom)out+=line({ic:"🐚", txt:S.bottomWords(bottomKo(s.bottom)), cls:""});
    return '<div class="ft-guide">'+out+weekStrip(s)+'</div>';
  }

  function spotName(s){
    var p=String(s.name||"").split(" · ");
    var nm=(p.length>1 ? p.slice(1).join(" · ") : p[0]).trim();
    if(p.length>1){
      var islands=p[0].split("·");
      if(islands.length===1){
        var isl=islands[0].trim();
        if(isl && nm.indexOf(isl+" ")===0 && nm.length>isl.length+2)
          nm=nm.slice(isl.length+1).trim();
      }
    }
    return nm;
  }
  function spotArea(s){
    var p=String(s.name||"").split(" · ");
    return p.length>1 ? p[0].trim() : "";
  }
  function spotWhere(s){
    var head=regionDisp(s.region||"")+(s.sigungu?" "+s.sigungu:"");
    var tail=s.road || s.dong || "";
    var area=spotArea(s);
    var out=head+(tail?" "+tail:"");
    if(area && out.indexOf(area)===-1) out+=" · "+area;
    return out;
  }

  function cardHtml(s){
    var speciesChips=(s.species||[]).slice(0,6).map(function(sp){return '<span class="ft-tag match">'+escapeHtml(speciesDisp(sp))+'</span>'}).join("");
    var techChips=(s.techniques||[])
      .map(function(t){return TECH_LABEL[t]})
      .filter(function(t,i,arr){return t&&arr.indexOf(t)===i})
      .slice(0,4)
      .map(function(t){return '<span class="ft-tag">'+escapeHtml(t)+'</span>'}).join("");
    var depth=depthText(s.depth);
    return '<div class="ft-card">'
      +'<div class="ft-name-row"><span class="ft-name">'+escapeHtml(spotName(s))+'</span>'
      +'<button type="button" class="ft-copy" data-name="'+escapeHtml(s.name)+'">'+S.copyBtn+'</button></div>'
      +'<div class="ft-where">'+S.whereIcon+escapeHtml(spotWhere(s))+'</div>'
      +'<div class="ft-meta">'+tideHtml()+timeHtml(s)+(depth?'<span class="ft-tag">'+S.depthLabel+escapeHtml(depth)+'</span>':'')+'</div>'
      +'<div class="ft-meta" style="margin-top:6px">'+speciesChips+techChips+'</div>'
      +guideHtml(s)
      +'<div class="ft-actions"><a class="ft-maplink" href="'+mapLink(s)+'" target="_blank" rel="noopener">'+S.mapLinkLabel+'</a></div>'
      +'<div class="ft-src">'+S.sourceLabel+'<a href="'+escapeHtml(s.sourceUrl)+'" target="_blank" rel="noopener">'+S.sourceName+'</a></div>'
      +'</div>';
  }

  function showResult(){
    var picks=ranked.slice(shownFrom,shownFrom+3);

    if(!ranked.length){
      $("ft-result-title").textContent=S.noDataTitle;
      $("ft-result-sub").textContent=S.noDataSub;
      $("ft-results").innerHTML="";
      $("ft-more").hidden=true;
    }else{
      var tg=TARGET_BY_ID[answers.target]||TARGET_BY_ID.any;
      if(fallbackLevel!==0){
        $("ft-result-title").textContent=S.fallbackTitle;
        $("ft-result-sub").textContent=S.fallbackSub;
      }else if(!tg.species){
        $("ft-result-title").textContent=S.beginnerTitle;
        $("ft-result-sub").textContent=S.beginnerSub;
      }else{
        $("ft-result-title").textContent=S.targetTitle(tg.label);
        var dc=driveCount(ranked);
        $("ft-result-sub").textContent = dc
          ? S.targetSubDrive(dayLabel(goDate()),dc)
          : S.targetSubFerry;
      }
      var stamp=S.dateStamp(dayLabel(goDate()));
      $("ft-results").innerHTML=stamp+SAFETY_HTML+picks.map(cardHtml).join("");
      showMap(ranked, S.resultMapTitle(ranked.length), S.resultMapSub, picks);
      $("ft-more").hidden = !(ranked.length>shownFrom+3);
      bindCopy();
      fillTideTimes();
    }

    $("stepResult").hidden=false;
    $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
  }

  var BASIC_METHODS=S.basicMethods;
  function methodName(n){ return S.methodName(n); }
  function renderTips(){
    var box=$("ft-tips");
    var tg=TARGET_BY_ID[answers.target]||TARGET_BY_ID.any;
    var picked=BASIC_METHODS.filter(function(m){return m[0]===tg.tech})[0]||BASIC_METHODS[0];
    var others=BASIC_METHODS.filter(function(m){return m[0]!==picked[0]});

    box.innerHTML =
      '<h3 style="margin:0 0 8px">'+S.tipsTitle+'</h3>'
      + S.tipsPicked(escapeHtml(methodName(picked[0])),picked[1])
      + '<div class="ft-tip-item ft-tip-buy"><b>'+S.tipsBuyTitle+'</b>'
      + '<br>'+S.tipsRod(escapeHtml(methodName(picked[0])))
      + '<br>'+S.tipsBaitPrefix+(picked[0]==="루어"||picked[0]==="에깅" ? S.tipsBaitLure : S.tipsBaitWorm)
      + S.tipsVest
      + S.tipsShopNote+'</div>'
      + '<details class="ft-more-tips"><summary>'+S.moreMethodsSummary+'</summary>'
      + others.map(function(m){
          return '<div class="ft-tip-item"><b>'+escapeHtml(methodName(m[0]))+'</b> — '+m[1]+'</div>';
        }).join("")
      + '</details>';
  }

  $("ft-more").addEventListener("click",function(){
    shownFrom+=3;
    showResult();
  });
  $("ft-more").textContent=S.moreNext;
  $("ft-restart").addEventListener("click",function(){
    answers={}; qIdx=0; ranked=[]; shownFrom=0; fallbackLevel=0;
    $("stepResult").hidden=true;
    if($("stepMap"))$("stepMap").hidden=true;
    $("stepQuiz").hidden=false;
    renderQuestion();
    $("stepQuiz").scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("ft-restart").textContent=S.restart;
})();
