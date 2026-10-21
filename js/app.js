/**
 * ====================================================================
 * LockIn – Trading Journal Application Logic
 * ====================================================================
 * Fully client-side trading journal:
 * - LocalStorage + IndexedDB persistence
 * - Performance metrics (P&L, win rate, expectancy, max drawdown)
 * - Daily journal, habits, moods, and execution mistakes tracking
 * - Prop firm account rules & payout tracking
 * - Risk management & position size calculator
 * - High-resolution canvas trading card generation
 * - Offline PWA support with service worker
 * ====================================================================
 */

/* ====================================================================
 * 1. Global State & Constants
 * ==================================================================== */
var K = "ascend1",
  S = { trades: [], days: {}, profile: {}, accts: [], pays: [] },
  tab = "home",
  MOODS = ["😖", "😕", "😐", "🙂", "😄"];
var MIST = [
  "None",
  "FOMO entry",
  "Revenge trade",
  "Moved stop loss",
  "Oversized",
  "Exited early",
  "Entered late",
  "Ignored plan",
];
/* ====================================================================
 * 2. Persistence Helpers (LocalStorage & Storage Sync)
 * ==================================================================== */
function load() {
  try {
    var d = JSON.parse(localStorage.getItem(K));
    if (d && d.trades && d.days) S = d;
  } catch (e) {}
}
function save() {
  try {
    localStorage.setItem(K, JSON.stringify(S));
    if (
      typeof LockinSync !== "undefined" &&
      typeof LockinAuth !== "undefined" &&
      LockinAuth.getCurrentUser()
    ) {
      LockinSync.saveUserData(false);
    }
    return true;
  } catch (e) {
    toast("Couldn’t save on this device. Export a backup.");
    return false;
  }
}
/* ====================================================================
 * 3. DOM & Formatting Utility Functions
 * ==================================================================== */
