/* =========================================================
   위키 토끼굴 — IndexedDB 저장소
   localStorage(5MB)로는 150편(약 2.4MB)에 궤적까지 담기 빠듯해 IndexedDB 를 쓴다.
   이 파일은 저장만 담당한다 — 판단 로직은 넣지 않는다(테스트 가능한 로직은 wikiApi 로).
   ========================================================= */
(function (global) {
  var DB_NAME = "wikiRabbithole";
  var DB_VER = 1;
  var db = null;
  var opening = null;   // 동시 호출이 연결을 여러 번 열지 않게 공유한다
  var OPEN_TIMEOUT = 8000;

  function open() {
    if (db) return Promise.resolve();
    if (opening) return opening;
    /* ⚠️ 2026-08-03 실측: IndexedDB 가 물리면 open 요청이 onsuccess·onerror·onblocked
       **어느 것도** 부르지 않고 영원히 멈춘다(개발 중 실제로 겪음). 그러면 화면은
       아무 반응 없이 죽은 것처럼 보인다. 다른 탭이 DB를 잡고 있을 때(onblocked)와
       원인 불명의 무응답(타임아웃) 둘 다 반드시 오류로 끝맺어야 화면이 안내를 띄운다. */
    opening = new Promise(function (resolve, reject) {
      var settled = false;
      function fail(msg) {
        if (settled) return; settled = true; opening = null;
        reject(new Error(msg));
      }
      var timer = setTimeout(function () {
        fail("저장소를 여는 데 너무 오래 걸립니다");
      }, OPEN_TIMEOUT);
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onblocked = function () {
        clearTimeout(timer);
        fail("다른 탭에서 이 도구를 열어두고 있어요");
      };
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains("bundles")) {
          d.createObjectStore("bundles", { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains("articles")) {
          d.createObjectStore("articles", { keyPath: ["bundleId", "title"] })
            .createIndex("byBundle", "bundleId", { unique: false });
        }
        if (!d.objectStoreNames.contains("summaries")) {
          d.createObjectStore("summaries", { keyPath: ["bundleId", "title"] })
            .createIndex("byBundle", "bundleId", { unique: false });
        }
        if (!d.objectStoreNames.contains("trail")) {
          d.createObjectStore("trail", { keyPath: ["bundleId", "seq"] })
            .createIndex("byBundle", "bundleId", { unique: false });
        }
      };
      req.onsuccess = function () {
        if (settled) return; settled = true;
        clearTimeout(timer);
        db = req.result;
        /* 다른 탭이 버전을 올리려 하면 이 연결을 놓아준다(그쪽이 blocked 로 멈추지 않게) */
        db.onversionchange = function () { try { db.close(); } catch (e) {} db = null; opening = null; };
        resolve();
      };
      req.onerror = function () { clearTimeout(timer); fail("저장소를 열지 못했습니다"); };
    });
    return opening;
  }

  function put(store, value) {
    return open().then(function () {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, "readwrite");
        t.objectStore(store).put(value);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function get(store, key) {
    return open().then(function () {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(store, "readonly").objectStore(store).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function allByBundle(store, bundleId) {
    return open().then(function () {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(store, "readonly").objectStore(store)
                    .index("byBundle").getAll(bundleId);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function delMany(store, keys) {
    if (!keys.length) return Promise.resolve();
    return open().then(function () {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, "readwrite");
        var s = t.objectStore(store);
        keys.forEach(function (k) { s.delete(k); });
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error("삭제가 중단됐습니다")); };
      });
    });
  }

  global.wikiStore = {
    open: open,

    putBundle: function (b) { return put("bundles", b); },
    listBundles: function () {
      return open().then(function () {
        return new Promise(function (resolve, reject) {
          var req = db.transaction("bundles", "readonly").objectStore("bundles").getAll();
          req.onsuccess = function () { resolve(req.result || []); };
          req.onerror = function () { reject(req.error); };
        });
      });
    },
    deleteBundle: function (id) {
      return Promise.all([
        allByBundle("articles", id),
        allByBundle("summaries", id),
        allByBundle("trail", id)
      ]).then(function (r) {
        return Promise.all([
          delMany("articles", r[0].map(function (x) { return [id, x.title]; })),
          delMany("summaries", r[1].map(function (x) { return [id, x.title]; })),
          delMany("trail", r[2].map(function (x) { return [id, x.seq]; })),
          delMany("bundles", [id])
        ]);
      });
    },

    putArticle: function (bundleId, a) { a.bundleId = bundleId; return put("articles", a); },
    getArticle: function (bundleId, title) { return get("articles", [bundleId, title]); },
    countArticles: function (bundleId) {
      return allByBundle("articles", bundleId).then(function (r) { return r.length; });
    },

    putSummary: function (bundleId, s) { s.bundleId = bundleId; return put("summaries", s); },
    getSummary: function (bundleId, title) { return get("summaries", [bundleId, title]); },

    pushTrail: function (bundleId, title) {
      return allByBundle("trail", bundleId).then(function (rows) {
        /* 굴을 다시 열면 씨앗이 또 쌓여 "심리학, 심리학"처럼 보인다.
           바로 직전과 같은 문서면 기록하지 않는다(경로는 '이동'만 남긴다). */
        var last = null, maxSeq = -1;
        rows.forEach(function (r) { if (r.seq > maxSeq) { maxSeq = r.seq; last = r; } });
        if (last && last.title === title) return;
        return put("trail", { bundleId: bundleId, seq: maxSeq + 1, title: title, at: Date.now() });
      });
    },
    getTrail: function (bundleId) {
      return allByBundle("trail", bundleId).then(function (r) {
        return r.sort(function (a, b) { return a.seq - b.seq; });
      });
    },
    clearTrail: function (bundleId) {
      return allByBundle("trail", bundleId).then(function (rows) {
        return delMany("trail", rows.map(function (x) { return [bundleId, x.seq]; }));
      });
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
