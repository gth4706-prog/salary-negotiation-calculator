/* =========================================================
   키워드 진단기 (keyword-checker)
   - 서버(Cloudflare Worker, webtool-proxy)에서 페이지를 fetch해 SEO 키워드 추출
   - 아무것도 저장하지 않음. 매 요청 즉시 처리.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("stepIn"))return;

  // 배포 후 실제 Worker URL로 교체 필요 (webtool-proxy — /transcript와 공용)
  var API_BASE="https://webtool-proxy.YOUR-SUBDOMAIN.workers.dev";

  var SRC_LABEL={title:"제목",h1:"H1",heading:"소제목",meta:"설명",body:"본문"};

  function escapeHtml(s){
    return (s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});
  }

  function showError(msg){ var e=$("kc-error"); e.textContent=msg; e.hidden=false; }
  function clearError(){ $("kc-error").hidden=true; }

  function renderKeywords(keywords){
    var box=$("kc-keywords");
    if(!keywords||!keywords.length){box.innerHTML='<div class="kc-empty">추출된 키워드가 없어요.</div>';return;}
    var max=keywords[0].score||1;
    box.innerHTML=keywords.map(function(k,i){
      var pct=Math.max(6,Math.round(k.score/max*100));
      var srcTxt=(k.sources||[]).map(function(s){return SRC_LABEL[s]||s}).join("·");
      return '<div class="kc-item">'
        +'<span class="kc-rank">'+(i+1)+'</span>'
        +'<span class="kc-term">'+escapeHtml(k.term)+'</span>'
        +'<span class="kc-bar"><span class="kc-bar-fill" style="width:'+pct+'%"></span></span>'
        +'<span class="kc-src">'+escapeHtml(srcTxt)+'</span>'
        +'</div>';
    }).join("");
  }

  function renderSuggestions(list){
    var box=$("kc-suggestions");
    if(!list||!list.length){box.innerHTML='<div class="kc-empty">추천할 키워드가 부족해요.</div>';return;}
    box.innerHTML=list.map(function(s){return '<span class="kc-chip">'+escapeHtml(s)+'</span>'}).join("");
  }

  function loadKeywords(url){
    clearError();
    $("kc-go").disabled=true; $("kc-go").textContent="진단하는 중...";
    fetch(API_BASE+"/seo-keywords?url="+encodeURIComponent(url))
      .then(function(r){return r.json()})
      .then(function(data){
        $("kc-go").disabled=false; $("kc-go").textContent="키워드 진단하기 →";
        if(data.error==="invalid_url"){showError("올바른 웹페이지 링크가 아니에요.");return;}
        if(data.error==="fetch_failed"){showError("이 페이지는 불러올 수 없어요(접근 차단 또는 존재하지 않는 페이지).");return;}
        if(data.error){showError("일시적인 오류예요. 잠시 후 다시 시도해 주세요.");return;}

        $("kc-title").textContent=data.title||"(제목 없음)";
        $("kc-desc").textContent=data.description||"";
        renderKeywords(data.keywords);
        renderSuggestions(data.suggestions);

        $("stepIn").hidden=true;
        $("stepResult").hidden=false;
        $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
        if($("adwrap"))$("adwrap").hidden=false;
      })
      .catch(function(){
        $("kc-go").disabled=false; $("kc-go").textContent="키워드 진단하기 →";
        showError("일시적인 오류예요. 잠시 후 다시 시도해 주세요.");
      });
  }

  function normalizeUrl(v){
    v=(v||"").trim();
    if(!v)return null;
    if(!/^https?:\/\//i.test(v))v="https://"+v;
    try{ new URL(v); return v; }catch(e){ return null; }
  }

  $("kc-go").addEventListener("click",function(){
    var u=normalizeUrl($("kc-url").value);
    if(!u){showError("올바른 웹페이지 링크가 아니에요.");return;}
    loadKeywords(u);
  });
  $("kc-url").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();$("kc-go").click();}});

  $("kc-restart").addEventListener("click",function(){
    $("kc-url").value="";
    $("stepResult").hidden=true;
    $("stepIn").hidden=false;
    $("stepIn").scrollIntoView({behavior:"smooth",block:"start"});
  });
})();
