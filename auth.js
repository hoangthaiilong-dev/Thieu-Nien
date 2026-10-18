/* Đăng nhập / đăng ký / xác thực / tài khoản. Có 2 chế độ: Firebase (thật) và Demo (lưu trong trình duyệt). */
(function () {
'use strict';
var cfg = window.FIREBASE_CONFIG;
var MODE = cfg && cfg.apiKey ? 'firebase' : 'demo';
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var ls = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};

var cur = null;        // người dùng đã đăng nhập và đã xác thực
var pending = null;    // đã đăng ký/đăng nhập nhưng chưa xác thực
var ready = false;

/* ---------- Tin nhắn lỗi tiếng Việt ---------- */
var ERR = {
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.', 'auth/wrong-password': 'Mật khẩu không đúng.',
  'auth/user-not-found': 'Không tìm thấy tài khoản với email này.', 'auth/email-already-in-use': 'Email này đã được đăng ký.',
  'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).', 'auth/invalid-email': 'Email không hợp lệ.',
  'auth/too-many-requests': 'Bạn thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.',
  'auth/configuration-not-found': 'Firebase chưa bật Authentication. Vào Firebase → Authentication → Get started → bật Email/Password.',
  'auth/operation-not-allowed': 'Firebase chưa bật đăng nhập bằng Email/Password.',
  'auth/network-request-failed': 'Không có kết nối mạng. Hãy kiểm tra lại.', 'auth/user-disabled': 'Tài khoản đã bị khóa.'
};
function msg(e) { return (e && (ERR[e.code] || e.message)) || 'Có lỗi xảy ra, vui lòng thử lại.'; }

/* ================= Adapter: DEMO ================= */
function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36) + s.length; }
var demo = {
  users: function () { return ls.get('tn_users', {}); },
  save: function (u) { ls.set('tn_users', u); },
  session: function (uid, remember) {
    if (remember) { ls.set('tn_session', { uid: uid }); try { sessionStorage.removeItem('tn_session'); } catch (e) {} }
    else { try { sessionStorage.setItem('tn_session', JSON.stringify({ uid: uid })); } catch (e) {} ls.del('tn_session'); }
  },
  load: function () {
    var s = ls.get('tn_session', null);
    if (!s) { try { s = JSON.parse(sessionStorage.getItem('tn_session') || 'null'); } catch (e) { s = null; } }
    if (!s) return;
    var u = demo.users()[s.uid]; if (u) apply({ uid: s.uid, name: u.name, email: u.email, verified: u.verified });
  },
  init: function () { demo.load(); ready = true; fire(); route(); },
  register: function (name, email, pass) {
    return new Promise(function (ok, no) {
      var us = demo.users(), id = 'u_' + email.toLowerCase();
      if (us[id]) return no({ code: 'auth/email-already-in-use' });
      us[id] = { name: name, email: email, pass: hash(pass), verified: false, created: Date.now() }; demo.save(us);
      demo.session(id, true); demo.sendOtp(id); apply({ uid: id, name: name, email: email, verified: false }); ok();
    });
  },
  login: function (email, pass, remember) {
    return new Promise(function (ok, no) {
      var id = 'u_' + email.toLowerCase(), u = demo.users()[id];
      if (!u || u.pass !== hash(pass)) return no({ code: 'auth/invalid-credential' });
      demo.session(id, remember); if (!u.verified) demo.sendOtp(id);
      apply({ uid: id, name: u.name, email: u.email, verified: u.verified }); ok();
    });
  },
  sendOtp: function (id) { var code = String(Math.floor(100000 + Math.random() * 900000)); ls.set('tn_otp', { id: id, code: code, t: Date.now() }); return code; },
  verify: function (code) {
    return new Promise(function (ok, no) {
      var o = ls.get('tn_otp', null);
      if (!o || !pending || o.id !== pending.uid) return no({ message: 'Mã đã hết hạn. Hãy bấm "Gửi lại mã".' });
      if (Date.now() - o.t > 10 * 60 * 1000) return no({ message: 'Mã đã hết hạn (quá 10 phút). Hãy bấm "Gửi lại mã".' });
      if (o.code !== code) return no({ message: 'Mã OTP không đúng.' });
      var us = demo.users(); us[o.id].verified = true; demo.save(us); ls.del('tn_otp');
      apply({ uid: o.id, name: us[o.id].name, email: us[o.id].email, verified: true }); ok();
    });
  },
  resend: function () { return Promise.resolve(demo.sendOtp(pending.uid)); },
  logout: function () { ls.del('tn_session'); try { sessionStorage.removeItem('tn_session'); } catch (e) {} apply(null); return Promise.resolve(); },
  reset: function () { return Promise.resolve(); },
  rename: function (name) { var us = demo.users(); us[cur.uid].name = name; demo.save(us); apply({ uid: cur.uid, name: name, email: cur.email, verified: true }); return Promise.resolve(); }
};

