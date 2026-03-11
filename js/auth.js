// ================================================
// XRAYNEWS - Authentication
// Uses @supabase/supabase-js v2 loaded from CDN
// ================================================

// Supabase URL and ANON_KEY come from supabase-config.js (window.XrayNewsDB)

var GUEST_FLAG_KEY    = 'gw_guest_mode';
var _supaClient       = null;

function _getClient() {
  if (_supaClient) return _supaClient;
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    _supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supaClient;
}

// ------------------------------------------------
// Login Page Auth
// ------------------------------------------------
document.addEventListener('DOMContentLoaded', function() {
  if (!document.getElementById('login-form')) return; // not login page
  _initLoginPage();
});

function _initLoginPage() {
  var form      = document.getElementById('login-form');
  var emailInp  = document.getElementById('email-input');
  var pwInp     = document.getElementById('password-input');
  var pwToggle  = document.getElementById('pw-toggle');
  var switchLink= document.getElementById('switch-link');
  var switchTxt = document.getElementById('switch-text');
  var formTitle = document.getElementById('form-title');
  var formSub   = document.getElementById('form-subtitle');
  var signinBtn = document.getElementById('signin-btn');
  var guestBtn  = document.getElementById('guest-btn');
  var isSignUp  = false;

  // Check if already logged in
  var client = _getClient();
  if (client) {
    client.auth.getSession().then(function(res) {
      if (res.data && res.data.session) {
        window.location.href = 'dashboard.html';
      }
    });
  } else if (localStorage.getItem(GUEST_FLAG_KEY) === '1') {
    window.location.href = 'dashboard.html';
  }

  // Password show/hide
  if (pwToggle) {
    pwToggle.addEventListener('click', function() {
      var type = pwInp.type === 'password' ? 'text' : 'password';
      pwInp.type = type;
      pwToggle.innerHTML = type === 'password' ? '&#128065;' : '&#128064;';
    });
  }

  // Toggle sign-in / sign-up
  if (switchLink) {
    switchLink.addEventListener('click', function() {
      isSignUp = !isSignUp;
      if (isSignUp) {
        formTitle.textContent  = 'Create Account';
        formSub.textContent    = 'Join XrayNews — free during beta.';
        switchTxt.innerHTML    = 'Already have an account? ';
        switchLink.textContent = 'Sign In';
        signinBtn.querySelector('.btn-text').textContent = 'CREATE ACCOUNT';
      } else {
        formTitle.textContent  = 'Welcome Back';
        formSub.textContent    = 'Sign in to access your XrayNews dashboard.';
        switchTxt.innerHTML    = 'Don&#39;t have an account? ';
        switchLink.textContent = 'Create Account';
        signinBtn.querySelector('.btn-text').textContent = 'SIGN IN';
      }
      _clearMessage();
    });
  }

  // Form submit
  if (form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      var email = (emailInp.value || '').trim();
      var pw    = (pwInp.value   || '').trim();
      if (!email || !pw) { _showMessage('Please fill in all fields.', 'error'); return; }
      _setLoading(true);
      _clearMessage();
      try {
        var client = _getClient();
        if (!client) throw new Error('Supabase client not loaded — check CDN.');
        if (isSignUp) {
          var res = await client.auth.signUp({ email: email, password: pw });
          if (res.error) throw res.error;
          _showMessage('Account created! Check your email to confirm, or sign in now.', 'success');
          isSignUp = false;
          switchLink.click();
        } else {
          var res = await client.auth.signInWithPassword({ email: email, password: pw });
          if (res.error) throw res.error;
          localStorage.removeItem(GUEST_FLAG_KEY);
          window.location.href = 'dashboard.html';
        }
      } catch(err) {
        _showMessage(err.message || 'Authentication failed.', 'error');
      } finally {
        _setLoading(false);
      }
    });
  }

  // Guest mode
  if (guestBtn) {
    guestBtn.addEventListener('click', function() {
      localStorage.setItem(GUEST_FLAG_KEY, '1');
      window.location.href = 'dashboard.html';
    });
  }
}

function _showMessage(msg, type) {
  var el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent  = msg;
  el.className    = 'auth-message auth-msg-' + (type || 'info');
  el.style.display= 'block';
}
function _clearMessage() {
  var el = document.getElementById('auth-message');
  if (el) { el.textContent=''; el.style.display='none'; }
}
function _setLoading(on) {
  var btn = document.getElementById('signin-btn');
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('loading', on);
}

