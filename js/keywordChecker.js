/* =========================================================
   키워드 진단기 (keyword-checker)
   - 서버(Cloudflare Worker, webtool-proxy)에서 페이지를 fetch해 SEO 키워드 추출
   - 아무것도 저장하지 않음. 매 요청 즉시 처리.
   KO/EN 공유: window.KEYWORD_LANG="en" 이면 동적 문구를 영어 테이블에서 고른다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("stepIn"))return;
  var LANG=(window.KEYWORD_LANG==="en")?"en":"ko";

  var API_BASE="https://bold-dream-f416.gth3941.workers.dev";

  // 서버(Worker)가 아직 배포되지 않은 상태를 감지한다.
  // API_BASE를 실제 주소로 교체하면 이 가드는 자동으로 풀린다.
  var API_READY=API_BASE.indexOf("YOUR-SUBDOMAIN")===-1;

  var T={
    ko:{
      srcLabel:{title:"제목",h1:"H1",heading:"소제목",meta:"설명",body:"본문"},
      noTitle:"(제목 없음)",
      noKeywords:'<div class="kc-empty">추출된 키워드가 없어요.</div>',
      noSuggestions:'<div class="kc-empty">추천할 키워드가 부족해요.</div>',
      diagnosing:"진단하는 중...",
      goBtn:"키워드 진단하기 →",
      preparing:"준비 중이에요",
      errInvalidUrl:"올바른 웹페이지 링크가 아니에요.",
      errFetchFailed:"이 페이지는 불러올 수 없어요(접근 차단 또는 존재하지 않는 페이지).",
      errGeneric:"일시적인 오류예요. 잠시 후 다시 시도해 주세요."
    },
    en:{
      srcLabel:{title:"Title",h1:"H1",heading:"Subheading",meta:"Description",body:"Body"},
      noTitle:"(No title)",
      noKeywords:'<div class="kc-empty">No keywords were extracted.</div>',
      noSuggestions:'<div class="kc-empty">Not enough data for keyword suggestions.</div>',
      diagnosing:"Checking...",
      goBtn:"Check keywords →",
      preparing:"Coming soon",
      errInvalidUrl:"That doesn't look like a valid page link.",
      errFetchFailed:"This page couldn't be loaded (access blocked or the page doesn't exist).",
      errGeneric:"Something went wrong. Please try again in a moment."
    }
  };
  var S=T[LANG];
  var SRC_LABEL=S.srcLabel;

  function escapeHtml(s){
    return (s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});
  }

  function showError(msg){ var e=$("kc-error"); e.textContent=msg; e.hidden=false; }
  function clearError(){ $("kc-error").hidden=true; }

  function renderKeywords(keywords){
    var box=$("kc-keywords");
    if(!keywords||!keywords.length){box.innerHTML=S.noKeywords;return;}
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
    if(!list||!list.length){box.innerHTML=S.noSuggestions;return;}
    box.innerHTML=list.map(function(s){return '<span class="kc-chip">'+escapeHtml(s)+'</span>'}).join("");
  }

  function loadKeywords(url){
    clearError();
    $("kc-go").disabled=true; $("kc-go").textContent=S.diagnosing;
    fetch(API_BASE+"/seo-keywords?url="+encodeURIComponent(url))
      .then(function(r){return r.json()})
      .then(function(data){
        $("kc-go").disabled=false; $("kc-go").textContent=S.goBtn;
        if(data.error==="invalid_url"){showError(S.errInvalidUrl);return;}
        if(data.error==="fetch_failed"){showError(S.errFetchFailed);return;}
        if(data.error){showError(S.errGeneric);return;}

        $("kc-title").textContent=data.title||S.noTitle;
        $("kc-desc").textContent=data.description||"";
        renderKeywords(data.keywords);
        renderSuggestions(data.suggestions);

        $("stepIn").hidden=true;
        $("stepResult").hidden=false;
        $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
      })
      .catch(function(){
        $("kc-go").disabled=false; $("kc-go").textContent=S.goBtn;
        showError(S.errGeneric);
      });
  }

  function normalizeUrl(v){
    v=(v||"").trim();
    if(!v)return null;
    if(!/^https?:\/\//i.test(v))v="https://"+v;
    try{ new URL(v); return v; }catch(e){ return null; }
  }

  // 준비 중이면 입력을 막고 상태를 정확히 알린다(작동하는 척하지 않음).
  if(!API_READY){
    $("kc-url").disabled=true;
    $("kc-go").disabled=true;
    $("kc-go").textContent=S.preparing;
    if($("kc-soon"))$("kc-soon").hidden=false;
  }

  $("kc-go").addEventListener("click",function(){
    if(!API_READY)return;
    var u=normalizeUrl($("kc-url").value);
    if(!u){showError(S.errInvalidUrl);return;}
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
