/* =========================================================
   방 가구 배치 시뮬레이터 (room-planner) v3
   - 내부 단위: cm  /  타일: 50cm(방 모양)  /  가구 스냅: 10cm
   - 3단계: A.평수입력 → B.방모양(타일) → D.가구·가전 배치(통합)
   - 서버 없음. 모든 계산은 브라우저 안에서만 동작.
   - 다국어: window.ROOM_LANG === "en" 이면 영문. 페이지가 스크립트 로드 전에 설정한다.

   ── 2026-08-01 대개편 ──────────────────────────────────────────────────────
   이전엔 "필수 가전"(싱크대·냉장고 등)이 STEP C 라는 별도 단계에서
   "버튼 누르고 평면도에 드래그해서 영역 그리기"로만 배치됐다. 사용자 피드백:
   "기본가구배치 자체가 필요없어 없애주고 그걸 그냥 침대고르는것처럼
    선택하는곳으로 옮겨줘" — 그래서 STEP C 를 통째로 없애고, 가전·구조물을
   가구와 같은 프리셋 카테고리(PRESETS 맨 뒤)로 합쳤다. 누르면 자동 배치되고
   그 자리에서 끌어 옮기면 된다 — 가구와 완전히 같은 조작이다.
   `state.builtins` 배열도 없앴다. 전부 `state.items` 하나다. 대신 시각적으로
   "고정 설비"임을 구분하려고 `kind:"fixture"` 필드만 남겨 색을 다르게 칠한다.

   또 "뭘 눌러도 강제로 화면이동하지 말라"는 지적으로 `reveal()`의
   `scrollIntoView`를 없앴다. 평면도가 화면 밖으로 나갔을 때만 최소한으로
   그 부분만 다시 보이게 한다(`ensurePlanVisible`).
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("plan"))return;

  /* ---------- 언어 ---------- */
  var LANG=(window.ROOM_LANG==="en")?"en":"ko";
  function nm(o){return o[LANG]!=null?o[LANG]:o.ko}

  var TILE=50, SNAP=10, PAD=50, PYEONG=33058, MIN_PASS=60, MARGIN=3, MAX_GRID=22;

  var state={
    phase:"A",
    gridW:0, gridH:0,
    tileSet:new Set(),      // "c,r" — 방 안쪽 타일
    items:[],               // {id,name,w,h,x,y,rot,cl,kind,ic}
    selId:null,
    tileDrag:null,          // {mode} — B단계 드래그 중 여부
    customUnit:"cm",
    tileMode:"add",         // "add" | "remove" — 방 모양 조정 드래그 모드
    pendingShapeKind:"square", // 팝업에서 고른(아직 미확정) 형태
    uid:1
  };

  /* ---------- 프리셋 — 가구와 가전·구조물이 이제 한 목록이다 ----------
     각 항목의 `ic` 는 js/furniture-icons.js 의 실루엣 키. 없으면 아이콘 없이
     사각형만 그려진다(사용자가 직접 입력한 가구가 그 경우). */
  var PRESETS=[
    {c:{ko:"침대",en:"Bed"},l:[
      {n:{ko:"싱글",en:"Single"},w:100,h:200,cl:60,ic:"bed"},
      {n:{ko:"슈퍼싱글",en:"Super single"},w:110,h:200,cl:60,ic:"bed"},
      {n:{ko:"더블",en:"Double"},w:140,h:200,cl:60,ic:"bed"},
      {n:{ko:"퀸",en:"Queen"},w:150,h:200,cl:60,ic:"bed"},
      {n:{ko:"킹",en:"King"},w:180,h:200,cl:60,ic:"bed"}
    ]},
    {c:{ko:"수납",en:"Storage"},l:[
      {n:{ko:"옷장 1000",en:"Wardrobe 1000"},w:100,h:60,cl:60,ic:"wardrobe"},
      {n:{ko:"옷장 1500",en:"Wardrobe 1500"},w:150,h:60,cl:60,ic:"wardrobe"},
      {n:{ko:"옷장 2000",en:"Wardrobe 2000"},w:200,h:60,cl:60,ic:"wardrobe"},
      {n:{ko:"서랍장",en:"Drawer unit"},w:80,h:45,cl:60,ic:"drawer"},
      {n:{ko:"책장",en:"Bookshelf"},w:80,h:30,cl:45,ic:"bookshelf"},
      {n:{ko:"행거",en:"Hanger rack"},w:120,h:45,cl:45,ic:"hanger"}
    ]},
    {c:{ko:"책상·의자",en:"Desk & chair"},l:[
      {n:{ko:"책상 1200",en:"Desk 1200"},w:120,h:60,cl:70,ic:"desk"},
      {n:{ko:"책상 1400",en:"Desk 1400"},w:140,h:70,cl:70,ic:"desk"},
      {n:{ko:"컴퓨터의자",en:"Office chair"},w:60,h:60,cl:0,ic:"chair"},
      {n:{ko:"화장대",en:"Vanity"},w:90,h:45,cl:60,ic:"vanity"}
    ]},
    {c:{ko:"거실·주방",en:"Living & kitchen"},l:[
      {n:{ko:"소파 2인",en:"Sofa (2-seat)"},w:160,h:85,cl:60,ic:"sofa"},
      {n:{ko:"소파 3인",en:"Sofa (3-seat)"},w:200,h:90,cl:60,ic:"sofa"},
      {n:{ko:"TV장",en:"TV stand"},w:120,h:40,cl:0,ic:"tvstand"},
      {n:{ko:"식탁 2인",en:"Dining table (2)"},w:80,h:80,cl:75,ic:"table"},
      {n:{ko:"식탁 4인",en:"Dining table (4)"},w:120,h:80,cl:75,ic:"table"}
    ]},
    {c:{ko:"가전·구조물",en:"Appliances & fixtures"},fixture:true,l:[
      {n:{ko:"싱크대",en:"Sink"},w:180,h:60,cl:0,ic:"sink"},
      {n:{ko:"냉장고",en:"Fridge"},w:90,h:75,cl:60,ic:"fridge"},
      {n:{ko:"세탁기",en:"Washer"},w:60,h:60,cl:60,ic:"washer"},
      {n:{ko:"신발장",en:"Shoe cabinet"},w:100,h:35,cl:45,ic:"shoecabinet"},
      {n:{ko:"붙박이장",en:"Built-in closet"},w:150,h:60,cl:60,ic:"closet"},
      {n:{ko:"보일러",en:"Boiler"},w:60,h:25,cl:0,ic:"boiler"},
      {n:{ko:"에어컨(벽걸이)",en:"AC (wall-mounted)"},w:90,h:25,cl:0,ic:"aircon"},
      {n:{ko:"가스레인지·인덕션",en:"Stove / induction"},w:60,h:55,cl:60,ic:"stove"},
      {n:{ko:"계량기함·두꺼비집",en:"Meter box"},w:30,h:15,cl:0,ic:"meter"},
      {n:{ko:"배관(PS)박스",en:"Pipe (PS) box"},w:40,h:40,cl:0,ic:"pipebox"},
      {n:{ko:"화장실 문",en:"Bathroom door"},w:70,h:10,cl:70,ic:"door"},
      {n:{ko:"현관문",en:"Entrance door"},w:80,h:10,cl:70,ic:"door"}
    ]}
  ];

  /* ---------- 첫 화면 예시 띠지(마퀴) — "이렇게 만들어볼 수 있다"를 실물로 보여준다 ----------
   * 가짜 이미지를 만드는 대신 **실제 렌더링 코드를 그대로 재사용**한다 — 방 모양 생성
   * (buildShapeTileSet)·자동 배치·아이콘까지 실제 도구가 만드는 것과 완전히 똑같다.
   * `picks` 는 [카테고리 인덱스, 그 안의 항목 인덱스] — PRESETS 를 그대로 가리킨다.
   * 16가지 방 형태를 고루 돌아가게 골랐다. */
  var EXAMPLES=[
    {py:7,    shape:"square",    picks:[[0,3],[2,0],[2,2],[1,0],[1,4],[4,3]]},
    {py:6,    shape:"tall",      picks:[[0,0],[2,0],[1,3],[1,4],[4,3]]},
    {py:10,   shape:"wide",      picks:[[3,1],[3,2],[3,4],[4,0],[4,1],[4,2]]},
    {py:6.5,  shape:"corner-tr", picks:[[4,0],[4,1],[4,7],[0,0],[1,3]]},
    {py:7,    shape:"square",    picks:[[0,3],[2,3],[1,1],[1,4],[4,3]]},
    {py:6,    shape:"verywide",  picks:[[2,0],[2,2],[2,3],[1,4],[1,3]]},
    {py:5,    shape:"verytall",  picks:[[0,1],[2,1],[1,4],[1,3],[4,3]]},
    {py:11,   shape:"corner-tl", picks:[[3,1],[3,2],[3,4],[4,0],[4,1],[4,7]]},
    {py:7,    shape:"corner-br", picks:[[0,2],[2,0],[4,0],[1,3],[4,3]]},
    {py:12,   shape:"ushape",    picks:[[3,1],[0,3],[1,0],[4,1],[4,0],[1,5]]},
    {py:8,    shape:"tshape",    picks:[[0,0],[4,0],[4,1],[4,3],[1,3]]},
    {py:6.5,  shape:"alcove",    picks:[[0,1],[2,0],[1,5],[1,3],[4,6]]},
    {py:7,    shape:"nick",      picks:[[0,3],[1,1],[2,3],[1,4],[4,3]]},
    {py:10,   shape:"octagon",   picks:[[3,0],[3,3],[1,4],[0,3],[4,1]]},
    {py:8,    shape:"stair",     picks:[[0,2],[2,1],[4,2],[1,3],[4,3]]},
    {py:11,   shape:"hall",      picks:[[4,11],[4,3],[0,3],[1,0],[3,2],[4,1]]},
    {py:13,   shape:"verywide",  picks:[[3,1],[3,2],[0,4],[4,2],[1,1],[4,0]]},
    {py:12,   shape:"square",    picks:[[0,4],[2,1],[1,2],[2,3],[4,1],[1,5]]},
    {py:7,    shape:"tall",      picks:[[0,3],[4,1],[4,0],[1,3],[4,3]]},
    {py:9,    shape:"wide",      picks:[[0,2],[2,0],[1,3],[3,2],[4,1]]}
  ];

  /* ---------- 문구 (동적으로 만들어지는 것만 — 정적 HTML은 페이지별로 직접 번역) ---------- */
  var T={
    ko:{
      phaseShape:"모양 조정 중", phasePlace:"가구 배치 중",
      genFail:"방이 너무 작습니다. 타일을 4칸 이상 남겨주세요.",
      shareFirst:"먼저 방 모양을 확정해 주세요.",
      restartConfirm:"처음부터 다시 시작할까요? 배치한 내용이 모두 사라집니다.",
      shareCopied:"✓ 링크 복사됨",
      shareBtn:"🔗 배치도 링크 복사",
      copyPrompt:"링크를 복사하세요:",
      emptyDiag:"가전·가구를 추가하면 배치 진단이 시작됩니다.",
      diagOk:"문제 없는 배치입니다.",
      occBad:"가구가 많아 답답할 수 있어요", occWarn:"적당히 채워진 편", occGood:"여유로운 편",
      hintOut:"방 밖이에요", hintOverlap:"겹쳤어요", hintGood:"좋은 위치예요",
      hintDelete:"여기서 놓으면 삭제돼요", hintPassage:function(g){return "통로가 "+g+"cm — 좁아요"},
      msgOutside:function(n){return "<b>"+n+"</b>이(가) 방 밖으로 나가 있습니다."},
      msgOverlap:function(a,b){return "<b>"+a+"</b>와(과) <b>"+b+"</b>가 겹칩니다."},
      msgClearance:function(n,cl){return "<b>"+n+"</b> 앞 <b>"+cl+"cm</b> 공간이 부족합니다."},
      msgPassage:function(a,b,g){return "<b>"+a+"</b>–<b>"+b+"</b> 사이 통로가 <b>"+g+"cm</b>입니다. (최소 60cm 권장)"},
      planSize:function(m2,py){return m2.toFixed(1)+"m² · 약 "+py.toFixed(1)+"평"},
      pyOut:function(w,h){return "약 "+w.toFixed(1)+"m × "+h.toFixed(1)+"m (근사)"},
      defName:"가구",
      coachPreset:"가구를 눌러보세요 — 바로 추가돼요",
      coachDrag:"평면도에서 끌어서 옮겨보세요",
      coachDiag:"여기서 통로·겹침을 확인하세요",
      exampleLead:"이렇게 만들어볼 수 있어요",
      exampleCap:function(py){return py+"평 예시"}
    },
    en:{
      phaseShape:"Adjusting shape", phasePlace:"Placing furniture",
      genFail:"The room is too small. Please keep at least 4 tiles.",
      shareFirst:"Please finish setting the room shape first.",
      restartConfirm:"Start over? Everything you've placed will be cleared.",
      shareCopied:"✓ Link copied",
      shareBtn:"🔗 Copy layout link",
      copyPrompt:"Copy this link:",
      emptyDiag:"Add appliances and furniture to start the diagnosis.",
      diagOk:"No issues with this layout.",
      occBad:"It might feel cramped with this much furniture", occWarn:"Moderately filled", occGood:"Nice and spacious",
      hintOut:"Outside the room", hintOverlap:"Overlapping", hintGood:"Good spot",
      hintDelete:"Drop here to delete", hintPassage:function(g){return g+"cm passage — too narrow"},
      msgOutside:function(n){return "<b>"+n+"</b> is outside the room."},
      msgOverlap:function(a,b){return "<b>"+a+"</b> and <b>"+b+"</b> overlap."},
      msgClearance:function(n,cl){return "<b>"+n+"</b> needs <b>"+cl+"cm</b> of clear space in front."},
      msgPassage:function(a,b,g){return "The gap between <b>"+a+"</b> and <b>"+b+"</b> is <b>"+g+"cm</b>. (60cm+ recommended)"},
      planSize:function(m2,py){return m2.toFixed(1)+"m² (~"+(m2*10.7639).toFixed(0)+" sq ft)"},
      pyOut:function(w,h){return "approx. "+w.toFixed(1)+" × "+h.toFixed(1)+" m"},
      defName:"Furniture",
      coachPreset:"Tap a piece — it's added instantly",
      coachDrag:"Drag it on the plan to move it",
      coachDiag:"Check passages and overlaps here",
      exampleLead:"Here's what you can build",
      exampleCap:function(py){return "Example (" + py + " py)"}
    }
  };
  var S=T[LANG];

  var SHAPE_KINDS=[
    {k:"square",label:{ko:"정사각형에 가깝게",en:"Close to square"}},
    {k:"wide",label:{ko:"가로로 넓게",en:"Wide"}},
    {k:"tall",label:{ko:"세로로 길게",en:"Long and narrow"}},
    {k:"verywide",label:{ko:"납작하고 넓게",en:"Very wide, flat"}},
    {k:"verytall",label:{ko:"좁고 긴 복도형",en:"Narrow hallway shape"}},
    {k:"corner-tr",label:{ko:"ㄱ자형(우상단 절개)",en:"L-shape (top-right cut)"}},
    {k:"corner-tl",label:{ko:"ㄴ자형(좌상단 절개)",en:"L-shape (top-left cut)"}},
    {k:"corner-br",label:{ko:"ㄱ자형(우하단 절개)",en:"L-shape (bottom-right cut)"}},
    {k:"corner-bl",label:{ko:"ㄴ자형(좌하단 절개)",en:"L-shape (bottom-left cut)"}},
    {k:"ushape",label:{ko:"ㄷ자형(양쪽 절개)",en:"U-shape (both sides cut)"}},
    {k:"tshape",label:{ko:"T자형(통로+안쪽 방)",en:"T-shape (hallway + inner room)"}},
    {k:"alcove",label:{ko:"알코브형(작은 돌출부)",en:"Alcove (small bump-out)"}},
    {k:"nick",label:{ko:"모서리만 살짝 깎인 형",en:"Slightly clipped corner"}},
    {k:"octagon",label:{ko:"네 모서리가 깎인 형",en:"All four corners clipped"}},
    {k:"stair",label:{ko:"계단식 모서리",en:"Stepped corners"}},
    {k:"hall",label:{ko:"현관 복도가 딸린 형",en:"With entrance hallway"}}
  ];

  /* ---------- 기하 헬퍼 ---------- */
  function ew(it){return it.rot%180===0?it.w:it.h}
  function eh(it){return it.rot%180===0?it.h:it.w}
  function rect(it){return{x:it.x,y:it.y,w:ew(it),h:eh(it)}}
  function overlap(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h}
  function inter(a,b){var ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);var oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);return ox>0&&oy>0?ox*oy:0}
  function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v))}
  function snap(v){return Math.round(v/SNAP)*SNAP}
  function tileKey(c,r){return c+","+r}
  function worldW(){return state.gridW*TILE}
  function worldH(){return state.gridH*TILE}

  /* 실제 방이 차지하는 타일들의 최소 사각형(cm). gridW/gridH는 방 사방에
     MARGIN(3타일=1.5m)씩 여백을 더한 '편집 캔버스' 크기라서, 이걸 방 크기로
     쓰면 안 된다 — 9타일(4.5m) 방이 15타일(7.5m)로 표시되던 원인.
     비정형 방(ㄱ자 등)이면 이 값은 '가장 넓은 곳 기준'이 된다. */
  function roomBBox(){
    var minC=Infinity,minR=Infinity,maxC=-Infinity,maxR=-Infinity;
    state.tileSet.forEach(function(k){
      var p=k.split(","),c=+p[0],r=+p[1];
      if(c<minC)minC=c; if(c>maxC)maxC=c;
      if(r<minR)minR=r; if(r>maxR)maxR=r;
    });
    if(minC===Infinity)return null;
    return {x:minC*TILE, y:minR*TILE, w:(maxC-minC+1)*TILE, h:(maxR-minR+1)*TILE};
  }
  /* 방이 직사각형이 아니면(타일 수 < bbox 타일 수) 치수는 근사값이다. */
  function roomIsRect(bb){
    return !!bb && state.tileSet.size === (bb.w/TILE)*(bb.h/TILE);
  }

  function inRoom(r){ // 사각형 r(cm)이 방(타일셋) 안에 있는지 근사 판정: 모서리+중앙 샘플
    var pts=[[r.x+1,r.y+1],[r.x+r.w-1,r.y+1],[r.x+1,r.y+r.h-1],[r.x+r.w-1,r.y+r.h-1],[r.x+r.w/2,r.y+r.h/2]];
    for(var i=0;i<pts.length;i++){
      var c=Math.floor(pts[i][0]/TILE), row=Math.floor(pts[i][1]/TILE);
      if(!state.tileSet.has(tileKey(c,row)))return false;
    }
    return true;
  }
  function clearZone(it){
    if(!it.cl)return null;
    var r=rect(it),c=it.cl;
    if(it.rot===0)  return{x:r.x,y:r.y+r.h,w:r.w,h:c};
    if(it.rot===180)return{x:r.x,y:r.y-c,w:r.w,h:c};
    if(it.rot===90) return{x:r.x-c,y:r.y,w:c,h:r.h};
    return{x:r.x+r.w,y:r.y,w:c,h:r.h};
  }
  function frontEdge(it){
    var r=rect(it);
    if(it.rot===0)  return[r.x,r.y+r.h,r.x+r.w,r.y+r.h];
    if(it.rot===180)return[r.x,r.y,r.x+r.w,r.y];
    if(it.rot===90) return[r.x,r.y,r.x,r.y+r.h];
    return[r.x+r.w,r.y,r.x+r.w,r.y+r.h];
  }
  function passGap(a,b){
    var ax2=a.x+a.w,ay2=a.y+a.h,bx2=b.x+b.w,by2=b.y+b.h;
    if(Math.min(ay2,by2)-Math.max(a.y,b.y)>0){var gx=Math.max(b.x-ax2,a.x-bx2);if(gx>0)return gx;}
    if(Math.min(ax2,bx2)-Math.max(a.x,b.x)>0){var gy=Math.max(b.y-ay2,a.y-by2);if(gy>0)return gy;}
    return null;
  }
  function wallEdges(){ // 타일셋 경계 → 벽 선분 배열
    var edges=[];
    state.tileSet.forEach(function(k){
      var p=k.split(","),c=+p[0],r=+p[1];
      var x=c*TILE,y=r*TILE;
      if(!state.tileSet.has(tileKey(c,r-1)))edges.push([x,y,x+TILE,y]);
      if(!state.tileSet.has(tileKey(c,r+1)))edges.push([x,y+TILE,x+TILE,y+TILE]);
      if(!state.tileSet.has(tileKey(c-1,r)))edges.push([x,y,x,y+TILE]);
      if(!state.tileSet.has(tileKey(c+1,r)))edges.push([x+TILE,y,x+TILE,y+TILE]);
    });
    return edges;
  }

  /* ---------- SVG 렌더 ---------- */
  var svg=$("plan");
  function el(tag,attrs,parent){
    var e=document.createElementNS("http://www.w3.org/2000/svg",tag);
    for(var k in attrs)e.setAttribute(k,attrs[k]);
    if(parent)parent.appendChild(e);
    return e;
  }
  function render(){
    var W=worldW(),H=worldH();
    svg.setAttribute("viewBox",(-PAD)+" "+(-PAD)+" "+(W+PAD*2)+" "+(H+PAD*2));
    svg.innerHTML="";

    if(state.phase==="B"){
      var g=el("g",{},svg);
      for(var r=0;r<state.gridH;r++)for(var c=0;c<state.gridW;c++){
        var on=state.tileSet.has(tileKey(c,r));
        el("rect",{x:c*TILE,y:r*TILE,width:TILE,height:TILE,class:"tile "+(on?"on":"off"),"data-c":c,"data-r":r},g);
      }
    }else{
      var gf=el("g",{},svg);
      state.tileSet.forEach(function(k){
        var p=k.split(","),c=+p[0],rr=+p[1];
        el("rect",{x:c*TILE,y:rr*TILE,width:TILE,height:TILE,class:"room-fill"},gf);
      });
    }

    // 앞 여유 구역
    var gc=el("g",{},svg);
    state.items.forEach(function(it){var z=clearZone(it);if(z)el("rect",{x:z.x,y:z.y,width:z.w,height:z.h,class:"clear-zone"},gc);});

    // 가구·가전 — 통합된 하나의 목록. kind==="fixture" 만 색을 다르게 칠한다(고정 설비 구분용)
    var gfu=el("g",{},svg);
    state.items.forEach(function(it){
      var r2=rect(it),bad=it._bad;
      var cls="furn"+(it.kind==="fixture"?" is-fixture":"")+(it.id===state.selId?" sel":"")+(bad?" bad":"");
      var grp=el("g",{class:cls,"data-id":it.id},gfu);
      el("rect",{x:r2.x,y:r2.y,width:r2.w,height:r2.h},grp);
      // 대표 가구(사이즈가 정해진 프리셋) 실루엣 — 사각형만 봐서는 뭔지 안 읽히던 걸 한눈에
      if(window.FURN_ICONS&&it.ic&&window.FURN_ICONS[it.ic]){
        var ic=el("svg",{x:r2.x,y:r2.y,width:r2.w,height:r2.h,viewBox:"0 0 100 100",preserveAspectRatio:"none",class:"furn-ico"},grp);
        ic.innerHTML=window.FURN_ICONS[it.ic];
      }
      var fe=frontEdge(it);
      if(it.cl)el("line",{x1:fe[0],y1:fe[1],x2:fe[2],y2:fe[3],class:"front"},grp);
      var t=el("text",{x:r2.x+r2.w/2,y:r2.y+r2.h/2-11},grp); t.textContent=it.name;
      var s=el("text",{x:r2.x+r2.w/2,y:r2.y+r2.h/2+12,class:"sz"},grp); s.textContent=ew(it)+"×"+eh(it);
    });

    // 벽
    var go=el("g",{},svg);
    wallEdges().forEach(function(e){el("line",{x1:e[0],y1:e[1],x2:e[2],y2:e[3],class:"room-wall"},go);});

    if(state.phase!=="B"){
      /* 치수는 캔버스가 아니라 실제 방 범위를 재고, 라벨도 그 위에 놓는다. */
      var bb=roomBBox();
      if(bb){
        var approx=roomIsRect(bb)?"":(LANG==="en"?"~":"약 ");  // 비정형 방이면 가장 넓은 곳 기준임을 표시
        var d1=el("text",{x:bb.x+bb.w/2,y:bb.y-24,class:"dim-txt"},svg);
        d1.textContent=approx+(bb.w/100).toFixed(1)+"m";
        var ly=bb.y+bb.h/2, lx=bb.x-26;
        var d2=el("text",{x:lx,y:ly,class:"dim-txt",transform:"rotate(-90 "+lx+" "+ly+")"},svg);
        d2.textContent=approx+(bb.h/100).toFixed(1)+"m";
      }
    }
  }

  /* ---------- 검증(핵심 차별화) ---------- */
  function allBlocks(){
    return state.items.map(function(it){return{name:it.name,r:rect(it),ref:it}});
  }
  function validate(){
    var msgs=[],blocks=allBlocks();
    state.items.forEach(function(it){it._bad=false});
    blocks.forEach(function(b){
      if(!inRoom(b.r)){ b.ref._bad=true; msgs.push({t:"err",m:S.msgOutside(b.name)}); }
    });
    for(var a=0;a<blocks.length;a++)for(var bI=a+1;bI<blocks.length;bI++){
      if(inter(blocks[a].r,blocks[bI].r)>0){
        blocks[a].ref._bad=true; blocks[bI].ref._bad=true;
        msgs.push({t:"err",m:S.msgOverlap(blocks[a].name,blocks[bI].name)});
      }
    }
    state.items.forEach(function(it){
      var z=clearZone(it); if(!z)return;
      var blocked=!inRoom(z);
      blocks.forEach(function(b){if(b.ref!==it&&inter(z,b.r)>0)blocked=true;});
      if(blocked)msgs.push({t:"warn",m:S.msgClearance(it.name,it.cl)});
    });
    var seen={};
    for(var i=0;i<blocks.length;i++)for(var j=i+1;j<blocks.length;j++){
      var gp=passGap(blocks[i].r,blocks[j].r);
      if(gp!==null&&gp>=5&&gp<MIN_PASS){
        var k=blocks[i].name+"|"+blocks[j].name;
        if(!seen[k]){seen[k]=1;msgs.push({t:"warn",m:S.msgPassage(blocks[i].name,blocks[j].name,Math.round(gp))});}
      }
    }
    var used=0; blocks.forEach(function(b){used+=b.r.w*b.r.h});
    var roomArea=state.tileSet.size*TILE*TILE;
    var pct=roomArea>0?used/roomArea*100:0;
    if(blocks.length&&!msgs.length)msgs.push({t:"ok",m:S.diagOk});
    return{msgs:msgs,pct:pct};
  }
  function renderDiag(){
    var v=validate();
    var box=$("diag");
    if(box){
      box.innerHTML="";
      if(!state.items.length){
        box.innerHTML='<div class="diag-item ok"><span class="ic">💡</span><span>'+S.emptyDiag+'</span></div>';
      }else{
        v.msgs.slice(0,14).forEach(function(m){
          var d=document.createElement("div");
          d.className="diag-item "+m.t;
          d.innerHTML='<span class="ic">'+(m.t==="err"?"⛔":m.t==="warn"?"⚠️":"✅")+'</span><span>'+m.m+'</span>';
          box.appendChild(d);
        });
      }
    }
    var pct=Math.round(v.pct);
    if($("occ-v")){
      $("occ-v").textContent=pct+"%";
      var f=$("occ-f"); f.style.width=Math.min(100,pct)+"%";
      f.className="occ-fill"+(pct>55?" bad":pct>38?" warn":"");
      $("occ-note").textContent=pct>55?S.occBad:pct>38?S.occWarn:S.occGood;
    }
    render();
    renderList();
  }
  function renderList(){
    var ul=$("ilist"); if(!ul)return;
    ul.innerHTML="";
    state.items.forEach(function(it){
      var li=document.createElement("li");
      li.className=(it.id===state.selId)?"on":"";
      li.innerHTML='<span class="nm">'+it.name+'</span><span class="sz">'+ew(it)+'×'+eh(it)+'cm</span>';
      li.addEventListener("click",function(){state.selId=it.id;syncSel();renderDiag();});
      ul.appendChild(li);
    });
    if($("ilist-empty"))$("ilist-empty").hidden=state.items.length>0;
  }
  function syncSel(){
    var bar=$("sel-bar");
    var it=state.items.filter(function(x){return x.id===state.selId})[0];
    if(!it){bar.hidden=true;return;}
    bar.hidden=false;
    $("sel-nm").textContent=it.name+" ("+ew(it)+"×"+eh(it)+"cm)";
  }

  /* ---------- 드래그 힌트(배지) ---------- */
  var hintEl=$("drag-hint"), containerEl=document.querySelector(".plan-sticky-in");
  function showHint(clientX,clientY,text,level){
    if(!hintEl)return;
    var cRect=containerEl.getBoundingClientRect();
    hintEl.style.left=(clientX-cRect.left)+"px";
    hintEl.style.top=(clientY-cRect.top)+"px";
    hintEl.textContent=text;
    hintEl.className="drag-hint "+level;
    hintEl.hidden=false;
  }
  function hideHint(){ if(hintEl)hintEl.hidden=true; }
  function itemHint(rectObj,excludeRef){
    if(!inRoom(rectObj))return{t:S.hintOut,l:"err"};
    var blocks=allBlocks().filter(function(b){return b.ref!==excludeRef});
    for(var i=0;i<blocks.length;i++){ if(inter(rectObj,blocks[i].r)>0)return{t:S.hintOverlap,l:"err"}; }
    for(var j=0;j<blocks.length;j++){
      var gp=passGap(rectObj,blocks[j].r);
      if(gp!==null&&gp>=5&&gp<MIN_PASS)return{t:S.hintPassage(Math.round(gp)),l:"warn"};
    }
    return{t:S.hintGood,l:"ok"};
  }

  /* ---------- 화면 이동은 최소한으로 ────────────────────────────────────
     예전엔 reveal() 이 새로 나타난 섹션으로 scrollIntoView 를 강제했다.
     사용자 피드백: "뭘 눌러도 강제로 화면이동하지말고 해당 위치에 그대로있게
     만들거나, 평면도가 보이는 선에서만 화면이동해." 그래서 새 섹션으로는
     아예 스크롤하지 않는다 — 사용자가 있던 자리 그대로 둔다. 다만 평면도
     (plan-sticky)가 화면 밖으로 나가 있으면, 그것만 최소한으로 다시 보이게
     당긴다(block:'nearest' — 맨 위로 점프하지 않는다). */
  function ensurePlanVisible(){
    var el2=document.querySelector(".plan-sticky-in");
    if(!el2)return;
    var r=el2.getBoundingClientRect();
    if(r.bottom<60||r.top>window.innerHeight-60){
      el2.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  }

  /* ---------- 말풍선 코치마크 ────────────────────────────────────────────
     "어떤 버튼을 누르면 되는지 조그만 말풍선으로 알려주던지 해" — 사용자당
     한 번만(localStorage), 대상 요소 근처에 뜨고, 클릭하거나 6초 지나면 사라진다. */
  function coachOnce(key,targetEl,text){
    if(!targetEl)return;
    var lsKey="rp.coach."+key;
    if(localStorage.getItem(lsKey))return;
    localStorage.setItem(lsKey,"1");
    var box=document.createElement("div");
    box.className="coach"; box.textContent=text;
    document.body.appendChild(box);
    function place(){
      var r=targetEl.getBoundingClientRect();
      var below=(r.bottom+70<=window.innerHeight);
      box.style.left=Math.max(10,Math.min(window.innerWidth-238,r.left))+"px";
      if(below){box.style.top=(r.bottom+10)+"px";box.className="coach below";}
      else{box.style.top=Math.max(10,r.top-58)+"px";box.className="coach above";}
    }
    place();
    var onScroll=function(){place()};
    window.addEventListener("scroll",onScroll,true);
    window.addEventListener("resize",onScroll);
    var timer;
    function remove(){
      clearTimeout(timer);
      window.removeEventListener("scroll",onScroll,true);
      window.removeEventListener("resize",onScroll);
      document.removeEventListener("click",onDocClick,true);
      if(box.parentNode)box.parentNode.removeChild(box);
    }
    function onDocClick(){remove()}
    timer=setTimeout(remove,6000);
    setTimeout(function(){document.addEventListener("click",onDocClick,true)},80);
  }

  /* ---------- 온보딩 ────────────────────────────────────────────────────
     "어려우면 안돼... 접속하자마자 가상 화면으로 어떻게 작동하는 사이트인지
     아주 짧은 가이드를 보여주고 직접해보기 버튼을 눌러서 해보게끔" —
     첫 방문에만 한 화면짜리 안내를 STEP A1 팝업보다 먼저 띄운다. */
  var pendingRevealStepA=false;
  function showOnboarding(){ if($("onboard-modal"))$("onboard-modal").hidden=false; }
  if($("onboard-cta")){
    $("onboard-cta").addEventListener("click",function(){
      $("onboard-modal").hidden=true;
      localStorage.setItem("rp.onboarded","1");
      if(pendingRevealStepA){$("stepA1-modal").hidden=false;pendingRevealStepA=false;}
    });
  }
  if($("onb-again-btn"))$("onb-again-btn").addEventListener("click",showOnboarding);

  /* ---------- STEP A1→A2: 평수(+ 띠지) → 방 모양 → 방 생성 ────────────────
     사용자 피드백: "띠지가 하단에있어서 안보이니 먼저 첫 화면에선 평수만
     고르게하고 띠지를 주로 보여주자 / 그다음 화면에서 형태고르고 원래방식
     대로 진행되게끔." 16종 형태 그리드 밑에 띠지를 붙였더니 스크롤을 한참
     내려야 보였다. 그래서 화면을 둘로 쪼갰다 —
       A1: 평수 입력 + 띠지가 화면의 주인공(스크롤 없이 바로 보임)
       A2: 방 모양 그리드 — 예전 STEP A와 완전히 같은 방식으로 진행 */
  function roomPreview(py){
    var area=py*PYEONG;
    var cols=Math.max(3,Math.round(Math.sqrt(area)/TILE));
    var rows=Math.max(3,Math.round(area/(cols*TILE)/TILE));
    return{cols:cols,rows:rows,w:cols*TILE,h:rows*TILE};
  }
  function updPyOut(){
    var py=+$("py").value||0;
    if(py<=0){$("py-out").textContent="–";return;}
    var p=roomPreview(py);
    $("py-out").textContent=S.pyOut(p.w/100,p.h/100);
  }
  $("py").addEventListener("input",function(){
    updPyOut();
    var py=+$("py").value||0;
    if(py>0)renderShapeGrid(py*PYEONG);
  });

  if($("pyeong-next")){
    $("pyeong-next").addEventListener("click",function(){
      var py=+$("py").value||0; if(py<=0){$("py").focus();return;}
      renderShapeGrid(py*PYEONG);
      if($("stepA1-modal"))$("stepA1-modal").hidden=true;
      if($("stepA2-modal"))$("stepA2-modal").hidden=false;
    });
  }

  $("gen-room").addEventListener("click",function(){
    var py=+$("py").value||0; if(py<=0){$("py").focus();return;}
    if($("stepA2-modal"))$("stepA2-modal").hidden=true;
    if($("hero"))$("hero").hidden=true;
    if($("privacy-note"))$("privacy-note").hidden=true;
    applyShape(py*PYEONG,state.pendingShapeKind);
    reveal("stepShape");
  });

  /* ---------- 예시 띠지 ---------- */
  /**
   * 예시 하나를 실제 렌더링 코드로 그려 카드 하나(<div class="example-card">)로 만든다.
   * `buildShapeTileSet`(방 형태 생성)와 `inter`(겹침 판정)는 그대로 재사용한다 —
   * 진짜 도구가 만드는 배치와 100% 같은 결과가 나온다는 뜻이다(가짜 목업이 아니다).
   * 방 범위는 roomBBox() 와 같은 방식으로 **꽉 채워서** 자른다 — 작은 카드 안에서
   * 여백 낭비 없이 방이 크게 보여야 "충분한 사이즈"라는 요청을 만족한다.
   */
  function exampleCard(cfg){
    var built=buildShapeTileSet(cfg.py*PYEONG,cfg.shape);
    var ts=built.tileSet, gw=built.gridW, gh=built.gridH;

    var minC=Infinity,minR=Infinity,maxC=-Infinity,maxR=-Infinity;
    ts.forEach(function(k){
      var p=k.split(","),c=+p[0],r=+p[1];
      if(c<minC)minC=c; if(c>maxC)maxC=c; if(r<minR)minR=r; if(r>maxR)maxR=r;
    });
    var bb={x:minC*TILE,y:minR*TILE,w:(maxC-minC+1)*TILE,h:(maxR-minR+1)*TILE};

    var items=[];
    cfg.picks.forEach(function(pick){
      var p=PRESETS[pick[0]].l[pick[1]], isFixture=!!PRESETS[pick[0]].fixture;
      var it={w:p.w,h:p.h,x:0,y:0,kind:isFixture?"fixture":"furn",ic:p.ic||null};
      var placed=false;
      for(var r=0;r<gh*TILE-p.h+1&&!placed;r+=SNAP)for(var c=0;c<gw*TILE-p.w+1&&!placed;c+=SNAP){
        var rr={x:c,y:r,w:p.w,h:p.h};
        var pts=[[rr.x+1,rr.y+1],[rr.x+rr.w-1,rr.y+1],[rr.x+1,rr.y+rr.h-1],[rr.x+rr.w-1,rr.y+rr.h-1],[rr.x+rr.w/2,rr.y+rr.h/2]];
        var okIn=true;
        for(var pi=0;pi<pts.length;pi++){
          var cc=Math.floor(pts[pi][0]/TILE), rw=Math.floor(pts[pi][1]/TILE);
          if(!ts.has(tileKey(cc,rw))){okIn=false;break;}
        }
        if(okIn&&!items.some(function(o){return inter(rr,o)>0})){it.x=c;it.y=r;placed=true;}
      }
      if(placed)items.push(it);
    });

    var pad=TILE*0.7;
    var svgEl=el("svg",{
      viewBox:(bb.x-pad)+" "+(bb.y-pad)+" "+(bb.w+pad*2)+" "+(bb.h+pad*2),
      class:"example-svg","aria-hidden":"true",focusable:"false"
    });
    var gf=el("g",{},svgEl);
    ts.forEach(function(k){
      var p=k.split(","),c=+p[0],r=+p[1];
      el("rect",{x:c*TILE,y:r*TILE,width:TILE,height:TILE,class:"room-fill"},gf);
    });
    var gfu=el("g",{},svgEl);
    items.forEach(function(it){
      var grp=el("g",{class:"furn"+(it.kind==="fixture"?" is-fixture":"")},gfu);
      el("rect",{x:it.x,y:it.y,width:it.w,height:it.h},grp);
      if(window.FURN_ICONS&&it.ic&&window.FURN_ICONS[it.ic]){
        var ic=el("svg",{x:it.x,y:it.y,width:it.w,height:it.h,viewBox:"0 0 100 100",preserveAspectRatio:"none",class:"furn-ico"},grp);
        ic.innerHTML=window.FURN_ICONS[it.ic];
      }
    });
    var go=el("g",{},svgEl);
    ts.forEach(function(k){
      var p=k.split(","),c=+p[0],r=+p[1],x=c*TILE,y=r*TILE;
      if(!ts.has(tileKey(c,r-1)))el("line",{x1:x,y1:y,x2:x+TILE,y2:y,class:"room-wall"},go);
      if(!ts.has(tileKey(c,r+1)))el("line",{x1:x,y1:y+TILE,x2:x+TILE,y2:y+TILE,class:"room-wall"},go);
      if(!ts.has(tileKey(c-1,r)))el("line",{x1:x,y1:y,x2:x,y2:y+TILE,class:"room-wall"},go);
      if(!ts.has(tileKey(c+1,r)))el("line",{x1:x+TILE,y1:y,x2:x+TILE,y2:y+TILE,class:"room-wall"},go);
    });

    var card=document.createElement("div"); card.className="example-card";
    card.appendChild(svgEl);
    var cap=document.createElement("span"); cap.className="example-cap"; cap.textContent=S.exampleCap(cfg.py);
    card.appendChild(cap);
    return card;
  }

  /** 세트를 두 번 이어붙여 넣는다 — CSS가 -50% 만큼만 옮기면 이음매 없이 반복된다. */
  function renderExamples(){
    var track=$("example-track"); if(!track)return;
    for(var pass=0;pass<2;pass++){
      EXAMPLES.forEach(function(cfg){ track.appendChild(exampleCard(cfg)); });
    }
    if($("example-lead"))$("example-lead").textContent=S.exampleLead;
  }

  /* ---------- 방 형태 프리셋(공간 감각 없어도 고를 수 있게, 16종) ---------- */
  function baseDims(area,ratio){
    var cols=Math.max(3,Math.round(Math.sqrt(area*ratio)/TILE));
    var rows=Math.max(3,Math.round(area/(cols*TILE)/TILE));
    return{cols:cols,rows:rows};
  }
  function fullCells(cols,rows){
    var cs=[]; for(var r=0;r<rows;r++)for(var c=0;c<cols;c++)cs.push([c,r]); return cs;
  }
  function cutCorner(cells,cols,rows,corner,fw,fh){
    var cw=Math.max(1,Math.round(cols*fw)), ch=Math.max(1,Math.round(rows*fh));
    return cells.filter(function(p){
      var c=p[0],r=p[1];
      if(corner==="tr")return !(c>=cols-cw&&r<ch);
      if(corner==="tl")return !(c<cw&&r<ch);
      if(corner==="br")return !(c>=cols-cw&&r>=rows-ch);
      return !(c<cw&&r>=rows-ch); // bl
    });
  }
  function shapeGen(area,kind){
    var d;
    if(kind==="wide"){d=baseDims(area,1.6);return{cells:fullCells(d.cols,d.rows),cols:d.cols,rows:d.rows};}
    if(kind==="tall"){d=baseDims(area,1/1.6);return{cells:fullCells(d.cols,d.rows),cols:d.cols,rows:d.rows};}
    if(kind==="verywide"){d=baseDims(area,2.4);return{cells:fullCells(d.cols,d.rows),cols:d.cols,rows:d.rows};}
    if(kind==="verytall"){d=baseDims(area,1/2.4);return{cells:fullCells(d.cols,d.rows),cols:d.cols,rows:d.rows};}
    if(kind==="corner-tr"){d=baseDims(area,1.15);return{cells:cutCorner(fullCells(d.cols,d.rows),d.cols,d.rows,"tr",.42,.42),cols:d.cols,rows:d.rows};}
    if(kind==="corner-tl"){d=baseDims(area,1.15);return{cells:cutCorner(fullCells(d.cols,d.rows),d.cols,d.rows,"tl",.42,.42),cols:d.cols,rows:d.rows};}
    if(kind==="corner-br"){d=baseDims(area,1.15);return{cells:cutCorner(fullCells(d.cols,d.rows),d.cols,d.rows,"br",.42,.42),cols:d.cols,rows:d.rows};}
    if(kind==="corner-bl"){d=baseDims(area,1.15);return{cells:cutCorner(fullCells(d.cols,d.rows),d.cols,d.rows,"bl",.42,.42),cols:d.cols,rows:d.rows};}
    if(kind==="ushape"){
      d=baseDims(area,1.15);
      var uc=cutCorner(fullCells(d.cols,d.rows),d.cols,d.rows,"tl",.3,.35);
      uc=cutCorner(uc,d.cols,d.rows,"tr",.3,.35);
      return{cells:uc,cols:d.cols,rows:d.rows};
    }
    if(kind==="tshape"){
      d=baseDims(area,1.15);
      var tc=[], topRows=Math.max(1,Math.round(d.rows*0.4));
      var s0=Math.round(d.cols*0.28), s1=d.cols-s0;
      for(var r=0;r<d.rows;r++)for(var c=0;c<d.cols;c++){
        if(r<topRows||(c>=s0&&c<s1))tc.push([c,r]);
      }
      return{cells:tc,cols:d.cols,rows:d.rows};
    }
    if(kind==="alcove"){
      d=baseDims(area,0.85);
      var bw=Math.max(1,Math.round(d.cols*0.28)), bh=Math.max(1,Math.round(d.rows*0.42));
      var br0=Math.round((d.rows-bh)/2);
      var ac=fullCells(d.cols,d.rows);
      for(var rr=br0;rr<br0+bh;rr++)for(var cc=d.cols;cc<d.cols+bw;cc++)ac.push([cc,rr]);
      return{cells:ac,cols:d.cols+bw,rows:d.rows};
    }
    if(kind==="nick"){d=baseDims(area,1);return{cells:cutCorner(fullCells(d.cols,d.rows),d.cols,d.rows,"tr",.16,.16),cols:d.cols,rows:d.rows};}
    if(kind==="octagon"){
      d=baseDims(area,1);
      var oc=fullCells(d.cols,d.rows);
      ["tl","tr","bl","br"].forEach(function(cn){oc=cutCorner(oc,d.cols,d.rows,cn,.16,.16)});
      return{cells:oc,cols:d.cols,rows:d.rows};
    }
    if(kind==="stair"){
      d=baseDims(area,1.1);
      var s1w=Math.round(d.cols*0.45), s1h=Math.round(d.rows*0.22);
      var s2w=Math.round(d.cols*0.22), s2h=Math.round(d.rows*0.45);
      var stc=fullCells(d.cols,d.rows).filter(function(p){
        var c=p[0],r=p[1];
        var in1=c>=d.cols-s1w&&r<s1h, in2=c>=d.cols-s2w&&r<s2h;
        return !(in1||in2);
      });
      return{cells:stc,cols:d.cols,rows:d.rows};
    }
    if(kind==="hall"){
      d=baseDims(area,1);
      var hw=Math.max(1,Math.round(d.cols*0.24)), hl=Math.max(2,Math.round(d.rows*0.55));
      var hc=fullCells(d.cols,d.rows);
      for(var hr=d.rows;hr<d.rows+hl;hr++)for(var hcx=0;hcx<hw;hcx++)hc.push([hcx,hr]);
      return{cells:hc,cols:d.cols,rows:d.rows+hl};
    }
    d=baseDims(area,1); return{cells:fullCells(d.cols,d.rows),cols:d.cols,rows:d.rows}; // square(기본)
  }
  function buildShapeTileSet(area,kind){
    var g=shapeGen(area,kind);
    var gridW=Math.min(MAX_GRID,g.cols+MARGIN*2), gridH=Math.min(MAX_GRID,g.rows+MARGIN*2);
    var offC=Math.floor((gridW-g.cols)/2), offR=Math.floor((gridH-g.rows)/2);
    var ts=new Set();
    g.cells.forEach(function(p){ts.add(tileKey(offC+p[0],offR+p[1]))});
    return{tileSet:ts,gridW:gridW,gridH:gridH};
  }
  function miniSvg(area,kind){
    var g=shapeGen(area,kind);
    var vb=Math.max(g.cols,g.rows), offx=(vb-g.cols)/2, offy=(vb-g.rows)/2;
    var s='<svg viewBox="0 0 '+vb+' '+vb+'" preserveAspectRatio="xMidYMid meet">';
    g.cells.forEach(function(p){s+='<rect x="'+(p[0]+offx)+'" y="'+(p[1]+offy)+'" width="1" height="1"/>';});
    return s+'</svg>';
  }
  function renderShapeGrid(area){
    var grid=$("shape-grid"); grid.innerHTML="";
    SHAPE_KINDS.forEach(function(sk){
      var btn=document.createElement("button");
      btn.type="button"; btn.className="shape-btn"+(sk.k===state.pendingShapeKind?" on":""); btn.setAttribute("data-kind",sk.k);
      btn.innerHTML='<span class="shape-prev">'+miniSvg(area,sk.k)+'</span><b>'+nm(sk.label)+'</b>';
      btn.addEventListener("click",function(){
        state.pendingShapeKind=sk.k;
        Array.prototype.forEach.call(grid.children,function(c){c.classList.remove("on")});
        btn.classList.add("on");
      });
      grid.appendChild(btn);
    });
  }
  function applyShape(area,kind){
    var built=buildShapeTileSet(area,kind);
    state.tileSet=built.tileSet; state.gridW=built.gridW; state.gridH=built.gridH;
    state.phase="B";
    $("plan-sticky").hidden=false;
    $("phase-badge").textContent=S.phaseShape;
    updatePlanSizeTxt();
    render();
  }
  function updatePlanSizeTxt(){
    var area=state.tileSet.size*TILE*TILE;
    $("plan-size-txt").textContent=S.planSize(area/10000,area/PYEONG);
  }
  function reveal(id){
    var e=$(id);if(!e)return;
    e.hidden=false;e.classList.remove("reveal");void e.offsetWidth;e.classList.add("reveal");
    ensurePlanVisible();
  }

  /* ---------- STEP B: 타일 토글(드래그로 여러 칸) ---------- */
  function applyTile(c,r,mode){
    var key=tileKey(c,r);
    if(mode==="remove"){
      if(state.tileSet.has(key)&&state.tileSet.size>4)state.tileSet.delete(key);
    }else{
      state.tileSet.add(key);
    }
    updatePlanSizeTxt();
    render();
  }
  function setTileMode(m){
    state.tileMode=m;
    $("tile-add").classList.toggle("on",m==="add");
    $("tile-remove").classList.toggle("on",m==="remove");
  }
  $("tile-add").addEventListener("click",function(){setTileMode("add")});
  $("tile-remove").addEventListener("click",function(){setTileMode("remove")});

  function rotateRoom(){
    var oldH=state.gridH;
    var rotated=new Set();
    state.tileSet.forEach(function(k){
      var p=k.split(","), c=+p[0], r=+p[1];
      rotated.add(tileKey(oldH-1-r,c));
    });
    state.tileSet=rotated;
    var tmp=state.gridW; state.gridW=state.gridH; state.gridH=tmp;
    updatePlanSizeTxt();
    render();
  }
  $("rotate-room").addEventListener("click",rotateRoom);

  /* 예전엔 여기서 STEP C(필수 가전 드래그 배치)로 넘어갔다. 이제 가전도
     프리셋 목록에 합쳐졌으므로 바로 가구·가전 배치 단계(D)로 간다. */
  /* 안내 토스트(2026-08-03). 예전엔 alert() 였는데 네이티브 모달은 화면을 가리고
     모바일에서 특히 거칠다. 화면을 막지 않고 잠깐 떴다 사라지는 방식으로 바꿨다.
     엘리먼트는 처음 쓸 때 한 번만 만든다(HTML 수정 불필요). */
  var _toastEl=null,_toastTimer=null;
  function toast(msg){
    if(!_toastEl){
      _toastEl=document.createElement("div");
      _toastEl.setAttribute("role","status");
      _toastEl.style.cssText="position:fixed;left:50%;bottom:26px;transform:translateX(-50%);"
        +"background:var(--ink,#0F3040);color:#fff;font-size:14px;font-weight:700;"
        +"padding:12px 20px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.28);"
        +"z-index:9999;max-width:88vw;text-align:center;opacity:0;transition:opacity .18s";
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent=msg;
    _toastEl.style.opacity="1";
    clearTimeout(_toastTimer);
    _toastTimer=setTimeout(function(){ if(_toastEl) _toastEl.style.opacity="0"; },2600);
  }

  $("shape-done").addEventListener("click",function(){
    if(state.tileSet.size<4){toast(S.genFail);return;}
    state.phase="D";
    $("phase-badge").textContent=S.phasePlace;
    updatePlanSizeTxt();
    renderPresets();
    $("stepShape").hidden=true;
    reveal("stepD");
    reveal("stepDiag");
    reveal("stepList");
    render();
    coachOnce("preset",$("preset-grid").firstElementChild,S.coachPreset);
  });

  /* ---------- 좌표 변환 ---------- */
  function toSvg(e){
    var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* ---------- 삭제는 휴지통 영역으로 ────────────────────────────────────
     예전엔 "화면 밖으로 드래그하면 삭제"였다. 사용자 피드백: "화면밖으로
     나가야 삭제가아니라 우측 구석에 휴지통 영역을 만들어줘." 목표가 안 보이는
     채로 "여기쯤이면 없어지겠지" 하고 던지는 조작은 위험하다 — 살짝만 세게
     끌어도 실수로 지워진다. 이제 **눈에 보이는 자리**에 놓아야만 지워진다.
     화면 밖으로 나가면 그냥 '방 밖'으로 빨갛게 표시될 뿐 사라지지 않는다
     (기존 validate() 의 "방 밖으로 나가 있습니다" 오류가 그대로 처리한다). */
  var trashEl=$("trash-zone");
  function inTrash(clientX,clientY){
    if(!trashEl)return false;
    var r=trashEl.getBoundingClientRect();
    return clientX>=r.left&&clientX<=r.right&&clientY>=r.top&&clientY<=r.bottom;
  }
  function showTrash(){ if(trashEl)trashEl.hidden=false; }
  function hideTrash(){ if(trashEl){trashEl.hidden=true; trashEl.classList.remove("over");} }

  /* ---------- 포인터 통합 핸들러 ---------- */
  var drag=null; // {ref, dx, dy}

  svg.addEventListener("pointerdown",function(e){
    var p=toSvg(e);
    if(state.phase==="B"){
      var tEl=e.target.closest?e.target.closest(".tile"):null;
      if(!tEl)return;
      var c=+tEl.getAttribute("data-c"), r=+tEl.getAttribute("data-r");
      state.tileDrag={mode:state.tileMode};
      applyTile(c,r,state.tileMode);
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    var fEl=e.target.closest?e.target.closest(".furn"):null;
    if(!fEl){state.selId=null;syncSel();renderDiag();return;}
    var id=+fEl.getAttribute("data-id");
    var it=state.items.filter(function(x){return x.id===id})[0]; if(!it)return;
    state.selId=id; syncSel(); renderDiag();
    drag={ref:it,dx:p.x-it.x,dy:p.y-it.y};
    fEl.classList.add("dragging");
    svg.setPointerCapture(e.pointerId);
    showTrash();
    e.preventDefault();
  });

  svg.addEventListener("pointermove",function(e){
    if(state.phase==="B"&&state.tileDrag){
      var pB=toSvg(e);
      var cB=Math.floor(pB.x/TILE), rB=Math.floor(pB.y/TILE);
      if(cB>=0&&rB>=0&&cB<state.gridW&&rB<state.gridH)applyTile(cB,rB,state.tileDrag.mode);
      e.preventDefault();
      return;
    }
    if(!drag)return;
    var p2=toSvg(e);
    var overTrash=inTrash(e.clientX,e.clientY);
    if(trashEl)trashEl.classList.toggle("over",overTrash);
    drag.ref.x=snap(p2.x-drag.dx); drag.ref.y=snap(p2.y-drag.dy);
    renderDiag();
    if(overTrash)showHint(e.clientX,e.clientY,S.hintDelete,"err");
    else{var h=itemHint(rect(drag.ref),drag.ref); showHint(e.clientX,e.clientY,h.t,h.l);}
    e.preventDefault();
  });

  function endDrag(e){
    if(state.phase==="B"&&state.tileDrag){
      state.tileDrag=null;
      try{svg.releasePointerCapture(e.pointerId)}catch(_){}
      return;
    }
    if(!drag)return;
    if(inTrash(e.clientX,e.clientY)){
      state.items=state.items.filter(function(x){return x.id!==drag.ref.id});
      state.selId=null; syncSel();
    }
    drag=null;
    try{svg.releasePointerCapture(e.pointerId)}catch(_){}
    hideHint();
    hideTrash();
    renderDiag();
  }
  svg.addEventListener("pointerup",endDrag);
  svg.addEventListener("pointercancel",endDrag);

  $("rot").addEventListener("click",function(){
    var it=state.items.filter(function(x){return x.id===state.selId})[0]; if(!it)return;
    it.rot=(it.rot+90)%360; syncSel(); renderDiag();
  });
  $("del").addEventListener("click",function(){
    state.items=state.items.filter(function(x){return x.id!==state.selId});
    state.selId=null; syncSel(); renderDiag();
  });
  $("clear-all").addEventListener("click",function(){
    if(!confirm(S.restartConfirm))return;
    location.href=location.pathname;
  });

  /* ---------- STEP D: 가구·가전 프리셋(통합) ---------- */
  var curCat=0;
  function renderPresets(){
    var cr=$("cat-row"); cr.innerHTML="";
    PRESETS.forEach(function(g,i){
      var b=document.createElement("button");
      b.type="button"; b.className="cat-btn"+(i===curCat?" on":""); b.textContent=nm(g.c);
      b.addEventListener("click",function(){curCat=i;renderPresets();});
      cr.appendChild(b);
    });
    var pg=$("preset-grid"); pg.innerHTML="";
    var cat=PRESETS[curCat];
    cat.l.forEach(function(p){
      var b=document.createElement("button");
      b.type="button"; b.className="preset-btn";
      b.innerHTML="<b>"+nm(p.n)+"</b><span>"+p.w+"×"+p.h+"cm</span>";
      b.addEventListener("click",function(){addItem(p,cat.fixture)});
      pg.appendChild(b);
    });
  }
  function addItem(p,isFixture){
    var it={id:state.uid++,name:nm(p.n),w:p.w,h:p.h,x:0,y:0,rot:0,cl:p.cl||0,kind:isFixture?"fixture":"furn",ic:p.ic||null};
    var placed=false;
    for(var r=0;r<state.gridH*TILE-p.h+1&&!placed;r+=SNAP)for(var c=0;c<state.gridW*TILE-p.w+1&&!placed;c+=SNAP){
      it.x=c;it.y=r;
      if(inRoom(rect(it))&&!allBlocks().some(function(b){return inter(rect(it),b.r)>0}))placed=true;
    }
    state.items.push(it); state.selId=it.id;
    syncSel(); renderDiag();
    if(state.items.length===1){
      coachOnce("drag",svg.querySelector('.furn[data-id="'+it.id+'"]'),S.coachDrag);
    }else if(state.items.length===2){
      coachOnce("diag",$("stepDiag").querySelector("h2")||$("diag"),S.coachDiag);
    }
  }

  /* ---------- 직접 입력 (cm/mm 단위) ---------- */
  function setUnit(u){
    if(u===state.customUnit)return;
    var wEl=$("c-w"), hEl=$("c-h");
    [wEl,hEl].forEach(function(inp){
      var v=+inp.value; if(!v)return;
      inp.value=u==="mm"?Math.round(v*10):Math.round(v/10*10)/10;
    });
    state.customUnit=u;
    $("unit-cm").classList.toggle("on",u==="cm");
    $("unit-mm").classList.toggle("on",u==="mm");
    $("c-w-u").textContent=u; $("c-h-u").textContent=u;
  }
  $("unit-cm").addEventListener("click",function(){setUnit("cm")});
  $("unit-mm").addEventListener("click",function(){setUnit("mm")});

  $("add-custom").addEventListener("click",function(){
    var n=($("c-name").value||S.defName).trim().replace(/[:|]/g,"");
    var wRaw=+$("c-w").value||0, hRaw=+$("c-h").value||0;
    var w=state.customUnit==="mm"?wRaw/10:wRaw, h=state.customUnit==="mm"?hRaw/10:hRaw;
    if(w<3||h<3){$("c-w").focus();return;}
    addItem({n:{ko:n,en:n},w:Math.round(w*10)/10,h:Math.round(h*10)/10,cl:+$("c-cl").value||0},false);
  });

  /* ---------- 공유(URL 상태) ---------- */
  function encode(){
    var g=state.gridW+"x"+state.gridH;
    var t=Array.from(state.tileSet).join("|");
    var i=state.items.map(function(x){return x.name.replace(/[:|]/g,"")+":"+x.w+":"+x.h+":"+x.x+":"+x.y+":"+x.rot+":"+x.cl+":"+(x.kind==="fixture"?"f":"u")+":"+(x.ic||"")}).join("|");
    return location.origin+location.pathname+"?g="+g+"&t="+encodeURIComponent(t)+"&i="+encodeURIComponent(i);
  }
  $("share").addEventListener("click",function(){
    if(state.phase==="A"||state.phase==="B"){toast(S.shareFirst);return;}
    var url=encode(),btn=$("share"),old=btn.textContent;
    function done(){btn.textContent=S.shareCopied;setTimeout(function(){btn.textContent=old},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt(S.copyPrompt,url)});
    else prompt(S.copyPrompt,url);
  });
  function decode(){
    var q=location.search.replace(/^\?/,""); if(!q)return false;
    var p={}; q.split("&").forEach(function(kv){var a=kv.split("=");p[a[0]]=decodeURIComponent(a[1]||"")});
    if(!p.g||!/^\d+x\d+$/.test(p.g))return false;
    var gd=p.g.split("x"); state.gridW=+gd[0]; state.gridH=+gd[1];
    state.tileSet=new Set((p.t||"").split("|").filter(Boolean));
    (p.i||"").split("|").filter(Boolean).forEach(function(s){
      var a=s.split(":"); if(a.length<7)return;
      state.items.push({id:state.uid++,name:a[0],w:+a[1],h:+a[2],x:+a[3],y:+a[4],rot:+a[5],cl:+a[6],
        kind:a[7]==="f"?"fixture":"furn",ic:a[8]||null});
    });
    // 옛 공유 링크(가전이 &b= 로 따로 있던 v2) 호환 — 없으면 그냥 지나간다
    (p.b||"").split("|").filter(Boolean).forEach(function(s){
      var a=s.split(":"); if(a.length<6)return;
      state.items.push({id:state.uid++,name:a[1],w:+a[4],h:+a[5],x:+a[2],y:+a[3],rot:0,cl:0,kind:"fixture",ic:null});
    });
    return true;
  }

  /* ---------- 초기화 ---------- */
  updPyOut();
  renderShapeGrid((+$("py").value||6)*PYEONG);
  renderExamples();
  if(decode()){
    if($("stepA1-modal"))$("stepA1-modal").hidden=true;
    if($("stepA2-modal"))$("stepA2-modal").hidden=true;
    if($("hero"))$("hero").hidden=true;
    if($("privacy-note"))$("privacy-note").hidden=true;
    state.phase="D";
    $("plan-sticky").hidden=false;
    $("phase-badge").textContent=S.phasePlace;
    updatePlanSizeTxt();
    renderPresets();
    ["stepD","stepDiag","stepList"].forEach(function(id){$(id).hidden=false});
    syncSel(); renderDiag();
  }else if(!localStorage.getItem("rp.onboarded")){
    if($("stepA1-modal"))$("stepA1-modal").hidden=true;
    pendingRevealStepA=true;
    showOnboarding();
  }
})();