// ------------------------------------------------
// Dashboard Auth Guard
// ------------------------------------------------
async function initDashboardAuth(autoGuest) {
  // Guest bypass — also auto-grant guest if autoGuest=true and no session
  if (localStorage.getItem(GUEST_FLAG_KEY) === '1') {
    _applyGuestUI();
    return { isGuest: true, user: { email: 'Guest' } };
  }
  var client = _getClient();
  if (!client) {
    console.warn('[Auth] Supabase client unavailable — allowing guest fallback');
    _applyGuestUI();
    return { isGuest: true, user: { email: 'Guest' } };
  }
  var res = await client.auth.getSession().catch(function(){ return null; });
  var session = res && res.data && res.data.session ? res.data.session : null;
  if (!session) {
    if (autoGuest) {
      // Auto-grant guest access instead of redirecting
      localStorage.setItem(GUEST_FLAG_KEY, '1');
      _applyGuestUI();
      return { isGuest: true, user: { email: 'Guest' } };
    }
    window.location.href = 'index.html';
    return null;
  }
  _applyUserUI(session.user);
  // Listen for auth changes
  client.auth.onAuthStateChange(function(event, sess) {
    if (event === 'SIGNED_OUT' || !sess) window.location.href = 'index.html';
  });
  // Sign out button
  var soBtn = document.getElementById('signout-btn');
  if (soBtn) soBtn.addEventListener('click', async function() {
    await client.auth.signOut().catch(function(){});
    localStorage.removeItem(GUEST_FLAG_KEY);
    window.location.href = 'index.html';
  });
  return { isGuest: false, user: session.user };
}

function _applyUserUI(user) {
  var email    = (user && user.email) || '';
  var initial  = email ? email[0].toUpperCase() : '?';
  var username = email.split('@')[0] || 'User';
  var avatar   = document.getElementById('nav-avatar');
  var uname    = document.getElementById('nav-username');
  var emailEl  = document.getElementById('user-email-display');
  if (avatar)  avatar.textContent  = initial;
  if (uname)   uname.textContent   = username;
  if (emailEl) emailEl.textContent = email;
}

function _applyGuestUI() {
  var avatar  = document.getElementById('nav-avatar');
  var uname   = document.getElementById('nav-username');
  var emailEl = document.getElementById('user-email-display');
  if (avatar)  avatar.textContent  = 'G';
  if (uname)   uname.textContent   = 'Guest';
  if (emailEl) emailEl.textContent = 'Guest Mode (read-only)';
  // Wire sign out as guest logout
  var soBtn = document.getElementById('signout-btn');
  if (soBtn) soBtn.addEventListener('click', function() {
    localStorage.removeItem(GUEST_FLAG_KEY);
    window.location.href = 'index.html';
  });
}

// ------------------------------------------------
// Login page globe (mini, atmospheric)
// ------------------------------------------------
function initLoginGlobe() {
  var el = document.getElementById('login-globe');
  if (!el || typeof Globe === 'undefined') return;
  var g = Globe()
    .width(window.innerWidth)
    .height(window.innerHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .atmosphereColor('rgba(0,212,255,0.6)')
    .atmosphereAltitude(0.22)
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg');
  g(el);
  var ctrl = g.controls();
  ctrl.autoRotate      = true;
  ctrl.autoRotateSpeed = 0.18;
  ctrl.enableZoom      = false;
  ctrl.enableRotate    = false;
  g.pointOfView({ lat: 20, lng: 0, altitude: 2.8 });
  window.addEventListener('resize', function() { g.width(window.innerWidth).height(window.innerHeight); });
}

// Starfield canvas
document.addEventListener('DOMContentLoaded', function() {
  var canvas = document.getElementById('starfield-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  var stars = [];
  for (var i = 0; i < 220; i++) {
    stars.push({
      x:   Math.random() * canvas.width,
      y:   Math.random() * canvas.height,
      r:   Math.random() * 1.4 + 0.2,
      a:   Math.random(),
      da:  (Math.random() - 0.5) * 0.004
    });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(function(s) {
      s.a += s.da;
      if (s.a <= 0 || s.a >= 1) s.da *= -1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,' + s.a + ')';
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
  window.addEventListener('resize', function() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  });
});