function $(s) {
  return document.querySelector(s);
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}
function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function dstr(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function today() {
  return dstr(new Date());
}
function addDays(s, n) {
  var d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dstr(d);
}
function nice(s) {
  return new Date(s + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function fmt(n) {
  var v = Math.round(n * 100) / 100;
  return (v > 0 ? "+" : "") + v.toLocaleString();
}
function sum(a) {
  return a.reduce(function (x, t) {
    return x + (+t.pnl || 0);
  }, 0);
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function toast(m) {
  var t = $("#toast");
  t.textContent = m;
  t.style.display = "block";
  clearTimeout(toast.h);
  toast.h = setTimeout(function () {
    t.style.display = "none";
  }, 2600);
}
/* ====================================================================
 * 4. Trading Statistics & Analytical Math Engine
 * ==================================================================== */
function stats(ts) {
  var w = ts.filter(function (t) {
      return t.pnl > 0;
    }),
    l = ts.filter(function (t) {
      return t.pnl < 0;
    }),
    gw = sum(w),
    gl = Math.abs(sum(l)),
    rs = ts.filter(function (t) {
      return t.r !== "" && t.r != null;
    });
  return {
    n: ts.length,
    pnl: sum(ts),
    wr: ts.length ? (w.length / ts.length) * 100 : 0,
    pf: gl ? gw / gl : gw ? 99 : 0,
    r: rs.length
      ? rs.reduce(function (x, t) {
          return x + +t.r;
        }, 0) / rs.length
      : 0,
  };
}
function sortedTrades() {
  return S.trades.slice().sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1;
  });
}
function discAvg(from, to) {
  var v = [];
  for (var k in S.days) {
    if (k >= from && k <= to && S.days[k].disc) v.push(S.days[k].disc);
  }
  return v.length
    ? (v.reduce(function (a, b) {
        return a + b;
      }, 0) /
        v.length) *
        20
    : null;
}
function streak() {
  var has = {};
  S.trades.forEach(function (t) {
    has[t.date] = 1;
  });
  for (var k in S.days) {
    if (S.days[k].plan || S.days[k].review || S.days[k].disc) has[k] = 1;
  }
  var d = today(),
    n = 0;
  if (!has[d]) d = addDays(d, -1);
  while (has[d]) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
function ringSvg(p) {
  var c = Math.round(2 * Math.PI * 46),
    off = p == null ? c : Math.round(c * (1 - p / 100));
  return (
    '<svg viewBox="0 0 112 112" width="112" height="112" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A3D"/><stop offset="1" stop-color="#FF3D81"/></linearGradient></defs><circle cx="56" cy="56" r="46" fill="none" stroke="var(--surf2)" stroke-width="10"/><circle class="p" cx="56" cy="56" r="46" fill="none" stroke="url(#rg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' +
    c +
    '" stroke-dashoffset="' +
    off +
    '" style="--c:' +
    c +
    '" transform="rotate(-90 56 56)"/></svg>'
  );
}
function curve(ts) {
  if (ts.length < 2)
    return (
      '<div class="empty">' +
      illo() +
      "<p>Log 2 trades to see your equity curve.</p></div>"
    );
  var c = 0,
    p = [0];
  ts.forEach(function (t) {
    c += +t.pnl || 0;
    p.push(c);
  });
  var mn = Math.min.apply(0, p),
    mx = Math.max.apply(0, p),
    rg = mx - mn || 1,
    W = 300,
    H = 110;
  var pts = p
    .map(function (v, i) {
      return (
        ((i / (p.length - 1)) * W).toFixed(1) +
        "," +
        (H - 6 - ((v - mn) / rg) * (H - 14)).toFixed(1)
      );
    })
    .join(" ");
  var up = p[p.length - 1] >= 0,
    col = up ? "var(--up)" : "var(--dn)";
  return (
    '<svg viewBox="0 0 ' +
    W +
    " " +
    H +
    '" width="100%" role="img" aria-label="Equity curve"><defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    (up ? "#22C55E" : "#EF4444") +
    '" stop-opacity=".45"/><stop offset="1" stop-color="' +
    (up ? "#22C55E" : "#EF4444") +
    '" stop-opacity="0"/></linearGradient></defs><polygon points="0,' +
    H +
    " " +
    pts +
    " " +
    W +
    "," +
    H +
    '" fill="url(#eg)"/><polyline points="' +
    pts +
    '" fill="none" stroke="' +
    col +
    '" stroke-width="2.5" stroke-linejoin="round"/></svg>'
  );
}
function costly() {
  var m = {};
  S.trades.forEach(function (t) {
    if (t.mistake && t.mistake !== "None" && t.pnl < 0)
      m[t.mistake] = (m[t.mistake] || 0) + +t.pnl;
  });
  var b = null;
  for (var k in m) {
    if (!b || m[k] < m[b]) b = k;
  }
  return b ? [b, m[b]] : null;
}

var rng = "all",
  hide = 0,
  RNG = [
    ["week", "This week"],
    ["month", "This month"],
    ["30d", "Last 30 days"],
    ["all", "All time"],
  ];
function inRng(d) {
  var t = today();
  if (rng === "all") return true;
  if (rng === "month") return d.slice(0, 7) === t.slice(0, 7);
  if (rng === "30d") return d >= addDays(t, -29) && d <= t;
  var wd = (new Date(t + "T12:00:00").getDay() + 6) % 7;
  return d >= addDays(t, -wd) && d <= t;
}
function f2(n) {
  return (
    (n > 0 ? "+" : n < 0 ? "−" : "") +
    Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
function sdt(d) {
  return new Date(d + "T12:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
function stat(l, v, d, sg, c, x, i, ic) {
  return (
    '<div class="stat" style="--i:' +
    i +
    '"><span>' +
    l +
    "</span>" +
    (ic ? '<em class="ic2">' + ic + "</em>" : "") +
    '<b class="' +
    (c || "") +
    '" data-n="' +
    v +
    '" data-d="' +
    d +
    '" data-s="' +
    sg +
    '" data-x="' +
    (x || "") +
    '">0</b></div>'
  );
}
function spark(ts) {
  if (ts.length < 2) return "";
  var c = 0,
    p = [0];
  ts.forEach((t) => {
    c += +t.pnl || 0;
    p.push(c);
  });
  var mn = Math.min.apply(0, p),
    mx = Math.max.apply(0, p),
    rg = mx - mn || 1,
    pt = p
      .map(
        (v, i) =>
          ((i / (p.length - 1)) * 120).toFixed(1) +
          "," +
          (44 - ((v - mn) / rg) * 38).toFixed(1),
      )
      .join(" "),
    col = p[p.length - 1] >= 0 ? "#22C55E" : "#EF4444";
  return (
    '<svg viewBox="0 0 120 50" width="120" height="50" aria-hidden="true"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    col +
    '" stop-opacity=".4"/><stop offset="1" stop-color="' +
    col +
    '" stop-opacity="0"/></linearGradient></defs><polygon points="0,50 ' +
    pt +
    ' 120,50" fill="url(#sg)"/><polyline class="ln" pathLength="1" points="' +
    pt +
    '" fill="none" stroke="' +
    col +
    '" stroke-width="2.5" stroke-linejoin="round"/></svg>'
  );
}
function eq(ts) {
  if (ts.length < 2)
    return '<div class="empty">Log 2 trades to see your equity curve.</div>';
  var c = 0,
    p = [0];
  ts.forEach((t) => {
    c += +t.pnl || 0;
    p.push(c);
  });
  var mn = Math.min.apply(0, p),
    mx = Math.max.apply(0, p),
    rg = mx - mn || 1,
    L = 40,
    R = 8,
    T = 26,
    B = 24,
    W = 320,
    H = 200,
    pw = W - L - R,
    ph = H - T - B,
    X = (i) => L + (i / (p.length - 1)) * pw,
    Y = (v) => T + ph - ((v - mn) / rg) * ph,
    pt = p.map((v, i) => X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" "),
    up = p[p.length - 1] >= 0,
    col = up ? "#22C55E" : "#EF4444",
    gl = [mn, (mn + mx) / 2, mx]
      .map(
        (v) =>
          '<line x1="' +
          L +
          '" x2="' +
          (W - R) +
          '" y1="' +
          Y(v).toFixed(1) +
          '" y2="' +
          Y(v).toFixed(1) +
          '" stroke="var(--line)" stroke-dasharray="3 4"/><text x="' +
          (L - 6) +
          '" y="' +
          (Y(v) + 3).toFixed(1) +
          '" text-anchor="end" class="ax">' +
          Math.round(v) +
          "</text>",
      )
      .join(""),
    mid = Math.floor(p.length / 2),
    lx = X(p.length - 1),
    ly = Y(p[p.length - 1]),
    bx = Math.min(Math.max(lx - 48, L), W - R - 96),
    by = ly < 52 ? ly + 12 : ly - 44;
  return (
    '<svg viewBox="0 0 ' +
    W +
    " " +
    H +
    '" width="100%" role="img" aria-label="Equity curve"><defs><linearGradient id="eg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    col +
    '" stop-opacity=".4"/><stop offset="1" stop-color="' +
    col +
    '" stop-opacity="0"/></linearGradient></defs>' +
    gl +
    '<polygon points="' +
    L +
    "," +
    (T + ph) +
    " " +
    pt +
    " " +
    lx +
    "," +
    (T + ph) +
    '" fill="url(#eg2)"/><polyline class="ln" pathLength="1" points="' +
    pt +
    '" fill="none" stroke="' +
    col +
    '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<text x="' +
    X(0) +
    '" y="' +
    (H - 6) +
    '" class="ax">' +
    sdt(ts[0].date) +
    '</text><text x="' +
    X(mid) +
    '" y="' +
    (H - 6) +
    '" class="ax" text-anchor="middle">' +
    sdt(ts[Math.min(mid, ts.length - 1)].date) +
    '</text><text x="' +
    lx +
    '" y="' +
    (H - 6) +
    '" class="ax" text-anchor="end">' +
    sdt(ts[ts.length - 1].date) +
    "</text>" +
    '<circle cx="' +
    lx +
    '" cy="' +
    ly +
    '" r="5" fill="' +
    col +
    '" stroke="var(--bg)" stroke-width="2"/><rect x="' +
    bx +
    '" y="' +
    by +
    '" width="96" height="32" rx="9" fill="var(--surf2)" stroke="var(--line)"/><text x="' +
    (bx + 48) +
    '" y="' +
    (by + 13) +
    '" text-anchor="middle" class="ax">' +
    sdt(ts[ts.length - 1].date) +
    '</text><text x="' +
    (bx + 48) +
    '" y="' +
    (by + 26) +
    '" text-anchor="middle" style="font:700 11px var(--f3);fill:' +
    col +
    '">' +
    f2(p[p.length - 1]) +
    "</text></svg>"
  );
}
function barsH(ts, key) {
  var m = {};
  ts.forEach((t) => {
    var k = key(t);
    m[k] = (m[k] || 0) + (+t.pnl || 0);
  });
  var r = Object.keys(m)
    .map((k) => [k, m[k]])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (r.length > 4) {
    var o = r.slice(3).reduce((x, y) => x + y[1], 0);
    r = r.slice(0, 3).concat([["Others", o]]);
  }
  if (!r.length)
    return '<p class="mut" style="margin:6px 0 0">No data yet.</p>';
  var mx =
    Math.max.apply(
      0,
      r.map((x) => Math.abs(x[1])),
    ) || 1;
  return r
    .map(
      (x) =>
        '<div class="br"><div class="l"><span>' +
        esc(x[0]) +
        '</span><b class="' +
        (x[1] > 0 ? "up" : x[1] < 0 ? "dn" : "") +
        '">' +
        f2(x[1]) +
        '</b></div><i><u style="width:' +
        Math.max(x[1] ? 4 : 0, (Math.abs(x[1]) / mx) * 100) +
        "%;background:" +
        (x[1] >= 0
          ? "linear-gradient(90deg,#22C55E,#3A8CFF)"
          : "linear-gradient(90deg,#EF4444,#FF8A3D)") +
        '"></u></i></div>',
    )
    .join("");
}
function days() {
  var t = today(),
    ym = t.slice(0, 7),
    m = {},
    n = new Date(+t.slice(0, 4), +t.slice(5, 7), 0).getDate();
  S.trades.forEach((x) => {
    if (x.date.slice(0, 7) === ym) {
      var k = +x.date.slice(8);
      m[k] = (m[k] || 0) + (+x.pnl || 0);
    }
  });
  var mx =
      Math.max.apply(
        0,
        Object.keys(m).map((k) => Math.abs(m[k])),
      ) || 1,
    o = "";
  for (var d = 1; d <= n; d++) {
    var v = m[d] || 0,
      h = Math.max(v ? 8 : 3, (Math.abs(v) / mx) * 58);
    o +=
      '<rect x="' +
      (2 + (d - 1) * 8.6).toFixed(1) +
      '" y="' +
      (66 - h).toFixed(1) +
      '" width="5.5" height="' +
      h.toFixed(1) +
      '" rx="2.5" fill="' +
      (v > 0 ? "#22C55E" : v < 0 ? "#EF4444" : "var(--surf2)") +
      '"/>';
  }
  return (
    '<svg viewBox="0 0 270 84" width="100%" aria-hidden="true">' +
    o +
    [1, 5, 10, 15, 20, 25, n]
      .map(
        (d) =>
          '<text x="' +
          (2 + (d - 1) * 8.6 + 2.7).toFixed(1) +
          '" y="80" text-anchor="middle" class="ax">' +
          d +
          "</text>",
      )
      .join("") +
    "</svg>"
  );
}
function illo() {
  return '<svg viewBox="0 0 140 100" width="140" height="100" aria-hidden="true" class="float"><defs><linearGradient id="il" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14B8A6"/><stop offset="1" stop-color="#3B82F6"/></linearGradient></defs><circle cx="70" cy="50" r="42" fill="url(#il)" opacity=".12"/><rect x="34" y="52" width="18" height="30" rx="5" fill="url(#il)"/><rect x="61" y="34" width="18" height="48" rx="5" fill="#14B8A6" opacity=".85"/><rect x="88" y="18" width="18" height="64" rx="5" fill="url(#il)"/><path d="M28 70 L56 48 L84 56 L116 22" fill="none" stroke="#FF8A3D" stroke-width="4" stroke-linecap="round"/><circle cx="116" cy="22" r="6" fill="#FF8A3D"/></svg>';
}
function cd(i, m, t, d, inner, cls) {
  return (
    '<div class="card c ' +
    (cls || "") +
    '" style="--i:' +
    i +
    ";--m:" +
    m +
    ";--t:" +
    t +
    ";--d:" +
    d +
    '">' +
    inner +
    "</div>"
  );
}
function cu(v, d, sg, c, x, p) {
  return (
    '<b class="' +
    (c || "") +
    '" data-n="' +
    v +
    '" data-d="' +
    d +
    '" data-s="' +
    sg +
    '" data-x="' +
    (x || "") +
    '" data-p="' +
    (p || "") +
    '">0</b>'
  );
}
function tl(ic, c1, c2, lb, val, sub) {
  return (
    '<div class="tile"><i class="i3" style="--c1:' +
    c1 +
    ";--c2:" +
    c2 +
    '">' +
    ic +
    '</i><div><span class="lb">' +
    lb +
    "</span>" +
    val +
    (sub ? "<small>" + sub + "</small>" : "") +
    "</div></div>"
  );
}
function maxDD(ts) {
  var c = 0,
    pk = 0,
    m = 0;
  ts.forEach((t) => {
    c += +t.pnl || 0;
    pk = Math.max(pk, c);
    m = Math.min(m, c - pk);
  });
  return m;
}
function dd(ts) {
  if (ts.length < 2)
    return '<div class="empty">' + illo() + "<p>Needs 2+ trades.</p></div>";
  var c = 0,
    pk = 0,
    d = [0],
    mn = 0;
  ts.forEach((t) => {
    c += +t.pnl || 0;
    pk = Math.max(pk, c);
    var x = c - pk;
    d.push(x);
    mn = Math.min(mn, x);
  });
  if (!mn) return '<div class="empty"><p>No drawdown yet 🎉</p></div>';
  var W = 300,
    H = 170,
    L = 42,
    R = 8,
    T = 14,
    B = 22,
    pw = W - L - R,
    ph = H - T - B,
    X = (i) => L + (i / (d.length - 1)) * pw,
    Y = (v) => T + (v / mn) * ph,
    pt = d.map((v, i) => X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
  return (
    '<svg viewBox="0 0 ' +
    W +
    " " +
    H +
    '" width="100%" role="img" aria-label="Drawdown"><defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EF4444" stop-opacity=".05"/><stop offset="1" stop-color="#EF4444" stop-opacity=".45"/></linearGradient></defs>' +
    [0, mn / 2, mn]
      .map(
        (v) =>
          '<line x1="' +
          L +
          '" x2="' +
          (W - R) +
          '" y1="' +
          Y(v).toFixed(1) +
          '" y2="' +
          Y(v).toFixed(1) +
          '" stroke="var(--line)" stroke-dasharray="3 4"/><text x="' +
          (L - 6) +
          '" y="' +
          (Y(v) + 3).toFixed(1) +
          '" text-anchor="end" class="ax">' +
          Math.round(v) +
          "</text>",
      )
      .join("") +
    '<polygon points="' +
    L +
    "," +
    T +
    " " +
    pt +
    " " +
    X(d.length - 1).toFixed(1) +
    "," +
    T +
    '" fill="url(#dg)"/><polyline class="ln" pathLength="1" points="' +
    pt +
    '" fill="none" stroke="#EF4444" stroke-width="2.4" stroke-linejoin="round"/></svg>'
  );
}
function donut(ts) {
  if (!ts.length)
    return '<div class="empty">' + illo() + "<p>No trades yet.</p></div>";
  var m = {};
  ts.forEach((t) => {
    var k = t.inst || "Other";
    m[k] = (m[k] || 0) + 1;
  });
  var r = Object.keys(m)
    .map((k) => [k, m[k]])
    .sort((a, b) => b[1] - a[1]);
  if (r.length > 4) {
    var o = r.slice(3).reduce((x, y) => x + y[1], 0);
    r = r.slice(0, 3).concat([["Others", o]]);
  }
  var n = ts.length,
    C = 2 * Math.PI * 44,
    off = 0,
    col = ["#14B8A6", "#3B82F6", "#8B5CF6", "#94A3B8"];
  var arcs = r
    .map((x, i) => {
      var len = (x[1] / n) * C,
        a = Math.max(0, len - 2),
        h =
          '<circle cx="60" cy="60" r="44" fill="none" stroke="' +
          col[i] +
          '" stroke-width="16" stroke-dasharray="' +
          a.toFixed(1) +
          " " +
          (C - a).toFixed(1) +
          '" stroke-dashoffset="' +
          (-off).toFixed(1) +
          '" transform="rotate(-90 60 60)"/>';
      off += len;
      return h;
    })
    .join("");
  return (
    '<div class="dn2"><svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">' +
    arcs +
    '<text x="60" y="62" text-anchor="middle" style="font:800 24px var(--f1);fill:var(--tx)">' +
    n +
    '</text><text x="60" y="78" text-anchor="middle" class="ax">Trades</text></svg><div>' +
    r
      .map(
        (x, i) =>
          '<div class="lgd"><i style="background:' +
          col[i] +
          '"></i><span>' +
          esc(x[0]) +
          "</span><b>" +
          Math.round((x[1] / n) * 100) +
          "%</b></div>",
      )
      .join("") +
    "</div></div>"
  );
}
/* ====================================================================
 * 6. Main Dashboard View (Overview, PnL, Win Rate, Analytics)
 * ==================================================================== */
function home() {
  var P = S.profile,
    all = sortedTrades().filter((t) => inRng(t.date) && accOk(t)),
    st = stats(all),
    hr = new Date().getHours(),
    cm = costly(),
    wn = all.filter((x) => x.pnl > 0),
    ls = all.filter((x) => x.pnl < 0),
    gw = sum(wn),
    gl = sum(ls),
    aw = wn.length ? gw / wn.length : 0,
    al = ls.length ? gl / ls.length : 0,
    srt = all.slice().sort((a, b) => b.pnl - a.pnl),
    bt = srt.length && srt[0].pnl > 0 ? srt[0] : null,
    wt = srt.length && srt[srt.length - 1].pnl < 0 ? srt[srt.length - 1] : null,
    mc = {},
    rec = all.slice().reverse().slice(0, 6),
    pc = Math.round(st.wr),
    cr = 2 * Math.PI * 24,
    mdd = maxDD(all),
    cls = st.pnl >= 0 ? "up" : "dn";
  all.forEach((t) => {
    var k = t.inst || "Other";
    mc[k] = (mc[k] || 0) + 1;
  });
  var mt = Object.keys(mc).sort((a, b) => mc[b] - mc[a])[0],
    sd2 = (t) =>
      esc(t.inst || "Trade") + " · " + (t.side === "Short" ? "Bear" : "Bull");
  return (
    (P.name
      ? ""
      : '<div class="card"><h3>Make it yours</h3><p class="mut">Add your name, goal, favorite pairs and entry rules.</p><button class="pri" onclick="profileForm(true)">Set up profile</button></div>') +
    '<div class="gh"><div><p class="mut" style="margin:0">' +
    (hr < 12
      ? "Good morning,"
      : hr < 17
        ? "Good afternoon,"
        : "Good evening,") +
    "</p><h1>" +
    esc(P.name || "Trader") +
    " " +
    (hr < 12 ? "☀️" : hr < 17 ? "🌤️" : "🌙") +
    '</h1><p class="mut" style="margin:6px 0 0">Discipline today builds the freedom tomorrow.</p></div><div class="fcol">' +
    accSelH() +
    '<select class="sel" aria-label="Date range" onchange="rng=this.value;render()">' +
    RNG.map(
      (r) =>
        '<option value="' +
        r[0] +
        '"' +
        (rng === r[0] ? " selected" : "") +
        ">" +
        r[1] +
        "</option>",
    ).join("") +
    "</select></div></div>" +
    '<div class="dash">' +
    cd(
      0,
      2,
      3,
      3,
      '<div class="pl"><div class="tile"><i class="i3" style="--c1:#22C55E;--c2:#0D9488">📈</i><div><span class="lb">Total P&amp;L <button class="eye" onclick="hide=!hide;render()" aria-label="Hide amounts">' +
        (hide ? "🙈" : "👁️") +
        '</button></span><div class="v amt ' +
        cls +
        '">' +
        f2(st.pnl) +
        "</div><small>" +
        st.n +
        " trade" +
        (st.n === 1 ? "" : "s") +
        " · " +
        RNG.filter((r) => r[0] === rng)[0][1].toLowerCase() +
        "</small></div></div>" +
        spark(all) +
        "</div>",
      "pnlc",
    ) +
    cd(
      1,
      1,
      3,
      3,
      '<div class="pl">' +
        tl(
          "🎯",
          "#14B8A6",
          "#0EA5E9",
          "Win rate",
          cu(st.wr, 0, 0, "", "%"),
          wn.length + "W / " + ls.length + "L",
        ) +
        '<svg class="rg" viewBox="0 0 60 60" width="54" height="54" aria-hidden="true"><circle cx="30" cy="30" r="24" fill="none" stroke="var(--surf2)" stroke-width="7"/><circle class="p" cx="30" cy="30" r="24" fill="none" stroke="#14B8A6" stroke-width="7" stroke-linecap="round" stroke-dasharray="' +
        cr.toFixed(1) +
        '" stroke-dashoffset="' +
        (cr * (1 - pc / 100)).toFixed(1) +
        '" style="--c:' +
        cr.toFixed(1) +
        '" transform="rotate(-90 30 30)"/></svg></div>',
    ) +
    cd(
      2,
      1,
      3,
      3,
      tl(
        "🔁",
        "#3B82F6",
        "#6366F1",
        "Total trades",
        cu(st.n, 0, 0, "", ""),
        "Avg R " + st.r.toFixed(2),
      ),
    ) +
    cd(
      3,
      2,
      3,
      3,
      tl(
        "⚖️",
        "#8B5CF6",
        "#6366F1",
        "Profit factor",
        st.pf >= 99 ? "<b>∞</b>" : cu(st.pf, 2, 0, "", ""),
        "Win " + f2(aw) + " / Loss " + f2(al),
      ),
    ) +
    cd(4, 2, 6, 8, '<div class="pl"><h3>Equity curve</h3></div>' + eq(all)) +
    cd(
      5,
      2,
      6,
      4,
      '<div class="pl"><h3>Drawdown</h3><b class="dn" style="font-family:var(--f3)">' +
        f2(mdd) +
        "</b></div>" +
        dd(all),
    ) +
    cd(
      6,
      1,
      3,
      3,
      tl(
        "🏆",
        "#22C55E",
        "#0D9488",
        "Best trade",
        cu(bt ? bt.pnl : 0, 2, 1, "up", ""),
        bt ? sd2(bt) : "No wins yet",
      ),
    ) +
    cd(
      7,
      1,
      3,
      3,
      tl(
        "📉",
        "#EF4444",
        "#B91C1C",
        "Worst trade",
        cu(wt ? wt.pnl : 0, 2, 0, wt ? "dn" : "", ""),
        wt ? sd2(wt) : "No losses yet",
      ),
    ) +
    cd(
      8,
      1,
      3,
      3,
      tl(
        "🔥",
        "#F59E0B",
        "#EF4444",
        "Most traded",
        '<b style="font-size:19px">' + esc(mt || "–") + "</b>",
        mt ? mc[mt] + " trades" : "",
      ),
    ) +
    cd(
      9,
      1,
      3,
      3,
      tl(
        "🎚️",
        "#14B8A6",
        "#3B82F6",
        "Average R",
        cu(st.r, 2, 0, "", ""),
        "Expectancy",
      ),
    ) +
    cd(
      10,
      2,
      6,
      8,
      '<div class="pl"><h3>Recent trades</h3><button class="ghost" style="min-height:34px;padding:6px 12px;font-size:13px" onclick="go(\'trades\')">View all →</button></div>' +
        (rec.length
          ? '<div class="tr th"><span class="hm">Date</span><span>Instrument</span><span class="hm">Direction</span><span>P&amp;L</span><span class="hm">R</span><span>Outcome</span></div>' +
            rec
              .map(
                (t) =>
                  '<div class="tr" onclick="tradeForm(\'' +
                  t.id +
                  '\')"><span class="hm mut">' +
                  sdt(t.date) +
                  "</span><b>" +
                  esc(t.inst || "Trade") +
                  (t.sh && t.sh.length ? " 📷" : "") +
                  '</b><span class="hm"><i class="pill ' +
                  (t.side === "Short" ? "dn" : "") +
                  '">' +
                  (t.side === "Short" ? "Bear" : "Bull") +
                  '</i></span><b class="' +
                  (t.pnl >= 0 ? "up" : "dn") +
                  '" style="font-family:var(--f3)">' +
                  f2(+t.pnl || 0) +
                  '</b><span class="hm mut">' +
                  (t.r !== "" && t.r != null
                    ? (t.r > 0 ? "+" : "") + t.r + "R"
                    : "–") +
                  '</span><span><i class="pill ' +
                  (t.pnl < 0 ? "dn" : t.pnl > 0 ? "" : "mu") +
                  '">' +
                  (t.pnl > 0 ? "Win" : t.pnl < 0 ? "Loss" : "BE") +
                  "</i></span></div>",
              )
              .join("")
          : '<div class="empty">' +
            illo() +
            "<p>No trades in this range yet.</p></div>"),
    ) +
    cd(11, 2, 6, 4, "<h3>Instrument breakdown</h3>" + donut(all)) +
    cd(
      12,
      2,
      3,
      4,
      "<h3>P&amp;L by setup</h3>" + barsH(all, (t) => t.setup || "No setup"),
    ) +
    cd(
      13,
      2,
      3,
      4,
      '<h3>Daily performance</h3><p class="mut" style="margin:0">This month</p>' +
        days(),
    ) +
    cd(
      14,
      2,
      6,
      4,
      '<h3>Trade stats</h3><div class="o"><span class="mut">Total profit</span><b class="up">' +
        f2(gw) +
        '</b></div><div class="o"><span class="mut">Total loss</span><b class="dn">' +
        f2(gl) +
        '</b></div><div class="o"><span class="mut">Avg win</span><b>' +
        f2(aw) +
        '</b></div><div class="o"><span class="mut">Avg loss</span><b>' +
        f2(al) +
        '</b></div><div class="o"><span class="mut">Expectancy (R)</span><b>' +
        st.r.toFixed(2) +
        "</b></div>",
    ) +
    (cm
      ? cd(
          15,
          2,
          6,
          12,
          '<h3>Costliest mistake</h3><p class="mut" style="margin:4px 0 0">' +
            esc(cm[0]) +
            ' has cost you <b class="dn">' +
            f2(cm[1]) +
            "</b>. Write a rule against it in tomorrow’s plan.</p>",
        )
      : "") +
    "</div>" +
    '<div class="row" style="max-width:520px"><button class="pri" onclick="go(\'journal\')">Write today’s journal</button><button onclick="tradeForm()">＋ Log a trade</button></div>'
  );
}

var q = "";
function trList() {
  var Q = q.toLowerCase(),
    ts = sortedTrades()
      .filter(
        (t) =>
          !Q ||
          (
            (t.inst || "") +
            " " +
            (t.setup || "") +
            " " +
            (t.notes || "") +
            " " +
            (t.mistake || "")
          )
            .toLowerCase()
            .indexOf(Q) > -1,
      )
      .reverse();
  if (!ts.length)
    return (
      '<div class="card empty">' +
      illo() +
      "<p>" +
      (q
        ? "No trades match your search."
        : "No trades yet. Log your first one and it shows up here and on your dashboard.") +
      "</p></div>"
    );
  var cur = "",
    h = '<div class="card">';
  ts.forEach((t) => {
    if (t.date !== cur) {
      cur = t.date;
      h += '<div class="mut" style="padding-top:10px">' + nice(cur) + "</div>";
    }
    h +=
      '<div class="item" onclick="tradeForm(\'' +
      t.id +
      "')\"><div><b>" +
      esc(t.inst || "Trade") +
      '</b> <span class="mut">' +
      esc(t.side) +
      (t.size ? " · " + t.size : "") +
      (t.entry ? " @ " + t.entry : "") +
      "</span>" +
      (t.grade ? '<span class="tag">' + esc(t.grade) + "</span>" : "") +
      (t.acc ? '<span class="tag">' + esc(accName(t.acc)) + "</span>" : "") +
      (t.mistake && t.mistake !== "None"
        ? '<span class="tag">' + esc(t.mistake) + "</span>"
        : "") +
      (t.ok ? "" : '<span class="tag">broke rules</span>') +
      (t.sh && t.sh.length
        ? '<span class="tag">📷 ' + t.sh.length + "</span>"
        : "") +
      '</div><div class="row2"><b class="' +
      (t.pnl >= 0 ? "up" : "dn") +
      '">' +
      fmt(+t.pnl || 0) +
      '</b><button class="mini" aria-label="Share trade card" onclick="event.stopPropagation();tradeCard(\'' +
      t.id +
      "')\">⤴</button></div></div>";
  });
  return h + "</div>";
}
function trades() {
  return (
    '<h2>Trades</h2><div class="row trs" style="margin-bottom:14px;flex-wrap:nowrap"><input id="trq" type="search" placeholder="Search trades, notes…" value="' +
    esc(q) +
    '" oninput="q=this.value;$(\'#trl\').innerHTML=trList()"><button class="pri" style="flex:none" onclick="tradeForm()">＋ Log</button></div><div id="trl">' +
    trList() +
    "</div>"
  );
}
var cm0 = today().slice(0, 7);
function cmv(d) {
  var y = +cm0.slice(0, 4),
    m = +cm0.slice(5, 7) + d,
    dt = new Date(y, m - 1, 1);
  cm0 = dt.getFullYear() + "-" + pad(dt.getMonth() + 1);
  render();
}
/* ====================================================================
 * 7. Calendar View & Heatmap
 * ==================================================================== */
function cal() {
  var y = +cm0.slice(0, 4),
    m = +cm0.slice(5, 7),
    n = new Date(y, m, 0).getDate(),
    off = (new Date(y, m - 1, 1).getDay() + 6) % 7,
    mp = {},
    ct = {};
  S.trades.filter(accOk).forEach((t) => {
    if (t.date.slice(0, 7) === cm0) {
      var k = +t.date.slice(8);
      mp[k] = (mp[k] || 0) + (+t.pnl || 0);
      ct[k] = (ct[k] || 0) + 1;
    }
  });
  var ks = Object.keys(mp),
    mx = Math.max.apply(0, [1].concat(ks.map((k) => Math.abs(mp[k])))),
    tot = ks.reduce((a, k) => a + mp[k], 0),
    g = ks.filter((k) => mp[k] > 0).length,
    r = ks.filter((k) => mp[k] < 0).length,
    cells = "";
  for (var i = 0; i < off; i++) cells += '<div class="cd e"></div>';
  for (var d = 1; d <= n; d++) {
    var v = mp[d],
      has = ct[d] > 0,
      a = has ? (0.16 + (0.5 * Math.abs(v)) / mx).toFixed(2) : 0;
    cells +=
      '<div class="cd" style="' +
      (has
        ? "background:rgba(" +
          (v >= 0 ? "34,197,94" : "239,68,68") +
          "," +
          a +
          ")"
        : "") +
      '" onclick="jd=\'' +
      cm0 +
      "-" +
      pad(d) +
      "';go('journal')\"><span>" +
      d +
      "</span>" +
      (has
        ? '<b class="' +
          (v >= 0 ? "up" : "dn") +
          '">' +
          fmt(v) +
          "</b><small>" +
          ct[d] +
          " trade" +
          (ct[d] === 1 ? "" : "s") +
          "</small>"
        : "") +
      "</div>";
  }
  return (
    '<h2>Calendar</h2><div class="card"><div class="pl"><button class="bk" onclick="cmv(-1)" aria-label="Previous month">‹</button><h3>' +
    new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    }) +
    '</h3><button class="bk" onclick="cmv(1)" aria-label="Next month">›</button></div><div class="cgrid">' +
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      .map((x) => '<div class="wd">' + x + "</div>")
      .join("") +
    cells +
    "</div></div>" +
    '<div class="grid3"><div class="stat" style="--i:0"><span>Month P&amp;L</span><b class="' +
    (tot >= 0 ? "up" : "dn") +
    '">' +
    f2(tot) +
    '</b></div><div class="stat" style="--i:1"><span>Green days</span><b class="up">' +
    g +
    '</b></div><div class="stat" style="--i:2"><span>Red days</span><b class="dn">' +
    r +
    "</b></div></div>"
  );
}
function modal(h) {
  var v = document.createElement("div");
  v.className = "veil";
  v.innerHTML = '<div class="sheet">' + h + "</div>";
  v.addEventListener("click", function (e) {
    if (e.target === v) v.remove();
  });
  document.body.appendChild(v);
  return v;
}
function closeM() {
  var v = $(".veil");
  if (v) v.remove();
}
function confetti() {
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  for (var i = 0; i < 22; i++) {
    var e = document.createElement("i");
    e.className = "cf";
    e.style.cssText =
      "--x:" +
      (Math.random() * 300 - 150) +
      "px;--y:" +
      (-120 - Math.random() * 220) +
      "px;--c:" +
      ["#FF8A3D", "#FF3D81", "#22C55E", "#FFD166", "#EF4444"][i % 5] +
      ";left:50%;top:60%";
    document.body.appendChild(e);
    setTimeout(function () {
      e.remove();
    }, 1300);
  }
}
var acf = "all";
function accName(id) {
  var a = S.accts.filter((x) => x.id === id)[0];
  return a
    ? a.firm + " " + (a.size >= 1000 ? a.size / 1000 + "K" : a.size)
    : "Account";
}
function accOk(t) {
  if (acf !== "all" && acf !== "personal" && !S.accts.some((a) => a.id === acf))
    acf = "all";
  return acf === "all" || (acf === "personal" ? !t.acc : t.acc === acf);
}
function accSelH() {
  accOk({});
  return (
    '<select class="sel" aria-label="Account" onchange="acf=this.value;render()"><option value="all">All accounts</option><option value="personal"' +
    (acf === "personal" ? " selected" : "") +
    ">Personal</option>" +
    S.accts
      .map(
        (a) =>
          '<option value="' +
          a.id +
          '"' +
          (acf === a.id ? " selected" : "") +
          ">" +
          esc(accName(a.id)) +
          "</option>",
      )
      .join("") +
    "</select>"
  );
}
function acctSel(t) {
  var cur = t.id ? t.acc || "" : S.profile.lastAcc || "",
    L = S.accts.filter((a) => a.status !== "Blown" || a.id === t.acc);
  if (!L.some((a) => a.id === cur)) cur = "";
  return (
    '<label for="f_ac">Account</label><select id="f_ac"><option value="">Personal / no prop account</option>' +
    L.map(
      (a) =>
        '<option value="' +
        a.id +
        '"' +
        (a.id === cur ? " selected" : "") +
        ">" +
        esc(a.firm) +
        " · " +
        money(a.size) +
        " · " +
        a.status +
        "</option>",
    ).join("") +
    "</select>"
  );
}
function accLine(a) {
  var ts = S.trades.filter((t) => t.acc === a.id);
  if (!ts.length)
    return '<div class="tl2">No trades linked yet. Pick this account when you log a trade.</div>';
  var st = stats(ts);
  return (
    '<div class="tl2">' +
    ts.length +
    " trade" +
    (ts.length === 1 ? "" : "s") +
    ' · P&amp;L <b class="' +
    (st.pnl >= 0 ? "up" : "dn") +
    '">' +
    f2(st.pnl) +
    "</b> · Balance <b>" +
    money(a.size + st.pnl) +
    "</b></div>"
  );
}
function jrn(a) {
  var ts = sortedTrades()
      .filter((t) => t.acc === a.id)
      .reverse(),
    st = stats(ts);
  return (
    '<div class="g4" style="margin:12px 0 10px"><div class="stat"><span>Balance</span><b>' +
    money(a.size + st.pnl) +
    '</b></div><div class="stat"><span>P&amp;L</span><b class="' +
    (st.pnl >= 0 ? "up" : "dn") +
    '">' +
    f2(st.pnl) +
    '</b></div><div class="stat"><span>Win rate</span><b>' +
    Math.round(st.wr) +
    '%</b></div><div class="stat"><span>Trades</span><b>' +
    st.n +
    "</b></div></div><h3>Trade journal</h3>" +
    (ts.length
      ? ts
          .slice(0, 8)
          .map(
            (t) =>
              '<div class="item" onclick="closeM();tradeForm(\'' +
              t.id +
              "')\"><div><b>" +
              esc(t.inst || "Trade") +
              '</b> <span class="mut">' +
              t.side +
              " · " +
              sdt(t.date) +
              '</span></div><b class="' +
              (t.pnl >= 0 ? "up" : "dn") +
              '" style="font-family:var(--f3)">' +
              f2(+t.pnl || 0) +
              "</b></div>",
          )
          .join("") +
        (ts.length > 8
          ? '<p class="mut">+ ' +
            (ts.length - 8) +
            " more in your Trades tab</p>"
          : "")
      : '<p class="mut">No trades logged on this account yet.</p>') +
    '<button class="pri" style="width:100%;margin:10px 0 16px" onclick="S.profile.lastAcc=\'' +
    a.id +
    "';closeM();tradeForm()\">Log a trade on this account</button>"
  );
}
function nv(i) {
  var x = parseFloat($(i).value);
  return isNaN(x) ? "" : x;
}
function nq(v) {
  return v === "" || v == null || isNaN(+v) ? "" : +v;
}
var SLOTS = [
    ["before", "Before entry"],
    ["after", "After entry"],
    ["result", "Result"],
  ],
  shp = {},
  DBP = null;
function idb() {
  return (
    DBP ||
    (DBP = new Promise(function (res, rej) {
      var r = indexedDB.open("lockin", 1);
      r.onupgradeneeded = function () {
        r.result.createObjectStore("shots");
      };
      r.onsuccess = function () {
        res(r.result);
      };
      r.onerror = function () {
        rej(r.error);
      };
    }))
  );
}
function shotPut(k, v) {
  return idb().then(
    (db) =>
      new Promise((res, rej) => {
        var t = db.transaction("shots", "readwrite");
        t.objectStore("shots").put(v, k);
        t.oncomplete = res;
        t.onerror = () => rej(t.error);
      }),
  );
}
function shotGet(k) {
  if (k && (k.startsWith("http://") || k.startsWith("https://"))) {
    return Promise.resolve(k);
  }
  return idb().then(
    (db) =>
      new Promise((res, rej) => {
        var q2 = db.transaction("shots").objectStore("shots").get(k);
        q2.onsuccess = () => res(q2.result || null);
        q2.onerror = () => rej(q2.error);
      }),
  );
}
function shotDel(k) {
  return idb().then(
    (db) =>
      new Promise((res, rej) => {
        var t = db.transaction("shots", "readwrite");
        t.objectStore("shots").delete(k);
        t.oncomplete = res;
        t.onerror = () => rej(t.error);
      }),
  );
}
function shrink(f) {
  return new Promise((res, rej) => {
    var u = URL.createObjectURL(f),
      im = new Image();
    im.onload = function () {
      var r = Math.min(1, 1400 / Math.max(im.width, im.height)),
        c = document.createElement("canvas");
      c.width = Math.round(im.width * r);
      c.height = Math.round(im.height * r);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      res(c.toDataURL("image/jpeg", 0.72));
    };
    im.onerror = function () {
      rej();
    };
    im.src = u;
  });
}
function viewImg(src, l) {
  if (!src) return;
  var v = modal(
    "<h3>" +
      esc(l) +
      '</h3><img src="' +
      src +
      '" alt="' +
      esc(l) +
      '" style="width:100%;border-radius:14px;margin-top:10px"><button class="pri" id="vx" style="width:100%;margin-top:12px">Close</button>',
  );
  v.querySelector("#vx").onclick = function () {
    v.remove();
  };
}
function slotH(k, l, src) {
  return (
    '<div class="slot">' +
    (src
      ? '<img src="' +
        src +
        '" alt="' +
        l +
        '" data-view="' +
        k +
        '"><button type="button" class="x" data-rm="' +
        k +
        '" aria-label="Remove ' +
        l +
        '">×</button><small>' +
        l +
        "</small>"
      : '<button type="button" class="add" data-add="' +
        k +
        '"><span>📷</span>' +
        l +
        "</button>") +
    "</div>"
  );
}
/* ====================================================================
 * 11. Trade Management & Entry Forms
 * ==================================================================== */
function tradeForm(id) {
  var P = S.profile,
    t = S.trades.filter((x) => x.id === id)[0] || {
      date: today(),
      side: "Long",
      mistake: "None",
      chk: [],
    },
    rules = P.rules || [],
    pairs = P.pairs || [],
    chk = t.chk || [],
    tid = t.id || uid(),
    slot = null;
  shp = {};
  var v = modal(
    "<h2>" +
      (id ? "Edit trade" : "Log a trade") +
      '</h2><label for="f_d">Date</label><input id="f_d" type="date" value="' +
      t.date +
      '"><label for="f_i">Instrument</label><input id="f_i" value="' +
      esc(t.inst || "") +
      '" placeholder="Nasdaq, Gold, EURUSD…">' +
      (pairs.length
        ? '<div class="chips" style="margin-top:8px">' +
          pairs
            .map(
              (x) =>
                '<button type="button" class="chip" data-pick="' +
                esc(x) +
                '">' +
                esc(x) +
                "</button>",
            )
            .join("") +
          "</div>"
        : "") +
      acctSel(t) +
      '<div class="row"><div><label for="f_s">Side</label><select id="f_s"><option' +
      (t.side === "Long" ? " selected" : "") +
      ">Long</option><option" +
      (t.side === "Short" ? " selected" : "") +
      '>Short</option></select></div><div><label for="f_p">P&amp;L</label><input id="f_p" type="number" step="any" inputmode="decimal" value="' +
      (t.pnl == null ? "" : t.pnl) +
      '"></div><div><label for="f_r">R multiple</label><input id="f_r" type="number" step="any" inputmode="decimal" value="' +
      (t.r == null ? "" : t.r) +
      '"></div></div>' +
      '<div class="row"><div><label for="f_z">Size</label><input id="f_z" type="number" step="any" inputmode="decimal" value="' +
      (t.size == null ? "" : t.size) +
      '" placeholder="contracts / lots"></div><div><label for="f_en">Entry price</label><input id="f_en" type="number" step="any" inputmode="decimal" value="' +
      (t.entry == null ? "" : t.entry) +
      '"></div></div>' +
      '<div class="row"><div><label for="f_sl">Stop-loss</label><input id="f_sl" type="number" step="any" inputmode="decimal" value="' +
      (t.sl == null ? "" : t.sl) +
      '"></div><div><label for="f_tp">Take-profit</label><input id="f_tp" type="number" step="any" inputmode="decimal" value="' +
      (t.tp == null ? "" : t.tp) +
      '"></div></div>' +
      '<div class="row"><div style="flex:2"><label for="f_st">Setup</label><input id="f_st" value="' +
      esc(t.setup || "") +
      '" placeholder="Breakout, pullback…"></div><div><label for="f_g">Grade</label><select id="f_g">' +
      ["", "A+", "A", "B", "C"]
        .map(
          (g) =>
            '<option value="' +
            g +
            '"' +
            ((t.grade || "") === g ? " selected" : "") +
            ">" +
            (g || "–") +
            "</option>",
        )
        .join("") +
      "</select></div></div>" +
      '<label for="f_m">Mistake</label><select id="f_m">' +
      MIST.map(
        (m) =>
          "<option" +
          (t.mistake === m ? " selected" : "") +
          ">" +
          m +
          "</option>",
      ).join("") +
      "</select>" +
      "<label>Entry-model checklist</label>" +
      (rules.length
        ? rules
            .map(
              (r) =>
                '<label class="rule"><input type="checkbox" class="f_r" value="' +
                esc(r) +
                '" ' +
                (chk.indexOf(r) > -1 ? "checked" : "") +
                "> " +
                esc(r) +
                "</label>",
            )
            .join("")
        : '<label class="rule"><input type="checkbox" id="f_o" ' +
          (t.ok ? "checked" : "") +
          '> I followed my rules</label><p class="mut">Add your entry-model rules under Settings to get a full checklist here.</p>') +
      '<label>Screenshots</label><div class="slots" id="f_sl2"></div><input id="f_file" type="file" accept="image/*" hidden>' +
      '<label for="f_n">Notes</label><textarea id="f_n">' +
      esc(t.notes || "") +
      '</textarea><div class="row" style="margin-top:16px"><button class="pri" id="f_save">Save trade</button>' +
      (id
        ? '<button id="f_sh">Share card</button><button class="ghost dn" id="f_del">Delete</button>'
        : "") +
      "</div>",
  );
  function draw() {
    v.querySelector("#f_sl2").innerHTML = SLOTS.map(function (s) {
      return slotH(s[0], s[1], shp[s[0]]);
    }).join("");
  }
  draw();
  (t.sh || []).forEach(function (k) {
    shotGet(tid + ":" + k)
      .then(function (d) {
        if (d && !(k in shp)) {
          shp[k] = d;
          draw();
        }
      })
      .catch(function () {});
  });
  v.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pick],[data-add],[data-rm],[data-view]");
    if (!b) return;
    var d = b.dataset;
    if (d.pick) $("#f_i").value = d.pick;
    else if (d.add) {
      slot = d.add;
      v.querySelector("#f_file").click();
    } else if (d.rm) {
      shp[d.rm] = null;
      draw();
    } else if (d.view)
      viewImg(
        shp[d.view],
        SLOTS.filter(function (s) {
          return s[0] === d.view;
        })[0][1],
      );
  });
  v.querySelector("#f_file").onchange = function () {
    var f = this.files[0],
      k = slot;
    this.value = "";
    if (!f || !k) return;
    shrink(f)
      .then(function (u) {
        shp[k] = u;
        draw();
      })
      .catch(function () {
        toast("Couldn’t read that image.");
      });
  };
  v.querySelector("#f_save").onclick = async function () {
    var p = parseFloat($("#f_p").value);
    if (isNaN(p)) {
      toast("Enter the P&L for this trade.");
      return;
    }
    var r = $("#f_r").value,
      cs = [].slice
        .call(v.querySelectorAll(".f_r:checked"))
        .map((x) => x.value),
      ok = rules.length ? cs.length === rules.length : $("#f_o").checked,
      sh = [],
      had = t.sh || [];
    try {
      for (var i = 0; i < SLOTS.length; i++) {
        var k = SLOTS[i][0];
        if (shp[k]) {
          if (
            typeof LockinSync !== "undefined" &&
            typeof LockinAuth !== "undefined" &&
            LockinAuth.getCurrentUser() &&
            isSupabaseConfigured() &&
            typeof shp[k] === "string" &&
            shp[k].startsWith("data:")
          ) {
            try {
              var byteString = atob(shp[k].split(",")[1]);
              var mimeString = shp[k].split(",")[0].split(":")[1].split(";")[0];
              var ab = new ArrayBuffer(byteString.length);
              var ia = new Uint8Array(ab);
              for (var bi = 0; bi < byteString.length; bi++) {
                ia[bi] = byteString.charCodeAt(bi);
              }
              var blob = new Blob([ab], { type: mimeString });
              var cdnUrl = await LockinSync.uploadScreenshot(
                blob,
                tid + "_" + k,
              );
              if (cdnUrl) {
                shp[k] = cdnUrl;
              }
            } catch (err) {
              console.warn("Supabase upload fallback to local:", err);
            }
          }
          await shotPut(tid + ":" + k, shp[k]);
          sh.push(k);
        } else if (shp[k] === null) {
          if (had.indexOf(k) > -1) await shotDel(tid + ":" + k);
        } else if (had.indexOf(k) > -1) sh.push(k);
      }
    } catch (e) {
      toast(
        "Screenshots couldn’t be saved in this browser. Open the hosted version.",
      );
      sh = [];
    }
    var o = {
      id: tid,
      date: $("#f_d").value || today(),
      inst: $("#f_i").value.trim(),
      side: $("#f_s").value,
      pnl: p,
      r: r === "" ? "" : parseFloat(r),
      setup: $("#f_st").value.trim(),
      grade: $("#f_g").value,
      mistake: $("#f_m").value,
      notes: $("#f_n").value.trim(),
      ok: ok,
      chk: cs,
      acc: $("#f_ac").value,
      size: nv("#f_z"),
      entry: nv("#f_en"),
      sl: nv("#f_sl"),
      tp: nv("#f_tp"),
      sh: sh,
    };
    S.trades = S.trades.filter((x) => x.id !== o.id);
    S.trades.push(o);
    S.profile.lastAcc = o.acc;
    if (save()) {
      closeM();
      toast(ok ? "Saved. Full discipline, nice." : "Trade saved");
      if (ok) confetti();
      render();
    }
  };
  if (id) {
    v.querySelector("#f_sh").onclick = function () {
      closeM();
      tradeCard(id);
    };
    v.querySelector("#f_del").onclick = function () {
      (t.sh || []).forEach(function (k) {
        shotDel(tid + ":" + k).catch(function () {});
      });
      S.trades = S.trades.filter((x) => x.id !== id);
      if (typeof LockinSync !== "undefined") {
        LockinSync.deleteTrade(id);
      }
      save();
      closeM();
      toast("Trade deleted");
      render();
    };
  }
}

var jd = today(),
  jm = 0,
  jc = 0;
function journal() {
  var d = S.days[jd] || {};
  jm = d.mood || 0;
  jc = d.disc || 0;
  var past = Object.keys(S.days)
    .sort()
    .reverse()
    .filter(function (k) {
      return k !== jd;
    })
    .slice(0, 12);
  return (
    '<h2>Journal</h2><div class="card"><label for="j_d" style="margin-top:0">Day</label><input id="j_d" type="date" value="' +
    jd +
    '"><label for="j_p">Plan: what will you trade, and what won’t you?</label><textarea id="j_p">' +
    esc(d.plan || "") +
    '</textarea><label for="j_r">Review: what went well, what to fix?</label><textarea id="j_r">' +
    esc(d.review || "") +
    "</textarea>" +
    '<label>Mood</label><div class="pips" id="j_m">' +
    MOODS.map(function (m, i) {
      return (
        '<button type="button" class="' +
        (jm === i + 1 ? "on" : "") +
        '" aria-label="Mood ' +
        (i + 1) +
        " of 5\" onclick=\"pick('m'," +
        (i + 1) +
        ')">' +
        m +
        "</button>"
      );
    }).join("") +
    "</div>" +
    '<label>Discipline: how well did you follow your rules?</label><div class="pips" id="j_c">' +
    [1, 2, 3, 4, 5]
      .map(function (i) {
        return (
          '<button type="button" class="' +
          (jc === i ? "on" : "") +
          "\" onclick=\"pick('c'," +
          i +
          ')">' +
          i +
          "</button>"
        );
      })
      .join("") +
    "</div>" +
    '<button class="pri" style="width:100%;margin-top:16px" onclick="saveDay()">Save journal</button></div>' +
    (past.length
      ? '<div class="card"><h3>Earlier days</h3>' +
        past
          .map(function (k) {
            var x = S.days[k];
            return (
              '<div class="item" onclick="jd=\'' +
              k +
              "';render()\"><div><b>" +
              nice(k) +
              '</b><div class="mut">' +
              esc((x.review || x.plan || "").slice(0, 60)) +
              "</div></div><span>" +
              (MOODS[(x.mood || 0) - 1] || "") +
              "</span></div>"
            );
          })
          .join("") +
        "</div>"
      : "")
  );
}
function pick(w, n) {
  if (w === "m") jm = n;
  else jc = n;
  var box = $(w === "m" ? "#j_m" : "#j_c").children;
  for (var i = 0; i < box.length; i++)
    box[i].className = i + 1 === n ? "on" : "";
}
function saveDay() {
  S.days[jd] = {
    plan: $("#j_p").value.trim(),
    review: $("#j_r").value.trim(),
    mood: jm,
    disc: jc,
  };
  if (save()) {
    toast("Journal saved");
  }
}

function daySummary(d) {
  var ts = S.trades.filter(function (t) {
      return t.date === d;
    }),
    x = S.days[d] || {};
  return { ts: ts, x: x, st: stats(ts) };
}
/* ====================================================================
 * 12. Backup, Data Export & Import Engine
 * ==================================================================== */
function share() {
  var d = window.sd || today(),
    x = daySummary(d);
  return (
    '<h2>Share &amp; backup</h2><div class="card"><label for="s_d" style="margin-top:0">Day to share</label><input id="s_d" type="date" value="' +
    d +
    '" onchange="window.sd=this.value;render()"><p class="mut">' +
    x.ts.length +
    " trade" +
    (x.ts.length === 1 ? "" : "s") +
    (x.ts.length ? " · " + fmt(x.st.pnl) + " P&amp;L" : "") +
    (x.x.review || x.x.plan ? " · journal written" : "") +
    "</p>" +
    '<div class="row" style="flex-direction:column"><button class="pri" onclick="shareCard()">Image card</button><button onclick="shareCodeUI()">Share code + QR</button><button onclick="shareFile()">Send as file</button></div><p class="mut">Nothing is uploaded. Your friend gets exactly what you send.</p></div>' +
    '<div class="card"><h3>Receive from a friend</h3><div class="row" style="margin-top:8px"><button onclick="pasteImp()">Paste code</button><button onclick="scanQR()">Scan QR</button><button onclick="$(\'#imp\').click()">Open file</button></div><input id="imp" type="file" accept=".json,application/json" hidden onchange="importFile(this)"></div>' +
    '<div class="card"><h3>Backup</h3><p class="mut">Your data lives in this browser only. Clearing site data erases it, so export now and then.</p><button onclick="exportAll()" style="width:100%">Export everything</button></div>'
  );
}
async function dl(name, data) {
  var blob =
    data instanceof Blob
      ? data
      : new Blob([data], { type: "application/json" });
  try {
    var file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  try {
    var u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(u);
    }, 4000);
    toast("Saved to your downloads");
  } catch (e) {
    toast("Couldn’t save that file.");
  }
}
function payload(d) {
  var s = daySummary(d),
    o = { v: 1, days: {}, trades: s.ts };
  if (S.days[d]) o.days[d] = S.days[d];
  return o;
}
function shareFile() {
  var d = window.sd || today();
  dl("lockin-" + d + ".json", JSON.stringify(payload(d)));
}
async function exportAll() {
  var o = JSON.parse(JSON.stringify(S));
  o.shots = {};
  try {
    for (var a = 0; a < S.trades.length; a++) {
      var t = S.trades[a],
        b = t.sh || [];
      for (var c = 0; c < b.length; c++) {
        var d = await shotGet(t.id + ":" + b[c]);
        if (d) o.shots[t.id + ":" + b[c]] = d;
      }
    }
  } catch (e) {}
  dl("lockin-backup-" + today() + ".json", JSON.stringify(o));
}
function importFile(el) {
  var f = el.files[0];
  if (!f) return;
  var r = new FileReader();
  r.onload = async function () {
    try {
      var o = JSON.parse(r.result);
      merge(o);
      var sh = o.shots || {};
      for (var key in sh) {
        try {
          await shotPut(key, sh[key]);
        } catch (e) {}
      }
      (o.trades || []).forEach(function (x) {
        var t = S.trades.filter(function (y) {
          return y.id === x.id;
        })[0];
        if (t)
          t.sh = SLOTS.map(function (s2) {
            return s2[0];
          }).filter(function (k) {
            return sh[x.id + ":" + k];
          });
      });
      save();
      toast("Imported");
      render();
    } catch (e) {
      toast("That file isn’t a LockIn export.");
    }
  };
  r.readAsText(f);
  el.value = "";
}
function merge(o) {
  if (!o || typeof o !== "object") throw 1;
  if (o.profile && !S.profile.name) S.profile = o.profile;
  (o.trades || []).forEach(function (t) {
    if (t && t.id && typeof t.pnl !== "undefined" && t.date) {
      S.trades = S.trades.filter(function (x) {
        return x.id !== t.id;
      });
      S.trades.push({
        id: String(t.id),
        date: String(t.date),
        inst: String(t.inst || ""),
        side: t.side === "Short" ? "Short" : "Long",
        pnl: +t.pnl || 0,
        r: t.r === "" || t.r == null ? "" : +t.r,
        setup: String(t.setup || ""),
        mistake: String(t.mistake || "None"),
        notes: String(t.notes || ""),
        ok: t.ok !== false,
        chk: Array.isArray(t.chk) ? t.chk : [],
        acc: String(t.acc || ""),
        grade: String(t.grade || ""),
        sh: [],
        size: nq(t.size),
        entry: nq(t.entry),
        sl: nq(t.sl),
        tp: nq(t.tp),
      });
    }
  });
  var dd = o.days || {};
  for (var k in dd) {
    var n = dd[k],
      m = S.days[k];
    n = {
      plan: String(n.plan || ""),
      review: String(n.review || ""),
      mood: +n.mood || 0,
      disc: +n.disc || 0,
    };
    if (!m) S.days[k] = n;
    else {
      if (n.plan)
        m.plan = (m.plan ? m.plan + "\n\n" : "") + "[Shared] " + n.plan;
      if (n.review)
        m.review = (m.review ? m.review + "\n\n" : "") + "[Shared] " + n.review;
    }
  }
  (o.accts || []).forEach(function (a) {
    if (
      a &&
      a.id &&
      a.firm &&
      !S.accts.some(function (x) {
        return x.id === a.id;
      })
    )
      S.accts.push({
        id: String(a.id),
        firm: String(a.firm),
        size: +a.size || 0,
        cost: +a.cost || 0,
        label: String(a.label || ""),
        date: String(a.date || today()),
        status: ST.indexOf(a.status) > -1 ? a.status : "Evaluation",
        hist: Array.isArray(a.hist) ? a.hist : [],
      });
  });
  (o.pays || []).forEach(function (p) {
    if (
      p &&
      p.id &&
      p.acc &&
      !S.pays.some(function (x) {
        return x.id === p.id;
      })
    )
      S.pays.push({
        id: String(p.id),
        acc: String(p.acc),
        date: String(p.date || today()),
        amt: +p.amt || 0,
        note: String(p.note || ""),
      });
  });
  save();
}
async function pack(o) {
  var s = new Blob([JSON.stringify(o)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw")),
    b = new Uint8Array(await new Response(s).arrayBuffer()),
    t = "";
  b.forEach(function (c) {
    t += String.fromCharCode(c);
  });
  return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function unpack(x) {
  x = x.replace(/-/g, "+").replace(/_/g, "/");
  var t = atob(x),
    b = Uint8Array.from(t, function (c) {
      return c.charCodeAt(0);
    }),
    s = new Blob([b])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
  return JSON.parse(await new Response(s).text());
}
function qrSvg(txt) {
  var q = qrcode(0, "L");
  q.addData(txt);
  q.make();
  var n = q.getModuleCount(),
    p = "";
  for (var r = 0; r < n; r++)
    for (var c = 0; c < n; c++)
      if (q.isDark(r, c)) p += "M" + (c + 3) + " " + (r + 3) + "h1v1h-1z";
  return (
    '<svg viewBox="0 0 ' +
    (n + 6) +
    " " +
    (n + 6) +
    '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="' +
    p +
    '" fill="#000"/></svg>'
  );
}
function cp2() {
  var a = $("#q_t");
  try {
    a.focus();
    a.select();
    a.setSelectionRange(0, 99999);
    document.execCommand("copy");
    toast("Copied");
  } catch (e) {
    toast("Press and hold the code to copy it.");
  }
}
function copyTxt(t) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(t).then(function () {
        toast("Copied");
      }, cp2);
      return;
    }
  } catch (e) {}
  cp2();
}
async function shareCodeUI() {
  var d = window.sd || today(),
    web = /^https?:/.test(location.protocol);
  try {
    if (typeof CompressionStream === "undefined") {
      toast("This browser can’t make codes. Use the image or file.");
      return;
    }
    var c = await pack(payload(d)),
      code = web ? location.href.split("#")[0] + "#d=" + c : "ASC1." + c,
      qr = "";
    try {
      if (code.length <= 2300) qr = '<div class="qr">' + qrSvg(code) + "</div>";
    } catch (e) {}
    var v = modal(
      '<h2>Share this day</h2><p class="mut">Send the code on WhatsApp or any chat. Your friend opens LockIn, goes to Me, and taps Paste code' +
        (qr
          ? web
            ? ", or scans the QR with their camera."
            : ", or taps Scan QR."
          : ".") +
        "</p>" +
        (qr ||
          '<p class="mut">This day is too long for a QR. Use the code or the file.</p>') +
        '<textarea id="q_t" readonly>' +
        esc(code) +
        '</textarea><div class="row" style="margin-top:12px"><button id="q_c">Copy code</button><button class="pri" id="q_s">Send</button></div>',
    );
    v.querySelector("#q_c").onclick = function () {
      copyTxt(code);
    };
    v.querySelector("#q_s").onclick = function () {
      if (navigator.share)
        navigator.share({ text: code }).catch(function () {});
      else copyTxt(code);
    };
  } catch (e) {
    toast("Couldn’t make the code.");
  }
}
function parseCode(t) {
  t = (t || "").trim();
  var i = t.indexOf("#d=");
  if (i > -1) return t.slice(i + 3).trim();
  i = t.indexOf("ASC1.");
  if (i > -1) return t.slice(i + 5).trim();
  return null;
}
async function importCode(t) {
  var c = parseCode(t);
  if (!c) {
    toast("That doesn’t look like an LockIn code.");
    return;
  }
  try {
    confirmImp(await unpack(c));
  } catch (e) {
    toast("That code couldn’t be read.");
  }
}
function pasteImp() {
  var v = modal(
    '<h2>Paste a code</h2><textarea id="pc" placeholder="ASC1.…"></textarea><button class="pri" id="pcb" style="width:100%;margin-top:12px">Read code</button>',
  );
  v.querySelector("#pcb").onclick = function () {
    var t = $("#pc").value;
    closeM();
    importCode(t);
  };
}
async function scanQR() {
  if (
    !("BarcodeDetector" in window) ||
    !navigator.mediaDevices ||
    !window.isSecureContext
  ) {
    toast(
      "Scanning needs the hosted version. Use Paste code, or scan with your camera app and copy the text.",
    );
    return;
  }
  try {
    var st = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      }),
      vd = document.createElement("video"),
      on = true;
    vd.srcObject = st;
    vd.setAttribute("playsinline", "");
    vd.style.cssText = "width:100%;border-radius:14px";
    await vd.play();
    var v = modal("<h2>Scan a QR</h2>"),
      det = new BarcodeDetector({ formats: ["qr_code"] });
    v.querySelector(".sheet").appendChild(vd);
    var stop = function () {
      on = false;
      st.getTracks().forEach(function (t) {
        t.stop();
      });
    };
    new MutationObserver(function (m, ob) {
      if (!document.body.contains(v)) {
        stop();
        ob.disconnect();
      }
    }).observe(document.body, { childList: true });
    (async function loop() {
      while (on) {
        try {
          var r = await det.detect(vd);
          if (r.length) {
            stop();
            closeM();
            importCode(r[0].rawValue);
            return;
          }
        } catch (e) {}
        await new Promise(function (r) {
          setTimeout(r, 250);
        });
      }
    })();
  } catch (e) {
    toast("Couldn’t open the camera. Use Paste code.");
  }
}
function wrap(c, t, x, y, w, lh, max) {
  var words = t.replace(/\s+/g, " ").split(" "),
    line = "",
    n = 0;
  for (var i = 0; i < words.length; i++) {
    var tt = line ? line + " " + words[i] : words[i];
    if (c.measureText(tt).width > w && line) {
      c.fillText(line, x, y);
      y += lh;
      n++;
      line = words[i];
      if (n >= max - 1) {
        c.fillText(line + "…", x, y);
        return y;
      }
    } else line = tt;
  }
  if (line) c.fillText(line, x, y);
  return y;
}
function rnd(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
async function cardFonts() {
  try {
    await Promise.all([
      document.fonts.load('800 80px "Sora"'),
      document.fonts.load('500 30px "Manrope"'),
      document.fonts.load('700 30px "JetBrains Mono"'),
    ]);
  } catch (e) {}
  try {
    await LGI.decode();
  } catch (e) {}
}
function usd(n, sg) {
  var a = Math.abs(+n || 0);
  return (
    (sg ? (n >= 0 ? "+" : "-") : "") +
    "$" +
    a.toLocaleString(undefined, { maximumFractionDigits: 2 })
  );
}
function instSub(n) {
  n = (n || "").toLowerCase();
  return /mnq/.test(n)
    ? "MICRO NASDAQ FUTURES"
    : /mes/.test(n)
      ? "MICRO S&P FUTURES"
      : /nq|nasdaq/.test(n)
        ? "NASDAQ FUTURES"
        : /\bes\b|s&p/.test(n)
          ? "S&P 500 FUTURES"
          : /gold|xau|gc/.test(n)
            ? "GOLD"
            : /btc/.test(n)
              ? "BITCOIN"
              : /eur|gbp|jpy|usd/.test(n)
                ? "FOREX"
                : "TRADING JOURNAL";
}
function mkCard(W, H, win) {
  var cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  var c = cv.getContext("2d"),
    F = '"Sora",sans-serif',
    B = '"Manrope",sans-serif',
    GC = win ? "#22C55E" : "#EF4444",
    GR = win ? "34,197,94" : "239,68,68";
  var bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, win ? "#0B2A22" : "#2A0E12");
  bg.addColorStop(0.55, "#0F1318");
  bg.addColorStop(1, "#0A0D11");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  function glow(x, y, r, rgb, a) {
    var q = c.createRadialGradient(x, y, 0, x, y, r);
    q.addColorStop(0, "rgba(" + rgb + "," + a + ")");
    q.addColorStop(1, "rgba(" + rgb + ",0)");
    c.fillStyle = q;
    c.fillRect(0, 0, W, H);
  }
  glow(120, 60, 720, GR, 0.28);
  glow(W, H, 640, "255,138,61", 0.2);
  var R = rnd(win ? 7 : 11);
  [
    ["rgba(40,52,50,.55)", 300, 70],
    ["rgba(16,22,22,.9)", 210, 55],
    ["#080B0D", 130, 40],
  ].forEach(function (L, li) {
    c.beginPath();
    c.moveTo(0, H);
    var p = 0;
    for (var x = 0; x <= W + 40; x += 36) {
      p = p * 0.6 + (R() - 0.5) * L[2] * 1.6;
      c.lineTo(x, H - L[1] + p + Math.sin(x / 170 + li) * L[2] * 0.45);
    }
    c.lineTo(W, H);
    c.closePath();
    c.fillStyle = L[0];
    c.fill();
  });
  function rr(x, y, w, h, r, f, k, lw) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    if (f) {
      c.fillStyle = f;
      c.fill();
    }
    if (k) {
      c.strokeStyle = k;
      c.lineWidth = lw || 2;
      c.stroke();
    }
  }
  function tx(t, x, y, f, col, al, ls) {
    c.font = f;
    c.fillStyle = col;
    c.textAlign = al || "left";
    c.letterSpacing = ls || "0px";
    c.fillText(t, x, y);
    c.textAlign = "left";
    c.letterSpacing = "0px";
  }
  function fit(t, w, f) {
    c.font = f;
    var o = t;
    while (c.measureText(t).width > w && t.length > 2) t = t.slice(0, -1);
    return t === o ? t : t + "…";
  }
  function grad(x0, x1, a, b) {
    var q = c.createLinearGradient(x0, 0, x1, 0);
    q.addColorStop(0, a);
    q.addColorStop(1, b);
    return q;
  }
  function wm(x, y, size) {
    c.font = "800 " + size + "px " + F;
    var a = c.measureText("Lock").width,
      b = c.measureText("In").width;
    c.textAlign = "left";
    c.fillStyle = "#F9FAFB";
    c.fillText("Lock", x, y);
    c.fillStyle = grad(x + a, x + a + b, "#FF8A3D", "#FF4D4D");
    c.fillText("In", x + a, y);
    return a + b;
  }
  function ic(t, x, y, s, col) {
    c.save();
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = 3.2;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    if (t === "target") {
      c.arc(x + s / 2, y + s / 2, s / 2 - 2, 0, 7);
      c.stroke();
      c.beginPath();
      c.arc(x + s / 2, y + s / 2, s / 4, 0, 7);
      c.stroke();
      c.beginPath();
      c.arc(x + s / 2, y + s / 2, 2.5, 0, 7);
      c.fill();
    } else if (t === "flag") {
      c.moveTo(x + 4, y + s);
      c.lineTo(x + 4, y + 2);
      c.lineTo(x + s - 2, y + 8);
      c.lineTo(x + 4, y + s * 0.55);
      c.stroke();
    } else if (t === "shield") {
      c.moveTo(x + s / 2, y + 1);
      c.lineTo(x + s - 3, y + 7);
      c.lineTo(x + s - 3, y + s * 0.5);
      c.quadraticCurveTo(x + s - 3, y + s * 0.85, x + s / 2, y + s);
      c.quadraticCurveTo(x + 3, y + s * 0.85, x + 3, y + s * 0.5);
      c.lineTo(x + 3, y + 7);
      c.closePath();
      c.stroke();
    } else if (t === "bars") {
      [
        [2, 0.55],
        [s * 0.4, 0.8],
        [s * 0.72, 1],
      ].forEach(function (b) {
        c.fillRect(x + b[0], y + s * (1 - b[1]), s * 0.2, s * b[1]);
      });
    } else if (t === "cal") {
      c.roundRect(x + 2, y + 5, s - 4, s - 7, 5);
      c.stroke();
      c.moveTo(x + 2, y + 14);
      c.lineTo(x + s - 2, y + 14);
      c.moveTo(x + 10, y + 1);
      c.lineTo(x + 10, y + 9);
      c.moveTo(x + s - 10, y + 1);
      c.lineTo(x + s - 10, y + 9);
      c.stroke();
    } else if (t === "note") {
      c.roundRect(x + 4, y + 1, s - 8, s - 2, 6);
      c.stroke();
      c.moveTo(x + 11, y + 12);
      c.lineTo(x + s - 11, y + 12);
      c.moveTo(x + 11, y + 20);
      c.lineTo(x + s - 11, y + 20);
      c.moveTo(x + 11, y + 28);
      c.lineTo(x + s * 0.55, y + 28);
      c.stroke();
    }
    c.restore();
  }
  function candles(x0, x1, yT, yB, up, seed) {
    var r = rnd(seed),
      n = 44,
      p = 0.5,
      o = [];
    for (var i = 0; i < n; i++) {
      var op = p;
      p += (up ? 0.014 : -0.014) + (r() - 0.5) * 0.075;
      p = Math.max(0.04, Math.min(0.96, p));
      var hi = Math.max(op, p) + r() * 0.03,
        lo = Math.min(op, p) - r() * 0.03;
      o.push([op, p, hi, lo]);
    }
    var mn = Math.min.apply(
        0,
        o.map(function (k) {
          return k[3];
        }),
      ),
      mx = Math.max.apply(
        0,
        o.map(function (k) {
          return k[2];
        }),
      ),
      Y = function (v) {
        return yB - ((v - mn) / (mx - mn)) * (yB - yT);
      },
      st = (x1 - x0) / n;
    o.forEach(function (k, i) {
      var x = x0 + i * st,
        a = 0.12 + 0.88 * Math.pow(i / n, 0.8),
        g = (i * 7) % 11 === 0,
        col = g ? "#8A8F98" : k[1] >= k[0] ? "#22C55E" : "#EF4444";
      c.globalAlpha = a;
      c.strokeStyle = col;
      c.fillStyle = col;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x + 5, Y(k[2]));
      c.lineTo(x + 5, Y(k[3]));
      c.stroke();
      c.fillRect(
        x,
        Math.min(Y(k[0]), Y(k[1])),
        10,
        Math.max(5, Math.abs(Y(k[0]) - Y(k[1]))),
      );
    });
    c.globalAlpha = 1;
  }
  rr(
    60,
    60,
    W - 120,
    H - 170,
    44,
    "rgba(13,17,21,.74)",
    "rgba(255,255,255,.1)",
  );
  c.save();
  c.beginPath();
  c.roundRect(60, 60, W - 120, H - 170, 44);
  c.clip();
  glow(W - 60, H - 110, 520, GR, 0.2);
  c.restore();
  return {
    cv: cv,
    c: c,
    rr: rr,
    tx: tx,
    fit: fit,
    grad: grad,
    wm: wm,
    ic: ic,
    candles: candles,
    F: F,
    B: B,
    GC: GC,
    GR: GR,
    glow: glow,
  };
}
async function tradeCard(id) {
  var t = S.trades.filter((x) => x.id === id)[0];
  if (!t) return;
  await cardFonts();
  var win = t.pnl >= 0,
    W = 1080,
    H = 1470,
    K = mkCard(W, H, win),
    c = K.c,
    rr = K.rr,
    tx = K.tx,
    F = K.F,
    B = K.B,
    GC = K.GC,
    GR = K.GR,
    MU = "#94A3B8",
    sh = t.side === "Short";
  K.wm(116, 152, 64);
  tx("TRADING JOURNAL", 118, 194, "600 20px " + B, MU, "left", "6px");
  tx(
    new Date(t.date + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    964,
    134,
    "500 26px " + B,
    MU,
    "right",
  );
  K.candles(300, 1000, 400, 820, win, t.id.length * 13 + 5);
  rr(116, 240, 120, 120, 30, "rgba(" + GR + ",.16)", "rgba(" + GR + ",.5)");
  c.font =
    '68px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  c.textAlign = "center";
  c.fillStyle = "#fff";
  c.fillText(sh ? "🐻" : "🐂", 176, 322);
  c.textAlign = "left";
  tx(
    K.fit(t.inst || "Trade", 420, "800 64px " + F),
    268,
    298,
    "800 64px " + F,
    "#F9FAFB",
  );
  tx(instSub(t.inst), 270, 342, "500 22px " + B, MU, "left", "6px");
  rr(734, 262, 230, 64, 32, "rgba(" + GR + ",.1)", "rgba(" + GR + ",.7)");
  tx(
    sh ? "↘  BEAR" : "↗  BULL",
    849,
    305,
    "800 26px " + B,
    GC,
    "center",
    "3px",
  );
  tx("P&L", 118, 440, "600 28px " + B, MU, "left", "4px");
  var pt = usd(t.pnl, 1),
    fs = 170;
  c.font = "800 " + fs + "px " + F;
  while (c.measureText(pt).width > 780 && fs > 70) {
    fs -= 6;
    c.font = "800 " + fs + "px " + F;
  }
  tx(
    pt,
    112,
    440 + fs * 0.8,
    "800 " + fs + "px " + F,
    K.grad(112, 700, win ? "#4ADE80" : "#FCA5A5", win ? "#14B8A6" : "#EF4444"),
  );
  if (t.r !== "" && t.r != null) {
    var rt = (t.r > 0 ? "+" : "") + (+t.r).toFixed(1) + "R";
    c.font = "800 30px " + B;
    var rw = c.measureText(rt).width + 56;
    rr(
      116,
      440 + fs * 0.8 + 34,
      rw,
      62,
      31,
      "rgba(" + GR + ",.1)",
      "rgba(" + GR + ",.7)",
    );
    tx(rt, 116 + rw / 2, 440 + fs * 0.8 + 76, "800 30px " + B, GC, "center");
  }
  rr(116, 850, 848, 170, 28, "rgba(255,255,255,.04)", "rgba(255,255,255,.1)");
  [
    ["target", "ENTRY PRICE", t.entry, "#F9FAFB"],
    ["flag", "TAKE PROFIT", t.tp, GC],
    ["shield", "STOP LOSS", t.sl, win ? "#F9FAFB" : "#F87171"],
    ["bars", "SIZE", t.size, "#F9FAFB"],
  ].forEach(function (f, i) {
    var x = 150 + i * 210;
    if (i) rr(x - 30, 880, 2, 110, 1, "rgba(255,255,255,.1)");
    K.ic(f[0], x, 886, 40, "#818CF8");
    tx(f[1], x, 962, "600 17px " + B, MU, "left", "3px");
    tx(
      f[2] === "" || f[2] == null
        ? "—"
        : (+f[2]).toLocaleString(undefined, { maximumFractionDigits: 5 }),
      x,
      1004,
      "700 36px " + F,
      f[2] === "" || f[2] == null ? MU : f[3],
    );
  });
  rr(116, 1050, 848, 170, 28, "rgba(255,255,255,.04)", "rgba(255,255,255,.1)");
  K.ic("note", 146, 1086, 44, "#818CF8");
  tx("NOTES", 216, 1096, "600 18px " + B, MU, "left", "4px");
  c.font = "500 27px " + B;
  c.fillStyle = "#E5E7EB";
  if (t.notes) wrap(c, t.notes, 216, 1138, 720, 38, 3);
  else {
    c.fillStyle = MU;
    c.fillText("No notes for this trade.", 216, 1138);
  }
  rr(116, 1244, 848, 2, 1, "rgba(255,255,255,.08)");
  var ww = K.wm(116, 1300, 46);
  tx(
    "|  LOG IT. LEARN IT. LEVEL UP.",
    116 + ww + 22,
    1296,
    "500 18px " + B,
    MU,
    "left",
    "4px",
  );
  tx(S.profile.name || "", 964, 1296, "700 24px " + B, MU, "right");
  K.cv.toBlob(function (b) {
    if (b) dl("lockin-trade-" + t.date + ".png", b);
    else toast("Couldn’t make the card.");
  }, "image/png");
}
async function shareCard() {
  var d = window.sd || today(),
    s = daySummary(d),
    n = s.ts.length,
    pn = s.st.pnl,
    win = !n || pn >= 0;
  await cardFonts();
  var show = Math.min(3, n),
    ty = 640,
    end = ty + (n ? show * 240 + (n > show ? 60 : 0) : 170),
    W = 1080,
    H = end + 400,
    K = mkCard(W, H, win),
    c = K.c,
    rr = K.rr,
    tx = K.tx,
    F = K.F,
    B = K.B,
    GC = K.GC,
    GR = K.GR,
    MU = "#94A3B8";
  K.wm(116, 152, 64);
  tx("TRADING JOURNAL", 118, 194, "600 20px " + B, MU, "left", "6px");
  var dtx = new Date(d + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  c.font = "500 28px " + B;
  K.ic("cal", 964 - c.measureText(dtx).width - 60, 106, 40, MU);
  tx(dtx, 964, 134, "500 28px " + B, "#E5E7EB", "right");
  tx("TRADING DAY", 964, 176, "500 18px " + B, MU, "right", "5px");
  tx("DAY P&L", 118, 330, "500 24px " + B, MU, "left", "7px");
  var pt = n ? usd(pn, 1) : "$0",
    fs = 150;
  c.font = "800 " + fs + "px " + F;
  while (c.measureText(pt).width > 500 && fs > 60) {
    fs -= 6;
    c.font = "800 " + fs + "px " + F;
  }
  tx(
    pt,
    112,
    330 + fs * 0.95,
    "800 " + fs + "px " + F,
    K.grad(112, 600, win ? "#4ADE80" : "#FCA5A5", win ? "#14B8A6" : "#EF4444"),
  );
  rr(640, 340, 2, 190, 1, "rgba(255,255,255,.1)");
  var cx = 816,
    cy = 430,
    wr = n ? s.st.wr / 100 : 0;
  c.lineWidth = 22;
  c.lineCap = "round";
  c.strokeStyle = "rgba(255,255,255,.08)";
  c.beginPath();
  c.arc(cx, cy, 98, 0, 7);
  c.stroke();
  if (wr > 0) {
    c.save();
    c.shadowColor = "rgba(" + GR + ",.6)";
    c.shadowBlur = 24;
    c.strokeStyle = K.grad(cx - 98, cx + 98, "#4ADE80", "#14B8A6");
    c.beginPath();
    c.arc(
      cx,
      cy,
      98,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(wr, 0.999),
    );
    c.stroke();
    c.restore();
  }
  c.lineCap = "butt";
  tx(
    Math.round(wr * 100) + "%",
    cx,
    cy + 14,
    "800 54px " + F,
    "#fff",
    "center",
  );
  tx("WIN RATE", cx, cy + 54, "600 17px " + B, MU, "center", "4px");
  tx(
    s.ts.filter(function (t) {
      return t.pnl > 0;
    }).length +
      " / " +
      n +
      " TRADES",
    cx,
    cy + 160,
    "500 18px " + B,
    MU,
    "center",
    "5px",
  );
  var y = ty;
  if (!n) {
    rr(100, y, 880, 140, 30, "rgba(255,255,255,.04)", "rgba(255,255,255,.1)");
    tx(
      "No trades logged this day",
      W / 2,
      y + 82,
      "600 30px " + B,
      MU,
      "center",
    );
    y += 170;
  }
  s.ts.slice(0, show).forEach(function (t) {
    var w = t.pnl >= 0,
      col = w ? "#22C55E" : "#EF4444",
      sh = t.side === "Short";
    rr(
      100,
      y,
      880,
      216,
      30,
      "rgba(255,255,255,.035)",
      w ? "rgba(34,197,94,.5)" : "rgba(239,68,68,.5)",
    );
    c.font =
      '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    c.fillStyle = "#fff";
    c.fillText(sh ? "🐻" : "🐂", 140, y + 96);
    var nm = K.fit(t.inst || "Trade", 350, "800 44px " + F);
    tx(nm, 250, y + 84, "800 44px " + F, "#F9FAFB");
    c.font = "800 44px " + F;
    var nw = c.measureText(nm).width;
    if (t.grade) {
      var gw = t.grade.length > 1 ? 78 : 64;
      rr(
        250 + nw + 18,
        y + 48,
        gw,
        44,
        22,
        "rgba(245,181,68,.12)",
        "rgba(245,181,68,.55)",
      );
      tx(
        t.grade,
        250 + nw + 18 + gw / 2,
        y + 79,
        "700 24px " + B,
        "#F5B544",
        "center",
      );
    }
    tx(usd(t.pnl, 1), 946, y + 84, "800 46px " + F, col, "right");
    if (t.r !== "" && t.r != null)
      tx(
        (t.r > 0 ? "+" : "") + t.r + "R",
        946,
        y + 126,
        "600 28px " + B,
        MU,
        "right",
      );
    [
      ["Size", t.size, "#F9FAFB"],
      ["Entry", t.entry, "#F9FAFB"],
      ["Take Profit", t.tp, "#22C55E"],
      ["Stop Loss", t.sl, "#F87171"],
    ].forEach(function (f, i) {
      var x = 140 + i * 212;
      if (i) rr(x - 24, y + 140, 2, 58, 1, "rgba(255,255,255,.1)");
      tx(f[0], x, y + 162, "500 22px " + B, MU);
      var e = f[1] === "" || f[1] == null;
      tx(
        e
          ? "—"
          : (+f[1]).toLocaleString(undefined, { maximumFractionDigits: 5 }),
        x,
        y + 198,
        "700 32px " + F,
        e ? MU : f[2],
      );
    });
    y += 240;
  });
  if (n > show) {
    tx(
      "+ " +
        (n - show) +
        " more trade" +
        (n - show > 1 ? "s" : "") +
        " that day",
      116,
      y + 22,
      "600 26px " + B,
      MU,
    );
    y += 60;
  }
  var okc = s.ts.filter(function (t) {
    return t.ok;
  }).length;
  [
    ["bars", "Total Trades", String(n)],
    ["target", "Average R", n ? s.st.r.toFixed(2) : "–"],
  ].forEach(function (f, i) {
    var x = 100 + i * 446;
    rr(
      x,
      y + 10,
      434,
      150,
      28,
      "rgba(255,255,255,.04)",
      "rgba(255,255,255,.1)",
    );
    rr(x + 30, y + 50, 76, 76, 20, "rgba(255,255,255,.07)");
    K.ic(f[0], x + 48, y + 68, 40, "#CBD5E1");
    tx(f[1], x + 134, y + 78, "500 24px " + B, MU);
    tx(f[2], x + 134, y + 130, "800 54px " + F, "#F9FAFB");
  });
  y = end + 200;
  var hl = c.createLinearGradient(116, 0, 964, 0);
  hl.addColorStop(0, "rgba(255,255,255,.06)");
  hl.addColorStop(1, "rgba(255,138,61,.55)");
  rr(116, y, 848, 2, 1, hl);
  var ww = K.wm(116, y + 64, 46);
  tx(
    "|  LOG IT. LEARN IT. LEVEL UP.",
    116 + ww + 22,
    y + 58,
    "500 18px " + B,
    MU,
    "left",
    "4px",
  );
  tx(S.profile.name || "", 964, y + 58, "700 26px " + B, MU, "right");
  K.cv.toBlob(function (b) {
    if (b) dl("lockin-day-" + d + ".png", b);
    else toast("Couldn’t make the card.");
  }, "image/png");
}
var PP = [
    "Nasdaq (NQ)",
    "Gold (XAUUSD)",
    "S&P (ES)",
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "BTCUSD",
    "Dow (YM)",
  ],
  PR = [
    "Higher-timeframe bias agrees",
    "Liquidity swept",
    "Clear entry trigger",
    "Stop-loss placed first",
    "Risk within my limit",
    "In my trading session",
    "At least 1:2 reward",
  ],
  pf = { p: [], r: [] };
function chipsH(k, pre) {
  return pre
    .concat(pf[k].filter((x) => pre.indexOf(x) < 0))
    .map(
      (x) =>
        '<button type="button" class="chip' +
        (pf[k].indexOf(x) > -1 ? " on" : "") +
        '" data-k="' +
        k +
        '" data-v="' +
        esc(x) +
        '" aria-pressed="' +
        (pf[k].indexOf(x) > -1) +
        '">' +
        esc(x) +
        "</button>",
    )
    .join("");
}
/* ====================================================================
 * 15. User Profile & Settings
 * ==================================================================== */
function profileForm(first) {
  var p = S.profile;
  pf.p = (p.pairs || []).slice();
  pf.r = (p.rules || []).slice();
  var v = modal(
    '<img src="' +
      LOGO +
      '" alt="" style="width:56px;height:56px"><h2>' +
      (first ? "Welcome to LockIn 👋" : "Your profile") +
      '</h2><p class="mut">' +
      (first
        ? "Set up once. Everything stays on this device."
        : "Stored on this device only.") +
      "</p>" +
      '<div class="row"><div><label for="p_n">Name</label><input id="p_n" value="' +
      esc(p.name || "") +
      '"></div><div style="flex:.5"><label for="p_a">Age</label><input id="p_a" type="number" inputmode="numeric" value="' +
      esc(p.age || "") +
      '"></div></div>' +
      '<label for="p_g">My goal</label><textarea id="p_g" placeholder="Funded account by March, 60% win rate…">' +
      esc(p.goal || "") +
      "</textarea>" +
      '<label>Favorite pairs</label><div class="chips" id="c_p">' +
      chipsH("p", PP) +
      '</div><div class="row addr"><input id="a_p" placeholder="Add your own"><button type="button" data-add="p">Add</button></div>' +
      '<label>My entry model (checked on every trade)</label><div class="chips" id="c_r">' +
      chipsH("r", PR) +
      '</div><div class="row addr"><input id="a_r" placeholder="Add your own rule"><button type="button" data-add="r">Add</button></div>' +
      '<button class="pri" id="p_s" style="width:100%;margin-top:18px">' +
      (first ? "Start my journey" : "Save profile") +
      "</button>",
  );
  v.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.k) {
      var a = pf[b.dataset.k],
        i = a.indexOf(b.dataset.v);
      if (i > -1) a.splice(i, 1);
      else a.push(b.dataset.v);
      b.classList.toggle("on");
      b.setAttribute("aria-pressed", i < 0);
    } else if (b.dataset.add) {
      var k = b.dataset.add,
        inp = v.querySelector("#a_" + k),
        t = inp.value.trim();
      if (t && pf[k].indexOf(t) < 0) {
        pf[k].push(t);
        inp.value = "";
        v.querySelector("#c_" + k).innerHTML = chipsH(k, k === "p" ? PP : PR);
      }
    }
  });
  v.querySelector("#p_s").onclick = function () {
    var n = $("#p_n").value.trim();
    if (!n) {
      toast("Add your name first.");
      return;
    }
    S.profile = Object.assign({}, p, {
      name: n,
      age: $("#p_a").value,
      goal: $("#p_g").value.trim(),
      pairs: pf.p.slice(),
      rules: pf.r.slice(),
    });
    if (save()) {
      closeM();
      toast("Profile saved");
      render();
    }
  };
}
function me() {
  var P = S.profile;
  return (
    '<h2>Me</h2><div class="card"><h3>' +
    esc(P.name || "Trader") +
    (P.age ? " · " + esc(P.age) : "") +
    "</h3>" +
    (P.goal ? '<p class="mut"><b>Goal:</b> ' + esc(P.goal) + "</p>" : "") +
    ((P.pairs || []).length
      ? '<div class="chips">' +
        P.pairs
          .map(
            (x) => '<span class="tag" style="margin:0">' + esc(x) + "</span>",
          )
          .join("") +
        "</div>"
      : "") +
    (function () {
      var isAuth =
        typeof LockinAuth !== "undefined" && LockinAuth.getCurrentUser();
      var u = isAuth ? LockinAuth.getCurrentUser() : null;
      if (u) {
        return (
          '<div style="margin:14px 0;padding:12px;background:rgba(20,184,166,.1);border:1px solid rgba(20,184,166,.3);border-radius:14px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<b>Cloud Sync Active ☁️</b><span class="badge b-fd">Connected</span></div>' +
          '<p class="mut" style="font-size:12.5px;margin:0 0 10px;">Signed in as <b>' +
          esc(u.email) +
          "</b>. Trades & screenshots sync across devices.</p>" +
          '<div style="display:flex;gap:8px;">' +
          '<button class="pri" style="flex:1;min-height:38px;padding:6px 12px;font-size:13px;" onclick="LockinSync.saveUserData(true)">Sync Now</button>' +
          '<button class="ghost" style="flex:1;min-height:38px;padding:6px 12px;font-size:13px;" onclick="LockinAuth.showConfigModal()">Cloud Keys</button>' +
          '<button class="ghost" style="min-height:38px;padding:6px 12px;font-size:13px;color:var(--dn);" onclick="LockinAuth.signOut()">Sign Out</button>' +
          "</div></div>"
        );
      } else {
        return (
          '<div style="margin:14px 0;padding:12px;background:var(--surf2);border:1px solid var(--line);border-radius:14px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<b>Cloud Account & Backup ☁️</b><span class="badge b-ps">Offline / Guest</span></div>' +
          '<p class="mut" style="font-size:12.5px;margin:0 0 10px;">Sign in to sync your trades across phone & PC with Firebase & Supabase.</p>' +
          '<div style="display:flex;gap:8px;">' +
          '<button class="pri" style="flex:1;min-height:38px;padding:6px 12px;font-size:13px;" onclick="LockinAuth.showAuthModal()">Sign In / Register</button>' +
          '<button class="ghost" style="flex:1;min-height:38px;padding:6px 12px;font-size:13px;" onclick="LockinAuth.showConfigModal()">Cloud Setup</button>' +
          "</div></div>"
        );
      }
    })() +
    '<button onclick="profileForm()">' +
    (P.name ? "Edit profile" : "Set up profile") +
    "</button></div>" +
    share()
  );
}