/* ================= Adapter: FIREBASE ================= */
var fb = {
  auth: null,
  init: function () {
    var base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    var load = function (src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = base + src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); };
    load('firebase-app-compat.js').then(function () { return load('firebase-auth-compat.js'); }).then(function () {
      firebase.initializeApp(cfg); fb.auth = firebase.auth();
      fb.auth.onAuthStateChanged(function (u) {
        if (!u) apply(null); else apply({ uid: u.uid, name: u.displayName || u.email.split('@')[0], email: u.email, verified: u.emailVerified });
        ready = true; fire(); route();
      });
    }).catch(function () { ready = true; fire(); route(); toast('Không tải được Firebase. Kiểm tra kết nối mạng.'); });
  },
  persist: function (remember) { var P = firebase.auth.Auth.Persistence; return fb.auth.setPersistence(remember ? P.LOCAL : P.SESSION); },
  register: function (name, email, pass) {
    return fb.persist(true).then(function () { return fb.auth.createUserWithEmailAndPassword(email, pass); })
      .then(function (c) { return c.user.updateProfile({ displayName: name }).then(function () { return c.user.sendEmailVerification(); }).then(function () { apply({ uid: c.user.uid, name: name, email: email, verified: false }); }); });
  },
  login: function (email, pass, remember) { return fb.persist(remember).then(function () { return fb.auth.signInWithEmailAndPassword(email, pass); }); },
  verify: function () {
    return fb.auth.currentUser.reload().then(function () {
      var u = fb.auth.currentUser; if (!u.emailVerified) throw { message: 'Chưa thấy xác thực. Hãy bấm vào liên kết trong email rồi thử lại.' };
      apply({ uid: u.uid, name: u.displayName || u.email, email: u.email, verified: true });
    });
  },
  resend: function () { return fb.auth.currentUser.sendEmailVerification(); },
  logout: function () { return fb.auth.signOut(); },
  reset: function (email) { return fb.auth.sendPasswordResetEmail(email); },
  rename: function (name) { return fb.auth.currentUser.updateProfile({ displayName: name }).then(function () { apply({ uid: cur.uid, name: name, email: cur.email, verified: true }); }); }
};
var A = MODE === 'firebase' ? fb : demo;

/* ================= Trạng thái ================= */
var lastUid = '\u0000';
function apply(u) {
  if (u && u.verified) { cur = u; pending = null; } else if (u) { cur = null; pending = u; } else { cur = null; pending = null; }
  renderMenu();
  var uid = cur ? cur.uid : 'guest';
  if (uid !== lastUid) { lastUid = uid; fire(); }
}
function fire() { window.dispatchEvent(new CustomEvent('auth-change')); }
function toast(m) { var t = $('#toast'); if (!t) return; t.innerHTML = '<span>' + esc(m) + '</span>'; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('on'); }, 3200); }

