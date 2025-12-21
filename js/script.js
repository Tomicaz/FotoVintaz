(function () {
  'use strict';

  const prints = Array.from(document.querySelectorAll('.print'));
  let currentIndex = -1;
  let overlay, viewer;
  let isAnimating = false;
  const preloadCache = new Map();
  const dwellTimeouts = new Map();

  // --- SCROLL HEADER LOGIC VARS ---
  const header = document.querySelector('.site-header');
  let lastScrollY = window.scrollY;
  let scrollDistance = 0;
  const SCROLL_THRESHOLD = 20; // 20px requirement

  // --- 1. CLOUDINARY URL OPTIMIZER ---
  function getOptimizedUrl(url) {
    if (!url.includes('cloudinary.com')) return url;
    return url.replace('/upload/', '/upload/q_auto,f_auto,w_2000,c_limit/');
  }

  // --- 2. SCROLL REVEAL (0.5s DWELL) ---
  function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const target = entry.target;
        if (entry.isIntersecting) {
          if (target.classList.contains('visible')) return;
          const timeout = setTimeout(() => {
            target.classList.add('visible');
            dwellTimeouts.delete(target);
          }, 500);
          dwellTimeouts.set(target, timeout);
        } else {
          if (dwellTimeouts.has(target)) {
            clearTimeout(dwellTimeouts.get(target));
            dwellTimeouts.delete(target);
          }
        }
      });
    }, { threshold: 0.1 });

    prints.forEach(p => {
      const img = p.querySelector('img');
      if (img) img.classList.add('photo-frame');
      observer.observe(p);
    });
  }

  // --- 3. PRELOADING ---
  async function preloadImage(index) {
    if (index < 0 || index >= prints.length) return;
    const rawUrl = prints[index].getAttribute('href');
    const optimizedUrl = getOptimizedUrl(rawUrl);
    if (preloadCache.has(optimizedUrl)) return preloadCache.get(optimizedUrl);
    const img = new Image();
    img.src = optimizedUrl;
    const promise = img.decode().then(() => img).catch(() => img);
    preloadCache.set(optimizedUrl, promise);
    return promise;
  }

  function preloadNeighbors(index) {
    preloadImage((index + 1) % prints.length);
    preloadImage((index - 1 + prints.length) % prints.length);
  }

  // --- 4. CREATE MODAL FRAME ---
  function createFrame(index) {
    const anchor = prints[index];
    const thumb = anchor.querySelector('img');
    const fullSrc = getOptimizedUrl(anchor.getAttribute('href'));
    const originalSrc = anchor.getAttribute('href');
    const capElement = anchor.querySelector('.print-caption');
    const capText = capElement ? capElement.textContent : "";

    const frame = document.createElement('div');
    frame.className = 'gv-content-item';

    frame.style.cssText = `
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.4s ease, transform 650ms cubic-bezier(0.16, 1, 0.3, 1);
      width: max-content;
      max-width: 94vw;
      flex: 0 0 auto;
      margin: auto;
    `;

    const imgContainer = document.createElement('div');
    imgContainer.className = 'gv-img-container';
    imgContainer.style.cursor = 'zoom-in';

    imgContainer.onclick = (e) => {
      e.stopPropagation();
      window.open(originalSrc, '_blank');
    };

    const thumbImg = document.createElement('img');
    thumbImg.className = 'gv-image';
    thumbImg.src = thumb.src;

    const fullImg = document.createElement('img');
    fullImg.className = 'gv-image gv-image-full';
    fullImg.src = fullSrc;

    const reveal = () => {
      if (thumb.naturalWidth > 0) {
        frame.style.aspectRatio = `${thumb.naturalWidth} / ${thumb.naturalHeight}`;
      }
      frame.classList.add('photo-frame');
      fullImg.classList.add('gv-loaded');
      frame.style.visibility = 'visible';
      frame.style.opacity = '1';
    };

    if (fullImg.complete) {
      reveal();
    } else {
      fullImg.decode().then(reveal).catch(reveal);
    }

    imgContainer.append(thumbImg, fullImg);
    frame.append(imgContainer);

    if (capText) {
      const cap = document.createElement('div');
      cap.className = 'gv-modal-caption';
      cap.textContent = capText;
      frame.append(cap);
    }
    return frame;
  }

  // --- 5. NAVIGATION ---
  async function navigate(direction) {
    if (isAnimating) return;
    isAnimating = true;

    const oldFrame = viewer.querySelector('.gv-content-item');
    currentIndex = (currentIndex + direction + prints.length) % prints.length;

    await preloadImage(currentIndex);

    const newFrame = createFrame(currentIndex);
    newFrame.classList.add(direction === 1 ? 'enter-right' : 'enter-left');
    viewer.appendChild(newFrame);

    void newFrame.offsetWidth;
    void newFrame.getBoundingClientRect();

    requestAnimationFrame(() => {
      if (oldFrame) {
        oldFrame.classList.add(direction === 1 ? 'exit-left' : 'exit-right');
        oldFrame.style.opacity = '0';
      }
      newFrame.classList.remove('enter-right', 'enter-left');
      newFrame.style.transform = 'translate3d(0, 0, 0)';
    });

    setTimeout(() => {
      if (oldFrame) oldFrame.remove();
      isAnimating = false;
      preloadNeighbors(currentIndex);
    }, 650);
  }

  // --- 6. SWIPE GESTURES ---
  let touchStartX = 0;
  let touchEndX = 0;
  function handleSwipe() {
    const threshold = 50;
    if (touchEndX < touchStartX - threshold) navigate(1);
    if (touchEndX > touchStartX + threshold) navigate(-1);
  }

  // --- 7. MODAL CORE ---
  function initModal() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'gv-overlay';
    overlay.innerHTML = `
      <button class="gv-close" aria-label="Close">x</button>
      <button class="gv-arrow gv-arrow--left" aria-label="Prev">&lt;</button>
      <div class="gv-viewer"></div>
      <button class="gv-arrow gv-arrow--right" aria-label="Next">&gt;</button>
    `;
    document.body.appendChild(overlay);
    viewer = overlay.querySelector('.gv-viewer');

    overlay.querySelector('.gv-close').onclick = closeOverlay;
    overlay.querySelector('.gv-arrow--left').onclick = (e) => { e.stopPropagation(); navigate(-1); };
    overlay.querySelector('.gv-arrow--right').onclick = (e) => { e.stopPropagation(); navigate(1); };

    overlay.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, {passive: true});
    overlay.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; handleSwipe(); }, {passive: true});
    overlay.onclick = (e) => { if (e.target === overlay || e.target === viewer) closeOverlay(); };
  }

  async function openOverlay(index) {
    initModal();
    currentIndex = index;
    viewer.innerHTML = '';

    await preloadImage(index);

    viewer.appendChild(createFrame(index));
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    preloadNeighbors(index);
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.style.display = 'none';
    viewer.innerHTML = '';
    document.body.style.overflow = '';
    isAnimating = false;
  }

  // --- 8. HEADER SCROLL ANIMATION ---
  function handleHeaderScroll() {
    if (!header) return;

    const currentScrollY = window.scrollY;
    const diff = currentScrollY - lastScrollY;

    // Accumulate scroll distance in the current direction
    if ((diff > 0 && scrollDistance < 0) || (diff < 0 && scrollDistance > 0)) {
      scrollDistance = 0; // Reset if direction changed
    }
    scrollDistance += diff;

    // Trigger action only if distance exceeds threshold
    if (Math.abs(scrollDistance) >= SCROLL_THRESHOLD) {
      if (scrollDistance > 0 && currentScrollY > 100) {
        // Downward scroll
        const navCheck = document.getElementById('nav-check');
        if (navCheck && !navCheck.checked) {
          header.classList.add('hidden');
        }
      } else if (scrollDistance < 0) {
        // Upward scroll
        header.classList.remove('hidden');
      }
      scrollDistance = 0; // Reset after triggering
    }

    lastScrollY = currentScrollY;
  }

  // --- INIT ---
  prints.forEach((a, i) => {
    a.onclick = (e) => { e.preventDefault(); openOverlay(i); };
  });

  document.addEventListener('keydown', (e) => {
    if (overlay?.style.display === 'flex') {
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'Escape') closeOverlay();
    }
  });

  window.addEventListener('scroll', handleHeaderScroll, { passive: true });

  initScrollReveal();
})();