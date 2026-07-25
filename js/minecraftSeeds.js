/* =========================================================
   마인크래프트 시드 추천기 (minecraft-seeds)
   - 서버 없음. data/minecraft-seeds.json(204개, 실제 수집)을 같은 사이트에서 fetch.
   - 로딩 연출의 "5,000여 개" 카운트는 순수 애니메이션 장식이며, 실제 추천은
     항상 204개의 검증된 데이터 안에서만 이루어짐(과장 없음 원칙).
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("stepQ1"))return;

  var GROUPS=[
    {id:"nature",icon:"🌿",label:"자연 경관이 예쁜 곳",tags:["자연경관","벚꽃숲","겨울설원","사막","정글","초원평원","버섯섬","해양난파선"]},
    {id:"survival",icon:"🏘️",label:"마을·자원이 많은 생존",tags:["마을근접","촌락밀집","생존초반유리"]},
    {id:"ruins",icon:"🏛️",label:"던전·유적 탐험",tags:["던전유적"]},
    {id:"rare",icon:"💎",label:"희귀·독특한 지형",tags:["희귀독특"]},
    {id:"build",icon:"🏗️",label:"건축하기 좋은 곳",tags:["건축용"]},
    {id:"speedrun",icon:"🏃",label:"스피드런에 좋은 곳",tags:["스피드런"]}
  ];

  var DATA=[], byTag={};
  fetch("../data/minecraft-seeds.json")
    .then(function(r){return r.json()})
    .then(function(list){
      DATA=list||[];
      DATA.forEach(function(s){
        byTag[s.category]=byTag[s.category]||[];
        byTag[s.category].push(s);
      });
      renderQ1();
    })
    .catch(function(){
      $("mc-q1").innerHTML='<div class="helper">시드 데이터를 불러오지 못했어요. 새로고침해 주세요.</div>';
    });

  function tagCount(tag){ return (byTag[tag]||[]).length; }
  function groupCount(g){ return g.tags.reduce(function(sum,t){return sum+tagCount(t)},0); }

  function renderQ1(){
    var box=$("mc-q1"); box.innerHTML="";
    GROUPS.forEach(function(g){
      var b=document.createElement("button");
      b.type="button"; b.className="mc-opt";
      b.innerHTML='<span class="ic">'+g.icon+'</span><span class="lb">'+g.label+'</span><span class="n">'+groupCount(g)+'개</span>';
      b.addEventListener("click",function(){
        if(g.tags.length>1){ renderQ2(g); $("stepQ1").hidden=true; $("stepQ2").hidden=false; $("stepQ2").scrollIntoView({behavior:"smooth",block:"start"}); }
        else{ startResult(g.tags[0]); }
      });
      box.appendChild(b);
    });
  }

  function renderQ2(g){
    var box=$("mc-q2"); box.innerHTML="";
    g.tags.forEach(function(tag){
      var b=document.createElement("button");
      b.type="button"; b.className="mc-opt";
      b.innerHTML='<span class="ic">📍</span><span class="lb">'+tag+'</span><span class="n">'+tagCount(tag)+'개</span>';
      b.addEventListener("click",function(){ startResult(tag); });
      box.appendChild(b);
    });
  }
  $("mc-back").addEventListener("click",function(){
    $("stepQ2").hidden=true; $("stepQ1").hidden=false;
    $("stepQ1").scrollIntoView({behavior:"smooth",block:"start"});
  });

  var currentTag=null;
  function startResult(tag){
    currentTag=tag;
    $("stepQ1").hidden=true; $("stepQ2").hidden=true;
    runScanAnimation(function(){ showResult(tag); });
  }
  function runScanAnimation(cb){
    var overlay=$("mc-loading"), numEl=$("mc-loading-num");
    overlay.hidden=false;
    overlay.scrollIntoView({behavior:"smooth",block:"start"});
    var target=5000+Math.floor(Math.random()*400);
    var start=null, dur=900;
    function tick(ts){
      if(!start)start=ts;
      var p=Math.min(1,(ts-start)/dur);
      numEl.textContent=Math.floor(p*target).toLocaleString();
      if(p<1)requestAnimationFrame(tick);
      else setTimeout(function(){ overlay.hidden=true; cb(); },350);
    }
    requestAnimationFrame(tick);
  }

  function pickRandom(tag,n){
    var pool=(byTag[tag]||[]).slice();
    for(var i=pool.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
    return pool.slice(0,n);
  }
  function escapeHtml(s){
    return (s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});
  }

  function showResult(tag){
    var n=Math.min(3,Math.max(2, tagCount(tag)>=3?3:2));
    var picks=pickRandom(tag,n);
    $("mc-result-title").textContent=tag+" 추천 시드";
    $("mc-result-sub").textContent="204개 중 "+tagCount(tag)+"개 후보에서 무작위로 골랐어요.";
    $("mc-results").innerHTML=picks.map(function(s){
      return '<div class="mc-card">'
        +'<div class="mc-seed-row"><span class="mc-seed">'+escapeHtml(s.seed)+'</span><button type="button" class="mc-copy" data-seed="'+escapeHtml(s.seed)+'">📋 복사</button></div>'
        +'<div class="mc-meta"><span class="mc-tag">'+escapeHtml(s.edition||"미상")+'</span><span class="mc-tag">v'+escapeHtml(s.version||"미상")+'</span></div>'
        +'<div class="mc-desc">'+escapeHtml(s.description||"")+'</div>'
        +(s.source_url?'<div class="mc-src">출처: <a href="'+escapeHtml(s.source_url)+'" target="_blank" rel="noopener">'+escapeHtml(s.source_url)+'</a></div>':'')
        +'</div>';
    }).join("");
    Array.prototype.forEach.call($("mc-results").querySelectorAll(".mc-copy"),function(btn){
      btn.addEventListener("click",function(){
        var seed=btn.getAttribute("data-seed");
        var done=function(){var old=btn.textContent;btn.textContent="✓ 복사됨";setTimeout(function(){btn.textContent=old},1400);};
        if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(seed).then(done,function(){prompt("복사하세요:",seed)});
        else prompt("복사하세요:",seed);
      });
    });
    $("stepResult").hidden=false;
    $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
    if($("adwrap"))$("adwrap").hidden=false;
  }

  $("mc-reroll").addEventListener("click",function(){ if(currentTag)showResult(currentTag); });
  $("mc-restart").addEventListener("click",function(){
    $("stepResult").hidden=true;
    $("stepQ1").hidden=false;
    $("stepQ1").scrollIntoView({behavior:"smooth",block:"start"});
  });
})();