var INS = [
    [
      "NQ · Nasdaq futures",
      20,
      1,
      "contracts",
      0,
      1,
      [10, 15, 20, 25, 30, 40, 50],
    ],
    [
      "MNQ · Micro Nasdaq",
      2,
      1,
      "contracts",
      0,
      0,
      [10, 15, 20, 25, 30, 40, 50],
    ],
    ["ES · S&P futures", 50, 1, "contracts", 0, 3, [2, 3, 4, 5, 8, 10]],
    ["MES · Micro S&P", 5, 1, "contracts", 0, 2, [2, 3, 4, 5, 8, 10]],
    ["XAUUSD · Gold", 100, 0.01, "lots", 0, null, [2, 3, 5, 8, 10, 15]],
    ["EURUSD", 100000, 0.01, "lots", 0.0001, null, [10, 15, 20, 30, 50]],
    ["GBPUSD", 100000, 0.01, "lots", 0.0001, null, [10, 15, 20, 30, 50]],
    ["USDJPY", "jpy", 0.01, "lots", 0.01, null, [10, 15, 20, 30, 50]],
    ["BTCUSD", 1, 0.001, "BTC", 0, null, [100, 200, 300, 500, 1000]],
    ["Custom", 0, 0.01, "units", 0, null, [5, 10, 20, 50]],
  ],
  ACC = [25000, 50000, 100000, 150000],
  RISKC = {
    25000: [50, 100, 250],
    50000: [100, 250, 500],
    100000: [250, 500, 1000],
    150000: [375, 750, 1500],
  },
  kv = { i: 1, acct: "", a: "", e: "", dir: "Long", t: "2", cs: "", c: "1" };
