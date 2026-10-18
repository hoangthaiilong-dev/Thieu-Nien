(function () {
'use strict';

/* ================= Dữ liệu & lưu trữ ================= */
var nfc = function (s) { return String(s).normalize('NFC'); };
var ARTS = window.ARTICLES.map(function (a) {
  var body = a.body.map(function (b) { return { k: b.k, t: nfc(b.t), img: b.img }; });
  var text = nfc(a.title + ' ' + a.sapo + ' ' + body.map(function (b) { return b.t; }).join(' '));
  var words = text.split(/\s+/).length;
  return { id: a.id, cat: a.cat, emoji: a.emoji, title: nfc(a.title), sapo: nfc(a.sapo), body: body,
           mins: Math.max(1, Math.round(words / 200)) };
});
var BY_ID = {}; ARTS.forEach(function (a) { BY_ID[a.id] = a; });
var CATS = []; ARTS.forEach(function (a) { if (CATS.indexOf(a.cat) < 0) CATS.push(a.cat); });
var CAT_HUE = { 'Thời sự': [212, 236], 'Thể thao': [150, 186], 'Pháp luật': [262, 288], 'Công nghệ': [196, 222],
  'Thế giới': [226, 262], 'Văn hóa': [14, 42], 'Giáo dục': [34, 18], 'Sức khỏe': [168, 142], 'Xe': [8, 28] };

var store = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
/* Dữ liệu riêng cho từng tài khoản (khách dùng khóa gốc) */
function uk(k) { var u = window.Auth && window.Auth.uid(); return !u || u === 'guest' ? k : k + '_' + u; }
var bookmarks = [], prog = {};   // prog: id -> {mark, ...}
function loadUser() { bookmarks = store.get(uk('tn_bm'), []); prog = store.get(uk('tn_prog'), {}); }
loadUser();
var saveBm = function () { store.set(uk('tn_bm'), bookmarks); };
var saveProg = function () { store.set(uk('tn_prog'), prog); };
var isBm = function (id) { return bookmarks.indexOf(id) >= 0; };

/* ================= Tiện ích ================= */
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
function norm(s) {
  return nfc(s).split('').map(function (c) {
    if (c === 'đ' || c === 'Đ') return 'd';
    var n = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (n.charAt(0) || c).toLowerCase();
  }).join('');
}
function tokens(q) { return norm(q).split(/\s+/).filter(Boolean); }
function hl(text, q) {
  var toks = tokens(q || '');
  if (!toks.length) return esc(text);
  var nt = norm(text), r = [];
  toks.forEach(function (t) { var i = 0; while ((i = nt.indexOf(t, i)) > -1) { r.push([i, i + t.length]); i += t.length; } });
  if (!r.length) return esc(text);
  r.sort(function (a, b) { return a[0] - b[0]; });
  var m = [r[0]];
  for (var i = 1; i < r.length; i++) { var l = m[m.length - 1]; if (r[i][0] <= l[1]) l[1] = Math.max(l[1], r[i][1]); else m.push(r[i]); }
  var out = '', p = 0;
  m.forEach(function (x) { out += esc(text.slice(p, x[0])) + '<mark>' + esc(text.slice(x[0], x[1])) + '</mark>'; p = x[1]; });
  return out + esc(text.slice(p));
}
function toast(msg, btn, fn) {
  var t = $('#toast'); t.innerHTML = '<span>' + esc(msg) + '</span>';
  if (btn) { var b = document.createElement('button'); b.textContent = btn; b.onclick = function () { t.classList.remove('on'); fn(); }; t.appendChild(b); }
  t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('on'); }, btn ? 7000 : 2600);
}

/* ================= Ngày giờ tự động ================= */
var WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
function tick() {
  var d = new Date(), p = function (n) { return n < 10 ? '0' + n : n; };
  $('#today').textContent = WD[d.getDay()] + ', ngày ' + d.getDate() + ' tháng ' + (d.getMonth() + 1) + ' năm ' + d.getFullYear();
  $('#clock').textContent = p(d.getHours()) + ':' + p(d.getMinutes());
}
tick(); setInterval(tick, 20000);

