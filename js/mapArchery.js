/* =========================================================
   여행지 활쏘기 (map-archery)
   - data/travel-districts.json(통계청 SGIS 공공누리 1유형 원본을
     southkorea/southkorea-maps에서 받아 mapshaper로 간략화한 가공본,
     시군구 250곳)를 fetch해서 캔버스에 회전시키며 그린다.
   - 화살은 "화면 고정 좌표계"에서 직선으로 날아간다(지도가 도는 것과
     무관). 맞는 순간의 지도 회전각을 역보정해서 지도 로컬 좌표 → 위경도로
     되돌린 뒤 point-in-polygon 판정한다. 판정은 이 직선 로직 하나뿐이고,
     화면에 그리는 화살 궤적의 살짝 휘는 아치는 순수 연출이라 판정에
     영향을 주지 않는다.

   KO/EN 공유: window.MA_LANG="en"이면 결과 카드에 nameEn/provinceEn을 쓴다.
   지역 매칭(point-in-polygon)은 언어와 무관하게 항상 원본 좌표로 한다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  var canvas=$("ma-canvas");
  if(!canvas) return;
  var LANG=(window.MA_LANG==="en")?"en":"ko";
  var DATA_PREFIX=LANG==="en"?"../../data/":"../data/";

  var ctx=canvas.getContext("2d");
  var W=canvas.width, H=canvas.height;
  var CX=W/2, CY=H/2;
  var MAP_R=W*0.42;
  var ANCHOR={x:CX,y:H*0.90};

  var MAX_PULL=130;
  var MIN_DIST=60, MAX_DIST=MAP_R*1.63;
  var ARROW_SPEED=480;
  var ROT_SPEED=0.9;
  var ZOOM_MS=650, TARGET_ZOOM=2.4;

  var state="loading";
  var rotation=0;
  var lastT=null;

  var features=[], paths=[], projMeta=null;
  var pull=null, flight=null;
  var impactLocal=null, resultFeature=null, zoomStart=0, zoomRotFrozen=0;
  var missTimer=null;

  // ---- vector helpers ----
  function sub(a,b){return {x:a.x-b.x,y:a.y-b.y}}
  function add(a,b){return {x:a.x+b.x,y:a.y+b.y}}
  function scl(a,s){return {x:a.x*s,y:a.y*s}}
  function len(a){return Math.sqrt(a.x*a.x+a.y*a.y)}
  function norm(a){var l=len(a)||1; return {x:a.x/l,y:a.y/l}}
  function perp(a){return {x:-a.y,y:a.x}}
  function lerp(a,b,t){return a+(b-a)*t}
  function lerpPt(a,b,t){return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)}}
  function easeOutCubic(t){return 1-Math.pow(1-t,3)}
  function rotatePoint(x,y,ang){
    var c=Math.cos(ang), s=Math.sin(ang);
    return {x:x*c-y*s, y:x*s+y*c};
  }
  function isDark(){
    var t=document.documentElement.getAttribute("data-theme");
    if(t==="dark") return true;
    if(t==="light") return false;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  // ---- load data & build projection ----
  var blurbs={};
  fetch(DATA_PREFIX+"travel-districts.json").then(function(r){return r.json()}).then(function(geo){
    features=geo.features;
    buildProjection();
    buildPaths();
    var loading=$("ma-loading"); if(loading) loading.hidden=true;
    state="idle";
    lastT=null;
    requestAnimationFrame(tick);
  }).catch(function(){
    var loading=$("ma-loading"); if(loading) loading.hidden=true;
    var err=$("ma-error"); if(err) err.hidden=false;
  });
  if(LANG!=="en"){
    fetch(DATA_PREFIX+"district-blurbs.json").then(function(r){return r.json()}).then(function(b){ blurbs=b; }).catch(function(){});
  }

  function eachCoord(geom,fn){
    (function walk(c){
      if(typeof c[0]==="number"){ fn(c[0],c[1]); return; }
      c.forEach(walk);
    })(geom.coordinates);
  }

  function buildProjection(){
    var minLon=Infinity,maxLon=-Infinity,minLat=Infinity,maxLat=-Infinity;
    features.forEach(function(f){
      eachCoord(f.geometry, function(x,y){
        if(x<minLon)minLon=x; if(x>maxLon)maxLon=x;
        if(y<minLat)minLat=y; if(y>maxLat)maxLat=y;
      });
    });
    var centerLon=(minLon+maxLon)/2, centerLat=(minLat+maxLat)/2;
    var xScale=Math.cos(centerLat*Math.PI/180);
    var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    features.forEach(function(f){
      eachCoord(f.geometry, function(lon,lat){
        var x=(lon-centerLon)*xScale, y=-(lat-centerLat);
        if(x<minX)minX=x; if(x>maxX)maxX=x;
        if(y<minY)minY=y; if(y>maxY)maxY=y;
      });
    });
    var span=Math.max(maxX-minX, maxY-minY);
    projMeta={centerLon:centerLon,centerLat:centerLat,xScale:xScale,scale:(MAP_R*2*0.94)/span};
  }

  function projectLocal(lon,lat){
    return {
      x:(lon-projMeta.centerLon)*projMeta.xScale*projMeta.scale,
      y:-(lat-projMeta.centerLat)*projMeta.scale
    };
  }
  function unprojectLocal(x,y){
    return {
      lon: x/(projMeta.xScale*projMeta.scale)+projMeta.centerLon,
      lat: -(y/projMeta.scale)+projMeta.centerLat
    };
  }

  function buildPaths(){
    paths=features.map(function(f){
      var p=new Path2D();
      var geom=f.geometry;
      var polys = geom.type==="Polygon" ? [geom.coordinates] : geom.coordinates;
      polys.forEach(function(rings){
        rings.forEach(function(ring){
          ring.forEach(function(pt,i){
            var lp=projectLocal(pt[0],pt[1]);
            if(i===0) p.moveTo(lp.x,lp.y); else p.lineTo(lp.x,lp.y);
          });
          p.closePath();
        });
      });
      return p;
    });
  }

  // ---- point-in-polygon (lon/lat space, raw geometry) ----
  function pointInRing(x,y,ring){
    var inside=false;
    for(var i=0,j=ring.length-1;i<ring.length;j=i++){
      var xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
      var hit=((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
      if(hit) inside=!inside;
    }
    return inside;
  }
  function pointInPolygonCoords(x,y,polyCoords){
    if(!pointInRing(x,y,polyCoords[0])) return false;
    for(var h=1;h<polyCoords.length;h++){ if(pointInRing(x,y,polyCoords[h])) return false; }
    return true;
  }
  function hitTest(lon,lat){
    for(var i=0;i<features.length;i++){
      var geom=features[i].geometry;
      if(geom.type==="Polygon"){
        if(pointInPolygonCoords(lon,lat,geom.coordinates)) return features[i];
      } else {
        for(var k=0;k<geom.coordinates.length;k++){
          if(pointInPolygonCoords(lon,lat,geom.coordinates[k])) return features[i];
        }
      }
    }
    return null;
  }

  // ---- pointer interaction ----
  function toCanvasPt(e){
    var rect=canvas.getBoundingClientRect();
    var sx=W/rect.width, sy=H/rect.height;
    return {x:(e.clientX-rect.left)*sx, y:(e.clientY-rect.top)*sy};
  }
  canvas.addEventListener("pointerdown",function(e){
    if(state!=="idle") return;
    if(canvas.setPointerCapture){ try{ canvas.setPointerCapture(e.pointerId); }catch(err){} }
    pull=toCanvasPt(e);
    state="aiming";
    updatePowerUI();
  });
  canvas.addEventListener("pointermove",function(e){
    if(state!=="aiming") return;
    pull=toCanvasPt(e);
    updatePowerUI();
  });
  canvas.addEventListener("pointerup",function(){
    if(state!=="aiming") return;
    releaseShot();
  });
  canvas.addEventListener("pointercancel",function(){
    if(state==="aiming"){ state="idle"; pull=null; hidePowerUI(); }
  });

  function updatePowerUI(){
    var pullVec=sub(pull,ANCHOR);
    var power=Math.min(len(pullVec),MAX_PULL)/MAX_PULL;
    var wrap=$("ma-power"), fill=$("ma-power-fill");
    if(wrap) wrap.hidden=false;
    if(fill) fill.style.width=(power*100)+"%";
  }
  function hidePowerUI(){ var wrap=$("ma-power"); if(wrap) wrap.hidden=true; }

  function releaseShot(){
    var pullVec=sub(pull,ANCHOR);
    var dist=Math.min(len(pullVec),MAX_PULL);
    hidePowerUI();
    if(dist<12){ state="idle"; pull=null; return; }
    var power=dist/MAX_PULL;
    var dir=norm(scl(pullVec,-1));
    var flightDist=MIN_DIST+power*(MAX_DIST-MIN_DIST);
    var end=add(ANCHOR, scl(dir,flightDist));
    var dur=Math.max(0.35, Math.min(1.15, flightDist/ARROW_SPEED));
    flight={start:{x:ANCHOR.x,y:ANCHOR.y}, end:end, dir:dir, dur:dur, t0:performance.now()};
    pull=null;
    state="flying";
  }
  function resolveImpact(){
    var rotAtImpact=rotation;
    var rel={x:flight.end.x-CX, y:flight.end.y-CY};
    var local=rotatePoint(rel.x,rel.y,-rotAtImpact);
    var geo=unprojectLocal(local.x,local.y);
    var hit=hitTest(geo.lon,geo.lat);
    flight=null;
    if(!hit){
      showMiss();
      state="idle";
      return;
    }
    impactLocal=local;
    resultFeature=hit;
    zoomRotFrozen=rotAtImpact;
    zoomStart=performance.now();
    state="zooming";
  }

  function showMiss(){
    var el=$("ma-miss"); if(!el) return;
    el.hidden=false;
    clearTimeout(missTimer);
    missTimer=setTimeout(function(){ el.hidden=true; }, 1400);
  }

  function showResultCard(){
    var f=resultFeature, p=f.properties;
    var name = LANG==="en" ? p.nameEn : p.name;
    var province = LANG==="en" ? p.provinceEn : p.province;
    var lat=p.centroid[1].toFixed(4), lon=p.centroid[0].toFixed(4);
    var elName=$("ma-result-name"); if(elName) elName.textContent=name;
    var elProv=$("ma-result-province"); if(elProv) elProv.textContent=province;
    var elCoord=$("ma-result-coord"); if(elCoord) elCoord.textContent=lat+"°N, "+lon+"°E";
    var elBlurb=$("ma-result-blurb"); if(elBlurb) elBlurb.textContent=blurbs[p.code]||"";
    var card=$("ma-result"); if(card) card.hidden=false;
  }
  var replayBtn=$("ma-replay");
  if(replayBtn) replayBtn.addEventListener("click", function(){
    var card=$("ma-result"); if(card) card.hidden=true;
    resultFeature=null; impactLocal=null;
    state="idle";
  });

  // ---- drawing ----
  function drawArrowShape(from,to,dir){
    ctx.strokeStyle=isDark()?"#ddd":"#444";
    ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(from.x,from.y); ctx.lineTo(to.x,to.y); ctx.stroke();
    var pxy=perp(dir);
    var h1=add(to, add(scl(dir,-8),scl(pxy,5)));
    var h2=add(to, add(scl(dir,-8),scl(pxy,-5)));
    ctx.fillStyle=ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(to.x,to.y); ctx.lineTo(h1.x,h1.y); ctx.lineTo(h2.x,h2.y); ctx.closePath(); ctx.fill();
  }

  function drawBow(){
    var pullVec=sub(pull,ANCHOR);
    var dist=Math.min(len(pullVec),MAX_PULL);
    var dir=norm(scl(pullVec,-1));
    drawBowAndArrow(dir,dist,true);
  }
  function drawIdleBow(){
    drawBowAndArrow({x:0,y:-1},0,false);
  }
  function drawBowAndArrow(dir,dist,showAimLine){
    var nock=add(ANCHOR, scl(dir,-dist));
    var pxy=perp(dir);
    var half=34, depth=14;
    var tip1=add(add(ANCHOR,scl(pxy,half)), scl(dir,-depth));
    var tip2=add(add(ANCHOR,scl(pxy,-half)), scl(dir,-depth));
    var bulge=add(ANCHOR, scl(dir,-(depth+22)));

    ctx.save();
    ctx.lineCap="round";
    ctx.strokeStyle=isDark()?"#c9a15a":"#8a5a2b";
    ctx.lineWidth=5;
    ctx.beginPath();
    ctx.moveTo(tip1.x,tip1.y);
    ctx.quadraticCurveTo(bulge.x,bulge.y,tip2.x,tip2.y);
    ctx.stroke();

    ctx.strokeStyle=isDark()?"#eee":"#333";
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(tip1.x,tip1.y); ctx.lineTo(nock.x,nock.y); ctx.lineTo(tip2.x,tip2.y);
    ctx.stroke();

    drawArrowShape(nock, add(ANCHOR, scl(dir,18)), dir);

    if(showAimLine){
      ctx.setLineDash([4,6]);
      ctx.strokeStyle="rgba(120,120,120,.55)";
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(ANCHOR.x,ANCHOR.y);
      ctx.lineTo(ANCHOR.x+dir.x*170, ANCHOR.y+dir.y*170);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawFlyingArrow(now){
    var t=Math.min(1,(now-flight.t0)/1000/flight.dur);
    var pos=lerpPt(flight.start,flight.end,t);
    var pxy=perp(flight.dir);
    var bulge=Math.sin(t*Math.PI)*18;
    pos=add(pos, scl(pxy,bulge));
    drawArrowShape(sub(pos, scl(flight.dir,16)), pos, flight.dir);
  }

  function renderFrame(rot, zoom, cam, markImpact){
    var dark=isDark();
    ctx.save();
    ctx.translate(CX,CY);
    ctx.rotate(rot);
    ctx.scale(zoom,zoom);
    ctx.translate(-cam.x,-cam.y);
    for(var i=0;i<paths.length;i++){
      ctx.fillStyle = dark ? (i%2===0?"#2b3a2f":"#243329") : (i%2===0?"#eaf3ea":"#dcebe0");
      ctx.fill(paths[i]);
      ctx.strokeStyle = dark ? "#4d6b55" : "#8fae95";
      ctx.lineWidth=1/zoom;
      ctx.stroke(paths[i]);
    }
    if(markImpact && impactLocal){
      ctx.fillStyle="#d9483c";
      ctx.beginPath(); ctx.arc(impactLocal.x,impactLocal.y,5/zoom,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function tick(now){
    try{
      if(lastT===null) lastT=now;
      var dt=(now-lastT)/1000; lastT=now;

      if(state==="idle"||state==="aiming"||state==="flying"){
        rotation += ROT_SPEED*dt;
      }

      ctx.clearRect(0,0,W,H);

      if(state==="zooming"||state==="result"){
        var t = state==="zooming" ? Math.min(1,(now-zoomStart)/ZOOM_MS) : 1;
        var e=easeOutCubic(t);
        renderFrame(zoomRotFrozen, 1+e*(TARGET_ZOOM-1), lerpPt({x:0,y:0},impactLocal,e), true);
        if(state==="zooming" && t>=1){ state="result"; showResultCard(); }
      } else {
        renderFrame(rotation,1,{x:0,y:0},false);
        if(state==="idle") drawIdleBow();
        if(state==="aiming") drawBow();
        if(state==="flying") drawFlyingArrow(now);
      }

      if(state==="flying"){
        var ft=(now-flight.t0)/1000/flight.dur;
        if(ft>=1) resolveImpact();
      }
    }catch(err){
      state="idle"; flight=null; pull=null;
      hidePowerUI();
    }
    requestAnimationFrame(tick);
  }
})();
