/* =========================================================
   방 가구 배치 시뮬레이터 (room-planner)
   - 내부 단위: cm  /  그리드: 100cm(1m)  /  스냅: 10cm
   - 서버 없음. 모든 계산은 브라우저 안에서만 동작.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("plan"))return;

  var SNAP=10, PAD=60, PYEONG=33058; // 1평 = 3.3058m² = 33058cm²
  var MIN_PASS=60;                   // 사람이 지나가는 최소 통로(cm)

  var room={w:400,h:500};
  var openings=[];   // {wall:'top'|'right'|'bottom'|'left', pos:0~1, width, type:'d'|'w'}
  var items=[];      // {id,name,w,h,x,y,rot,cl}
  var selId=null, uid=1;

  /* ---------- 프리셋 (한국 표준 규격, cm / cl=앞 필요공간) ---------- */
  var PRESETS=[
    {c:"침대",l:[{n:"싱글",w:100,h:200,cl:60},{n:"슈퍼싱글",w:110,h:200,cl:60},{n:"더블",w:140,h:200,cl:60},{n:"퀸",w:150,h:200,cl:60},{n:"킹",w:180,h:200,cl:60}]},
    {c:"수납",l:[{n:"옷장 1000",w:100,h:60,cl:60},{n:"옷장 1500",w:150,h:60,cl:60},{n:"옷장 2000",w:200,h:60,cl:60},{n:"서랍장",w:80,h:45,cl:60},{n:"책장",w:80,h:30,cl:45},{n:"행거",w:120,h:45,cl:45}]},
    {c:"책상·의자",l:[{n:"책상 1200",w:120,h:60,cl:70},{n:"책상 1400",w:140,h:70,cl:70},{n:"컴퓨터의자",w:60,h:60,cl:0},{n:"화장대",w:90,h:45,cl:60}]},
    {c:"가전",l:[{n:"냉장고 1도어",w:60,h:65,cl:70},{n:"냉장고 양문형",w:90,h:75,cl:80},{n:"세탁기",w:60,h:60,cl:60},{n:"스탠드에어컨",w:40,h:40,cl:0},{n:"TV장",w:120,h:40,cl:0}]},
    {c:"거실·주방",l:[{n:"소파 2인",w:160,h:85,cl:60},{n:"소파 3인",w:200,h:90,cl:60},{n:"식탁 2인",w:80,h:80,cl:75},{n:"식탁 4인",w:120,h:80,cl:75}]}
  ];

  /* ---------- 기하 헬퍼 ---------- */
  function ew(it){return it.rot%180===0?it.w:it.h}      // 회전 반영 폭
  function eh(it){return it.rot%180===0?it.h:it.w}      // 회전 반영 높이
  function rect(it){return{x:it.x,y:it.y,w:ew(it),h:eh(it)}}
  function overlap(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h}
  function inter(a,b){ // 겹침 면적
    var ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
    var oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
    return ox>0&&oy>0?ox*oy:0;
  }
  function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v))}
  function snap(v){return Math.round(v/SNAP)*SNAP}
  // 가구 앞쪽(문/서랍 열리는 방향) 여유 구역
  function clearZone(it){
    if(!it.cl)return null;
    var r=rect(it),c=it.cl;
    if(it.rot===0)  return{x:r.x,y:r.y+r.h,w:r.w,h:c};
    if(it.rot===180)return{x:r.x,y:r.y-c,w:r.w,h:c};
    if(it.rot===90) return{x:r.x-c,y:r.y,w:c,h:r.h};
    return{x:r.x+r.w,y:r.y,w:c,h:r.h};
  }
  // 앞면 모서리(시각 표시용)
  function frontEdge(it){
    var r=rect(it);
    if(it.rot===0)  return[r.x,r.y+r.h,r.x+r.w,r.y+r.h];
    if(it.rot===180)return[r.x,r.y,r.x+r.w,r.y];
    if(it.rot===90) return[r.x,r.y,r.x,r.y+r.h];
    return[r.x+r.w,r.y,r.x+r.w,r.y+r.h];
  }
  // 개구부 기하: 벽 위 선분 + (문이면) 열림 반경
  function opGeo(o){
    var W=room.w,H=room.h,dw=o.width,g={};
    if(o.wall==="top"){   var cx=o.pos*W; g.x1=cx-dw/2;g.y1=0;g.x2=cx+dw/2;g.y2=0;
      g.hx=cx-dw/2;g.hy=0;   g.bb={x:g.hx,y:0,w:dw,h:dw};
      g.arc="M "+g.hx+" 0 L "+(g.hx+dw)+" 0 A "+dw+" "+dw+" 0 0 1 "+g.hx+" "+dw+" Z"; }
    else if(o.wall==="bottom"){ var cx2=o.pos*W; g.x1=cx2-dw/2;g.y1=H;g.x2=cx2+dw/2;g.y2=H;
      g.hx=cx2-dw/2;g.hy=H;  g.bb={x:g.hx,y:H-dw,w:dw,h:dw};
      g.arc="M "+g.hx+" "+H+" L "+(g.hx+dw)+" "+H+" A "+dw+" "+dw+" 0 0 0 "+g.hx+" "+(H-dw)+" Z"; }
    else if(o.wall==="left"){ var cy=o.pos*H; g.x1=0;g.y1=cy-dw/2;g.x2=0;g.y2=cy+dw/2;
      g.hx=0;g.hy=cy-dw/2;   g.bb={x:0,y:g.hy,w:dw,h:dw};
      g.arc="M 0 "+g.hy+" L 0 "+(g.hy+dw)+" A "+dw+" "+dw+" 0 0 0 "+dw+" "+g.hy+" Z"; }
    else { var cy2=o.pos*H;  g.x1=W;g.y1=cy2-dw/2;g.x2=W;g.y2=cy2+dw/2;
      g.hx=W;g.hy=cy2-dw/2;  g.bb={x:W-dw,y:g.hy,w:dw,h:dw};
      g.arc="M "+W+" "+g.hy+" L "+W+" "+(g.hy+dw)+" A "+dw+" "+dw+" 0 0 1 "+(W-dw)+" "+g.hy+" Z"; }
    return g;
  }
  function circRectDist(cx,cy,rx,ry,rw,rh){
    var nx=clamp(cx,rx,rx+rw), ny=clamp(cy,ry,ry+rh);
    return Math.sqrt((cx-nx)*(cx-nx)+(cy-ny)*(cy-ny));
  }
  // 두 사각형 사이 '통과 가능한 틈' (있으면 {gap})
  function passGap(a,b){
    var ax2=a.x+a.w,ay2=a.y+a.h,bx2=b.x+b.w,by2=b.y+b.h;
    if(Math.min(ay2,by2)-Math.max(a.y,b.y)>0){
      var gx=Math.max(b.x-ax2,a.x-bx2); if(gx>0)return gx;
    }
    if(Math.min(ax2,bx2)-Math.max(a.x,b.x)>0){
      var gy=Math.max(b.y-ay2,a.y-by2); if(gy>0)return gy;
    }
    return null;
  }

  /* ---------- 렌더 ---------- */
  var svg=$("plan");
  function el(tag,attrs,parent){
    var e=document.createElementNS("http://www.w3.org/2000/svg",tag);
    for(var k in attrs)e.setAttribute(k,attrs[k]);
    if(parent)parent.appendChild(e);
    return e;
  }
  function render(){
    var W=room.w,H=room.h;
    svg.setAttribute("viewBox",(-PAD)+" "+(-PAD)+" "+(W+PAD*2)+" "+(H+PAD*2));
    svg.innerHTML="";
    el("rect",{x:0,y:0,width:W,height:H,class:"room-fill"},svg);
    // 1m 그리드
    var g=el("g",{},svg),i;
    for(i=100;i<W;i+=100) el("line",{x1:i,y1:0,x2:i,y2:H,class:"grid-l major"},g);
    for(i=100;i<H;i+=100) el("line",{x1:0,y1:i,x2:W,y2:i,class:"grid-l major"},g);
    // 앞 여유 구역
    var gc=el("g",{},svg);
    items.forEach(function(it){var z=clearZone(it);if(z)el("rect",{x:z.x,y:z.y,width:z.w,height:z.h,class:"clear-zone"},gc);});
    // 가구
    var gf=el("g",{},svg);
    items.forEach(function(it){
      var r=rect(it),bad=it._bad;
      var grp=el("g",{class:"furn"+(it.id===selId?" sel":"")+(bad?" bad":""),"data-id":it.id},gf);
      el("rect",{x:r.x,y:r.y,width:r.w,height:r.h},grp);
      var fe=frontEdge(it);
      if(it.cl)el("line",{x1:fe[0],y1:fe[1],x2:fe[2],y2:fe[3],class:"front"},grp);
      var t=el("text",{x:r.x+r.w/2,y:r.y+r.h/2-11},grp); t.textContent=it.name;
      var s=el("text",{x:r.x+r.w/2,y:r.y+r.h/2+12,class:"sz"},grp); s.textContent=it.w+"×"+it.h;
    });
    // 개구부
    var go=el("g",{},svg);
    openings.forEach(function(o){
      var q=opGeo(o);
      if(o.type==="d")el("path",{d:q.arc,class:"op-swing"},go);
      el("line",{x1:q.x1,y1:q.y1,x2:q.x2,y2:q.y2,class:o.type==="d"?"op-door":"op-win"},go);
    });
    el("rect",{x:0,y:0,width:W,height:H,class:"room-wall"},svg);
    // 치수
    var d1=el("text",{x:W/2,y:-26,class:"dim-txt"},svg); d1.textContent=(W/100).toFixed(1)+"m";
    var d2=el("text",{x:-30,y:H/2,class:"dim-txt",transform:"rotate(-90 "+(-30)+" "+(H/2)+")"},svg); d2.textContent=(H/100).toFixed(1)+"m";
  }

  /* ---------- 검증(핵심 차별화) ---------- */
  function validate(){
    var msgs=[],W=room.w,H=room.h;
    items.forEach(function(it){it._bad=false});
    // 방 이탈
    items.forEach(function(it){
      var r=rect(it);
      if(r.x<-1||r.y<-1||r.x+r.w>W+1||r.y+r.h>H+1){it._bad=true;msgs.push({t:"err",m:"<b>"+it.name+"</b>이(가) 방 밖으로 나가 있습니다."});}
    });
    // 겹침
    for(var a=0;a<items.length;a++)for(var b=a+1;b<items.length;b++){
      if(inter(rect(items[a]),rect(items[b]))>0){
        items[a]._bad=items[b]._bad=true;
        msgs.push({t:"err",m:"<b>"+items[a].name+"</b>와(과) <b>"+items[b].name+"</b>가 겹칩니다."});
      }
    }
    // 문 열림 방해
    openings.filter(function(o){return o.type==="d"}).forEach(function(o){
      var q=opGeo(o);
      items.forEach(function(it){
        var r=rect(it);
        if(overlap(r,q.bb)&&circRectDist(q.hx,q.hy,r.x,r.y,r.w,r.h)<o.width){
          it._bad=true;
          msgs.push({t:"err",m:"<b>"+it.name+"</b>이(가) <b>문 열리는 반경</b>을 막습니다."});
        }
      });
    });
    // 앞 공간 부족
    items.forEach(function(it){
      var z=clearZone(it); if(!z)return;
      var blocked=false;
      if(z.x<-1||z.y<-1||z.x+z.w>W+1||z.y+z.h>H+1)blocked=true;
      items.forEach(function(o){if(o!==it&&inter(z,rect(o))>0)blocked=true});
      if(blocked)msgs.push({t:"warn",m:"<b>"+it.name+"</b> 앞 <b>"+it.cl+"cm</b> 공간이 부족합니다. 문·서랍을 열거나 드나들기 어려울 수 있어요."});
    });
    // 통로 좁음
    var seen={};
    for(var i=0;i<items.length;i++)for(var j=i+1;j<items.length;j++){
      var gp=passGap(rect(items[i]),rect(items[j]));
      if(gp!==null&&gp>=5&&gp<MIN_PASS){
        var k=items[i].name+"|"+items[j].name;
        if(!seen[k]){seen[k]=1;
          msgs.push({t:"warn",m:"<b>"+items[i].name+"</b>–<b>"+items[j].name+"</b> 사이 통로가 <b>"+Math.round(gp)+"cm</b>입니다. (지나다니려면 최소 60cm 권장)"});}
      }
    }
    // 창문 가림
    openings.filter(function(o){return o.type==="w"}).forEach(function(o){
      var q=opGeo(o),strip;
      if(o.wall==="top")strip={x:Math.min(q.x1,q.x2),y:0,w:o.width,h:30};
      else if(o.wall==="bottom")strip={x:Math.min(q.x1,q.x2),y:H-30,w:o.width,h:30};
      else if(o.wall==="left")strip={x:0,y:Math.min(q.y1,q.y2),w:30,h:o.width};
      else strip={x:W-30,y:Math.min(q.y1,q.y2),w:30,h:o.width};
      items.forEach(function(it){
        if(inter(strip,rect(it))>0)msgs.push({t:"warn",m:"<b>"+it.name+"</b>이(가) <b>창문</b>을 가립니다. 채광·환기를 확인하세요."});
      });
    });
    // 점유율
    var used=0; items.forEach(function(it){used+=ew(it)*eh(it)});
    var pct=W*H>0?used/(W*H)*100:0;
    if(items.length&&!msgs.length)msgs.push({t:"ok",m:"문제 없는 배치입니다. 통로·문 열림·앞 공간 모두 확보됐어요."});
    return{msgs:msgs,pct:pct};
  }

  function renderDiag(){
    var v=validate();
    var box=$("diag"); box.innerHTML="";
    if(!items.length){
      box.innerHTML='<div class="diag-item ok"><span class="ic">💡</span><span>아래에서 가구를 추가하면 배치 진단이 시작됩니다.</span></div>';
    }else{
      v.msgs.slice(0,12).forEach(function(m){
        var d=document.createElement("div");
        d.className="diag-item "+m.t;
        d.innerHTML='<span class="ic">'+(m.t==="err"?"⛔":m.t==="warn"?"⚠️":"✅")+'</span><span>'+m.m+'</span>';
        box.appendChild(d);
      });
    }
    var pct=Math.round(v.pct);
    $("occ-v").textContent=pct+"%";
    var f=$("occ-f"); f.style.width=Math.min(100,pct)+"%";
    f.className="occ-fill"+(pct>50?" bad":pct>35?" warn":"");
    $("occ-note").textContent=pct>50?"가구가 많아 답답할 수 있어요":pct>35?"적당히 채워진 편":"여유로운 편";
    render();
    renderList();
  }

  function renderList(){
    var ul=$("ilist"); ul.innerHTML="";
    items.forEach(function(it){
      var li=document.createElement("li");
      li.className=it.id===selId?"on":"";
      li.innerHTML='<span class="nm">'+it.name+'</span><span class="sz">'+ew(it)+'×'+eh(it)+'cm</span>';
      li.addEventListener("click",function(){selId=it.id;syncSel();renderDiag();});
      ul.appendChild(li);
    });
    $("ilist-empty").hidden=items.length>0;
  }
  function syncSel(){
    var it=items.filter(function(x){return x.id===selId})[0];
    $("sel-bar").hidden=!it; $("sel-empty").hidden=!!it;
    if(it)$("sel-nm").textContent=it.name+" ("+ew(it)+"×"+eh(it)+"cm)";
  }

  /* ---------- 가구 추가/조작 ---------- */
  function addItem(p){
    var it={id:uid++,name:p.n,w:p.w,h:p.h,x:0,y:0,rot:0,cl:p.cl||0};
    // 빈 곳 찾기(격자 탐색)
    var placed=false;
    for(var y=0;y<=room.h-p.h&&!placed;y+=SNAP)for(var x=0;x<=room.w-p.w&&!placed;x+=SNAP){
      it.x=x;it.y=y;
      var ok=true;
      items.forEach(function(o){if(inter(rect(it),rect(o))>0)ok=false});
      if(ok)placed=true;
    }
    if(!placed){it.x=0;it.y=0;}
    items.push(it); selId=it.id;
    syncSel(); renderDiag();
  }
  function clampItem(it){
    it.x=clamp(it.x,0,Math.max(0,room.w-ew(it)));
    it.y=clamp(it.y,0,Math.max(0,room.h-eh(it)));
  }

  /* ---------- 드래그 ---------- */
  var drag=null;
  function toSvg(e){
    var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  svg.addEventListener("pointerdown",function(e){
    var g=e.target.closest?e.target.closest(".furn"):null;
    if(!g){selId=null;syncSel();renderDiag();return;}
    var id=+g.getAttribute("data-id");
    var it=items.filter(function(x){return x.id===id})[0]; if(!it)return;
    selId=id; syncSel();
    var p=toSvg(e);
    drag={it:it,dx:p.x-it.x,dy:p.y-it.y};
    g.classList.add("dragging");
    svg.setPointerCapture(e.pointerId);
    renderDiag();
    e.preventDefault();
  });
  svg.addEventListener("pointermove",function(e){
    if(!drag)return;
    var p=toSvg(e);
    drag.it.x=snap(p.x-drag.dx); drag.it.y=snap(p.y-drag.dy);
    clampItem(drag.it);
    renderDiag();
    e.preventDefault();
  });
  function endDrag(e){ if(!drag)return; drag=null; try{svg.releasePointerCapture(e.pointerId)}catch(_){} renderDiag(); }
  svg.addEventListener("pointerup",endDrag);
  svg.addEventListener("pointercancel",endDrag);

  $("rot").addEventListener("click",function(){
    var it=items.filter(function(x){return x.id===selId})[0]; if(!it)return;
    it.rot=(it.rot+90)%360; clampItem(it); syncSel(); renderDiag();
  });
  $("del").addEventListener("click",function(){
    items=items.filter(function(x){return x.id!==selId}); selId=null; syncSel(); renderDiag();
  });
  $("clear-all").addEventListener("click",function(){
    if(!items.length)return;
    items=[]; selId=null; syncSel(); renderDiag();
  });

  /* ---------- 방 크기 ---------- */
  function syncRoomUI(){
    $("rw").value=room.w; $("rh").value=room.h;
    $("rw-v").textContent=(room.w/100).toFixed(1)+"m";
    $("rh-v").textContent=(room.h/100).toFixed(1)+"m";
    $("rw").style.setProperty("--p",((room.w-200)/600*100)+"%");
    $("rh").style.setProperty("--p",((room.h-200)/700*100)+"%");
    $("py-out").textContent=(room.w*room.h/PYEONG).toFixed(1)+"평";
    items.forEach(clampItem);
  }
  $("py").addEventListener("input",function(){
    var p=+$("py").value||0; if(p<=0)return;
    var area=p*PYEONG, w=Math.round(Math.sqrt(area*0.8)/10)*10;
    w=clamp(w,200,800);
    var h=clamp(Math.round(area/w/10)*10,200,900);
    room.w=w; room.h=h; syncRoomUI(); renderDiag();
  });
  $("rw").addEventListener("input",function(){room.w=+$("rw").value;syncRoomUI();renderDiag();});
  $("rh").addEventListener("input",function(){room.h=+$("rh").value;syncRoomUI();renderDiag();});

  /* ---------- 개구부 ---------- */
  function renderOps(){
    var box=$("op-list"); box.innerHTML="";
    openings.forEach(function(o,i){
      var names={top:"위",right:"오른쪽",bottom:"아래",left:"왼쪽"};
      var c=document.createElement("span"); c.className="op-chip";
      c.innerHTML='<span>'+(o.type==="d"?"🚪 문":"🪟 창문")+' · '+names[o.wall]+' · '+o.width+'cm</span>';
      var b=document.createElement("button"); b.type="button"; b.textContent="×"; b.title="삭제";
      b.addEventListener("click",function(){openings.splice(i,1);renderOps();renderDiag();});
      c.appendChild(b); box.appendChild(c);
    });
    $("op-empty").hidden=openings.length>0;
  }
  $("op-add").addEventListener("click",function(){
    openings.push({wall:$("op-wall").value,pos:+$("op-pos").value/100,width:+$("op-w").value||90,type:$("op-type").value});
    renderOps(); renderDiag();
  });

  /* ---------- 프리셋 UI ---------- */
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

  /* ---------- 직접 입력 / 치수 붙여넣기 ---------- */
  $("add-custom").addEventListener("click",function(){
    var n=($("c-name").value||"가구").trim().replace(/[:|]/g,"");
    var w=+$("c-w").value||0, h=+$("c-h").value||0;
    if(w<10||h<10){$("c-w").focus();return;}
    addItem({n:n,w:Math.round(w),h:Math.round(h),cl:+$("c-cl").value||0});
  });
  function parseDims(t){
    t=(t||"").replace(/,/g,"");
    // mm 표기 추정: 가구는 한 변이 500cm를 넘지 않으므로, 500 이상이면 mm로 보고 10으로 나눔.
    // 단, 나눈 값이 10cm 미만이면 비현실적이므로 그 값은 원래대로 둔다. (예: 80 x 1800 → 80 x 180)
    function norm(a,b){
      if(Math.max(a,b)>=500){
        var na=a/10, nb=b/10;
        if(na>=10)a=na;
        if(nb>=10)b=nb;
      }
      return{w:Math.min(500,Math.round(a)),h:Math.min(500,Math.round(b))};
    }
    // "1200x600", "W1400 x D700 x H750" 등 (W/D/H 접두사 허용, 앞 두 값=가로·세로)
    var m=t.match(/(?:[WDH]\s*)?(\d{2,4}(?:\.\d+)?)\s*(?:cm|mm|m)?\s*[x×*]\s*(?:[WDH]\s*)?(\d{2,4}(?:\.\d+)?)/i);
    if(m)return norm(+m[1],+m[2]);
    var w=t.match(/(?:가로|폭|너비|width)\s*[:=]?\s*(\d{2,4}(?:\.\d+)?)/i);
    var d=t.match(/(?:세로|깊이|길이|depth)\s*[:=]?\s*(\d{2,4}(?:\.\d+)?)/i);
    if(w&&d)return norm(+w[1],+d[1]);
    return null;
  }
  $("paste").addEventListener("input",function(){
    var r=parseDims($("paste").value);
    if(r){
      $("c-w").value=r.w; $("c-h").value=r.h;
      $("paste-res").innerHTML="추출됨 → 가로 <b>"+r.w+"cm</b> × 세로 <b>"+r.h+"cm</b> (아래 값에 자동 입력됨)";
    }else{
      $("paste-res").textContent=$("paste").value.trim()?"치수를 찾지 못했어요. 아래에 직접 입력해 주세요.":"";
    }
  });

  /* ---------- 공유 ---------- */
  function encode(){
    var o=openings.map(function(x){return x.wall+":"+x.pos.toFixed(2)+":"+x.width+":"+x.type}).join("|");
    var i=items.map(function(t){return t.name.replace(/[:|]/g,"")+":"+t.w+":"+t.h+":"+t.x+":"+t.y+":"+t.rot+":"+t.cl}).join("|");
    return location.origin+location.pathname+"?r="+room.w+"x"+room.h+"&o="+encodeURIComponent(o)+"&i="+encodeURIComponent(i);
  }
  function decode(){
    var q=location.search.replace(/^\?/,""); if(!q)return false;
    var p={}; q.split("&").forEach(function(kv){var a=kv.split("=");p[a[0]]=decodeURIComponent(a[1]||"")});
    if(p.r&&/^\d+x\d+$/.test(p.r)){var d=p.r.split("x");room.w=clamp(+d[0],200,800);room.h=clamp(+d[1],200,900);}
    if(p.o)p.o.split("|").filter(Boolean).forEach(function(s){
      var a=s.split(":"); if(a.length<4)return;
      openings.push({wall:a[0],pos:+a[1],width:+a[2],type:a[3]});
    });
    if(p.i)p.i.split("|").filter(Boolean).forEach(function(s){
      var a=s.split(":"); if(a.length<7)return;
      items.push({id:uid++,name:a[0],w:+a[1],h:+a[2],x:+a[3],y:+a[4],rot:+a[5],cl:+a[6]});
    });
    return true;
  }
  $("share").addEventListener("click",function(){
    var url=encode(),b=$("share"),old=b.textContent;
    function done(){b.textContent="✓ 링크 복사됨";setTimeout(function(){b.textContent=old},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,function(){prompt("링크를 복사하세요:",url)});
    else prompt("링크를 복사하세요:",url);
  });

  /* ---------- 초기화 ---------- */
  var restored=decode();
  if(!restored)openings.push({wall:"bottom",pos:0.25,width:90,type:"d"});
  $("py").value=(room.w*room.h/PYEONG).toFixed(1);
  syncRoomUI(); renderOps(); renderPresets(); syncSel(); renderDiag();
})();