/* ================= Minh họa ================= */
function art(a, v, cls, imgName, inFig) {
  var h = CAT_HUE[a.cat] || [212, 236], ang = 120 + ((a.id * 37 + (v || 0) * 53) % 90);
  return '<div class="thumb ' + (cls || '') + '" style="--h1:' + h[0] + ';--h2:' + h[1] + ';--a:' + ang + 'deg">' +
    '<span class="em" aria-hidden="true">' + a.emoji + '</span><span class="tag">' + esc(a.cat) + '</span>' +
    '<img src="images/' + (imgName || a.id) + '.jpg" alt="" loading="lazy" onerror="' + (inFig ? "this.closest('figure').remove()" : 'this.remove()') + '"></div>';
}

/* ================= Thẻ bài ================= */
function statusBadge() { return ''; }
function starBtn(id) {
  var on = isBm(id);
  return '<button class="star' + (on ? ' on' : '') + '" data-star="' + id + '" title="' + (on ? 'Bỏ lưu bài' : 'Lưu bài này') + '" aria-label="Lưu bài">' + (on ? '★' : '☆') + '</button>';
}
function bar() { return ''; }
function href(a, q) { return '#/bai/' + a.id + (q ? '?q=' + encodeURIComponent(q) : ''); }
function card(a, q, snip) {
  return '<article class="card">' + starBtn(a.id) +
    '<a class="cover" href="' + href(a, q) + '">' + art(a) + '</a>' +
    '<div class="card-b"><span class="cat">' + esc(a.cat) + '</span>' +
    '<h3><a href="' + href(a, q) + '">' + hl(a.title, q) + '</a></h3>' +
    '<p>' + (snip || hl(a.sapo, q)) + '</p>' +
    '<div class="meta"><span>' + a.mins + ' phút đọc</span>' + statusBadge(a.id) + '</div></div>' + bar(a.id) + '</article>';
}
function rowCard(a, q, snip, big) {
  return '<article class="row">' + starBtn(a.id) +
    '<a href="' + href(a, q) + '">' + art(a) + '</a>' +
    '<div class="row-b"><span class="cat">' + esc(a.cat) + '</span>' +
    '<h3><a href="' + href(a, q) + '">' + hl(a.title, q) + '</a></h3>' +
    (big ? '<p>' + (snip || hl(a.sapo, q)) + '</p>' : '') +
    '<div class="meta"><span>' + a.mins + ' phút đọc</span>' + statusBadge(a.id) + '</div></div></article>';
}

