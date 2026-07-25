/* =========================================================
   유튜브 자막 추출기 (youtube-transcript)
   - 서버(Cloudflare Worker)에서 유튜브 자막을 가져와 텍스트로 표시
   - 아무것도 저장하지 않음. 매 요청 즉시 처리.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  if(!$("stepIn"))return;

  // 배포 후 실제 Worker URL로 교체 필요
  var API_BASE="https://yt-transcript-proxy.YOUR-SUBDOMAIN.workers.dev";

  var state={cues:[],player:null,pollTimer:null,activeIdx:-1};

  /* ---------- 영상 ID 파싱(클라이언트 측 1차 검증) ---------- */
  function extractVideoId(input){
    input=(input||"").trim();
    if(/^[a-zA-Z0-9_-]{11}$/.test(input))return input;
    try{
      var u=new URL(input);
      if(u.hostname.indexOf("youtu.be")!==-1){
        var seg=u.pathname.split("/").filter(Boolean)[0];
        if(seg)return seg;
      }
      if(u.pathname.indexOf("/shorts/")===0)return u.pathname.split("/")[2];
      if(u.pathname.indexOf("/embed/")===0)return u.pathname.split("/")[2];
      var v=u.searchParams.get("v");
      if(v)return v;
    }catch(e){}
    return null;
  }

  function fmtTime(sec){
    sec=Math.max(0,Math.round(sec));
    var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
    var mm=(h>0?String(m).padStart(2,"0"):String(m));
    var ss=String(s).padStart(2,"0");
    return h>0?(h+":"+mm+":"+ss):(mm+":"+ss);
  }

  /* ---------- YouTube IFrame Player ---------- */
  var ytApiReady=false, pendingVideoId=null;
  window.onYouTubeIframeAPIReady=function(){
    ytApiReady=true;
    if(pendingVideoId)createPlayer(pendingVideoId);
  };
  function createPlayer(videoId){
    if(!ytApiReady){pendingVideoId=videoId;return;}
    pendingVideoId=null;
    if(state.player){try{state.player.destroy()}catch(e){}}
    state.player=new YT.Player("yt-player",{
      videoId:videoId,
      playerVars:{rel:0},
      events:{onStateChange:onPlayerStateChange}
    });
  }
  function onPlayerStateChange(e){
    if(e.data===YT.PlayerState.PLAYING){
      if(state.pollTimer)clearInterval(state.pollTimer);
      state.pollTimer=setInterval(syncActiveCue,500);
    }else{
      if(state.pollTimer){clearInterval(state.pollTimer);state.pollTimer=null;}
    }
  }
  function syncActiveCue(){
    if(!state.player||!state.player.getCurrentTime)return;
    var t=state.player.getCurrentTime();
    var idx=-1;
    for(var i=0;i<state.cues.length;i++){
      if(state.cues[i].t<=t)idx=i; else break;
    }
    if(idx!==state.activeIdx){
      var list=$("yt-cues");
      var prev=list.querySelector(".yt-cue.active"); if(prev)prev.classList.remove("active");
      var cur=list.querySelector('[data-idx="'+idx+'"]');
      if(cur){cur.classList.add("active"); cur.scrollIntoView({block:"nearest",behavior:"smooth"});}
      state.activeIdx=idx;
    }
  }

  /* ---------- 자막 렌더 ---------- */
  function renderCues(cues){
    var list=$("yt-cues"); list.innerHTML="";
    if(!cues.length){list.innerHTML='<div class="yt-empty">표시할 자막이 없어요.</div>';return;}
    cues.forEach(function(c,i){
      var row=document.createElement("div");
      row.className="yt-cue"; row.setAttribute("data-idx",i);
      row.innerHTML='<span class="yt-t">'+fmtTime(c.t)+'</span><span class="yt-txt">'+escapeHtml(c.text)+'</span>';
      row.addEventListener("click",function(){
        if(state.player&&state.player.seekTo){state.player.seekTo(c.t,true); state.player.playVideo();}
      });
      list.appendChild(row);
    });
  }
  function escapeHtml(s){
    return (s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});
  }

  /* ---------- 검색 ---------- */
  $("yt-search").addEventListener("input",function(){
    var q=this.value.trim().toLowerCase();
    var rows=$("yt-cues").querySelectorAll(".yt-cue");
    rows.forEach(function(row,i){
      var c=state.cues[i];
      if(!q){row.classList.remove("hide"); row.querySelector(".yt-txt").innerHTML=escapeHtml(c.text); return;}
      var hit=c.text.toLowerCase().indexOf(q)!==-1;
      row.classList.toggle("hide",!hit);
      if(hit){
        var re=new RegExp("("+q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","ig");
        row.querySelector(".yt-txt").innerHTML=escapeHtml(c.text).replace(re,"<mark>$1</mark>");
      }
    });
  });

  /* ---------- 복사 ---------- */
  $("yt-copy").addEventListener("click",function(){
    var text=state.cues.map(function(c){return "["+fmtTime(c.t)+"] "+c.text}).join("\n");
    var btn=this, old=btn.textContent;
    function done(){btn.textContent="✓ 복사됨"; setTimeout(function(){btn.textContent=old},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,function(){prompt("복사하세요:",text)});
    else prompt("복사하세요:",text);
  });

  /* ---------- 언어 선택 ---------- */
  var lastVideoId=null;
  function renderLangSelect(tracks,selected){
    var sel=$("yt-lang");
    if(!tracks||tracks.length<2){sel.hidden=true;sel.innerHTML="";return;}
    sel.innerHTML="";
    tracks.forEach(function(t){
      var o=document.createElement("option");
      o.value=t.code; o.textContent=t.name+(t.kind==="asr"?" (자동)":"");
      if(t.code===selected)o.selected=true;
      sel.appendChild(o);
    });
    sel.hidden=false;
  }
  $("yt-lang").addEventListener("change",function(){
    if(lastVideoId)loadTranscript(lastVideoId,this.value);
  });

  /* ---------- 메인 흐름 ---------- */
  function showError(msg){
    var e=$("yt-error"); e.textContent=msg; e.hidden=false;
  }
  function clearError(){ $("yt-error").hidden=true; }

  function loadTranscript(videoId,lang){
    clearError();
    $("yt-go").disabled=true; $("yt-go").textContent="가져오는 중...";
    var qs="?id="+encodeURIComponent(videoId)+(lang?"&lang="+encodeURIComponent(lang):"");
    fetch(API_BASE+"/transcript"+qs)
      .then(function(r){return r.json()})
      .then(function(data){
        $("yt-go").disabled=false; $("yt-go").textContent="텍스트로 변환하기 →";
        if(data.error==="no_captions"){showError("이 영상은 자막이 없어서 지원하지 않아요.");return;}
        if(data.error==="invalid_url"){showError("올바른 유튜브 링크가 아니에요.");return;}
        if(data.error){showError("영상을 불러오지 못했어요. 링크를 다시 확인해 주세요.");return;}

        lastVideoId=videoId;
        state.cues=data.cues||[];
        $("yt-title").textContent=data.title||"제목 없음";
        renderLangSelect(data.tracks,data.selected);
        renderCues(state.cues);
        state.activeIdx=-1;
        createPlayer(videoId);

        $("stepIn").hidden=true;
        $("stepResult").hidden=false;
        $("stepResult").scrollIntoView({behavior:"smooth",block:"start"});
        if($("adwrap"))$("adwrap").hidden=false;
      })
      .catch(function(){
        $("yt-go").disabled=false; $("yt-go").textContent="텍스트로 변환하기 →";
        showError("일시적인 오류예요. 잠시 후 다시 시도해 주세요.");
      });
  }

  $("yt-go").addEventListener("click",function(){
    var v=extractVideoId($("yt-url").value);
    if(!v){showError("올바른 유튜브 링크가 아니에요.");return;}
    loadTranscript(v,null);
  });
  $("yt-url").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();$("yt-go").click();}});

  $("yt-restart").addEventListener("click",function(){
    if(state.pollTimer)clearInterval(state.pollTimer);
    if(state.player){try{state.player.destroy()}catch(e){}}
    state.player=null; state.cues=[]; lastVideoId=null;
    $("yt-url").value="";
    $("stepResult").hidden=true;
    $("stepIn").hidden=false;
    $("stepIn").scrollIntoView({behavior:"smooth",block:"start"});
  });
})();
