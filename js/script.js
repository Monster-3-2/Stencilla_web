/* =============================================================
   STENCILLA — main.js
   ============================================================= */

/* ── 1. SCROLL-SCRUBBED VIDEO (smooth interpolated) ─────────── */
const scrubVideos = Array.from(document.querySelectorAll('video.scrub'));
scrubVideos.forEach(v => v.pause());

const scrubBar     = document.getElementById('scrubBar');
const CIRC         = 88;          // circumference ≈ 2π×14
const SCRUB_START  = 1.2;         // skip dark opening frames
const SCRUB_END_P  = 0.4;         // buffer before last frame
const LERP_SPEED   = 0.072;       // 0–1: lower = more lag/smoothness
const SEEK_THRESH  = 0.02;        // only seek when drift > this (seconds)
const FAIL_LIMIT   = 20;          // retries before ambient-play fallback

// Per-video state
const pendingSeek  = new WeakMap();
const seekFails    = new WeakMap();
const seekDisabled = new WeakMap();

function getVideoDuration(){
  for(const v of scrubVideos)
    if(v.duration && !isNaN(v.duration) && v.duration > 0) return v.duration;
  return 0;
}

function getScrollProgress(){
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
}

function targetTime(progress, duration){
  const usable = Math.max(duration - SCRUB_START - SCRUB_END_P, 0.5);
  return SCRUB_START + progress * usable;
}

function fallbackPlay(v){
  seekDisabled.set(v, true);
  v.loop = true;
  v.muted = true;
  v.play().catch(() => {});
}

function doSeek(v, t){
  if(seekDisabled.get(v)) return;
  if(v.readyState < 1) return;
  const delta = Math.abs(v.currentTime - t);
  if(delta < SEEK_THRESH) return;               // already close enough
  const prev = pendingSeek.get(v);
  pendingSeek.set(v, t);
  try { v.currentTime = t; } catch(e){}
  // Self-correction: if position isn't landing, count failures
  if(prev !== undefined && Math.abs((v.currentTime) - prev) < 0.01){
    const fails = (seekFails.get(v) || 0) + 1;
    seekFails.set(v, fails);
    if(fails > FAIL_LIMIT) fallbackPlay(v);
  } else {
    seekFails.set(v, 0);
  }
}

// Smoothly interpolated scrub — runs every animation frame
let currentProgress = 0;   // lerped display position (0-1)
let rafId = null;

function scrubLoop(){
  const raw      = getScrollProgress();
  // lerp toward raw scroll position — this is what creates silky smoothness
  currentProgress += (raw - currentProgress) * LERP_SPEED;

  // snap to exact position when very close to avoid endless near-zero drift
  if(Math.abs(raw - currentProgress) < 0.0005) currentProgress = raw;

  const duration = getVideoDuration();
  if(duration){
    const t = targetTime(currentProgress, duration);
    scrubVideos.forEach(v => doSeek(v, t));
  }

  if(scrubBar){
    scrubBar.style.strokeDashoffset = (CIRC * (1 - currentProgress)).toFixed(2);
  }

  rafId = requestAnimationFrame(scrubLoop);
}

// Start the loop once the first video is ready
function startScrubLoop(){
  if(!rafId) rafId = requestAnimationFrame(scrubLoop);
}

scrubVideos.forEach(v => v.addEventListener('loadedmetadata', startScrubLoop));
startScrubLoop();  // also try immediately in case already loaded


/* ── 1b. HERO CARD — independent autoplay, never scroll-synced ── */
(function(){
  const heroVid = document.getElementById('heroScrubVideo');
  if(!heroVid) return;
  // Ensure it is fully independent — not in scrubVideos, not paused by scrub logic
  heroVid.muted = true;
  heroVid.loop  = true;
  heroVid.playsInline = true;
  // Try to play immediately; if blocked, play on first user interaction
  heroVid.play().catch(() => {
    const unlock = () => {
      heroVid.play().catch(() => {});
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('scroll', unlock);
    };
    window.addEventListener('click', unlock, {once:true});
    window.addEventListener('touchstart', unlock, {once:true});
    window.addEventListener('scroll', unlock, {once:true});
  });
})();

/* ── 2. SMOOTH SCROLL — header-offset-aware ──────────────────── */
function scrollToSection(el){
  const header = document.querySelector('header');
  const offset = (header ? header.offsetHeight : 0) + 20;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

// data-target buttons (top bar — pure scroll, no href, no URL change)
document.querySelectorAll('[data-target]').forEach(btn => {
  btn.addEventListener('click', () => {
    const el = document.querySelector(btn.dataset.target);
    if(el) scrollToSection(el);
  });
});

// Regular anchor links in page content
document.querySelectorAll('a[href^="#"]').forEach(link => {
  const hash = link.getAttribute('href');
  if(!hash || hash === '#'){
    link.addEventListener('click', e => e.preventDefault());
    return;
  }
  link.addEventListener('click', e => {
    const el = document.querySelector(hash);
    if(el){ e.preventDefault(); scrollToSection(el); }
  });
});


/* ── 3. REVEAL ON SCROLL ─────────────────────────────────────── */
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if(e.isIntersecting){
      e.target.classList.add('in-view');
      revealIO.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealIO.observe(el));


/* ── 4. NAV — scroll-shadow + active section ─────────────────── */
const navInner = document.getElementById('navInner');
const navBtns  = document.querySelectorAll('.nav-links button');

window.addEventListener('scroll', () => {
  if(navInner){
    navInner.style.boxShadow = window.scrollY > 30
      ? '0 12px 40px rgba(0,0,0,.4)'
      : '';
  }
}, { passive: true });

const sectionIds = ['product','features','solutions','testimonials','pricing'];
const navSpy = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      const id = entry.target.id;
      navBtns.forEach(b => b.classList.toggle('active', b.dataset.nav === id));
    }
  });
}, { rootMargin: '-38% 0px -50% 0px', threshold: 0 });

sectionIds.map(id => document.getElementById(id)).filter(Boolean)
  .forEach(s => navSpy.observe(s));


/* ── 5. MOBILE NAV TOGGLE ────────────────────────────────────── */
const navToggle = document.getElementById('navToggle');
const navList   = document.getElementById('navLinksList');
if(navToggle && navList){
  navToggle.addEventListener('click', () => {
    const open = navList.classList.toggle('mobile-open');
    navToggle.setAttribute('aria-expanded', open);
  });
  // Close when a nav button is tapped
  navList.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      navList.classList.remove('mobile-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}


/* ── 6. COUNT-UP STATS ───────────────────────────────────────── */
const countIO = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(!entry.isIntersecting) return;
    const el     = entry.target;
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    const isNeg  = target < 0;
    const abs    = Math.abs(target);
    const dur    = 1600;
    const start  = performance.now();
    function tick(now){
      const p      = Math.min((now - start) / dur, 1);
      const eased  = 1 - Math.pow(1 - p, 3);
      const cur    = Math.round(abs * eased);
      el.textContent = (isNeg ? '-' : (target > 0 && suffix.includes('%') ? '+' : '')) + cur + suffix;
      if(p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    countIO.unobserve(el);
  });
}, { threshold: 0.5 });

document.querySelectorAll('[data-count]').forEach(c => countIO.observe(c));


/* ── 7. FEATURE SPOTLIGHT CROSSFADE ─────────────────────────── */
const spotVisuals = document.querySelectorAll('.spotlight-visual');
const spotIO = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      const id = entry.target.dataset.spot;
      spotVisuals.forEach(v => v.classList.toggle('active', v.dataset.visual === id));
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.spotlight-item').forEach(el => spotIO.observe(el));