/* ================= Menu người dùng (góc trên) ================= */
function initial(n) { return esc((n || '?').trim().charAt(0).toUpperCase()); }
function renderMenu() {
  var m = $('#userMenu'); if (!m) return;
  if (!ready) { m.innerHTML = ''; return; }
  if (!cur) { m.innerHTML = '<a class="ub" href="#/dang-nhap">Đăng nhập</a><a class="ub fill" href="#/dang-ky">Đăng ký</a>'; return; }
  m.innerHTML = '<button class="ub user" id="umBtn" aria-haspopup="true" aria-expanded="false"><span class="av">' + initial(cur.name) + '</span><span class="un">' + esc(cur.name) + '</span> ▾</button>' +
    '<div class="um-pop" id="umPop" hidden><div class="um-h"><b>' + esc(cur.name) + '</b><small>' + esc(cur.email) + '</small></div>' +
    '<a href="#/tai-khoan">👤 Tài khoản của tôi</a><a href="#/da-luu">★ Bài đã lưu</a><button id="umOut">⎋ Đăng xuất</button></div>';
}
document.addEventListener('click', function (e) {
  var btn = e.target.closest('#umBtn'), pop = $('#umPop');
  if (btn && pop) { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); return; }
  if (pop && !e.target.closest('#umPop')) pop.hidden = true;
  if (pop && e.target.closest('#umPop a')) pop.hidden = true;
  if (e.target.closest('#umOut')) doLogout();
});
function doLogout() {
  A.logout().then(function () { toast('Đã đăng xuất'); location.hash = '#/'; });
}

/* ================= Màn hình xác thực ================= */
var PAGES = { 'dang-nhap': 1, 'dang-ky': 1, 'xac-thuc': 1, 'quen-mat-khau': 1, 'tai-khoan': 1 };
var LEFT = {
  'dang-nhap': ['Đăng nhập để tiếp tục khám phá những tin tức mới nhất.', 'Lưu bài, đánh dấu chỗ đọc và giữ tài khoản mỗi lần quay lại.'],
  'dang-ky': ['Tham gia BẢN TIN để không bỏ lỡ tin mới.', 'Tạo tài khoản miễn phí chỉ với vài bước.'],
  'xac-thuc': ['Xác thực tài khoản để tiếp tục đọc tin mới.', 'Bước cuối cùng để bảo vệ tài khoản của bạn.'],
  'quen-mat-khau': ['Quên mật khẩu? Đừng lo, chúng tôi giúp bạn.', 'Nhập email để nhận liên kết đặt lại mật khẩu.'],
  'tai-khoan': ['Quản lý tài khoản của bạn.', 'Cập nhật tên hiển thị và đăng xuất khi cần.']
};
function field(id, label, type, ph, extra) {
  var pw = type === 'password';
  return '<label class="f" for="' + id + '">' + label + '</label><div class="fi"><input id="' + id + '" type="' + type + '" placeholder="' + ph + '" ' + (extra || '') + '>' +
    (pw ? '<button type="button" class="eye" data-eye="' + id + '" aria-label="Hiện/ẩn mật khẩu">👁</button>' : '') + '</div>';
}
function modeNote() { return MODE === 'demo' ? '<div class="note">⚠ Chế độ DEMO: tài khoản chỉ lưu trong trình duyệt này và chưa gửi email/SMS thật. Dán cấu hình Firebase vào <code>firebase-config.js</code> để dùng thật.</div>' : ''; }

