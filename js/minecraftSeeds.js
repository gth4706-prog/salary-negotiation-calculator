/* =========================================================
   마인크래프트 시드 추천기 (minecraft-seeds)
   - 서버 없음. data/minecraft-seeds.json을 같은 사이트에서 fetch.
   - 무작위 추첨이 아니라, 실제 시드 데이터(카테고리·설명문)에서 뽑아낸
     특징과 사용자 답변을 점수로 매칭해 상위 1~2개를 고른다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("mc-quiz"))return;

  /* ---------- 시드 1건에서 특징 추출 ---------- */
  function featuresOf(s){
    var t=(s.category||"")+" "+(s.description||"");
    // 한 글자 키워드가 무관한 단어에 걸리는 걸 막는다.
    // '산': 광산(동굴)·산호(바다)·황산염·빙산·산산이 → 산악으로 오판. 해당 단어만 지운 사본으로 검사.
    //       산맥·산악·산비탈·톱니산·산양 등 진짜 산악 표현은 그대로 남는다.
    var tm=t.replace(/광산|산호초|산호|황산염|빙산|산산이/g,"");
    // '섬': 섬뜩한·이스터섬(석상 비유) → 바다로 오판.
    var to=t.replace(/섬뜩|이스터섬/g,"");
    return {
      village:/마을|촌락/.test(t),
      ruins:/저택|사원|유적|초소|요새|고대|기념물|던전|폐허|시험실/.test(t),
      cave:/동굴|광산|협곡|다이아|광물|자원|치즈/.test(t),
      forest:/숲|벚꽃|꽃/.test(t),
      snow:/눈|얼음|설원|타이가|서리/.test(t),
      desert:/사막|황토|메사/.test(t),
      jungle:/정글|대나무/.test(t),
      ocean:/바다|해양|섬|난파선|산호/.test(to),
      mountain:/산|절벽|봉우리|계곡|고원/.test(tm)
    };
  }

  /* ---------- 질문지 ---------- */
  var QUESTIONS=[
    {id:"edition",t:"어떤 에디션으로 플레이하세요?",opts:[
      ["java","☕","자바 (PC)"],
      ["bedrock","🧱","베드락 (모바일·콘솔)"],
      ["any","🎮","상관없어요"]
    ]},
    {id:"style",t:"이번 월드에서 뭘 하고 싶으세요?",opts:[
      ["settle","🏘️","자리 잡고 생존하기"],
      ["explore","🧭","유적·던전 탐험하기"],
      ["build","🏗️","예쁜 곳에 건축하기"],
      ["speed","🏃","빠르게 클리어하기"],
      ["weird","💎","특이한 지형 구경하기"]
    ]},
    {id:"scene",t:"어떤 풍경에서 시작하고 싶으세요?",opts:[
      ["forest","🌸","숲·벚꽃"],
      ["snow","❄️","눈·얼음"],
      ["desert","🏜️","사막"],
      ["jungle","🌴","정글"],
      ["ocean","🌊","바다·섬"],
      ["mountain","⛰️","산·절벽"],
      ["any","🎲","상관없어요"]
    ]},
    {id:"near","t":"스폰 근처에 뭐가 있으면 좋겠어요?",opts:[
      ["village","🏡","마을"],
      ["ruins","🏛️","유적·던전"],
      ["cave","⛏️","동굴·광물"],
      ["any","🤷","상관없어요"]
    ]}
  ];

  var STYLE_CATS={
    settle:["마을근접","촌락밀집","생존초반유리"],
    explore:["던전유적","해양난파선"],
    build:["건축용","벚꽃숲","초원평원"],
    speed:["스피드런"],
    weird:["희귀독특","자연경관"]
  };
  var SCENE_LABEL={forest:"숲·벚꽃",snow:"눈·얼음",desert:"사막",jungle:"정글",ocean:"바다·섬",mountain:"산·절벽"};
  var NEAR_LABEL={village:"마을 근처",ruins:"유적·던전",cave:"동굴·광물"};
  var STYLE_LABEL={settle:"생존 정착",explore:"탐험",build:"건축",speed:"스피드런",weird:"특이 지형"};

  var DATA=[], POOL=[], answers={}, qIdx=0, ranked=[], shownFrom=0, poolFrom=0;

  Promise.all([
    fetch("../data/minecraft-seeds.json").then(function(r){return r.json()}),
    fetch("../data/minecraft-seeds-random.json").then(function(r){return r.json()}).catch(function(){return{seeds:[]}})
  ]).then(function(res){
    DATA=(res[0]||[]).map(function(s){ s._f=featuresOf(s); return s; });
    POOL=(res[1]&&res[1].seeds)||[];
    var total=DATA.length+POOL.length;
    if($("mc-total"))$("mc-total").textContent=total.toLocaleString();
    renderQuestion();
  }).catch(function(){
    $("mc-quiz").innerHTML='<div class="helper">시드 데이터를 불러오지 못했어요. 새로고침해 주세요.</div>';
  });

  /* ---------- 질문 렌더 ---------- */
  function renderProgress(){
    var box=$("mc-progress"); box.innerHTML="";
    for(var i=0;i<QUESTIONS.length;i++){
      var s=document.createElement("span");
      if(i<qIdx)s.className="done";
      box.appendChild(s);
    }
  }
  function renderQuestion(){
    if(qIdx>=QUESTIONS.length){ finish(); return; }
    renderProgress();
    var q=QUESTIONS[qIdx];
    $("mc-q-title").textContent=(qIdx+1)+". "+q.t;
    var box=$("mc-opts"); box.innerHTML="";
    q.opts.forEach(function(o){
      var b=document.createElement("button");
      b.type="button"; b.className="mc-opt";
      b.innerHTML='<span class="ic">'+o[1]+'</span><span class="lb">'+o[2]+'</span>';
      b.addEventListener("click",function(){
        answers[q.id]=o[0];
        qIdx++;
        renderQuestion();
      });
      box.appendChild(b);
    });
    $("mc-back").hidden=qIdx===0;
  }
  $("mc-back").addEventListener("click",function(){
    if(qIdx>0){ qIdx--; renderQuestion(); }
  });

  /* ---------- 점수 매칭 ---------- */
  function editionOk(s){
    var e=(s.edition||"").toLowerCase();
    if(answers.edition==="java")return e.indexOf("java")!==-1;
    if(answers.edition==="bedrock")return e.indexOf("bedrock")!==-1;
    return true;
  }
  function scoreSeed(s){
    var sc=0, why=[];
    var cats=STYLE_CATS[answers.style]||[];
    if(cats.indexOf(s.category)!==-1){ sc+=3; why.push(STYLE_LABEL[answers.style]); }
    if(answers.scene!=="any"&&s._f[answers.scene]){ sc+=3; why.push(SCENE_LABEL[answers.scene]); }
    if(answers.near!=="any"&&s._f[answers.near]){ sc+=2; why.push(NEAR_LABEL[answers.near]); }
    // 양쪽 에디션 지원(Java & Bedrock)은 "사용자가 고른 조건"이 아니라 동점자 정렬용 타이브레이커다.
    // 실질 점수(sc)에 더하면 조건에 하나도 안 맞는 시드가 이 0.5점만으로 후보에 올라오므로 따로 둔다.
    var tie=(answers.edition!=="any"&&(s.edition||"").indexOf("&")!==-1)?0.5:0;
    return {seed:s,score:sc,tie:tie,rank:sc+tie,why:why};
  }
  function computeRanked(){
    // 임계값 sc>0: 실질 조건(스타일 3 / 장면 3 / 근처 2)에서 한 개도 못 맞춘 시드를 뺀다.
    // 가산점 단위가 최소 2점이라 sc>0 은 사실상 "최소 한 조건 충족"과 같다.
    var pool=DATA.filter(editionOk).map(scoreSeed).filter(function(r){return r.score>0});
    pool.sort(function(a,b){ return b.rank-a.rank; }); // 동점일 때만 타이브레이커가 순서를 가른다
    return pool;
  }

  function finish(){
    renderProgress();
    $("stepQuiz").hidden=true;
    runScan(function(){
      ranked=computeRanked();
      shownFrom=0;
      showResult();
    });
  }
  function runScan(cb){
    var overlay=$("mc-loading");
    overlay.hidden=false;
    overlay.scrollIntoView({behavior:"smooth",block:"start"});
    setTimeout(function(){ overlay.hidden=true; cb(); },900);
  }

  function escapeHtml(s){
    return (s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});
  }

  function bindCopy(){
    Array.prototype.forEach.call($("mc-results").querySelectorAll(".mc-copy"),function(btn){
      btn.addEventListener("click",function(){
        var seed=btn.getAttribute("data-seed");
        var done=function(){var old=btn.textContent;btn.textContent="✓ 복사됨";setTimeout(function(){btn.textContent=old},1400);};
        if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(seed).then(done,function(){prompt("복사하세요:",seed)});
        else prompt("복사하세요:",seed);
      });
    });
  }
  function cardHtml(r){
    var s=r.seed;
    var whyChips=r.why.map(function(w){return '<span class="mc-tag match">✓ '+escapeHtml(w)+'</span>'}).join("");
    return '<div class="mc-card">'
      +'<div class="mc-seed-row"><span class="mc-seed">'+escapeHtml(s.seed)+'</span><button type="button" class="mc-copy" data-seed="'+escapeHtml(s.seed)+'">📋 복사</button></div>'
      +'<div class="mc-meta">'+whyChips+'<span class="mc-tag">'+escapeHtml(s.edition||"미상")+'</span><span class="mc-tag">v'+escapeHtml(s.version||"미상")+'</span></div>'
      +'<div class="mc-desc">'+escapeHtml(s.description||"")+'</div>'
      +(s.source_url?'<div class="mc-src">출처: <a href="'+escapeHtml(s.source_url)+'" target="_blank" rel="noopener">'+escapeHtml(s.source_url)+'</a></div>':'')
      +'</div>';
  }
  function poolCardHtml(seedNum){
    return '<div class="mc-card">'
      +'<div class="mc-seed-row"><span class="mc-seed">'+escapeHtml(seedNum)+'</span><button type="button" class="mc-copy" data-seed="'+escapeHtml(seedNum)+'">📋 복사</button></div>'
      +'<div class="mc-meta"><span class="mc-tag unknown">특징 미확인</span></div>'
      +'<div class="mc-desc">아직 아무도 정리하지 않은 시드예요. 어떤 지형이 나올지는 직접 들어가서 확인해보세요.</div>'
      +'</div>';
  }
  function pickPool(n){
    var out=[];
    for(var i=0;i<n&&POOL.length;i++){
      out.push(POOL[Math.floor(Math.random()*POOL.length)]);
    }
    return out;
  }

  function showResult(){
    var picks=ranked.slice(shownFrom,shownFrom+2);

    if(picks.length){
      $("mc-result-title").textContent="이 시드를 추천해요";
      $("mc-result-sub").textContent="답변하신 조건과 가장 잘 맞는 순서예요.";
      $("mc-results").innerHTML=picks.map(cardHtml).join("");
      $("mc-more").hidden=false;
      $("mc-more").textContent=(ranked.length>shownFrom+2)?"다음 후보 보기 →":"미개척 시드도 보기 🎲";
    }else{
      // 정리된 후보를 다 봤거나 조건에 맞는 게 없을 때 → 미개척 시드 풀에서 제시
      $("mc-result-title").textContent="미개척 시드";
      $("mc-result-sub").textContent="아직 특징이 정리되지 않은 시드예요. 직접 들어가서 확인해보세요.";
      $("mc-results").innerHTML=pickPool(2).map(poolCardHtml).join("");
      $("mc-more").hidden=false;
      $("mc-more").textContent="다른 시드 보기 🎲";
    }

    bindCopy();
    $("stepResult").hidden=false;
    $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
    if($("adwrap"))$("adwrap").hidden=false;
  }

  $("mc-more").addEventListener("click",function(){
    shownFrom+=2;
    showResult();
  });
  $("mc-restart").addEventListener("click",function(){
    answers={}; qIdx=0; ranked=[]; shownFrom=0; poolFrom=0;
    $("stepResult").hidden=true;
    $("stepQuiz").hidden=false;
    renderQuestion();
    $("stepQuiz").scrollIntoView({behavior:"smooth",block:"start"});
  });
})();
