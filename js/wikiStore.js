/* =========================================================
   위키 토끼굴 — IndexedDB 저장소
   localStorage(5MB)로는 150편(약 2.4MB)에 궤적까지 담기 빠듯해 IndexedDB 를 쓴다.
   이 파일은 저장만 담당한다 — 판단 로직은 넣지 않는다(테스트 가능한 로직은 wikiApi 로).
   ========================================================= */
(function (global) {
  var DB_NAME = "wikiRabbithole";
  var DB_VER = 1;
  var db = null;

  function open() {
    if (db) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
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
      req.onsuccess = function () { db = req.result; resolve(); };
      req.onerror = function () { reject(req.error); };
    });
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
        return put("trail", { bundleId: bundleId, seq: rows.length, title: title, at: Date.now() });
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