function cardFor(page) {
  if (page === 'dang-nhap') return '<h1>Đăng nhập</h1><p class="sub">Chào mừng bạn quay lại.</p><form id="fLogin" novalidate>' +
    field('lEmail', 'Email', 'email', 'ban@example.com', 'autocomplete="username"') + field('lPass', 'Mật khẩu', 'password', 'Nhập mật khẩu', 'autocomplete="current-password"') +
    '<div class="rowf"><label class="chk"><input type="checkbox" id="lRem" checked> Ghi nhớ đăng nhập</label><a href="#/quen-mat-khau">Quên mật khẩu?</a></div>' +
    '<div class="err" id="aErr" role="alert"></div><button class="pbtn" type="submit">Đăng nhập</button></form>' +
    '<p class="alt">Chưa có tài khoản? <a href="#/dang-ky">Đăng ký</a></p><p class="alt"><a href="#/">Tiếp tục không cần đăng nhập</a></p>' + modeNote();
  if (page === 'dang-ky') return '<h1>Đăng ký</h1><p class="sub">Tạo tài khoản mới.</p><form id="fReg" novalidate>' +
    field('rName', 'Họ và tên', 'text', 'Nguyễn Văn A', 'autocomplete="name"') + field('rEmail', 'Email', 'email', 'ban@example.com', 'autocomplete="email"') +
    field('rPass', 'Mật khẩu', 'password', 'Tối thiểu 6 ký tự', 'autocomplete="new-password"') + field('rPass2', 'Nhập lại mật khẩu', 'password', 'Nhập lại mật khẩu', 'autocomplete="new-password"') +
    '<div class="err" id="aErr" role="alert"></div><button class="pbtn" type="submit">Đăng ký</button></form>' +
    '<p class="alt">Đã có tài khoản? <a href="#/dang-nhap">Đăng nhập</a></p>' + modeNote();
  if (page === 'xac-thuc') {
    var email = pending ? esc(pending.email) : '';
    if (MODE === 'demo') {
      var o = ls.get('tn_otp', null);
      return '<h1>Nhập mã OTP</h1><p class="sub">Mã gồm 6 số đã được gửi tới <b>' + email + '</b>.</p><form id="fOtp" novalidate><div class="otp" id="otp">' +
        [0, 1, 2, 3, 4, 5].map(function (i) { return '<input inputmode="numeric" maxlength="1" data-o="' + i + '" aria-label="Số ' + (i + 1) + '">'; }).join('') + '</div>' +
        '<div class="err" id="aErr" role="alert"></div><button class="pbtn" type="submit">Xác nhận</button></form>' +
        '<p class="alt">Chưa nhận được mã? <a href="#" id="resend">Gửi lại mã</a></p><p class="alt"><a href="#" id="otherAcc">Dùng tài khoản khác</a></p>' +
        '<div class="note">Chế độ DEMO không gửi email thật. Mã của bạn: <b id="demoCode" style="letter-spacing:.2em">' + (o ? esc(o.code) : '') + '</b></div>';
    }
    return '<h1>Xác thực email</h1><p class="sub">Chúng tôi đã gửi một liên kết xác thực tới <b>' + email + '</b>. Hãy mở email, bấm vào liên kết, rồi quay lại đây.</p>' +
      '<div class="err" id="aErr" role="alert"></div><button class="pbtn" id="chk">Tôi đã xác thực</button>' +
      '<p class="alt">Không thấy email (kiểm tra cả thư rác)? <a href="#" id="resend">Gửi lại email</a></p><p class="alt"><a href="#" id="otherAcc">Dùng tài khoản khác</a></p>';
  }
  if (page === 'quen-mat-khau') return '<h1>Quên mật khẩu</h1><p class="sub">Nhập email để nhận liên kết đặt lại mật khẩu.</p><form id="fReset" novalidate>' +
    field('pEmail', 'Email', 'email', 'ban@example.com', 'autocomplete="email"') + '<div class="err" id="aErr" role="alert"></div><button class="pbtn" type="submit">Gửi liên kết</button></form>' +
    '<p class="alt"><a href="#/dang-nhap">← Quay lại đăng nhập</a></p>' + (MODE === 'demo' ? '<div class="note">Chế độ DEMO không gửi email thật.</div>' : '');
  if (page === 'tai-khoan') return '<h1>Tài khoản của tôi</h1><div class="prof"><span class="av big">' + initial(cur.name) + '</span><div><b>' + esc(cur.name) + '</b><br><small>' + esc(cur.email) + '</small></div></div>' +
    '<form id="fName" novalidate>' + field('nName', 'Tên hiển thị', 'text', 'Tên của bạn', 'value="' + esc(cur.name) + '"') + '<div class="err" id="aErr" role="alert"></div><button class="pbtn" type="submit">Lưu tên</button></form>' +
    '<button class="sbtn" id="chgPw">Gửi email đổi mật khẩu</button><button class="sbtn danger" id="outBtn">Đăng xuất</button><p class="alt"><a href="#/">← Về trang chủ</a></p>' + modeNote();
  return '';
}

