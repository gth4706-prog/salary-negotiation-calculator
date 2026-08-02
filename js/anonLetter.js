/* =========================================================
   마지막으로 남길 말은? (anon-letter)
   - 서버(Worker /letter)에서 편지를 읽고, 답장을 써서 그 편지의 자식으로 저장한다.
   - 독점 잠금 없음: 같은 편지가 여러 사람에게 반복해서 보여질 수 있다(병렬 브랜칭).
   - /my-branch/ 페이지에서는 localStorage에 기억된 내 편지 id로 조상/자손 트리를 그린다.
   KO/EN/ZH/JA 공유: window.AL_LANG 으로 문구·API lang 파라미터를 고른다.
   ========================================================= */
(function(){
  var $=function(id){return document.getElementById(id)};
  var isReadPage=!!$("al-read"), isTreePage=!!$("al-tree");
  if(!isReadPage && !isTreePage)return;
  var LANG=(["en","zh","ja"].indexOf(window.AL_LANG)!==-1)?window.AL_LANG:"ko";

  var API_BASE="https://bold-dream-f416.gth3941.workers.dev";
  var MY_KEY="al.myLetters";

  var T={
    ko:{
      loading:"편지를 불러오는 중...",
      notReady:"서버 연결을 준비하고 있어요. 조금만 기다려주세요.",
      empty:"아직 아무도 편지를 남기지 않았어요. 첫 편지를 남겨보세요.",
      writePrompt:"이제 당신이 다음 사람에게 남길 말은?",
      placeholder:"낯선 누군가에게 하고 싶은 말을 적어보세요",
      submit:"편지 보내기",
      sending:"보내는 중...",
      doneTitle:"편지가 이어졌어요",
      doneSub:"당신의 편지는 이제 다음 사람에게 전해질 거예요.",
      myBranch:"내 가지치기 보기",
      writeNext:"나도 다음 사람에게 한마디",
      errGeneric:"일시적인 오류예요. 잠시 후 다시 시도해 주세요.",
      errEmpty:"편지 내용을 적어주세요.",
      errBlocked:"이 내용은 남길 수 없어요. 다르게 적어봐 주세요.",
      crisisHotline:"📞 자살예방상담전화 1393 (24시간, 무료)",
      restart:"↺ 처음부터",
      charCount:function(n){return n+" / 300"},
      treeEmpty:"아직 쓴 편지가 없어요."
    },
    en:{
      loading:"Loading a letter...",
      notReady:"We're still setting up the server. Please check back soon.",
      empty:"No one has left a letter yet. Be the first.",
      writePrompt:"What would you like to say to the next person?",
      placeholder:"Write something for a stranger",
      submit:"Send letter",
      sending:"Sending...",
      doneTitle:"Your letter is on its way",
      doneSub:"Someone else will read it next.",
      myBranch:"See my branch",
      writeNext:"Leave a word for the next person too",
      errGeneric:"Something went wrong. Please try again in a moment.",
      errEmpty:"Please write something first.",
      errBlocked:"This content can't be posted. Please try different wording.",
      crisisHotline:"📞 988 Suicide & Crisis Lifeline (US, 24/7)",
      restart:"↺ Start over",
      charCount:function(n){return n+" / 300"},
      treeEmpty:"No letters yet."
    },
    zh:{
      loading:"正在加载信件...",
      notReady:"服务器正在准备中，请稍后再来看看。",
      empty:"还没有人留下信件，来当第一个吧。",
      writePrompt:"你想对下一个人说什么？",
      placeholder:"写点什么给陌生人吧",
      submit:"寄出信件",
      sending:"发送中...",
      doneTitle:"信件已经寄出",
      doneSub:"接下来会有人读到它。",
      myBranch:"查看我的分支",
      writeNext:"也给下一个人留句话",
      errGeneric:"出了点问题，请稍后再试。",
      errEmpty:"请先写点什么。",
      errBlocked:"这段内容无法发布，请换一种说法。",
      crisisHotline:"📞 北京心理危机研究与干预中心 010-82951332",
      restart:"↺ 重新开始",
      charCount:function(n){return n+" / 300"},
      treeEmpty:"还没有写过信件。"
    },
    ja:{
      loading:"手紙を読み込み中...",
      notReady:"サーバーを準備中です。もう少しお待ちください。",
      empty:"まだ誰も手紙を残していません。最初の一通を。",
      writePrompt:"次の人に伝えたいことは？",
      placeholder:"見知らぬ誰かへ、伝えたいことを書いてみましょう",
      submit:"手紙を送る",
      sending:"送信中...",
      doneTitle:"手紙が届きました",
      doneSub:"次は誰かがこれを読みます。",
      myBranch:"自分の枝を見る",
      writeNext:"次の人にもひとこと",
      errGeneric:"一時的なエラーです。しばらくしてからもう一度お試しください。",
      errEmpty:"内容を入力してください。",
      errBlocked:"この内容は投稿できません。表現を変えてみてください。",
      crisisHotline:"📞 よりそいホットライン 0120-279-338 (24時間無料)",
      restart:"↺ 最初から",
      charCount:function(n){return n+" / 300"},
      treeEmpty:"まだ書いた手紙がありません。"
    }
  };
  var S=T[LANG]||T.ko;

  var state={ currentId:null, hasParent:false };

  function myLetters(){
    try{ return JSON.parse(localStorage.getItem(MY_KEY)||"[]"); }catch(e){ return []; }
  }
  function saveMyLetter(id){
    var list=myLetters();
    list.push(id);
    try{ localStorage.setItem(MY_KEY, JSON.stringify(list.slice(-50))); }catch(e){}
  }
  function escapeHtml(s){
    return (s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});
  }

  if(isReadPage){
    function show(id){
      ["al-read","al-write","al-done","al-crisis"].forEach(function(s){ $(s).hidden=(s!==id); });
    }

    function loadLetter(){
      show("al-read");
      $("al-read-text").textContent=S.loading;
      $("al-to-write").hidden=true;
      fetch(API_BASE+"/letter?lang="+LANG)
        .then(function(r){return r.json()})
        .then(function(data){
          if(data.error){
            $("al-read-text").textContent=S.notReady;
            return;
          }
          if(data.empty){
            state.currentId=null; state.hasParent=false;
            startWriting();
            return;
          }
          state.currentId=data.id; state.hasParent=true;
          $("al-read-text").textContent=data.text;
          $("al-to-write").hidden=false;
        })
        .catch(function(){
          $("al-read-text").textContent=S.notReady;
        });
    }

    function startWriting(){
      show("al-write");
      $("al-write-title").textContent=S.writePrompt;
      $("al-text").value="";
      $("al-text").placeholder=S.placeholder;
      updateCharCount();
      $("al-error").hidden=true;
    }

    function updateCharCount(){
      var n=$("al-text").value.length;
      $("al-char-count").textContent=S.charCount(n);
    }
    $("al-text").addEventListener("input",updateCharCount);
    $("al-to-write").addEventListener("click",startWriting);

    function showError(msg){ $("al-error").textContent=msg; $("al-error").hidden=false; }

    $("al-submit").addEventListener("click",function(){
      var text=$("al-text").value.trim();
      if(!text){ showError(S.errEmpty); return; }
      $("al-submit").disabled=true; $("al-submit").textContent=S.sending;
      fetch(API_BASE+"/letter", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({lang:LANG, text:text, parentId:state.currentId})
      })
        .then(function(r){return r.json()})
        .then(function(data){
          $("al-submit").disabled=false; $("al-submit").textContent=S.submit;
          if(data.crisis){ show("al-crisis"); return; }
          if(data.error==="blocked"){ showError(S.errBlocked); return; }
          if(data.error){ showError(S.errGeneric); return; }
          saveMyLetter(data.id);
          show("al-done");
        })
        .catch(function(){
          $("al-submit").disabled=false; $("al-submit").textContent=S.submit;
          showError(S.errGeneric);
        });
    });

    $("al-restart").addEventListener("click",loadLetter);
    if($("al-crisis-restart"))$("al-crisis-restart").addEventListener("click",loadLetter);

    loadLetter();
  }

  if(isTreePage){
    function renderChildren(children){
      if(!children||!children.length)return "";
      var html='<div class="al-tree-line"></div><div class="al-tree-branch">';
      children.forEach(function(c){
        html+='<div class="al-tree-col"><div class="al-tree-node child">'+escapeHtml(c.text)+'</div>'+renderChildren(c.children)+'</div>';
      });
      html+='</div>';
      return html;
    }
    function renderTree(){
      var box=$("al-tree");
      var ids=myLetters();
      if(!ids.length){ box.innerHTML='<div class="helper">'+S.treeEmpty+'</div>'; return; }
      var lastId=ids[ids.length-1];
      box.innerHTML='<div class="helper">'+S.loading+'</div>';
      fetch(API_BASE+"/thread/"+lastId+"?lang="+LANG)
        .then(function(r){return r.json()})
        .then(function(data){
          if(data.error){ box.innerHTML='<div class="helper">'+S.errGeneric+'</div>'; return; }
          var html='<div class="al-tree-col">';
          data.ancestors.forEach(function(a){
            html+='<div class="al-tree-node ancestor">'+escapeHtml(a.text)+'</div><div class="al-tree-line"></div>';
          });
          html+='<div class="al-tree-node self">'+escapeHtml(data.self.text)+'</div>';
          html+=renderChildren(data.children);
          html+='</div>';
          box.innerHTML=html;
        })
        .catch(function(){ box.innerHTML='<div class="helper">'+S.errGeneric+'</div>'; });
    }
    renderTree();
  }
})();
