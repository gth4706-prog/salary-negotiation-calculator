/* =========================================================
   허브(index.html) 전용 — 고민별 필터 칩
   ========================================================= */
(function(){
  var filterBar=document.getElementById("cat-filter");
  var grid=document.getElementById("hub-cards");
  if(!filterBar||!grid)return;

  var items=Array.prototype.slice.call(grid.querySelectorAll("li"));
  var chips=Array.prototype.slice.call(filterBar.querySelectorAll(".chip"));

  filterBar.addEventListener("click",function(e){
    var chip=e.target.closest(".chip");
    if(!chip)return;
    chips.forEach(function(c){c.classList.remove("on")});
    chip.classList.add("on");
    var cat=chip.getAttribute("data-filter");
    items.forEach(function(li){
      li.hidden = (cat!=="all" && li.getAttribute("data-cat")!==cat);
    });
  });
})();