/* ================= Thời tiết ================= */
var CITIES = [
  ['Hà Nội', 21.03, 105.85], ['TP. Hồ Chí Minh', 10.78, 106.70], ['Hải Phòng', 20.84, 106.69], ['Đà Nẵng', 16.05, 108.20],
  ['Cần Thơ', 10.03, 105.78], ['Huế', 16.46, 107.59], ['Quảng Ninh', 20.95, 107.08], ['Cao Bằng', 22.67, 106.26],
  ['Lạng Sơn', 21.85, 106.76], ['Lai Châu', 22.40, 103.46], ['Điện Biên', 21.39, 103.02], ['Sơn La', 21.33, 103.91],
  ['Thanh Hóa', 19.81, 105.78], ['Nghệ An', 18.68, 105.68], ['Hà Tĩnh', 18.34, 105.91], ['Quảng Trị', 17.47, 106.62],
  ['Quảng Ngãi', 15.12, 108.80], ['Gia Lai', 13.98, 108.00], ['Khánh Hòa', 12.24, 109.19], ['Lâm Đồng', 11.94, 108.44],
  ['Đắk Lắk', 12.67, 108.04], ['Đồng Nai', 10.95, 106.82], ['Tây Ninh', 11.31, 106.10], ['Vĩnh Long', 10.25, 105.97],
  ['Đồng Tháp', 10.46, 105.63], ['Cà Mau', 9.18, 105.15], ['An Giang', 10.37, 105.43], ['Tuyên Quang', 21.82, 105.21],
  ['Lào Cai', 22.48, 103.97], ['Thái Nguyên', 21.59, 105.85], ['Phú Thọ', 21.32, 105.40], ['Bắc Ninh', 21.19, 106.07],
  ['Hưng Yên', 20.65, 106.05], ['Ninh Bình', 20.25, 105.97]
];
var wxData = null, wxState = 'loading', city = store.get('tn_city', 0);
if (typeof city !== 'number' || !CITIES[city]) city = 0;
function wcode(c) {
  if (c === 0) return ['☀️', 'Trời nắng'];
  if (c === 1) return ['🌤️', 'Ít mây'];
  if (c === 2) return ['⛅', 'Có mây'];
  if (c === 3) return ['☁️', 'Nhiều mây'];
  if (c === 45 || c === 48) return ['🌫️', 'Sương mù'];
  if (c >= 51 && c <= 57) return ['🌦️', 'Mưa phùn'];
  if ((c >= 61 && c <= 65) || c === 66 || c === 67) return ['🌧️', 'Có mưa'];
  if (c >= 71 && c <= 77) return ['❄️', 'Tuyết'];
  if (c === 80) return ['🌦️', 'Mưa rào nhẹ'];
  if (c === 81 || c === 82) return ['🌧️', 'Mưa rào'];
  if (c >= 95) return ['⛈️', 'Dông'];
  return ['🌡️', 'Thời tiết'];
}
function loadWeather() {
  var cached = store.get('tn_wx', null);
  if (cached && Date.now() - cached.t < 30 * 60 * 1000) { wxData = cached.d; wxState = 'ok'; paintWeather(); return; }
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + CITIES.map(function (c) { return c[1]; }).join(',') +
    '&longitude=' + CITIES.map(function (c) { return c[2]; }).join(',') +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=Asia%2FBangkok';
  fetch(url).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
    wxData = Array.isArray(j) ? j : [j]; wxState = 'ok'; store.set('tn_wx', { t: Date.now(), d: wxData }); paintWeather();
  }).catch(function () {
    if (cached) { wxData = cached.d; wxState = 'ok'; } else wxState = 'err';
    paintWeather();
  });
}
function day3(i) {
  var d = wxData[i].daily, out = '';
  var names = ['Hôm nay', 'Ngày mai', 'Ngày kia'];
  for (var k = 0; k < 3; k++) {
    var w = wcode(d.weather_code[k]);
    out += '<div class="w-day"><b>' + names[k] + '</b><span class="ic" title="' + w[1] + '">' + w[0] + '</span>' +
      Math.round(d.temperature_2m_min[k]) + '° - ' + Math.round(d.temperature_2m_max[k]) + '°<br><small>☔ ' + (d.precipitation_probability_max[k] == null ? '–' : d.precipitation_probability_max[k]) + '%</small></div>';
  }
  return out;
}
function weatherPanel() {
  var opts = CITIES.map(function (c, i) { return '<option value="' + i + '"' + (i === city ? ' selected' : '') + '>' + esc(c[0]) + '</option>'; }).join('');
  var body;
  if (wxState === 'loading') body = '<p class="empty">Đang tải thời tiết…</p>';
  else if (wxState === 'err' || !wxData || !wxData[city]) body = '<p class="empty">Không tải được dữ liệu thời tiết. Hãy kiểm tra kết nối mạng rồi tải lại trang.</p>';
  else {
    var c = wxData[city].current, w = wcode(c.weather_code);
    body = '<div class="w-now"><span class="ic">' + w[0] + '</span><div><div class="t">' + Math.round(c.temperature_2m) + '°C</div><div class="d">' + w[1] +
      '<br>Độ ẩm ' + c.relative_humidity_2m + '% · Gió ' + Math.round(c.wind_speed_10m) + ' km/h</div></div></div><div class="w-days">' + day3(city) + '</div>';
  }
  return '<section class="panel"><h3>🌦️ Thời tiết</h3><select id="citySel" aria-label="Chọn tỉnh thành">' + opts + '</select>' + body +
    '<a class="more" href="#/thoi-tiet">Xem thời tiết ' + CITIES.length + ' tỉnh thành ›</a></section>';
}
function paintWeather() {
  var m = $('#miniWeather');
  if (wxState === 'ok' && wxData && wxData[city]) {
    var c = wxData[city].current, w = wcode(c.weather_code);
    m.innerHTML = w[0] + ' <span>' + esc(CITIES[city][0]) + ': ' + Math.round(c.temperature_2m) + '°C, ' + w[1].toLowerCase() + '</span>';
  } else m.innerHTML = '🌤️ <span>' + (wxState === 'err' ? 'Chưa có dữ liệu thời tiết' : 'Đang tải thời tiết…') + '</span>';
  renderAside();
  if (route.name === 'weather') renderView();
}