function show(page) {
  var el = $('#auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; el.className = 'auth'; document.body.appendChild(el); }
  var L = LEFT[page];
  el.innerHTML = '<aside class="auth-l"><div class="brand-t">BẢN TIN</div><div class="bar"></div><h2>' + esc(L[0]) + '</h2><p>' + esc(L[1]) + '</p><a class="back" href="#/">← Về trang chủ</a></aside>' +
    '<section class="auth-r"><img class="auth-logo" src="logo.png" alt="Thiếu Niên"><div class="auth-card">' + cardFor(page) + '</div></section>';
  document.body.style.overflow = 'hidden'; el.scrollTop = 0; bind(page);
  var first = el.querySelector('input'); if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 50);
}
function hide() { var el = $('#auth'); if (el) el.remove(); document.body.style.overflow = ''; }
function err(m) { var e = $('#aErr'); if (e) e.textContent = m || ''; }
function busy(form, on) { var b = form && form.querySelector('.pbtn'); if (b) { b.disabled = on; b.dataset.t = b.dataset.t || b.textContent; b.textContent = on ? 'Vui lòng đợi…' : b.dataset.t; } }
var okEmail = function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); };

function bind(page) {
  var el = $('#auth');
  el.querySelectorAll('[data-eye]').forEach(function (b) { b.onclick = function () { var i = $('#' + b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; }; });
  var f;
  if ((f = $('#fLogin'))) f.onsubmit = function (e) {
    e.preventDefault(); var em = $('#lEmail').value.trim(), pw = $('#lPass').value; err('');
    if (!okEmail(em)) return err('Vui lòng nhập email hợp lệ.'); if (!pw) return err('Vui lòng nhập mật khẩu.');
    busy(f, true); A.login(em, pw, $('#lRem').checked).then(function () { next(); }).catch(function (x) { err(msg(x)); }).then(function () { busy(f, false); });
  };
  if ((f = $('#fReg'))) f.onsubmit = function (e) {
    e.preventDefault(); var n = $('#rName').value.trim(), em = $('#rEmail').value.trim(), p1 = $('#rPass').value, p2 = $('#rPass2').value; err('');
    if (n.length < 2) return err('Vui lòng nhập họ và tên.'); if (!okEmail(em)) return err('Vui lòng nhập email hợp lệ.');
    if (p1.length < 6) return err('Mật khẩu cần tối thiểu 6 ký tự.'); if (p1 !== p2) return err('Mật khẩu nhập lại không khớp.');
    busy(f, true); A.register(n, em, p1).then(function () { next(); }).catch(function (x) { err(msg(x)); }).then(function () { busy(f, false); });
  };
  if ((f = $('#fReset'))) f.onsubmit = function (e) {
    e.preventDefault(); var em = $('#pEmail').value.trim(); err(''); if (!okEmail(em)) return err('Vui lòng nhập email hợp lệ.');
    busy(f, true); A.reset(em).then(function () { toast('Nếu email tồn tại, liên kết đặt lại đã được gửi.'); location.hash = '#/dang-nhap'; }).catch(function (x) { err(msg(x)); }).then(function () { busy(f, false); });
  };
  if ((f = $('#fName'))) f.onsubmit = function (e) {
    e.preventDefault(); var n = $('#nName').value.trim(); err(''); if (n.length < 2) return err('Tên quá ngắn.');
    A.rename(n).then(function () { toast('Đã lưu tên hiển thị'); show('tai-khoan'); }).catch(function (x) { err(msg(x)); });
  };
  if ((f = $('#chgPw'))) f.onclick = function () { A.reset(cur.email).then(function () { toast(MODE === 'demo' ? 'Chế độ demo: chưa gửi email thật' : 'Đã gửi email đổi mật khẩu'); }).catch(function (x) { toast(msg(x)); }); };
  if ((f = $('#outBtn'))) f.onclick = doLogout;
  // OTP
  var boxes = el.querySelectorAll('[data-o]');
  if (boxes.length) {
    boxes.forEach(function (b, i) {
      b.oninput = function () { b.value = b.value.replace(/\D/g, '').slice(0, 1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); };
      b.onkeydown = function (e) { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); };
      b.onpaste = function (e) { var t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (!t) return; e.preventDefault(); boxes.forEach(function (x, k) { x.value = t[k] || ''; }); (boxes[Math.min(t.length, 5)]).focus(); };
    });
    $('#fOtp').onsubmit = function (e) {
      e.preventDefault(); var code = Array.prototype.map.call(boxes, function (b) { return b.value; }).join(''); err('');
      if (code.length < 6) return err('Vui lòng nhập đủ 6 số.');
      demo.verify(code).then(function () { toast('Xác thực thành công'); next(); }).catch(function (x) { err(msg(x)); });
    };
  }
  if ((f = $('#chk'))) f.onclick = function () { err(''); A.verify().then(function () { toast('Xác thực thành công'); next(); }).catch(function (x) { err(msg(x)); }); };
  if ((f = $('#resend'))) f.onclick = function (e) {
    e.preventDefault(); Promise.resolve(A.resend()).then(function (c) { toast(MODE === 'demo' ? 'Đã tạo mã mới' : 'Đã gửi lại email'); if (MODE === 'demo') { var d = $('#demoCode'); if (d) d.textContent = c; } }).catch(function (x) { toast(msg(x)); });
  };
  if ((f = $('#otherAcc'))) f.onclick = function (e) { e.preventDefault(); A.logout().then(function () { location.hash = '#/dang-nhap'; }); };
}
function next() {
  var back = sessionStorage.getItem('tn_back'); try { sessionStorage.removeItem('tn_back'); } catch (e) {}
  if (pending) { if (location.hash === '#/xac-thuc') show('xac-thuc'); else location.hash = '#/xac-thuc'; return; }
  location.hash = back || '#/';
}

/* ================= Định tuyến ================= */
function route() {
  renderMenu();
  var m = (location.hash || '').match(/^#\/([a-z-]+)/), page = m && PAGES[m[1]] ? m[1] : null;
  if (!page) { hide(); return; }
  if (!ready) { hide(); return; }
  if (page === 'tai-khoan' && !cur) { location.replace(pending ? '#/xac-thuc' : '#/dang-nhap'); return; }
  if (page === 'xac-thuc' && !pending) { location.replace(cur ? '#/' : '#/dang-nhap'); return; }
  if ((page === 'dang-nhap' || page === 'dang-ky') && cur) { location.replace('#/'); return; }
  if (pending && (page === 'dang-nhap' || page === 'dang-ky')) { location.replace('#/xac-thuc'); return; }
  show(page);
}
window.addEventListener('hashchange', route);
window.addEventListener('auth-change', function () { route(); });

window.Auth = { mode: MODE, uid: function () { return cur ? cur.uid : 'guest'; }, user: function () { return cur; } };
document.addEventListener('DOMContentLoaded', function () { renderMenu(); });
renderMenu();
A.init();
})();