/* ====================================================================
 * 16. Position Sizing & Risk Management Calculator
 * ==================================================================== */
function riskTab() {
  var P = S.profile,
    cu = kv.i === INS.length - 1;
  kv.acct = kv.acct || P.acct || "";
  kv.a = kv.a || P.riskUsd || "";
  return (
    '<h2>Risk calculator</h2><div class="card"><label for="k_i" style="margin-top:0">Instrument</label><select id="k_i" onchange="calc()">' +
    INS.map(
      (x, i) =>
        '<option value="' +
        i +
        '"' +
        (i === kv.i ? " selected" : "") +
        ">" +
        x[0] +
        "</option>",
    ).join("") +
    "</select>" +
    '<div id="k_cw" ' +
    (cu ? "" : "hidden") +
    '><label for="k_c">$ per 1.0 price move, per 1 unit</label><input id="k_c" type="number" step="any" inputmode="decimal" value="' +
    esc(kv.c) +
    '" oninput="calc()"></div>' +
    '<label for="k_ac">Account size ($)</label><div class="chips" id="k_ach">' +
    ACC.map(
      (x) =>
        '<button type="button" class="chip" data-v="' +
        x +
        "\" onclick=\"$('#k_ac').value=" +
        x +
        ";$('#k_a').value='';calc()\">" +
        x / 1000 +
        "K</button>",
    ).join("") +
    '</div><input id="k_ac" type="number" inputmode="decimal" style="margin-top:8px" value="' +
    esc(kv.acct) +
    '" placeholder="or type your own" oninput="calc()">' +
    '<label for="k_a">How much will you risk? ($)</label><input id="k_a" type="number" inputmode="decimal" value="' +
    esc(kv.a) +
    '" placeholder="e.g. 250" oninput="calc()"><div class="chips" id="k_rc" style="margin-top:8px"></div><p class="mut" id="k_ai" style="margin:8px 0 0"></p>' +
    '<div class="pips seg"><button type="button" class="' +
    (kv.dir === "Long" ? "on" : "") +
    '" onclick="kv.dir=\'Long\';render()">Long</button><button type="button" class="' +
    (kv.dir === "Short" ? "on" : "") +
    '" onclick="kv.dir=\'Short\';render()">Short</button></div>' +
    '<label for="k_e">Entry price</label><input id="k_e" type="number" step="any" inputmode="decimal" value="' +
    esc(kv.e) +
    '" oninput="calc()">' +
    '<label for="k_t">Reward : risk</label><div class="chips"><button type="button" class="chip" onclick="$(\'#k_t\').value=1;calc()">1 : 1</button><button type="button" class="chip" onclick="$(\'#k_t\').value=2;calc()">1 : 2</button><button type="button" class="chip" onclick="$(\'#k_t\').value=3;calc()">1 : 3</button></div><input id="k_t" type="number" step="any" inputmode="decimal" style="margin-top:8px" value="' +
    esc(kv.t) +
    '" oninput="calc()">' +
    '<label for="k_cs">Your own stop (optional, points or pips)</label><input id="k_cs" type="number" step="any" inputmode="decimal" value="' +
    esc(kv.cs) +
    '" oninput="calc()"></div>' +
    '<div id="k_o"></div><p class="mut">NQ $20/pt · MNQ $2/pt · ES $50/pt · MES $5/pt · Gold 1 lot = 100 oz ($100 per $1) · Forex 1 lot = 100k. USD account assumed. Check your broker’s specs.</p>'
  );
}
function calc() {
  kv.i = +$("#k_i").value;
  kv.acct = $("#k_ac").value;
  kv.a = $("#k_a").value;
  kv.e = $("#k_e").value;
  kv.t = $("#k_t").value;
  kv.cs = $("#k_cs").value;
  kv.c = $("#k_c").value;
  S.profile.acct = kv.acct;
  S.profile.riskUsd = kv.a;
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (x) {}
  var I = INS[kv.i],
    cu = kv.i === INS.length - 1,
    ac = +kv.acct,
    ra = +kv.a,
    e = +kv.e,
    rr = +kv.t || 0,
    o = $("#k_o"),
    m = (x) => x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  $("#k_cw").hidden = !cu;
  document
    .querySelectorAll("#k_ach .chip")
    .forEach((b) => b.classList.toggle("on", +b.dataset.v === ac));
  $("#k_rc").innerHTML = (RISKC[ac] || [100, 250, 500])
    .map(
      (x) =>
        '<button type="button" class="chip' +
        (ra === x ? " on" : "") +
        "\" onclick=\"$('#k_a').value=" +
        x +
        ';calc()">$' +
        x +
        "</button>",
    )
    .join("");
  $("#k_ai").textContent =
    ac > 0 && ra > 0
      ? "$" +
        m(ra) +
        " is " +
        m((ra / ac) * 100) +
        "% of your $" +
        m(ac) +
        " account."
      : "";
  var pp = I[1] === "jpy" ? 100000 / (e || 150) : cu ? +kv.c : I[1];
  if (!(ra > 0 && e > 0 && pp > 0)) {
    o.innerHTML =
      '<div class="card"><p class="mut" style="margin:0">Pick your risk in $ and enter your entry price. Your stop, target, size, win and loss show up here.</p></div>';
    return;
  }
  var long = kv.dir === "Long",
    my = +kv.cs > 0,
    stops = (my ? [+kv.cs] : []).concat(I[6].filter((x) => x !== +kv.cs)),
    dc = I[2] < 0.01 ? 3 : I[2] < 1 ? 2 : 0,
    u = I[3].replace(/s$/, ""),
    pr = I[4] ? 5 : 2,
    rows = stops.map((sv, k) => {
      var d = I[4] ? sv * I[4] : sv,
        per = d * pp,
        n = +(Math.floor(ra / per / I[2] + 1e-9) * I[2]).toFixed(dc),
        loss = n * per,
        sl = e + (long ? -d : d),
        tp = e + (long ? d : -d) * rr;
      return (
        '<div class="opt' +
        (my && k === 0 ? " mine" : "") +
        (n ? "" : " off") +
        '"><div class="oh"><b>' +
        (my && k === 0 ? "Your stop · " : "") +
        m(sv) +
        (I[4] ? " pips" : " pts") +
        '</b><span class="big2">' +
        n +
        " " +
        I[3] +
        "</span></div>" +
        (n
          ? '<div class="o2"><span>Stop-loss</span><b>' +
            sl.toFixed(pr) +
            "</b></div>" +
            (rr > 0
              ? '<div class="o2"><span>Take-profit (' +
                rr +
                "R)</span><b>" +
                tp.toFixed(pr) +
                "</b></div>"
              : "") +
            '<div class="o2"><span>If stopped out</span><b class="dn">−$' +
            m(loss) +
            "</b></div>" +
            (rr > 0
              ? '<div class="o2"><span>If target hits</span><b class="up">+$' +
                m(loss * rr) +
                "</b></div>"
              : "")
          : '<p class="mut" style="margin:6px 0 0">1 ' +
            u +
            " would risk $" +
            m(per * I[2]) +
            ", more than your $" +
            m(ra) +
            ". Use a tighter stop or raise your risk.</p>") +
        "</div>"
      );
    });
  o.innerHTML =
    '<div class="mut" style="margin:0 0 10px">' +
    (long ? "Long" : "Short") +
    " from " +
    e +
    " · risking $" +
    m(ra) +
    ". Pick the stop size that fits your setup.</div>" +
    rows.join("");
}

