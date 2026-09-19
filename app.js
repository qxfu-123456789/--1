/* ============================================================
 * 《天空的伤口》游戏引擎
 * 单页应用：阅读 + 互动问答 + 线索本 + 成绩结算 + 社区
 * 参考 github.com/yaoyuzhang1/socrates-question 的机制设计：
 * 答错给反馈可重答；提示降分；成绩=各题平均分；
 * 成绩/评论经 GitHub Issues 由玩家本人登录后发布。
 * ============================================================ */
(function () {
  "use strict";

  var META = window.GAME_META;
  var PAGES = window.PAGES;
  var SAVE_KEY = "ozone-mystery-save-v1";
  var REPO = META.repo; // "owner/name"

  /* ---------- 状态 ---------- */
  function defaultState() {
    return { page: 0, q: {}, clues: [], sound: true, voice: false, done: false };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s.page === "number") return s;
    } catch (e) {}
    return defaultState();
  }
  var state = load();
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- 音效（WebAudio 本机合成） ---------- */
  var actx = null;
  function beep(kind) {
    if (!state.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var seq = kind === "right" ? [[660, 0], [880, 0.12]] : [[220, 0], [180, 0.14]];
      seq.forEach(function (p) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = "sine"; o.frequency.value = p[0];
        g.gain.setValueAtTime(0.15, actx.currentTime + p[1]);
        g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + p[1] + 0.25);
        o.connect(g); g.connect(actx.destination);
        o.start(actx.currentTime + p[1]); o.stop(actx.currentTime + p[1] + 0.3);
      });
    } catch (e) {}
  }
  function speak(text) {
    if (!state.voice) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN"; u.rate = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------- 工具 ---------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- 计分 ---------- */
  function qState(id) {
    if (!state.q[id]) state.q[id] = { status: "unseen", hinted: false, wrong: false, tries: 0 };
    return state.q[id];
  }
  function qScore(id) {
    var s = state.q[id];
    if (!s || s.status !== "done") return null;
    if (s.hinted) return 30;
    if (s.wrong) return 60;
    return 100;
  }
  function allDone() {
    var ids = questionIds();
    return ids.every(function (id) { return qScore(id) != null; });
  }
  function finalScore() {
    var ids = questionIds(), sum = 0;
    ids.forEach(function (id) { sum += qScore(id) || 0; });
    return Math.round(sum / ids.length);
  }
  function questionIds() {
    var ids = [];
    PAGES.forEach(function (p) { if (p.question) ids.push(p.question.id); });
    return ids;
  }
  function evalText(score) {
    if (score >= 95) return "首席调查员——每一道推理都无懈可击，你完全掌握了检验假说的方法。";
    if (score >= 85) return "资深调查员——证据链在你手中严丝合缝，仅个别环节需要回顾。";
    if (score >= 70) return "合格调查员——主线推理扎实，建议回看重答失分题背后的机制。";
    if (score >= 50) return "见习调查员——你已经走完整个案件，再来一次会理解得更深。";
    return "新手调查员——别灰心： ozone 案的每一步都曾被最聪明的人争论过，重走一遍就是收获。";
  }

  /* ---------- 可视化数据 ---------- */
  var TREND = []; // [year, DU]
  (function () {
    var base = [310, 300, 315, 298, 305, 290, 312, 296, 302, 288, 308, 295, 300, 306, 292, 310, 285, 298, 305, 295, 288, 302];
    for (var i = 0; i < base.length; i++) TREND.push([1956 + i, base[i]]);
    var fall = [290, 270, 258, 250, 235, 222, 205, 180, 185];
    for (var j = 0; j < fall.length; j++) TREND.push([1978 + j, fall[j]]);
  })();
  var CLO_O3_OUT = [], CLO_O3_IN = [];
  (function () {
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 26; i++) CLO_O3_OUT.push([0.04 + rnd() * 0.08, 2.6 + rnd() * 1.6]);      // 涡旋外：ClO低，O3正常
    for (var k = 0; k < 30; k++) {
      var clo = 0.12 + rnd() * 1.05;
      var o3 = 3.1 - 1.75 * ((clo - 0.12) / 1.05) + (rnd() - 0.5) * 0.25; // 反相关
      CLO_O3_IN.push([clo, Math.max(0.8, o3)]);
    }
  })();

  /* ---------- SVG 折线图（可悬停） ---------- */
  function lineChart(mount, series, opts) {
    var W = 560, H = 300, pad = { l: 46, r: 14, t: 16, b: 34 };
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.classList.add("chart");
    var xMin = opts.xMin, xMax = opts.xMax, yMin = opts.yMin, yMax = opts.yMax;
    function X(v) { return pad.l + (v - xMin) / (xMax - xMin) * (W - pad.l - pad.r); }
    function Y(v) { return H - pad.b - (v - yMin) / (yMax - yMin) * (H - pad.t - pad.b); }
    var grid = el("div", "chart-grid-note", opts.note || "");
    var g = '<line x1="' + pad.l + '" y1="' + Y(yMin) + '" x2="' + (W - pad.r) + '" y2="' + Y(yMin) + '" class="axis"/>';
    g += '<line x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' + Y(yMin) + '" class="axis"/>';
    for (var t = yMin; t <= yMax; t += opts.yStep) {
      g += '<text x="' + (pad.l - 6) + '" y="' + (Y(t) + 4) + '" class="tick" text-anchor="end">' + t + '</text>';
      g += '<line x1="' + pad.l + '" y1="' + Y(t) + '" x2="' + (W - pad.r) + '" y2="' + Y(t) + '" class="grid"/>';
    }
    for (var x = xMin; x <= xMax; x += opts.xStep) {
      g += '<text x="' + X(x) + '" y="' + (H - pad.b + 16) + '" class="tick" text-anchor="middle">' + x + '</text>';
    }
    series.forEach(function (s) {
      var d = s.pts.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join("");
      g += '<path d="' + d + '" fill="none" class="line ' + s.cls + '"/>';
    });
    svg.innerHTML = g;
    var dotsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(dotsLayer);
    var tip = el("div", "chart-tip", "");
    mount.appendChild(svg); mount.appendChild(tip); mount.appendChild(grid);

    series.forEach(function (s) {
      s.pts.forEach(function (p) {
        var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", X(p[0])); c.setAttribute("cy", Y(p[1])); c.setAttribute("r", 7);
        c.setAttribute("class", "hit");
        c.addEventListener("mousemove", function (ev) {
          var r = mount.getBoundingClientRect();
          tip.textContent = s.tip(p);
          tip.style.left = (ev.clientX - r.left + 12) + "px";
          tip.style.top = (ev.clientY - r.top - 8) + "px";
          tip.classList.add("on");
        });
        c.addEventListener("mouseleave", function () { tip.classList.remove("on"); });
        dotsLayer.appendChild(c);
      });
    });
  }
  function scatterChart(mount, series, opts) {
    var W = 560, H = 320, pad = { l: 52, r: 14, t: 16, b: 36 };
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.classList.add("chart");
    var xMin = opts.xMin, xMax = opts.xMax, yMin = opts.yMin, yMax = opts.yMax;
    function X(v) { return pad.l + (v - xMin) / (xMax - xMin) * (W - pad.l - pad.r); }
    function Y(v) { return H - pad.b - (v - yMin) / (yMax - yMin) * (H - pad.t - pad.b); }
    var g = '<line x1="' + pad.l + '" y1="' + Y(yMin) + '" x2="' + (W - pad.r) + '" y2="' + Y(yMin) + '" class="axis"/>';
    g += '<line x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' + Y(yMin) + '" class="axis"/>';
    opts.xTicks.forEach(function (t) {
      g += '<text x="' + X(t) + '" y="' + (H - pad.b + 16) + '" class="tick" text-anchor="middle">' + t + '</text>';
    });
    opts.yTicks.forEach(function (t) {
      g += '<text x="' + (pad.l - 6) + '" y="' + (Y(t) + 4) + '" class="tick" text-anchor="end">' + t + '</text>';
      g += '<line x1="' + pad.l + '" y1="' + Y(t) + '" x2="' + (W - pad.r) + '" y2="' + Y(t) + '" class="grid"/>';
    });
    g += '<text x="' + ((W + pad.l) / 2) + '" y="' + (H - 4) + '" class="tick" text-anchor="middle">' + opts.xLabel + '</text>';
    g += '<text x="14" y="' + (H / 2) + '" class="tick" text-anchor="middle" transform="rotate(-90 14 ' + (H / 2) + ')">' + opts.yLabel + '</text>';
    svg.innerHTML = g;
    series.forEach(function (s) {
      s.pts.forEach(function (p) {
        var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", X(p[0])); c.setAttribute("cy", Y(p[1]));
        c.setAttribute("r", 4); c.setAttribute("class", "dot " + s.cls);
        svg.appendChild(c);
      });
    });
    mount.appendChild(svg);
    var lg = el("div", "legend",
      '<span><i class="dot in"></i>' + opts.legendIn + '</span><span><i class="dot out"></i>' + opts.legendOut + '</span>');
    mount.appendChild(lg);
  }

  /* ---------- 可视化场景 ---------- */
  var VIZ = {
    "ozone-trend": function (mount) {
      lineChart(mount, [{
        pts: TREND, cls: "oz",
        tip: function (p) { return p[0] + " 年 10 月：" + p[1] + " DU"; }
      }], { xMin: 1956, xMax: 1986, xStep: 5, yMin: 150, yMax: 330, yStep: 30, note: "哈雷站十月臭氧柱总量（DU）· 依据 Farman et al. 1985 历史趋势示意重绘" });
    },
    "clo-o3": function (mount) {
      scatterChart(mount,
        [{ pts: CLO_O3_OUT, cls: "out" }, { pts: CLO_O3_IN, cls: "in" }],
        {
          xMin: 0, xMax: 1.2, xTicks: [0, 0.3, 0.6, 0.9, 1.2], xLabel: "ClO（ppbv）",
          yMin: 0, yMax: 4.5, yTicks: [0, 1, 2, 3, 4], yLabel: "O₃（ppmv）",
          legendIn: "涡旋内部（南极春季）", legendOut: "涡旋外部"
        });
    },
    "station": function (mount) { mount.appendChild(sceneSVG("station")); },
    "hole": function (mount) { mount.appendChild(sceneSVG("hole")); },
    "er2": function (mount) { mount.appendChild(sceneSVG("er2")); },
    "map": function (mount) { mount.appendChild(sceneSVG("map")); },
    "chain": function (mount) { mount.appendChild(sceneSVG("chain")); },
    "heal": function (mount) { mount.appendChild(sceneSVG("heal")); }
  };

  function sceneSVG(kind) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 560 260");
    s.classList.add("scene");
    var g = '<rect width="560" height="260" fill="url(#bg)"/>' + defs();
    if (kind === "station") {
      g += stars() + '<circle cx="470" cy="52" r="26" fill="#dce9ff" opacity=".9"/>' +
        '<polygon points="80,230 200,120 320,230" fill="#2a3f5f"/>' +
        '<rect x="160" y="180" width="90" height="50" fill="#37547d"/>' +
        '<rect x="176" y="196" width="20" height="34" fill="#0e1a2b"/>' +
        '<rect x="206" y="196" width="20" height="20" fill="#9fd0ff"/>' +
        '<line x1="240" y1="180" x2="240" y2="110" stroke="#c8d8ee" stroke-width="3"/>' +
        '<rect x="232" y="104" width="18" height="12" fill="#9fd0ff"/>' +
        '<text x="80" y="252" class="cap">南极哈雷站 · 多布森分光光度计</text>';
    } else if (kind === "hole") {
      g += '<circle cx="280" cy="130" r="98" fill="#123a63"/>' +
        '<circle cx="280" cy="130" r="98" fill="none" stroke="#3f6ea3" stroke-width="3"/>' +
        '<ellipse cx="280" cy="140" rx="42" ry="30" fill="#0a1420" stroke="#7fb2ff" stroke-width="2" stroke-dasharray="6 4"/>' +
        '<text x="280" y="145" class="cap" text-anchor="middle">臭氧洞</text>' +
        '<text x="280" y="245" class="cap" text-anchor="middle">南极春季 · 中心低于 220 DU · 面积可达大陆两倍</text>';
    } else if (kind === "er2") {
      g += stars() +
        '<path d="M0,210 Q140,150 280,190 T560,170 L560,260 L0,260 Z" fill="#16273f"/>' +
        '<g transform="translate(250,90)">' +
        '<path d="M-70,0 L60,-6 L78,0 L60,6 Z" fill="#c8d8ee"/>' +
        '<path d="M-10,-4 L-46,-34 L-34,-36 L4,-6 Z" fill="#9fb8d8"/>' +
        '<path d="M-10,4 L-46,34 L-34,36 L4,6 Z" fill="#9fb8d8"/>' +
        '<circle cx="30" cy="0" r="5" fill="#37547d"/>' +
        '<rect x="60" y="-3" width="18" height="6" fill="#7fb2ff"/></g>' +
        '<path d="M240,96 q30,14 60,26" stroke="#7fb2ff" stroke-width="2" fill="none" stroke-dasharray="4 4"/>' +
        '<text x="280" y="245" class="cap" text-anchor="middle">ER-2 高空科研机 · 平流层 18–20 km 原位采样</text>';
    } else if (kind === "map") {
      g += '<circle cx="150" cy="130" r="82" fill="#1c3350" stroke="#3f6ea3" stroke-width="2"/>' +
        '<ellipse cx="150" cy="138" rx="26" ry="18" fill="#0a1420" stroke="#7fb2ff" stroke-dasharray="5 4"/>' +
        '<text x="150" y="222" class="cap" text-anchor="middle">南极：−85°C · PSC 大量</text>' +
        '<circle cx="400" cy="110" r="58" fill="#1c3350" stroke="#3f6ea3" stroke-width="2"/>' +
        '<text x="400" y="192" class="cap" text-anchor="middle">北极：较暖 · 涡旋常被扰动</text>' +
        '<text x="280" y="40" class="cap" text-anchor="middle" fill="#a9c6e8">同样的氯，不同的温度</text>';
    } else if (kind === "chain") {
      var steps = ["CFC 入库（年）", "极冬 PSC 活化（季节）", "Cl₂ 贮存", "春光光解 → Cl·", "ClO 二聚体循环耗 O₃（周）"];
      steps.forEach(function (t, i) {
        var x = 16 + i * 110;
        g += '<rect x="' + x + '" y="100" width="96" height="52" rx="8" fill="#16273f" stroke="#3f6ea3"/>' +
          '<text x="' + (x + 48) + '" y="122" class="cap2" text-anchor="middle">' + t.split("（")[0] + '</text>' +
          '<text x="' + (x + 48) + '" y="140" class="cap2" text-anchor="middle" fill="#7fb2ff">' + (t.split("（")[1] ? "（" + t.split("（")[1] : "") + '</text>';
        if (i < 4) g += '<path d="M' + (x + 98) + ',126 l10,0 m-4,-5 l6,5 l-6,5" stroke="#7fb2ff" stroke-width="2" fill="none"/>';
      });
      g += '<text x="280" y="60" class="cap" text-anchor="middle">三层时间尺度，环环相扣</text>';
    } else if (kind === "heal") {
      g += stars() +
        '<path d="M60,190 Q180,90 300,150 T520,120" stroke="#7fb2ff" stroke-width="3" fill="none"/>' +
        '<circle cx="520" cy="120" r="5" fill="#9fd0ff"/>' +
        '<text x="280" y="230" class="cap" text-anchor="middle">平流层氯含量持续下降 · 空洞预计 2060 年代愈合</text>';
    }
    s.innerHTML = g;
    return s;
    function defs() {
      return '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#0b1626"/><stop offset="1" stop-color="#132a44"/></linearGradient></defs>';
    }
    function stars() {
      var st = "";
      for (var i = 0; i < 26; i++) {
        st += '<circle cx="' + ((i * 97) % 560) + '" cy="' + ((i * 53) % 90) + '" r="1.1" fill="#9fd0ff" opacity="' + (0.3 + (i % 5) * 0.12) + '"/>';
      }
      return st;
    }
  }

  /* ---------- 页面渲染 ---------- */
  var root = document.getElementById("app");
  var pageNo = el("div", "page-no");

  function renderNav(i) {
    var nav = el("div", "nav");
    if (i > 0) {
      var b = el("button", "btn ghost", "‹ 上一页");
      b.onclick = function () { go(i - 1); };
      nav.appendChild(b);
    }
    var home = el("button", "btn ghost", "封面");
    home.onclick = function () { go(0); };
    nav.appendChild(home);
    var prog = el("span", "progress", "第 " + (i + 1) + " / " + PAGES.length + " 页");
    nav.appendChild(prog);
    if (i < PAGES.length - 1 && !PAGES[i].question) {
      var n = el("button", "btn primary", "下一页 ›");
      n.onclick = function () { go(i + 1); };
      nav.appendChild(n);
    }
    return nav;
  }

  function addClue(text) {
    if (!text) return;
    if (state.clues.indexOf(text) === -1) { state.clues.push(text); save(); }
  }

  function go(i) {
    state.page = Math.max(0, Math.min(PAGES.length - 1, i));
    save();
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    var p = PAGES[state.page];
    root.innerHTML = "";
    document.body.setAttribute("data-act", p.act);
    if (p.type === "cover") return renderCover(p);
    if (p.type === "result") return renderResult();
    if (p.type === "community") return renderCommunity();
    renderPage(p, state.page);
  }

  function renderCover(p) {
    var wrap = el("div", "cover");
    wrap.appendChild(el("div", "cover-kicker", esc(p.kicker)));
    wrap.appendChild(el("h1", "cover-title", esc(p.title)));
    wrap.appendChild(el("div", "cover-sub", esc(META.subtitle)));
    wrap.appendChild(el("div", "cover-body", p.body));
    var stats = el("div", "cover-stats",
      "<span>24 页推理故事</span><span>6 个互动问题</span><span>真实科学史</span><span>免登录 · 进度存本机</span>");
    wrap.appendChild(stats);
    var start = el("button", "btn primary big", state.page > 1 || state.qDone ? "继续调查" : "进入游戏");
    if (allDone()) start.textContent = "重温案件";
    start.onclick = function () { go(1); };
    wrap.appendChild(start);
    var reset = el("button", "btn ghost", "从头开始");
    reset.onclick = function () {
      if (confirm("清除本机进度与成绩，从头开始？")) { state = defaultState(); save(); go(0); }
    };
    wrap.appendChild(reset);
    root.appendChild(wrap);
    updateClueBadge();
  }

  function renderPage(p, i) {
    var art = el("div", "art act-" + p.act);
    var card = el("div", "card");
    card.appendChild(el("div", "kicker", esc(p.kicker)));
    card.appendChild(el("h2", null, esc(p.title)));
    card.appendChild(el("div", "body", p.body));
    if (p.viz && VIZ[p.viz]) {
      var vz = el("div", "viz");
      VIZ[p.viz](vz);
      card.appendChild(vz);
    }
    addClue(p.clue);
    if (p.question) {
      var qs = qState(p.question.id);
      if (qs.status !== "done") qs.status = "pending";
      card.appendChild(renderQuestion(p.question, i));
      root.appendChild(art); root.appendChild(pageNo); root.appendChild(card);
      updateClueBadge();
      return; // 问题页导航由题目自身控制
    }
    card.appendChild(renderNav(i));
    root.appendChild(art); root.appendChild(pageNo); root.appendChild(card);
    pageNo.textContent = "";
    updateClueBadge();
  }

  /* ---------- 问题交互 ---------- */
  function renderQuestion(q, pageIdx) {
    var qs = qState(q.id);
    var box = el("div", "quiz");
    box.appendChild(el("div", "quiz-prompt", esc(q.prompt)));

    var hintBtn = el("button", "btn ghost small", "提示（用过后本题最高 30 分）");
    var hintBox = el("div", "hint-box", "");
    hintBox.style.display = "none";
    hintBtn.onclick = function () {
      qs.hinted = true; qs.status = "pending"; save();
      hintBox.textContent = "提示：" + q.hint;
      hintBox.style.display = "block";
      hintBtn.disabled = true;
    };

    var opts = el("div", "quiz-opts");
    var feedback = el("div", "quiz-feedback", "");
    var nextWrap = el("div", "quiz-next", "");
    var answered = qs.status === "done";

    q.options.forEach(function (o, idx) {
      var b = el("button", "quiz-opt", "<b>" + "ABCD"[idx] + "</b><span>" + esc(o.t) + "</span>");
      if (answered) { b.disabled = true; if (o.ok) b.classList.add("correct"); }
      b.onclick = function () {
        if (qs.status === "done") return;
        if (o.ok) {
          qs.status = "done"; save();
          b.classList.add("correct");
          Array.prototype.forEach.call(opts.children, function (c) { c.disabled = true; });
          beep("right");
          feedback.className = "quiz-feedback good";
          feedback.innerHTML = "<b>✓ 推理成立。</b>" + esc(o.why);
          speak(q.explain);
          showExplain();
          showNext();
        } else {
          qs.wrong = true; qs.tries++; save();
          b.classList.add("wrong");
          b.disabled = true;
          beep("wrong");
          feedback.className = "quiz-feedback bad";
          feedback.innerHTML = "<b>✗ 这一步走不通。</b>" + esc(o.why) + "<br><span class='retry'>换一个选项再试试——错误本身也是线索。</span>";
        }
      };
      opts.appendChild(b);
    });

    box.appendChild(opts);
    var ctrl = el("div", "quiz-ctrl");
    ctrl.appendChild(hintBtn);
    if (qs.hinted || answered) { hintBox.textContent = "提示：" + q.hint; hintBox.style.display = "block"; hintBtn.disabled = true; }
    box.appendChild(ctrl);
    box.appendChild(hintBox);
    box.appendChild(feedback);

    function showExplain() {
      var ex = el("div", "quiz-explain", "<b>结案陈词：</b>" + esc(q.explain));
      box.appendChild(ex);
    }
    if (answered) showExplain();

    function showNext() {
      nextWrap.innerHTML = "";
      var n = el("button", "btn primary", "继续 ›");
      n.onclick = function () { go(pageIdx + 1); };
      nextWrap.appendChild(n);
      if (!nextWrap.parentNode) box.appendChild(nextWrap);
    }
    if (answered) showNext();
    return box;
  }

  /* ---------- 成绩结算 ---------- */
  function renderResult() {
    if (!allDone()) {
      var warn = el("div", "card");
      warn.appendChild(el("div", "kicker", "档案尚未完成"));
      warn.appendChild(el("h2", null, "还有推理未完成"));
      warn.appendChild(el("div", "body", "<p>完成全部 6 个互动问题后，才能生成完整调查档案。</p>"));
      var back = el("button", "btn primary", "回到案件");
      back.onclick = function () { go(state.page - 1); };
      warn.appendChild(back);
      root.appendChild(warn);
      return;
    }
    state.done = true; save();
    var score = finalScore();
    var ids = questionIds();
    var card = el("div", "card result");
    card.appendChild(el("div", "kicker", "调查档案 · 结案"));
    card.appendChild(el("h2", null, "你的成绩：" + score + " 分"));
    card.appendChild(el("div", "score-eval", evalText(score)));

    var tbl = el("table", "score-table");
    tbl.innerHTML = "<tr><th>推理环节</th><th>判定</th><th>得分</th></tr>";
    var labels = { q1: "检验异常 · 仪器与交叉验证", q2: "判别假说 · 选择观测靶点", q3: "解读数据 · 反相关的含义", q4: "地理对照 · 南北极差异", q5: "机制排序 · 引爆链条", q6: "政策抉择 · 不确定性下的行动" };
    ids.forEach(function (id) {
      var s = state.q[id], sc = qScore(id);
      var verdict = s.hinted ? "借助提示" : (s.wrong ? "纠错后答对" : "首次答对");
      tbl.innerHTML += "<tr><td>" + labels[id] + "</td><td>" + verdict + "</td><td>" + sc + "</td></tr>";
    });
    card.appendChild(tbl);

    card.appendChild(el("div", "body", "<p style='margin-top:14px'>自愿上传成绩：填写显示名，游戏会在新标签页打开你仓库的 Issue 草稿（已自动填好成绩），<b>核对后由你本人点击提交</b>。成绩与评论是玩家自报记录，用于交流，不作为考核凭证。</p>"));
    var row = el("div", "submit-row");
    var nick = el("input", "nick-input");
    nick.placeholder = "显示名（公开）";
    nick.maxLength = 24;
    var sub = el("button", "btn primary", "上传成绩到 GitHub");
    sub.onclick = function () { submitScore(nick.value.trim(), score); };
    row.appendChild(nick); row.appendChild(sub);
    card.appendChild(row);

    var nav = renderNav(state.page);
    card.appendChild(nav);
    root.appendChild(el("div", "art act-5"));
    root.appendChild(card);
    updateClueBadge();
  }

  function recordJSON(kind, data) {
    return "<!-- ozone-mystery:" + kind + " v=1 -->\n```json\n" + JSON.stringify(data, null, 2) + "\n```";
  }
  function submitScore(nick, score) {
    if (!nick) { alert("请先填写显示名（将公开显示）。"); return; }
    var ids = questionIds();
    var data = {
      nick: nick, score: score, game: META.title, version: META.version,
      firstTry: ids.filter(function (id) { return !state.q[id].wrong && !state.q[id].hinted; }).length,
      corrected: ids.filter(function (id) { return state.q[id].wrong && !state.q[id].hinted; }).length,
      hinted: ids.filter(function (id) { return state.q[id].hinted; }).length,
      ts: new Date().toISOString()
    };
    var body = recordJSON("score", data) +
      "\n\n自报成绩记录，由《天空的伤口》游戏成绩页生成。关闭本 Issue 可从榜单撤回。";
    var url = "https://github.com/" + REPO + "/issues/new?" + new URLSearchParams({
      template: "score.md", title: "成绩 · " + nick, body: body
    });
    window.open(url, "_blank");
  }

  /* ---------- 社区：排行榜 + 评论 ---------- */
  function renderCommunity() {
    var card = el("div", "card");
    card.appendChild(el("div", "kicker", "社区 · 由 GitHub Issues 驱动"));
    card.appendChild(el("h2", null, "排行榜与留言板"));
    card.appendChild(el("div", "body",
      "<p>榜单从公开的 GitHub Issues 自动生成（通常滞后几十秒到几分钟）。每个 GitHub 账号保留其最高公开成绩，同分并列。成绩为玩家自报记录。</p>"));
    var status = el("div", "comm-status", "正在加载榜单…");
    var board = el("div", "comm-board");
    card.appendChild(status); card.appendChild(board);

    var cRow = el("div", "submit-row");
    var cNick = el("input", "nick-input"); cNick.placeholder = "显示名（公开）"; cNick.maxLength = 24;
    var cStars = el("select", "stars-input");
    cStars.innerHTML = "<option value=''>星级…</option><option value='5'>★★★★★</option><option value='4'>★★★★</option><option value='3'>★★★</option><option value='2'>★★</option><option value='1'>★</option>";
    var cText = el("input", "nick-input wide"); cText.placeholder = "评论：哪个推理最让你印象深刻？"; cText.maxLength = 200;
    var cBtn = el("button", "btn primary", "发表留言");
    cBtn.onclick = function () { submitComment(cNick.value.trim(), cStars.value, cText.value.trim()); };
    cRow.appendChild(cNick); cRow.appendChild(cStars); cRow.appendChild(cText); cRow.appendChild(cBtn);
    card.appendChild(el("div", "body", "<p style='margin-top:10px'><b>写评论</b>：与成绩一样，会在新标签页打开已填好的 Issue 草稿，由你本人确认发布。</p>"));
    card.appendChild(cRow);
    card.appendChild(renderNav(state.page));
    root.appendChild(el("div", "art act-5"));
    root.appendChild(card);

    loadBoard(status, board);
  }

  function submitComment(nick, stars, text) {
    if (!nick) { alert("请填写显示名。"); return; }
    if (!stars) { alert("请选择星级。"); return; }
    if (!text) { alert("请写一句评论。"); return; }
    var data = { nick: nick, stars: Number(stars), text: text, ts: new Date().toISOString() };
    var body = recordJSON("comment", data) +
      "\n\n玩家评论，由《天空的伤口》游戏生成。关闭本 Issue 可从留言板撤回。";
    var url = "https://github.com/" + REPO + "/issues/new?" + new URLSearchParams({
      template: "comment.md", title: "评论 · " + nick, body: body
    });
    window.open(url, "_blank");
  }

  function parseRecord(body) {
    var m = body.match(/<!--\s*ozone-mystery:(score|comment)\s+v=1\s*-->\s*```json\s*([\s\S]*?)```/);
    if (!m) return null;
    try { return { kind: m[1], data: JSON.parse(m[2]) }; } catch (e) { return null; }
  }

  function loadBoard(status, board) {
    function fail(msg) {
      status.className = "comm-status err";
      status.textContent = msg;
    }
    // 1) 优先读取 Actions 生成的快照
    fetch("community/scores.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("snapshot")); })
      .then(function (snap) {
        var recs = [];
        (snap.leaderboard || []).forEach(function (r) {
          recs.push({ kind: "score", data: { nick: r.nick, score: r.score, firstTry: r.firstTry, corrected: r.corrected, hinted: r.hinted, ts: r.at }, author: r.author });
        });
        (snap.comments || []).forEach(function (c) {
          recs.push({ kind: "comment", data: { nick: c.nick, stars: c.stars, text: c.text, ts: c.at }, author: c.author, at: c.at });
        });
        drawBoard(board, recs, snap.generatedAt, "快照");
        status.textContent = "榜单更新于 " + (snap.generatedAt || "未知时间");
      })
      .catch(function () {
        // 2) 回退：直接读取公开 Issues API
        status.textContent = "正在从 GitHub Issues 实时读取…";
        fetch("https://api.github.com/repos/" + REPO + "/issues?state=open&per_page=100")
          .then(function (r) {
            if (!r.ok) throw new Error("api " + r.status);
            return r.json();
          })
          .then(function (issues) {
            var recs = [];
            (issues || []).forEach(function (iss) {
              var p = parseRecord(iss.body || "");
              if (p) recs.push({ kind: p.kind, data: p.data, author: iss.user && iss.user.login, url: iss.html_url, at: iss.created_at });
            });
            drawBoard(board, recs, null, "实时");
            status.textContent = "已从 GitHub Issues 实时读取（每 IP 每小时限额 60 次，超限请稍后再试）";
          })
          .catch(function (e) { fail("暂时无法连接榜单：" + e.message + "。请稍后点击刷新，或到 GitHub 仓库 Issues 页直接查看。"); });
      });
  }

  function drawBoard(board, recs, generatedAt, mode) {
    board.innerHTML = "";
    var scores = recs.filter(function (r) { return r.kind === "score" && r.data && typeof r.data.score === "number"; });
    var byAuthor = {};
    scores.forEach(function (r) {
      var key = r.author || (r.data.nick + "#" + r.data.ts);
      if (!byAuthor[key] || byAuthor[key].data.score < r.data.score) byAuthor[key] = r;
    });
    var list = Object.keys(byAuthor).map(function (k) { return byAuthor[k]; })
      .sort(function (a, b) { return b.data.score - a.data.score || String(a.data.ts).localeCompare(String(b.data.ts)); });

    var h = el("h3", null, "排行榜（" + mode + (generatedAt ? " · " + generatedAt : "") + "）");
    board.appendChild(h);
    if (!list.length) {
      board.appendChild(el("div", "comm-empty", "还没有公开成绩。成为第一个上传档案的调查员！"));
    } else {
      var tbl = el("table", "score-table board");
      tbl.innerHTML = "<tr><th>#</th><th>调查员</th><th>成绩</th><th>首答对 / 纠错 / 提示</th></tr>";
      list.slice(0, 50).forEach(function (r, i) {
        tbl.innerHTML += "<tr><td>" + (i + 1) + "</td><td>" + esc(r.data.nick) +
          (r.author ? " <span class='gh'>@" + esc(r.author) + "</span>" : "") + "</td><td><b>" + r.data.score + "</b></td><td>" +
          r.data.firstTry + " / " + r.data.corrected + " / " + r.data.hinted + "</td></tr>";
      });
      board.appendChild(tbl);
    }

    var comments = recs.filter(function (r) { return r.kind === "comment" && r.data && r.data.text; })
      .sort(function (a, b) { return String(b.at || b.data.ts).localeCompare(String(a.at || a.data.ts)); })
      .slice(0, 20);
    board.appendChild(el("h3", null, "最新留言"));
    if (!comments.length) {
      board.appendChild(el("div", "comm-empty", "还没有留言。"));
    } else {
      comments.forEach(function (r) {
        var stars = "";
        for (var i = 0; i < (r.data.stars || 0); i++) stars += "★";
        var d = el("div", "comment",
          "<div class='c-head'>" + esc(r.data.nick) + (r.author ? " <span class='gh'>@" + esc(r.author) + "</span>" : "") +
          " <span class='stars'>" + stars + "</span></div>" +
          "<div class='c-text'>" + esc(r.data.text) + "</div>");
        board.appendChild(d);
      });
    }
  }

  /* ---------- 线索本 ---------- */
  function updateClueBadge() {
    var b = document.getElementById("clueBadge");
    if (b) b.textContent = "线索本（" + state.clues.length + "）";
  }
  function buildCluePanel() {
    var btn = document.getElementById("clueBadge");
    var panel = document.getElementById("cluePanel");
    btn.onclick = function () {
      var list = state.clues.length
        ? state.clues.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("")
        : "<li>还没有收集到线索，继续阅读。</li>";
      panel.innerHTML = "<h3>线索本</h3><ul>" + list + "</ul>" +
        "<button class='btn ghost small' id='clueClose'>收起</button>";
      panel.classList.add("on");
      document.getElementById("clueClose").onclick = function () { panel.classList.remove("on"); };
    };
    var sBtn = document.getElementById("soundToggle");
    var vBtn = document.getElementById("voiceToggle");
    function paint() {
      sBtn.textContent = state.sound ? "音效：开" : "音效：关";
      vBtn.textContent = state.voice ? "朗读：开" : "朗读：关";
    }
    sBtn.onclick = function () { state.sound = !state.sound; save(); paint(); };
    vBtn.onclick = function () {
      state.voice = !state.voice; save(); paint();
      if (!state.voice) try { window.speechSynthesis.cancel(); } catch (e) {}
    };
    paint();
    updateClueBadge();
  }

  /* ---------- 启动 ---------- */
  buildCluePanel();
  render();
})();
