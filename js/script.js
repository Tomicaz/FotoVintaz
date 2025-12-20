(function () {
  'use strict';

  const prints = Array.from(document.querySelectorAll('.print'));
  let currentIndex = -1;
  let overlay, viewer;
  let isAnimating = false;
  const preloadCache = new Map();
  const dwellTimeouts = new Map();

  // SWIPE LOGIC VARS
  let touchStartX = 0;
  let touchEndX = 0;

  // --- 1. CLOUDINARY URL OPTIMIZER ---
  function getOptimizedUrl(url) {
    if (!url.includes('cloudinary.com')) return url;
    // Requests WebP/AVIF, auto quality, and resizes to screen-friendly width
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
          }, 500); // 0.5s requirement
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

  // --- 3. PRELOADING & GPU DECODING ---
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
    const capElement = anchor.querySelector('.print-caption');
    const capText = capElement ? capElement.textContent : "";

    const frame = document.createElement('div');
    frame.className = 'gv-content-item photo-frame';
    if (thumb.naturalWidth > 0) {
      frame.style.aspectRatio = `${thumb.naturalWidth} / ${thumb.naturalHeight}`;
    }

    const imgContainer = document.createElement('div');
    imgContainer.className = 'gv-img-container';

    const thumbImg = document.createElement('img');
    thumbImg.className = 'gv-image';
    thumbImg.src = thumb.src;

    const fullImg = document.createElement('img');
    fullImg.className = 'gv-image gv-image-full';
    fullImg.src = fullSrc;

    if (fullImg.complete) fullImg.classList.add('gv-loaded');
    else fullImg.onload = () => fullImg.classList.add('gv-loaded');

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

    requestAnimationFrame(() => {
      if (oldFrame) oldFrame.classList.add(direction === 1 ? 'exit-left' : 'exit-right');
      newFrame.classList.remove('enter-right', 'enter-left');
      newFrame.style.transform = 'translate3d(0, 0, 0)';
      newFrame.style.opacity = '1';
    });

    setTimeout(() => {
      if (oldFrame) oldFrame.remove();
      isAnimating = false;
      preloadNeighbors(currentIndex);
    }, 650);
  }

  // --- 6. SWIPE GESTURES ---
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
      <button class="gv-close" aria-label="Close">&times;</button>
      <button class="gv-arrow gv-arrow--left" aria-label="Prev">&#10094;</button>
      <div class="gv-viewer"></div>
      <button class="gv-arrow gv-arrow--right" aria-label="Next">&#10095;</button>
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

  function openOverlay(index) {
    initModal();
    currentIndex = index;
    viewer.innerHTML = '';
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

  initScrollReveal();
})();