var ST = ["Evaluation", "Passed", "Funded", "Blown"],
  SC = { Evaluation: "ev", Passed: "ps", Funded: "fd", Blown: "bl" },
  PFN = [
    "FTMO",
    "Topstep",
    "Apex",
    "MyFundedFX",
    "The5ers",
    "FundedNext",
    "E8",
    "Alpha Futures",
    "Take Profit Trader",
    "Tradeify",
  ];
function money(x) {
  return (
    "$" + (+x || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );
}
function pstat(l, v, c, i) {
  return (
    '<div class="stat" style="--i:' +
    i +
    '"><span>' +
    l +
    '</span><b class="' +
    c +
    '" data-n="' +
    v +
    '" data-d="0" data-s="0" data-p="$">0</b></div>'
  );
}
function netH(n) {
  return (n < 0 ? "−" : "+") + money(Math.abs(n));
}
var FUT = [
    "Lucid Trading",
    "Tradeify",
    "FundedNext Futures",
    "My Funded Futures",
    "Top One Futures",
    "Apex Trader Funding",
    "Topstep",
    "Traders Launch",
    "Funded Futures Family",
    "FuturesElite",
    "Blue Guardian Futures",
    "E8 Futures",
    "TradeDay",
    "Take Profit Trader",
    "Goat Funded Futures",
  ],
  FXF = [
    "FundedNext",
    "The5ers",
    "BrightFunded",
    "Crypto Fund Trader",
    "E8 Markets",
    "Alpha Capital",
    "FundingPips",
    "AquaFunded",
    "Hola Prime",
    "Blue Guardian",
    "Moneta Funded",
    "Top One Trader",
    "Atmos Funded",
    "FundedElite",
    "FTMO",
  ],
  SZ = [
    5000, 10000, 15000, 25000, 50000, 75000, 100000, 150000, 200000, 250000,
    300000,
  ],
  pq = { m: "Futures", t: "One Step", sp: 80 },
  pflt = "All",
  FG = [
    "#FF8A3D,#FF3D81",
    "#5B8CFF,#9B5CFF",
    "#10C48A,#3A8CFF",
    "#FF3D81,#8B5CFF",
    "#FFB020,#FF6A3D",
    "#2EC4B6,#3A6BFF",
  ];
function fav(n) {
  var h = 0;
  for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return (
    '<div class="fa" style="background:linear-gradient(135deg,' +
    FG[h % FG.length] +
    ')">' +
    esc(n.trim().charAt(0).toUpperCase()) +
    "</div>"
  );
}
function ptile(l, v, d, sg, c, x, i, ic, p) {
  return (
    '<div class="stat" style="--i:' +
    i +
    '"><span>' +
    l +
    '</span><em class="ic2">' +
    ic +
    '</em><b class="' +
    (c || "") +
    '" data-n="' +
    v +
    '" data-d="' +
    d +
    '" data-s="' +
    sg +
    '" data-x="' +
    (x || "") +
    '" data-p="' +
    (p || "") +
    '">0</b></div>'
  );
}
/* ====================================================================
 * 17. Prop Firm Accounts & Payout Tracker
 * ==================================================================== */
function propTab() {
  var A = S.accts,
    Y = S.pays,
    spent = A.reduce((x, a) => x + (+a.cost || 0), 0),
    paid = Y.reduce((x, p) => x + (+p.amt || 0), 0),
    elig = A.filter((a) => a.type !== "Instant"),
    ever = elig.filter((a) =>
      a.hist.some((h) => h.s === "Passed" || h.s === "Funded"),
    ).length,
    fd = A.filter((a) => a.status === "Funded").length,
    bl = A.filter((a) => a.status === "Blown").length,
    net = paid - spent,
    list = A.filter((a) => pflt === "All" || a.status === pflt)
      .slice()
      .reverse(),
    ev = [];
  A.forEach((a) =>
    a.hist.forEach((h, k) => {
      var pu = k === 0;
      ev.push({
        d: h.d,
        t: pu ? "Account purchased" : "Marked " + h.s,
        s: esc(a.firm) + " · " + money(a.size),
        amt: pu ? -a.cost : null,
        ic: pu
          ? "🛒"
          : h.s === "Funded"
            ? "🏆"
            : h.s === "Passed"
              ? "✅"
              : h.s === "Blown"
                ? "💥"
                : "🔄",
      });
    }),
  );
  Y.forEach((p) => {
    var a = A.filter((x) => x.id === p.acc)[0];
    ev.push({
      d: p.date,
      t: "Payout received",
      s: a ? esc(a.firm) + " · " + money(a.size) : "",
      amt: p.amt,
      ic: "💸",
    });
  });
  ev.sort((x, y) => (x.d < y.d ? 1 : x.d > y.d ? -1 : 0));
  return (
    '<div class="gh"><div><h1 style="font-size:32px">Prop firms</h1><p class="mut" style="margin:4px 0 0">Track your prop firm journey.</p></div></div><div class="row" style="margin-bottom:14px"><button class="pri" onclick="acctForm()">＋ Log purchase</button><button onclick="payForm()">Log payout</button></div>' +
    '<div class="grid3">' +
    ptile("Spent", spent, 0, 0, "dn", "", 0, "💳", "$") +
    ptile("Payouts", paid, 0, 0, "up", "", 1, "📈", "$") +
    ptile("Net", net, 0, 1, net >= 0 ? "up" : "dn", "", 2, "📊", "$") +
    ptile(
      "Pass rate",
      elig.length ? (ever / elig.length) * 100 : 0,
      0,
      0,
      "",
      "%",
      3,
      "🎯",
    ) +
    ptile("Funded now", fd, 0, 0, "up", "", 4, "🏆") +
    ptile("Blown", bl, 0, 0, bl ? "dn" : "", "", 5, "✕") +
    "</div>" +
    '<div class="pills">' +
    [
      ["All", "All accounts"],
      ["Evaluation", "Evaluation"],
      ["Passed", "Passed"],
      ["Funded", "Funded"],
      ["Blown", "Blown"],
    ]
      .map(
        (f) =>
          '<button class="' +
          (pflt === f[0] ? "on" : "") +
          '" onclick="pflt=\'' +
          f[0] +
          "';render()\">" +
          f[1] +
          "</button>",
      )
      .join("") +
    "</div>" +
    (list.length
      ? '<div class="accs">' +
        list
          .map((a) => {
            var pt = Y.filter((p) => p.acc === a.id).reduce(
                (x, p) => x + (+p.amt || 0),
                0,
              ),
              n = pt - (+a.cost || 0),
              pc =
                a.status === "Evaluation"
                  ? 35
                  : a.status === "Passed"
                    ? 72
                    : 100,
              bad = a.status === "Blown",
              lb =
                a.type === "Instant"
                  ? "Instant funding"
                  : a.status === "Evaluation"
                    ? "In evaluation"
                    : a.status;
            return (
              '<div class="card" onclick="acctView(\'' +
              a.id +
              '\')"><div class="row" style="flex-wrap:nowrap;align-items:center">' +
              fav(a.firm) +
              '<div style="flex:1;min-width:0"><b style="font-size:17px">' +
              esc(a.firm) +
              '</b><div class="mut">' +
              money(a.size) +
              (a.market ? " · " + a.market : "") +
              (a.type ? " · " + a.type : "") +
              (a.label ? " · " + esc(a.label) : "") +
              '</div></div><span class="badge b-' +
              SC[a.status] +
              '">' +
              a.status +
              '</span></div><div class="pb"><u style="width:' +
              pc +
              "%;background:" +
              (bad
                ? "linear-gradient(90deg,#EF4444,#FF8A3D)"
                : a.status === "Funded"
                  ? "linear-gradient(90deg,#10C48A,#22C55E)"
                  : "linear-gradient(90deg,#5B8CFF,#9B5CFF)") +
              '"></u></div><div class="mut" style="text-align:right;font-size:12px">' +
              lb +
              "</div>" +
              '<div class="meta"><div><span>Purchased</span><b>' +
              sdt(a.date) +
              '</b> <span style="display:inline">' +
              money(a.cost) +
              "</span></div><div><span>Payouts</span><b>" +
              money(pt) +
              '</b></div><div><span>Net</span><b class="' +
              (n >= 0 ? "up" : "dn") +
              '">' +
              netH(n) +
              "</b></div></div>" +
              accLine(a) +
              "</div>"
            );
          })
          .join("") +
        "</div>"
      : '<div class="card empty">' +
        (A.length
          ? "No accounts with this status."
          : "No prop accounts yet. Log your first purchase and track it from evaluation to payout.") +
        "</div>") +
    (ev.length
      ? '<div class="card"><h3>Recent activity</h3>' +
        ev
          .slice(0, 6)
          .map(
            (e) =>
              '<div class="act"><div class="ic">' +
              e.ic +
              "</div><div><b>" +
              e.t +
              '</b><div class="mut">' +
              e.s +
              '</div></div><div style="text-align:right"><div class="mut">' +
              sdt(e.d) +
              "</div>" +
              (e.amt != null
                ? '<b style="font-family:var(--f3)" class="' +
                  (e.amt >= 0 ? "up" : "dn") +
                  '">' +
                  (e.amt >= 0 ? "+" : "−") +
                  money(Math.abs(e.amt)) +
                  "</b>"
                : "") +
              "</div></div>",
          )
          .join("") +
        "</div>"
      : "")
  );
}
function acctForm() {
  pq = { m: "Futures", t: "One Step", sp: 80 };
  var v = modal(
    '<div class="row" style="align-items:center;flex-wrap:nowrap;margin-bottom:8px"><button class="bk" id="a_b" aria-label="Back" style="flex:none">←</button><h2 style="margin:0;flex:1">Log purchase</h2></div><div id="a_top"></div><label for="a_z">Account size</label><select id="a_z">' +
      SZ.map(
        (x) =>
          '<option value="' +
          x +
          '"' +
          (x === 25000 ? " selected" : "") +
          ">$" +
          x.toLocaleString() +
          "</option>",
      ).join("") +
      '<option value="c">Custom…</option></select><input id="a_zc" type="number" inputmode="decimal" placeholder="Account size ($)" hidden style="margin-top:8px"><label for="a_c">Price paid (USD)</label><input id="a_c" type="number" inputmode="decimal"><label>Profit split</label><div class="sg sp" id="a_sp"></div><label for="a_d">Start date</label><input id="a_d" type="date" value="' +
      today() +
      '"><label for="a_n">Notes (optional)</label><textarea id="a_n" placeholder="Add any notes…"></textarea><button class="pri" id="a_x" style="width:100%;margin-top:18px">Save purchase</button>',
  );
  function draw() {
    var fl = pq.m === "Futures" ? FUT : FXF,
      ts =
        pq.m === "Futures"
          ? ["Instant", "One Step"]
          : ["Instant", "One Step", "Two Step"],
      cf = v.querySelector("#a_f"),
      keep = cf ? cf.value : "";
    if (ts.indexOf(pq.t) < 0) pq.t = ts[ts.length - 1];
    v.querySelector("#a_top").innerHTML =
      '<label for="a_f">Prop firm</label><select id="a_f">' +
      fl.map((x) => "<option>" + x + "</option>").join("") +
      '</select><input id="a_fo" placeholder="Firm name" hidden style="margin-top:8px"><label>Market type</label><div class="sg">' +
      ["Futures", "Forex"]
        .map(
          (x) =>
            '<button type="button" class="' +
            (pq.m === x ? "on" : "") +
            '" data-m="' +
            x +
            '">' +
            x +
            "</button>",
        )
        .join("") +
      "</div>" +
      (pq.m === "Futures"
        ? '<div class="note">ⓘ Futures prop firms only have Instant or One Step accounts.</div>'
        : "") +
      '<label>Account type</label><div class="sg">' +
      ts
        .map(
          (x) =>
            '<button type="button" class="' +
            (pq.t === x ? "on" : "") +
            '" data-t="' +
            x +
            '">' +
            x +
            "</button>",
        )
        .join("") +
      "</div>";
    var f = v.querySelector("#a_f");
    if (keep && fl.indexOf(keep) > -1) f.value = keep;
    v.querySelector("#a_fo").hidden = f.value !== "Other";
    v.querySelector("#a_sp").innerHTML = [70, 80, 90, 100]
      .map(
        (x) =>
          '<button type="button" class="' +
          (pq.sp === x ? "on" : "") +
          '" data-sp="' +
          x +
          '">' +
          x +
          "%</button>",
      )
      .join("");
  }
  draw();
  v.querySelector("#a_b").onclick = closeM;
  v.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.m) {
      pq.m = b.dataset.m;
      draw();
    } else if (b.dataset.t) {
      pq.t = b.dataset.t;
      draw();
    } else if (b.dataset.sp) {
      pq.sp = +b.dataset.sp;
      draw();
    }
  });
  v.addEventListener("change", function (e) {
    if (e.target.id === "a_f")
      v.querySelector("#a_fo").hidden = e.target.value !== "Other";
    if (e.target.id === "a_z")
      v.querySelector("#a_zc").hidden = e.target.value !== "c";
  });
  v.querySelector("#a_x").onclick = function () {
    var f = v.querySelector("#a_f").value;
    if (f === "Other") f = v.querySelector("#a_fo").value.trim();
    var zs = v.querySelector("#a_z").value,
      sz = zs === "c" ? parseFloat(v.querySelector("#a_zc").value) : +zs,
      c = parseFloat(v.querySelector("#a_c").value);
    if (!f || !(sz > 0) || isNaN(c)) {
      toast("Add the firm, account size and price paid.");
      return;
    }
    var d = v.querySelector("#a_d").value || today(),
      inst = pq.t === "Instant",
      st = inst ? "Funded" : "Evaluation";
    S.accts.push({
      id: uid(),
      firm: f,
      size: sz,
      cost: c,
      market: pq.m,
      type: pq.t,
      split: pq.sp,
      notes: v.querySelector("#a_n").value.trim(),
      label: "",
      date: d,
      status: st,
      hist: [{ d: d, s: st, n: "Purchased" }],
    });
    if (save()) {
      closeM();
      toast("Account added");
      render();
    }
  };
}
function acctView(id) {
  var a = S.accts.filter((x) => x.id === id)[0];
  if (!a) return;
  var py = S.pays.filter((p) => p.acc === id),
    pt = py.reduce((x, p) => x + (+p.amt || 0), 0),
    n = pt - (+a.cost || 0),
    ev = a.hist
      .map((h) => ({ d: h.d, t: h.s + (h.n ? " · " + h.n : "") }))
      .concat(
        py.map((p) => ({
          d: p.date,
          t: "Payout " + money(p.amt) + (p.note ? " · " + p.note : ""),
          p: 1,
        })),
      )
      .sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  var v = modal(
    "<h2>" +
      esc(a.firm) +
      ' <span class="badge b-' +
      SC[a.status] +
      '">' +
      a.status +
      '</span></h2><p class="mut">' +
      money(a.size) +
      (a.label ? " · " + esc(a.label) : "") +
      " · paid " +
      money(a.cost) +
      " · payouts " +
      money(pt) +
      ' · net <b class="' +
      (n >= 0 ? "up" : "dn") +
      '">' +
      netH(n) +
      "</b></p>" +
      jrn(a) +
      '<h3>History</h3><div class="tl">' +
      ev
        .map(
          (e) =>
            "<div><b>" +
            nice(e.d) +
            '</b><div class="mut">' +
            (e.p ? "💸 " : "") +
            esc(e.t) +
            "</div></div>",
        )
        .join("") +
      "</div>" +
      '<h3 style="margin-top:16px">Update status</h3><div class="row"><div><label for="u_s">New status</label><select id="u_s">' +
      ST.map(
        (x) =>
          "<option" +
          (x === a.status ? " selected" : "") +
          ">" +
          x +
          "</option>",
      ).join("") +
      '</select></div><div><label for="u_d">Date</label><input id="u_d" type="date" value="' +
      today() +
      '"></div></div><label for="u_n">Note (optional)</label><input id="u_n"><div class="row" style="margin-top:14px"><button class="pri" id="u_b">Update status</button><button id="u_p">Log payout</button></div><button class="ghost dn" id="u_x" style="width:100%;margin-top:12px">Delete account</button>',
  );
  v.querySelector("#u_b").onclick = function () {
    var ns = $("#u_s").value;
    if (ns === a.status) {
      toast("Pick a different status.");
      return;
    }
    a.status = ns;
    a.hist.push({
      d: $("#u_d").value || today(),
      s: ns,
      n: $("#u_n").value.trim(),
    });
    if (save()) {
      closeM();
      toast("Status updated to " + ns);
      if (ns === "Passed" || ns === "Funded") confetti();
      render();
    }
  };
  v.querySelector("#u_p").onclick = function () {
    closeM();
    payForm(id);
  };
  v.querySelector("#u_x").onclick = function () {
    if (confirm("Delete this account and its payouts?")) {
      S.accts = S.accts.filter((x) => x.id !== id);
      S.pays = S.pays.filter((p) => p.acc !== id);
      S.trades.forEach(function (t) {
        if (t.acc === id) t.acc = "";
      });
      save();
      closeM();
      render();
    }
  };
}
function payForm(pre) {
  var el = S.accts.filter(
    (a) => a.status === "Passed" || a.status === "Funded",
  );
  if (!el.length) {
    toast(
      "Payouts can be logged on Passed or Funded accounts. Update an account’s status first.",
    );
    return;
  }
  var v = modal(
    '<h2>Log a payout</h2><label for="y_a">Account</label><select id="y_a">' +
      el
        .map(
          (a) =>
            '<option value="' +
            a.id +
            '"' +
            (a.id === pre ? " selected" : "") +
            ">" +
            esc(a.firm) +
            " · " +
            money(a.size) +
            " · " +
            a.status +
            "</option>",
        )
        .join("") +
      '</select><div class="row"><div><label for="y_m">Payout ($)</label><input id="y_m" type="number" inputmode="decimal"></div><div><label for="y_d">Date</label><input id="y_d" type="date" value="' +
      today() +
      '"></div></div><label for="y_n">Note (optional)</label><input id="y_n" placeholder="First payout, 80% split…"><button class="pri" id="y_b" style="width:100%;margin-top:16px">Save payout</button>',
  );
  v.querySelector("#y_b").onclick = function () {
    var q = parseFloat($("#y_m").value);
    if (!(q > 0)) {
      toast("Enter the payout amount.");
      return;
    }
    S.pays.push({
      id: uid(),
      acc: $("#y_a").value,
      date: $("#y_d").value || today(),
      amt: q,
      note: $("#y_n").value.trim(),
    });
    if (save()) {
      closeM();
      toast("Payout logged 💸");
      confetti();
      render();
    }
  };
}