/* ================= Aside ================= */
function renderAside() {
  var sel = $('#citySel');
  if (sel && document.activeElement === sel) return;   // đang mở danh sách thì không vẽ lại
  var saved = bookmarks.map(function (id) { return BY_ID[id]; }).filter(Boolean);
  var savedHtml = saved.length ? '<ul class="mini-list">' + saved.slice(0, 5).map(function (a) {
    return '<li><a href="' + href(a) + '">' + esc(a.title) + '</a></li>'; }).join('') + '</ul>' + (saved.length > 5 ? '<a class="more" href="#/da-luu">Xem tất cả (' + saved.length + ') ›</a>' : '')
    : '<p class="empty">Chưa có bài nào. Bấm ☆ ở mỗi bài để lưu lại đọc sau.</p>';
  $('#aside').innerHTML = weatherPanel() +
    '<section class="panel"><h3>★ Bài đã lưu (' + saved.length + ')</h3>' + savedHtml + '</section>';
}

/* ================= Điều hướng ================= */
var route = { name: 'home' };
function parseHash() {
  var h = decodeURIComponent((location.hash || '#/').slice(1)), q = '';
  var qi = h.indexOf('?q='); if (qi >= 0) { q = h.slice(qi + 3); h = h.slice(0, qi); }
  var p = h.split('/').filter(Boolean);
  if (!p.length) return { name: 'home' };
  if (p[0] === 'bai' && BY_ID[p[1]]) return { name: 'article', id: +p[1], q: q };
  if (p[0] === 'muc') return { name: 'cat', cat: p.slice(1).join('/') };
  if (p[0] === 'tim') return { name: 'search', q: p.slice(1).join('/') };
  if (p[0] === 'da-luu') return { name: 'saved' };
  if (p[0] === 'thoi-tiet') return { name: 'weather' };
  if (p[0] === 'chao-mung') return { name: 'welcome' };
  return { name: 'home' };
}
function renderNav() {
  var r = route;
  var items = [['#/', 'Trang chủ', r.name === 'home']];
  CATS.forEach(function (c) { items.push(['#/muc/' + encodeURIComponent(c), c, r.name === 'cat' && r.cat === c]); });
  items.push(['#/thoi-tiet', '🌦️ Thời tiết', r.name === 'weather']);
  items.push(['#/da-luu', '★ Đã lưu' + (bookmarks.length ? ' <span class="count">' + bookmarks.length + '</span>' : ''), r.name === 'saved']);
  $('#nav').innerHTML = items.map(function (i) { return '<a href="' + i[0] + '"' + (i[2] ? ' class="on"' : '') + '>' + i[1] + '</a>'; }).join('');
}
/* ===== Trang chào mừng (màn hình đầu tiên theo thiết kế Figma) ===== */
function syncWelcome() {
  var el = $('#welcome');
  if (route.name !== 'welcome') { if (el) el.remove(); if (!$('#auth')) document.body.style.overflow = ''; return; }
  try { sessionStorage.setItem('tn_welcomed', '1'); } catch (e) {}
  if (!el) { el = document.createElement('div'); el.id = 'welcome'; el.className = 'welcome'; document.body.appendChild(el); }
  var three = ARTS.slice(0, 3).map(function (a) {
    return '<a class="wcard" href="' + href(a) + '"><span class="cat">' + esc(a.cat) + '</span><h3>' + esc(a.title) + '</h3><p>' + esc(a.sapo) + '</p></a>';
  }).join('');
  el.innerHTML = '<header class="w-top"><b class="w-brand">BẢN TIN</b><nav><a href="#/">Trang chủ</a><a href="#/thoi-tiet">Thời tiết</a><a href="#/dang-nhap">Đăng nhập</a><a href="#/dang-ky">Đăng ký</a></nav></header>' +
    '<section class="w-hero"><div class="w-text"><h1>Chào Mừng</h1><p>Khám phá những tin tức nổi bật trong ngày, theo dõi thời tiết các tỉnh thành và lưu lại những bài báo bạn yêu thích.</p>' +
    '<div class="w-btns"><a class="pbtn" id="wGo" href="#/">Tiếp tục</a><a class="sbtn" href="#/dang-nhap">Đăng nhập</a></div></div>' +
    '<img class="w-logo" src="logo.png" alt="Thiếu Niên"></section>' +
    '<section class="w-news"><h2>Tin tức mới nhất</h2><div class="w-cards">' + three + '</div></section>' +
    '<footer class="w-foot">Thiếu Niên · Báo đọc mỗi ngày</footer>';
  document.body.style.overflow = 'hidden'; el.scrollTop = 0;
}
function onRoute() {
  stopReading();
  route = parseHash();
  syncWelcome();
  var inp = $('#q');
  if (route.name === 'search') { if (document.activeElement !== inp) inp.value = route.q; }
  else if (route.name !== 'article') inp.value = '';
  renderView(); renderNav();
  if (route.name !== 'article') window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ================= Các trang ================= */
function renderView() {
  var v = $('#view'), h = '';
  document.title = 'Thiếu Niên - Báo đọc mỗi ngày';
  switch (route.name) {
    case 'home': h = homeView(); break;
    case 'cat': h = listView('Chuyên mục: ' + route.cat, ARTS.filter(function (a) { return a.cat === route.cat; })); document.title = route.cat + ' - Thiếu Niên'; break;
    case 'saved': h = listView('★ Bài đã lưu', bookmarks.map(function (id) { return BY_ID[id]; }).filter(Boolean), 'Bạn chưa lưu bài nào. Bấm ☆ trên mỗi bài để lưu lại.'); break;
    case 'search': h = searchView(); break;
    case 'weather': h = weatherView(); document.title = 'Thời tiết - Thiếu Niên'; break;
    case 'article': h = articleView(BY_ID[route.id]); break;
  }
  v.innerHTML = h;
  if (route.name === 'article') startReading(BY_ID[route.id]);
}
function homeView() {
  var lead = ARTS[0], side = [ARTS[1], ARTS[3]], rest = ARTS.slice(2).filter(function (a) { return side.indexOf(a) < 0; });
  return '<div class="hero"><article class="lead">' + starBtn(lead.id) + '<a href="' + href(lead) + '">' + art(lead) + '</a><div class="lead-b"><span class="cat">' + esc(lead.cat) + '</span>' +
    '<h2><a href="' + href(lead) + '">' + esc(lead.title) + '</a></h2><p>' + esc(lead.sapo) + '</p><div class="meta"><span>' + lead.mins + ' phút đọc</span>' + statusBadge(lead.id) + '</div></div>' + bar(lead.id) + '</article>' +
    '<div class="hero-side">' + side.map(function (a) { return rowCard(a); }).join('') + '</div></div>' +
    '<h2 class="sec">Tin mới nhất<small>' + ARTS.length + ' bài</small></h2><div class="grid3">' + rest.map(function (a) { return card(a); }).join('') + '</div>';
}
function listView(title, list, emptyMsg) {
  if (!list.length) return '<h2 class="sec">' + esc(title) + '</h2><div class="empty-big"><div class="big">📰</div><p>' + esc(emptyMsg || 'Chưa có bài viết.') + '</p></div>';
  return '<h2 class="sec">' + esc(title) + '<small>' + list.length + ' bài</small></h2><div class="grid3">' + list.map(function (a) { return card(a); }).join('') + '</div>';
}
function searchView() {
  var q = route.q.trim(), toks = tokens(q);
  if (!toks.length) return homeView();
  var res = [];
  ARTS.forEach(function (a) {
    var nt = norm(a.title), ns = norm(a.sapo), parts = a.body.map(function (b) { return b.t; }), nb = norm(parts.join('\n'));
    var all = toks.every(function (t) { return (nt + ' ' + ns + ' ' + nb).indexOf(t) >= 0; });
    if (!all) return;
    var score = 0; toks.forEach(function (t) {
      if (nt.indexOf(t) >= 0) score += 10; if (ns.indexOf(t) >= 0) score += 3;
      var i = 0, n = 0; while ((i = nb.indexOf(t, i)) > -1 && n < 30) { n++; i += t.length; } score += n; });
    if (nt.indexOf(norm(q)) >= 0) score += 20;
    // đoạn trích
    var snip = '', best = null;
    var pool = [a.sapo].concat(parts);
    for (var k = 0; k < pool.length && !best; k++) { var np = norm(pool[k]); for (var j = 0; j < toks.length; j++) { var ix = np.indexOf(toks[j]); if (ix >= 0) { best = [pool[k], ix]; break; } } }
    if (best) { var s = Math.max(0, best[1] - 70), e = Math.min(best[0].length, best[1] + 130); snip = (s > 0 ? '…' : '') + hl(best[0].slice(s, e), q) + (e < best[0].length ? '…' : ''); }
    res.push({ a: a, score: score, snip: snip });
  });
  res.sort(function (x, y) { return y.score - x.score; });
  document.title = 'Tìm "' + q + '" - Thiếu Niên';
  if (!res.length) return '<h2 class="sec">Kết quả tìm kiếm</h2><div class="empty-big"><div class="big">🔍</div><p>Không tìm thấy bài nào cho “' + esc(q) + '”. Thử từ khóa ngắn hơn hoặc bỏ dấu.</p></div>';
  return '<h2 class="sec">Kết quả cho “' + esc(q) + '”<small>' + res.length + ' bài</small></h2><div class="rows">' +
    res.map(function (r) { return rowCard(r.a, q, r.snip, true); }).join('') + '</div>';
}
function weatherView() {
  if (wxState === 'loading') return '<h2 class="sec">Thời tiết các tỉnh thành</h2><div class="empty-big"><div class="big">⏳</div><p>Đang tải dữ liệu thời tiết…</p></div>';
  if (wxState === 'err' || !wxData) return '<h2 class="sec">Thời tiết các tỉnh thành</h2><div class="empty-big"><div class="big">📡</div><p>Không tải được dữ liệu thời tiết. Hãy kiểm tra kết nối mạng rồi tải lại trang.</p></div>';
  var f = (window.__wf || '');
  var cells = CITIES.map(function (c, i) {
    if (f && norm(c[0]).indexOf(norm(f)) < 0) return '';
    var cur = wxData[i].current, d = wxData[i].daily, w = wcode(cur.weather_code);
    return '<button class="wc' + (i === city ? ' sel' : '') + '" data-city="' + i + '"><b>' + esc(c[0]) + '</b><span class="big"><span>' + w[0] + '</span>' + Math.round(cur.temperature_2m) + '°C</span>' +
      '<small>' + w[1] + ' · ẩm ' + cur.relative_humidity_2m + '%</small><small>Hôm nay ' + Math.round(d.temperature_2m_min[0]) + '° - ' + Math.round(d.temperature_2m_max[0]) + '° · ☔ ' + (d.precipitation_probability_max[0] == null ? '–' : d.precipitation_probability_max[0]) + '%</small></button>';
  }).join('');
  return '<h2 class="sec">Thời tiết các tỉnh thành<small>' + CITIES.length + ' tỉnh, thành</small></h2><div class="w-tools"><input id="wf" type="search" placeholder="Lọc tỉnh thành…" value="' + esc(f) + '"></div>' +
    '<div class="wgrid">' + (cells || '<p class="empty">Không có tỉnh thành phù hợp.</p>') + '</div><p class="empty" style="margin-top:12px">Bấm vào một tỉnh để chọn làm nơi hiển thị trên đầu trang.</p>';
}

/* ================= Trang bài đọc ================= */
function articleView(a) {
  document.title = a.title + ' - Thiếu Niên';
  var q = route.q || '', i = 0, vi = 0, out = '';
  a.body.forEach(function (b) {
    if (b.k === 'h') out += '<h2 data-i="' + (i++) + '">' + hl(b.t, q) + '</h2>';
    else if (b.k === 'cap') out += '<figure class="fig">' + art(a, vi + 2, '', b.img || a.id + '-' + (++vi), true) + '<figcaption>' + hl(b.t, q) + '</figcaption></figure>';
    else { out += '<p data-i="' + i + '"><button class="mk" data-mk="' + i + '" title="Đánh dấu: tôi đọc đến đây" aria-label="Đánh dấu đọc đến đây">🔖</button>' + hl(b.t, q) + '</p>'; i++; }
  });
  var idx = ARTS.indexOf(a), next = [ARTS[(idx + 1) % ARTS.length], ARTS[(idx + 2) % ARTS.length], ARTS[(idx + 3) % ARTS.length]];
  return '<article class="art-page" id="artPage"><div class="crumbs"><a href="#/">Trang chủ</a> › <a href="#/muc/' + encodeURIComponent(a.cat) + '">' + esc(a.cat) + '</a></div>' +
    '<h1>' + hl(a.title, q) + '</h1><div class="byline"><span>' + a.mins + ' phút đọc</span><span id="pctLabel"></span></div>' +
    '<div class="tools"><button class="btn' + (isBm(a.id) ? ' on' : '') + '" id="bmBtn">' + (isBm(a.id) ? '★ Đã lưu bài' : '☆ Lưu bài') + '</button>' +
    '<button class="btn" id="clearMk">Xóa đánh dấu</button><button class="btn" id="backBtn">← Quay lại</button></div>' +
    art(a) + '<p class="sapo" style="margin-top:18px">' + hl(a.sapo, q) + '</p><div class="body" id="artBody">' + out + '</div>' +
    '<div class="end"><span>✔ Bạn đã đọc hết bài này.</span><a class="btn fill" href="' + href(next[0]) + '" style="text-decoration:none">Bài tiếp theo ›</a></div>' +
    '<div class="next"><h3>Đọc thêm</h3><div class="grid3">' + next.map(function (n) { return card(n); }).join('') + '</div></div></article>';
}

var rd = null;   // trạng thái đang đọc
function stopReading() {
  if (!rd) return;
  window.removeEventListener('scroll', rd.onScroll); clearTimeout(rd.timer); flush();
  rd = null; $('#progress').classList.remove('on');
}
function getPos() {
  var body = $('#artBody'), page = $('#artPage'); if (!body || !page) return null;
  var top = page.getBoundingClientRect().top + window.scrollY, h = page.offsetHeight;
  var pct = Math.min(1, Math.max(0, (window.scrollY + window.innerHeight * .75 - top) / h));
  var mid = window.innerHeight * .4, last = -1;
  var els = body.querySelectorAll('p[data-i]');
  for (var k = 0; k < els.length; k++) { if (els[k].getBoundingClientRect().top < mid) last = +els[k].dataset.i; else break; }
  return { pct: pct, y: Math.max(0, window.scrollY - top), p: last };
}
function flush() {}
function startReading(a) {
  var bar = $('#progress'); bar.classList.add('on');
  var saved = prog[a.id];
  rd = { id: a.id, timer: 0, onScroll: null };
  var lab = $('#pctLabel');
  rd.onScroll = function () {
    var pos = getPos(); if (!pos) return;
    bar.firstElementChild.style.width = (pos.pct * 100).toFixed(1) + '%';
    lab.textContent = 'Đã đọc ' + Math.round(pos.pct * 100) + '%';
  };
  window.addEventListener('scroll', rd.onScroll, { passive: true });
  paintMark(saved && saved.mark);
  var target = saved && saved.mark != null ? $('#artBody [data-i="' + saved.mark + '"]') : null;
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (target) setTimeout(function () {
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    toast('Đã quay lại chỗ bạn đánh dấu', 'Đọc từ đầu', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }, 60);
  rd.onScroll();
}
function paintMark(i) {
  document.querySelectorAll('#artBody p.marked').forEach(function (p) { p.classList.remove('marked'); });
  if (i != null) { var p = $('#artBody p[data-i="' + i + '"]'); if (p) p.classList.add('marked'); }
}

/* ================= Xem ảnh lớn: nhấp đúp để phóng to, nhấp đúp lần nữa để thu lại ================= */
function closeLightbox() { var o = $('#lightbox'); if (o) o.remove(); document.body.style.overflow = ''; }
document.addEventListener('dblclick', function (e) {
  if (e.target.closest('#lightbox')) { closeLightbox(); return; }
  var im = e.target.closest('.art-page .thumb img'); if (!im) return;
  e.preventDefault();
  var fig = im.closest('figure'), cap = fig ? fig.querySelector('figcaption') : null;
  var o = document.createElement('div'); o.id = 'lightbox';
  o.innerHTML = '<button class="lb-x" aria-label="Đóng">✕</button><img src="' + im.src + '" alt="">' +
    '<div class="lb-cap">' + (cap ? esc(cap.textContent) + ' · ' : '') + 'Nhấp đúp để thu nhỏ</div>';
  document.body.appendChild(o); document.body.style.overflow = 'hidden';
});
document.addEventListener('click', function (e) { if (e.target.closest('.lb-x')) closeLightbox(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });

/* ================= Sự kiện ================= */
document.addEventListener('click', function (e) {
  var t = e.target.closest('button,a'); if (!t) return;
  if (t.dataset.star) {
    e.preventDefault(); var id = +t.dataset.star, i = bookmarks.indexOf(id);
    if (i >= 0) { bookmarks.splice(i, 1); toast('Đã bỏ lưu bài'); } else { bookmarks.unshift(id); toast('Đã lưu bài để đọc sau'); }
    saveBm(); renderNav(); renderAside();
    if (route.name === 'saved') renderView();
    else document.querySelectorAll('[data-star="' + id + '"]').forEach(function (b) { var on = isBm(id); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; });
    return;
  }
  if (t.id === 'bmBtn') {
    var aid = route.id, k = bookmarks.indexOf(aid);
    if (k >= 0) bookmarks.splice(k, 1); else bookmarks.unshift(aid);
    saveBm(); var on = isBm(aid); t.classList.toggle('on', on); t.textContent = on ? '★ Đã lưu bài' : '☆ Lưu bài'; renderNav(); renderAside(); toast(on ? 'Đã lưu bài để đọc sau' : 'Đã bỏ lưu bài'); return;
  }
  if (t.dataset.mk != null && t.classList.contains('mk')) {
    var n = +t.dataset.mk, cur = prog[route.id] || { pct: 0, max: 0, y: 0, p: -1, t: Date.now() };
    if (cur.mark === n) { cur.mark = null; toast('Đã bỏ đánh dấu'); } else { cur.mark = n; toast('Đã đánh dấu: lần sau mở bài sẽ tự quay lại đây'); }
    prog[route.id] = cur; saveProg(); paintMark(cur.mark); return;
  }
  if (t.id === 'clearMk') {
    var c2 = prog[route.id]; if (c2) { c2.mark = null; saveProg(); paintMark(null); }
    toast('Đã xóa đánh dấu'); return;
  }
  if (t.id === 'backBtn') { if (history.length > 1) history.back(); else location.hash = '#/'; return; }
  if (t.dataset.city != null) { city = +t.dataset.city; store.set('tn_city', city); paintWeather(); toast('Đã chọn ' + CITIES[city][0]); return; }
});
document.addEventListener('change', function (e) {
  if (e.target.id === 'citySel') { city = +e.target.value; store.set('tn_city', city); paintWeather(); }
});
document.addEventListener('input', function (e) {
  if (e.target.id === 'wf') { window.__wf = e.target.value; var pos = e.target.selectionStart; renderView(); var w = $('#wf'); w.focus(); w.setSelectionRange(pos, pos); }
});
var qt;
$('#q').addEventListener('input', function (e) {
  clearTimeout(qt); var v = e.target.value.trim();
  qt = setTimeout(function () { location.replace(v ? '#/tim/' + encodeURIComponent(v) : '#/'); }, 220);
});
$('#searchForm').addEventListener('submit', function (e) {
  e.preventDefault(); clearTimeout(qt); var v = $('#q').value.trim();
  location.hash = v ? '#/tim/' + encodeURIComponent(v) : '#/';
});
window.addEventListener('hashchange', onRoute);
window.addEventListener('auth-change', function () { loadUser(); renderNav(); renderAside(); renderView(); });
window.addEventListener('beforeunload', function () { flush(); });
document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
var tt = $('#toTop');
window.addEventListener('scroll', function () { tt.classList.toggle('on', window.scrollY > 600); }, { passive: true });
tt.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); };

/* ================= Khởi động ================= */
var h0 = location.hash;
var seen = false; try { seen = !!sessionStorage.getItem('tn_welcomed'); } catch (e) {}
if ((!h0 || h0 === '#' || h0 === '#/') && !seen) location.replace('#/chao-mung');
route = parseHash();
syncWelcome();
renderNav(); renderAside(); renderView();
if (route.name === 'search') $('#q').value = route.q;
loadWeather();
})();
