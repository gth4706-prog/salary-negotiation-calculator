/* =========================================================
   방 가구 배치 시뮬레이터 (room-planner) v2
   - 내부 단위: cm  /  타일: 50cm(방 모양)  /  가구 스냅: 10cm
   - 4단계: A.평수입력 → B.방모양(타일) → C.필수가전(드래그배치) → D.가구추가
   - 서버 없음. 모든 계산은 브라우저 안에서만 동작.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("plan"))return;

  var TILE=50, SNAP=10, PAD=50, PYEONG=33058, MIN_PASS=60, MARGIN=3, MAX_GRID=22;

  var state={
    phase:"A",
    gridW:0, gridH:0,
    tileSet:new Set(),      // "c,r" — 방 안쪽 타일
    builtins:[],            // {id,type,name,x,y,w,h}
    items:[],               // {id,name,w,h,x,y,rot,cl}
    selId:null, selType:null,
    placingBuiltin:null,    // {type,name,w,h}
    drawStart:null,         // {c,r}
    drawCur:null,
    customUnit:"cm",
    tileMode:"add",         // "add" | "remove" — 방 모양 조정 드래그 모드
    tileDrag:null,          // {mode} — B단계 드래그 중 여부
    pendingShapeKind:"square", // 팝업에서 고른(아직 미확정) 형태
    uid:1
  };

  var PRESETS=[
    {c:"침대",l:[{n:"싱글",w:100,h:200,cl:60},{n:"슈퍼싱글",w:110,h:200,cl:60},{n:"더블",w:140,h:200,cl:60},{n:"퀸",w:150,h:200,cl:60},{n:"킹",w:180,h:200,cl:60}]},
    {c:"수납",l:[{n:"옷장 1000",w:100,h:60,cl:60},{n:"옷장 1500",w:150,h:60,cl:60},{n:"옷장 2000",w:200,h:60,cl:60},{n:"서랍장",w:80,h:45,cl:60},{n:"책장",w:80,h:30,cl:45},{n:"행거",w:120,h:45,cl:45}]},
    {c:"책상·의자",l:[{n:"책상 1200",w:120,h:60,cl:70},{n:"책상 1400",w:140,h:70,cl:70},{n:"컴퓨터의자",w:60,h:60,cl:0},{n:"화장대",w:90,h:45,cl:60}]},
    {c:"거실·주방",l:[{n:"소파 2인",w:160,h:85,cl:60},{n:"소파 3인",w:200,h:90,cl:60},{n:"TV장",w:120,h:40,cl:0},{n:"식탁 2인",w:80,h:80,cl:75},{n:"식탁 4인",w:120,h:80,cl:75}]}
  ];
  var BUILTINS=[
    {type:"sink",name:"싱크대",w:180,h:60},
    {type:"fridge",name:"냉장고",w:90,h:75},
    {type:"washer",name:"세탁기",w:60,h:60},
    {type:"shoe",name:"신발장",w:100,h:35},
    {type:"closet",name:"붙박이장",w:150,h:60},
    {type:"boiler",name:"보일러",w:60,h:25},
    {type:"aircon",name:"에어컨(벽걸이)",w:90,h:25},
    {type:"stove",name:"가스레인지·인덕션",w:60,h:55},
    {type:"meter",name:"계량기함·두꺼비집",w:30,h:15},
    {type:"boxpipe",name:"배관(PS)박스",w:40,h:40},
    {type:"bathroom",name:"화장실 문",w:70,h:10},
    {type:"entrance",name:"현관문",w:80,h:10}
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

    // 필수 가전
    var gb=el("g",{},svg);
    state.builtins.forEach(function(b){
      var grp=el("g",{class:"builtin"+(b.id===state.selId&&state.selType==="builtin"?" sel":""),"data-id":b.id,"data-type":"builtin"},gb);
      el("rect",{x:b.x,y:b.y,width:b.w,height:b.h},grp);
      var t=el("text",{x:b.x+b.w/2,y:b.y+b.h/2},grp); t.textContent=b.name;
    });

    // 가구
    var gfu=el("g",{},svg);
    state.items.forEach(function(it){
      var r2=rect(it),bad=it._bad;
      var grp=el("g",{class:"furn"+(it.id===state.selId&&state.selType==="furn"?" sel":"")+(bad?" bad":""),"data-id":it.id,"data-type":"furn"},gfu);
      el("rect",{x:r2.x,y:r2.y,width:r2.w,height:r2.h},grp);
      var fe=frontEdge(it);
      if(it.cl)el("line",{x1:fe[0],y1:fe[1],x2:fe[2],y2:fe[3],class:"front"},grp);
      var t=el("text",{x:r2.x+r2.w/2,y:r2.y+r2.h/2-11},grp); t.textContent=it.name;
      var s=el("text",{x:r2.x+r2.w/2,y:r2.y+r2.h/2+12,class:"sz"},grp); s.textContent=it.w+"×"+it.h;
    });

    // 벽
    var go=el("g",{},svg);
    wallEdges().forEach(function(e){el("line",{x1:e[0],y1:e[1],x2:e[2],y2:e[3],class:"room-wall"},go);});

    // 배치(가전) 드래그 미리보기
    if(state.drawStart&&state.drawCur){
      var rr=drawRectFromDrag();
      el("rect",{x:rr.x,y:rr.y,width:rr.w,height:rr.h,class:"draw-preview"},svg);
    }

    if(state.phase!=="B"){
      var d1=el("text",{x:W/2,y:-24,class:"dim-txt"},svg); d1.textContent=(W/100).toFixed(1)+"m";
      var d2=el("text",{x:-26,y:H/2,class:"dim-txt",transform:"rotate(-90 "+(-26)+" "+(H/2)+")"},svg); d2.textContent=(H/100).toFixed(1)+"m";
    }
  }

  /* ---------- 검증(핵심 차별화) ---------- */
  function allBlocks(){
    return state.items.map(function(it){return{name:it.name,r:rect(it),isFurn:true,ref:it}})
      .concat(state.builtins.map(function(b){return{name:b.name,r:{x:b.x,y:b.y,w:b.w,h:b.h},isFurn:false,ref:b}}));
  }
  function validate(){
    var msgs=[],blocks=allBlocks();
    state.items.forEach(function(it){it._bad=false});
    blocks.forEach(function(b){
      if(!inRoom(b.r)){ if(b.isFurn)b.ref._bad=true; msgs.push({t:"err",m:"<b>"+b.name+"</b>이(가) 방 밖으로 나가 있습니다."}); }
    });
    for(var a=0;a<blocks.length;a++)for(var bI=a+1;bI<blocks.length;bI++){
      if(inter(blocks[a].r,blocks[bI].r)>0){
        if(blocks[a].isFurn)blocks[a].ref._bad=true;
        if(blocks[bI].isFurn)blocks[bI].ref._bad=true;
        msgs.push({t:"err",m:"<b>"+blocks[a].name+"</b>와(과) <b>"+blocks[bI].name+"</b>가 겹칩니다."});
      }
    }
    state.items.forEach(function(it){
      var z=clearZone(it); if(!z)return;
      var blocked=!inRoom(z);
      blocks.forEach(function(b){if(b.ref!==it&&inter(z,b.r)>0)blocked=true;});
      if(blocked)msgs.push({t:"warn",m:"<b>"+it.name+"</b> 앞 <b>"+it.cl+"cm</b> 공간이 부족합니다."});
    });
    var seen={};
    for(var i=0;i<blocks.length;i++)for(var j=i+1;j<blocks.length;j++){
      var gp=passGap(blocks[i].r,blocks[j].r);
      if(gp!==null&&gp>=5&&gp<MIN_PASS){
        var k=blocks[i].name+"|"+blocks[j].name;
        if(!seen[k]){seen[k]=1;msgs.push({t:"warn",m:"<b>"+blocks[i].name+"</b>–<b>"+blocks[j].name+"</b> 사이 통로가 <b>"+Math.round(gp)+"cm</b>입니다. (최소 60cm 권장)"});}
      }
    }
    var used=0; blocks.forEach(function(b){used+=b.r.w*b.r.h});
    var roomArea=state.tileSet.size*TILE*TILE;
    var pct=roomArea>0?used/roomArea*100:0;
    if(blocks.length&&!msgs.length)msgs.push({t:"ok",m:"문제 없는 배치입니다."});
    return{msgs:msgs,pct:pct};
  }
  function renderDiag(){
    var v=validate();
    var box=$("diag");
    if(box){
      box.innerHTML="";
      if(!state.items.length&&!state.builtins.length){
        box.innerHTML='<div class="diag-item ok"><span class="ic">💡</span><span>가전·가구를 추가하면 배치 진단이 시작됩니다.</span></div>';
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
      $("occ-note").textContent=pct>55?"가구가 많아 답답할 수 있어요":pct>38?"적당히 채워진 편":"여유로운 편";
    }
    render();
    renderList();
  }
  function renderList(){
    var ul=$("ilist"); if(!ul)return;
    ul.innerHTML="";
    state.items.forEach(function(it){
      var li=document.createElement("li");
      li.className=(it.id===state.selId&&state.selType==="furn")?"on":"";
      li.innerHTML='<span class="nm">'+it.name+'</span><span class="sz">'+ew(it)+'×'+eh(it)+'cm</span>';
      li.addEventListener("click",function(){state.selId=it.id;state.selType="furn";syncSel();renderDiag();});
      ul.appendChild(li);
    });
    if($("ilist-empty"))$("ilist-empty").hidden=state.items.length>0;
  }
  function syncSel(){
    var bar=$("sel-bar"),rotBtn=$("rot");
    if(state.selType==="furn"){
      var it=state.items.filter(function(x){return x.id===state.selId})[0];
      if(!it){bar.hidden=true;return;}
      bar.hidden=false; rotBtn.hidden=false;
      $("sel-nm").textContent=it.name+" ("+ew(it)+"×"+eh(it)+"cm)";
    }else if(state.selType==="builtin"){
      var b=state.builtins.filter(function(x){return x.id===state.selId})[0];
      if(!b){bar.hidden=true;return;}
      bar.hidden=false; rotBtn.hidden=true;
      $("sel-nm").textContent=b.name+" ("+b.w+"×"+b.h+"cm)";
    }else{
      bar.hidden=true;
    }
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
    if(!inRoom(rectObj))return{t:"방 밖이에요",l:"err"};
    var blocks=allBlocks().filter(function(b){return b.ref!==excludeRef});
    for(var i=0;i<blocks.length;i++){ if(inter(rectObj,blocks[i].r)>0)return{t:"겹쳤어요",l:"err"}; }
    for(var j=0;j<blocks.length;j++){
      var gp=passGap(rectObj,blocks[j].r);
      if(gp!==null&&gp>=5&&gp<MIN_PASS)return{t:"통로가 "+Math.round(gp)+"cm — 좁아요",l:"warn"};
    }
    return{t:"좋은 위치예요",l:"ok"};
  }

  /* ---------- STEP A: 평수 → 방 생성 ---------- */
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
    $("py-out").textContent="약 "+(p.w/100).toFixed(1)+"m × "+(p.h/100).toFixed(1)+"m (근사)";
  }
  $("py").addEventListener("input",function(){
    updPyOut();
    var py=+$("py").value||0;
    if(py>0)renderShapeGrid(py*PYEONG);
  });

  $("gen-room").addEventListener("click",function(){
    var py=+$("py").value||0; if(py<=0){$("py").focus();return;}
    if($("stepA-modal"))$("stepA-modal").hidden=true;
    if($("hero"))$("hero").hidden=true;
    if($("privacy-note"))$("privacy-note").hidden=true;
    applyShape(py*PYEONG,state.pendingShapeKind);
    reveal("stepShape");
  });

  /* ---------- 방 형태 프리셋(공간 감각 없어도 고를 수 있게, 16종) ---------- */
  var SHAPE_KINDS=[
    {k:"square",label:"정사각형에 가깝게"},
    {k:"wide",label:"가로로 넓게"},
    {k:"tall",label:"세로로 길게"},
    {k:"verywide",label:"납작하고 넓게"},
    {k:"verytall",label:"좁고 긴 복도형"},
    {k:"corner-tr",label:"ㄱ자형(우상단 절개)"},
    {k:"corner-tl",label:"ㄴ자형(좌상단 절개)"},
    {k:"corner-br",label:"ㄱ자형(우하단 절개)"},
    {k:"corner-bl",label:"ㄴ자형(좌하단 절개)"},
    {k:"ushape",label:"ㄷ자형(양쪽 절개)"},
    {k:"tshape",label:"T자형(통로+안쪽 방)"},
    {k:"alcove",label:"알코브형(작은 돌출부)"},
    {k:"nick",label:"모서리만 살짝 깎인 형"},
    {k:"octagon",label:"네 모서리가 깎인 형"},
    {k:"stair",label:"계단식 모서리"},
    {k:"hall",label:"현관 복도가 딸린 형"}
  ];
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
      btn.innerHTML='<span class="shape-prev">'+miniSvg(area,sk.k)+'</span><b>'+sk.label+'</b>';
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
    $("phase-badge").textContent="모양 조정 중";
    updatePlanSizeTxt();
    render();
  }
  function updatePlanSizeTxt(){
    var area=state.tileSet.size*TILE*TILE;
    $("plan-size-txt").textContent=(area/10000).toFixed(1)+"m² · 약 "+(area/PYEONG).toFixed(1)+"평";
  }
  function reveal(id){var e=$(id);if(!e)return;e.hidden=false;e.classList.remove("reveal");void e.offsetWidth;e.classList.add("reveal");e.scrollIntoView({behavior:"smooth",block:"start"});}

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

  $("shape-done").addEventListener("click",function(){
    if(state.tileSet.size<4){alert("방이 너무 작습니다. 타일을 4칸 이상 남겨주세요.");return;}
    state.phase="C";
    $("phase-badge").textContent="가전 배치 중";
    updatePlanSizeTxt();
    renderBuiltinButtons();
    $("stepShape").hidden=true;
    reveal("stepC");
    render();
  });

  /* ---------- STEP C: 필수 가전 ---------- */
  function renderBuiltinButtons(){
    var row=$("builtin-row"); row.innerHTML="";
    BUILTINS.forEach(function(b){
      var btn=document.createElement("button");
      btn.type="button"; btn.className="cat-btn"; btn.textContent=b.name+" "+b.w+"×"+b.h;
      btn.addEventListener("click",function(){
        var already=state.placingBuiltin&&state.placingBuiltin.type===b.type;
        state.placingBuiltin=already?null:{type:b.type,name:b.name,w:b.w,h:b.h};
        Array.prototype.forEach.call(row.children,function(c){c.classList.remove("on")});
        if(state.placingBuiltin)btn.classList.add("on");
        $("builtin-hint").textContent=state.placingBuiltin
          ? "평면도에서 "+b.name+" 자리를 드래그해 표시하세요. (놓을 곳을 대략 끌어주면 됩니다)"
          : "배치할 가전 버튼을 먼저 눌러주세요.";
      });
      row.appendChild(btn);
    });
  }
  function renderBuiltinSummary(){
    var parts=BUILTINS.map(function(b){
      var has=state.builtins.some(function(x){return x.type===b.type});
      return b.name+" "+(has?"✓":"-");
    });
    $("builtin-summary").innerHTML="현재 구성: "+parts.join(" · ");
    var list=$("builtin-list"); list.innerHTML="";
    state.builtins.forEach(function(b,i){
      var chip=document.createElement("span"); chip.className="op-chip";
      chip.innerHTML='<span>'+b.name+' '+b.w+'×'+b.h+'cm</span>';
      var del=document.createElement("button"); del.type="button"; del.textContent="×";
      del.addEventListener("click",function(){state.builtins.splice(i,1);if(state.selType==="builtin")state.selId=null;renderBuiltinSummary();syncSel();renderDiag();});
      chip.appendChild(del); list.appendChild(chip);
    });
  }
  $("builtin-done").addEventListener("click",function(){
    state.phase="D";
    $("phase-badge").textContent="가구 배치 중";
    state.placingBuiltin=null;
    renderPresets();
    $("stepC").hidden=true;
    reveal("stepD");
    reveal("stepDiag");
    reveal("stepList");
    if($("adwrap"))$("adwrap").hidden=false;
    render();
  });

  /* ---------- 좌표 변환 ---------- */
  function toSvg(e){
    var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function drawRectFromDrag(){
    var c1=Math.min(state.drawStart.c,state.drawCur.c), c2=Math.max(state.drawStart.c,state.drawCur.c);
    var r1=Math.min(state.drawStart.r,state.drawCur.r), r2=Math.max(state.drawStart.r,state.drawCur.r);
    return{x:c1*TILE,y:r1*TILE,w:(c2-c1+1)*TILE,h:(r2-r1+1)*TILE};
  }

  /* ---------- 포인터 통합 핸들러 ---------- */
  var drag=null; // {kind:'furn'|'builtin', ref, dx, dy}

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
    if(state.phase==="C"&&state.placingBuiltin){
      var c0=Math.floor(p.x/TILE), r0=Math.floor(p.y/TILE);
      state.drawStart={c:c0,r:r0}; state.drawCur={c:c0,r:r0};
      svg.setPointerCapture(e.pointerId);
      render();
      e.preventDefault();
      return;
    }
    var fEl=e.target.closest?e.target.closest(".furn,.builtin"):null;
    if(!fEl){state.selId=null;state.selType=null;syncSel();renderDiag();return;}
    var id=+fEl.getAttribute("data-id"), type=fEl.getAttribute("data-type");
    state.selId=id; state.selType=type; syncSel(); renderDiag();
    if(type==="furn"){
      var it=state.items.filter(function(x){return x.id===id})[0]; if(!it)return;
      drag={kind:"furn",ref:it,dx:p.x-it.x,dy:p.y-it.y};
      fEl.classList.add("dragging");
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    }else if(type==="builtin"){
      var bt=state.builtins.filter(function(x){return x.id===id})[0]; if(!bt)return;
      drag={kind:"builtin",ref:bt,dx:p.x-bt.x,dy:p.y-bt.y};
      fEl.classList.add("dragging");
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });

  svg.addEventListener("pointermove",function(e){
    if(state.phase==="B"&&state.tileDrag){
      var pB=toSvg(e);
      var cB=Math.floor(pB.x/TILE), rB=Math.floor(pB.y/TILE);
      if(cB>=0&&rB>=0&&cB<state.gridW&&rB<state.gridH)applyTile(cB,rB,state.tileDrag.mode);
      e.preventDefault();
      return;
    }
    if(state.phase==="C"&&state.drawStart){
      var p=toSvg(e);
      state.drawCur={c:Math.floor(p.x/TILE),r:Math.floor(p.y/TILE)};
      render();
      var rr=drawRectFromDrag();
      var okIn=inRoom(rr), blk=allBlocks().some(function(b){return inter(rr,b.r)>0});
      showHint(e.clientX,e.clientY, !okIn?"방 밖이에요":blk?"이미 다른 물건과 겹쳐요":(rr.w+"×"+rr.h+"cm"), !okIn||blk?"err":"ok");
      e.preventDefault();
      return;
    }
    if(!drag)return;
    var p2=toSvg(e);
    var svgRect=svg.getBoundingClientRect();
    var outNow=e.clientX<svgRect.left||e.clientX>svgRect.right||e.clientY<svgRect.top||e.clientY>svgRect.bottom;
    if(drag.kind==="furn"){
      drag.ref.x=snap(p2.x-drag.dx); drag.ref.y=snap(p2.y-drag.dy);
      renderDiag();
      if(outNow)showHint(e.clientX,e.clientY,"여기서 놓으면 삭제돼요","err");
      else{var h=itemHint(rect(drag.ref),drag.ref); showHint(e.clientX,e.clientY,h.t,h.l);}
    }else if(drag.kind==="builtin"){
      drag.ref.x=snap(p2.x-drag.dx); drag.ref.y=snap(p2.y-drag.dy);
      renderDiag();
      if(outNow)showHint(e.clientX,e.clientY,"여기서 놓으면 삭제돼요","err");
      else{var hb={x:drag.ref.x,y:drag.ref.y,w:drag.ref.w,h:drag.ref.h}; var h2=itemHint(hb,drag.ref); showHint(e.clientX,e.clientY,h2.t,h2.l);}
    }
    e.preventDefault();
  });

  function endDrag(e){
    if(state.phase==="B"&&state.tileDrag){
      state.tileDrag=null;
      try{svg.releasePointerCapture(e.pointerId)}catch(_){}
      return;
    }
    if(state.phase==="C"&&state.drawStart){
      var rr=drawRectFromDrag();
      var okIn=inRoom(rr), blk=allBlocks().some(function(b){return inter(rr,b.r)>0});
      if(okIn&&!blk){
        state.builtins.push({id:state.uid++,type:state.placingBuiltin.type,name:state.placingBuiltin.name,x:rr.x,y:rr.y,w:rr.w,h:rr.h});
        renderBuiltinSummary();
      }
      state.drawStart=null; state.drawCur=null;
      try{svg.releasePointerCapture(e.pointerId)}catch(_){}
      hideHint();
      renderDiag();
      return;
    }
    if(!drag)return;
    var svgRect2=svg.getBoundingClientRect();
    var outEnd=e.clientX<svgRect2.left||e.clientX>svgRect2.right||e.clientY<svgRect2.top||e.clientY>svgRect2.bottom;
    if(outEnd){
      if(drag.kind==="furn")state.items=state.items.filter(function(x){return x.id!==drag.ref.id});
      else if(drag.kind==="builtin"){state.builtins=state.builtins.filter(function(x){return x.id!==drag.ref.id});renderBuiltinSummary();}
      state.selId=null; state.selType=null; syncSel();
    }
    drag=null;
    try{svg.releasePointerCapture(e.pointerId)}catch(_){}
    hideHint();
    renderDiag();
  }
  svg.addEventListener("pointerup",endDrag);
  svg.addEventListener("pointercancel",endDrag);

  $("rot").addEventListener("click",function(){
    if(state.selType!=="furn")return;
    var it=state.items.filter(function(x){return x.id===state.selId})[0]; if(!it)return;
    it.rot=(it.rot+90)%360; syncSel(); renderDiag();
  });
  $("del").addEventListener("click",function(){
    if(state.selType==="furn"){state.items=state.items.filter(function(x){return x.id!==state.selId})}
    else if(state.selType==="builtin"){state.builtins=state.builtins.filter(function(x){return x.id!==state.selId});renderBuiltinSummary();}
    state.selId=null; state.selType=null; syncSel(); renderDiag();
  });
  $("clear-all").addEventListener("click",function(){
    if(!confirm("처음부터 다시 시작할까요? 배치한 내용이 모두 사라집니다."))return;
    location.href=location.pathname;
  });

  /* ---------- STEP D: 가구 프리셋 ---------- */
  var curCat=0;
  function renderPresets(){
    var cr=$("cat-row"); cr.innerHTML="";
    PRESETS.forEach(function(g,i){
      var b=document.createElement("button");
      b.type="button"; b.className="cat-btn"+(i===curCat?" on":""); b.textContent=g.c;
      b.addEventListener("click",function(){curCat=i;renderPresets();});
      cr.appendChild(b);
    });
    var pg=$("preset-grid"); pg.innerHTML="";
    PRESETS[curCat].l.forEach(function(p){
      var b=document.createElement("button");
      b.type="button"; b.className="preset-btn";
      b.innerHTML="<b>"+p.n+"</b><span>"+p.w+"×"+p.h+"cm</span>";
      b.addEventListener("click",function(){addItem(p)});
      pg.appendChild(b);
    });
  }
  function addItem(p){
    var it={id:state.uid++,name:p.n,w:p.w,h:p.h,x:0,y:0,rot:0,cl:p.cl||0};
    var placed=false;
    for(var r=0;r<state.gridH*TILE-p.h+1&&!placed;r+=SNAP)for(var c=0;c<state.gridW*TILE-p.w+1&&!placed;c+=SNAP){
      it.x=c;it.y=r;
      if(inRoom(rect(it))&&!allBlocks().some(function(b){return inter(rect(it),b.r)>0}))placed=true;
    }
    state.items.push(it); state.selId=it.id; state.selType="furn";
    syncSel(); renderDiag();
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
    var n=($("c-name").value||"가구").trim().replace(/[:|]/g,"");
    var wRaw=+$("c-w").value||0, hRaw=+$("c-h").value||0;
    var w=state.customUnit==="mm"?wRaw/10:wRaw, h=state.customUnit==="mm"?hRaw/10:hRaw;
    if(w<3||h<3){$("c-w").focus();return;}
    addItem({n:n,w:Math.round(w*10)/10,h:Math.round(h*10)/10,cl:+$("c-cl").value||0});
  });

  /* ---------- 공유(URL 상태) ---------- */
  function encode(){
    var g=state.gridW+"x"+state.gridH;
    var t=Array.from(state.tileSet).join("|");
    var b=state.builtins.map(function(x){return x.type+":"+x.name+":"+x.x+":"+x.y+":"+x.w+":"+x.h}).join("|");
    var i=state.items.map(function(x){return x.name.replace(/[:|]/g,"")+":"+x.w+":"+x.h+":"+x.x+":"+x.y+":"+x.rot+":"+x.cl}).join("|");
    return location.origin+location.pathname+"?g="+g+"&t="+encodeURIComponent(t)+"&b="+encodeURIComponent(b)+"&i="+encodeURIComponent(i);
  }
  $("share").addEventListener("click",function(){
    if(state.phase==="A"||state.phase==="B"){alert("먼저 방 모양을 확정해 주세요.");return;}
    var url=encode(),btn=$("share"),old=btn.textContent;
    function done(){btn.textContent="✓ 링크 복사됨";setTimeout(function(){btn.textContent=old},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt("링크를 복사하세요:",url)});
    else prompt("링크를 복사하세요:",url);
  });
  function decode(){
    var q=location.search.replace(/^\?/,""); if(!q)return false;
    var p={}; q.split("&").forEach(function(kv){var a=kv.split("=");p[a[0]]=decodeURIComponent(a[1]||"")});
    if(!p.g||!/^\d+x\d+$/.test(p.g))return false;
    var gd=p.g.split("x"); state.gridW=+gd[0]; state.gridH=+gd[1];
    state.tileSet=new Set((p.t||"").split("|").filter(Boolean));
    (p.b||"").split("|").filter(Boolean).forEach(function(s){
      var a=s.split(":"); if(a.length<6)return;
      state.builtins.push({id:state.uid++,type:a[0],name:a[1],x:+a[2],y:+a[3],w:+a[4],h:+a[5]});
    });
    (p.i||"").split("|").filter(Boolean).forEach(function(s){
      var a=s.split(":"); if(a.length<7)return;
      state.items.push({id:state.uid++,name:a[0],w:+a[1],h:+a[2],x:+a[3],y:+a[4],rot:+a[5],cl:+a[6]});
    });
    return true;
  }

  /* ---------- 초기화 ---------- */
  updPyOut();
  renderShapeGrid((+$("py").value||6)*PYEONG);
  if(decode()){
    if($("stepA-modal"))$("stepA-modal").hidden=true;
    if($("hero"))$("hero").hidden=true;
    if($("privacy-note"))$("privacy-note").hidden=true;
    state.phase="D";
    $("plan-sticky").hidden=false;
    $("phase-badge").textContent="가구 배치 중";
    updatePlanSizeTxt();
    renderBuiltinButtons(); renderBuiltinSummary(); renderPresets();
    ["stepD","stepDiag","stepList"].forEach(function(id){$(id).hidden=false});
    if($("adwrap"))$("adwrap").hidden=false;
    syncSel(); renderDiag();
  }
})();