function countUp() {
  var RM = matchMedia("(prefers-reduced-motion:reduce)").matches;
  document.querySelectorAll("[data-n]").forEach((el) => {
    var v = +el.dataset.n,
      d = +el.dataset.d || 0,
      sg = el.dataset.s === "1",
      x = el.dataset.x || "",
      p = el.dataset.p || "",
      t0 = performance.now();
    function f(now) {
      var k = RM ? 1 : Math.min(1, (now - t0) / 900),
        c = v * (1 - Math.pow(1 - k, 3));
      el.textContent =
        (c < 0 ? "−" : sg && c > 0 ? "+" : "") +
        p +
        Math.abs(c).toLocaleString(undefined, {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }) +
        x;
      if (k < 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  });
}
function go(t) {
  tab = t;
  render();
  scrollTo(0, 0);
}
/* ====================================================================
 * 18. App Router & Navigation Controller
 * ==================================================================== */
function render() {
  var hh = {
    home: home,
    trades: trades,
    cal: cal,
    journal: journal,
    prop: propTab,
    risk: riskTab,
    me: me,
  }[tab]();
  $("#app").innerHTML =
    tab === "home" || tab === "prop" ? hh : '<div class="pg">' + hh + "</div>";
  var IC = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    trades: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    journal: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    prop: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    risk: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  };
  $("#nav").innerHTML = [
    ["home", "Home", "Dashboard"],
    ["trades", "Trades", "Trades"],
    ["cal", "Calendar", "Calendar"],
    ["journal", "Journal", "Journal"],
    ["prop", "Prop", "Prop Firms"],
    ["risk", "Risk", "Risk Calculator"],
    ["me", "Me", "Settings"],
  ]
    .map(
      (n) =>
        '<button class="' +
        (tab === n[0] ? "on" : "") +
        '" onclick="go(\'' +
        n[0] +
        '\')"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        IC[n[0]] +
        '</svg><span class="ls">' +
        n[1] +
        '</span><span class="ll">' +
        n[2] +
        "</span></button>",
    )
    .join("");
  $("#app").className = hide ? "hide" : "";
  var av = $("#av");
  if (av)
    av.textContent = (
      (S.profile.name || "T").trim().charAt(0) || "T"
    ).toUpperCase();
  var j = $("#j_d");
  if (j)
    j.onchange = function () {
      jd = this.value || today();
      render();
    };
  if (tab === "risk") calc();
  countUp();
}
function setTheme(t, sv) {
  document.documentElement.setAttribute("data-theme", t);
  if (sv) {
    try {
      localStorage.setItem(K + "t", t);
    } catch (e) {}
  }
  var b = $("#thm");
  if (b) {
    b.firstChild.textContent = t === "light" ? "☀️" : "🌙";
    b.setAttribute(
      "aria-label",
      "Switch to " + (t === "light" ? "dark" : "light") + " mode",
    );
  }
  var m = document.querySelector("meta[name=theme-color]");
  if (m) m.content = t === "light" ? "#F8FAFC" : "#0F1318";
}
function toggleTheme() {
  setTheme(
    document.documentElement.getAttribute("data-theme") === "light"
      ? "dark"
      : "light",
    1,
  );
}
function confirmImp(o) {
  var nt = (o.trades || []).length,
    nd = Object.keys(o.days || {}),
    v = modal(
      '<h2>A friend shared a day</h2><p class="mut">' +
        nd.map(nice).join(", ") +
        " · " +
        nt +
        " trade" +
        (nt === 1 ? "" : "s") +
        (nt ? " · " + fmt(sum(o.trades)) + " P&amp;L" : "") +
        '</p><div class="row"><button class="pri" id="i_a">Add to my journal</button><button class="ghost" id="i_x">Dismiss</button></div>',
    );
  v.querySelector("#i_a").onclick = function () {
    try {
      (o.trades || []).forEach(function (t) {
        t.acc = "";
      });
      merge(o);
      closeM();
      toast("Added to your journal");
      render();
    } catch (e) {
      toast("Couldn’t add that entry.");
    }
  };
  v.querySelector("#i_x").onclick = closeM;
}
async function incoming() {
  var h = location.hash;
  if (h.indexOf("#d=") !== 0) return;
  await importCode(h);
  try {
    history.replaceState(null, "", location.href.split("#")[0]);
  } catch (e) {}
}
document.querySelectorAll(".lgi").forEach(function (i) {
  i.src = LOGO;
});
var fl = document.createElement("link");
fl.rel = "icon";
fl.href = LOGO;
document.head.appendChild(fl);
var LGI = new Image();
LGI.src = LOGO;
load();
setTheme(document.documentElement.getAttribute("data-theme") || "dark");
if (!S.profile) S.profile = {};
if (!S.accts) S.accts = [];
if (!S.pays) S.pays = [];
S.accts.forEach(function (a) {
  if (!a.hist) a.hist = [];
});
render();
incoming();
if ("serviceWorker" in navigator && /^https?:/.test(location.protocol))
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
var TG = [
    "Better than yesterday.",
    "Log it. Learn it. Level up.",
    "Your edge, written down.",
    "Discipline compounds.",
  ],
  ti = 0;
setInterval(function () {
  return;
  ti = (ti + 1) % TG.length;
  var e = $("#tg");
  e.style.animation = "none";
  e.offsetWidth;
  e.style.animation = "";
  e.textContent = TG[ti];
}, 4000);
/* ====================================================================
 * 20. Application Bootstrap & Initialization
 * ==================================================================== */
if (!S.profile.name)
  setTimeout(function () {
    if (!$(".veil")) profileForm(true);
  }, 700);

// Initialize Cloud Authentication & Database Synchronization
if (typeof LockinAuth !== "undefined") {
  LockinAuth.init();
}
if (typeof LockinSync !== "undefined") {
  LockinSync.init();
}
