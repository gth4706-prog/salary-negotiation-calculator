/* 사이트 공통 — 테마 토글 (모든 페이지) */
(function(){
  var btn=document.getElementById("theme-btn");
  if(!btn)return;
  btn.addEventListener("click",function(){
    var r=document.documentElement,c=r.getAttribute("data-theme");
    if(!c)c=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";
    r.setAttribute("data-theme",c==="dark"?"light":"dark");
  });
})();
