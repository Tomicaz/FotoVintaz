(function () {
  'use strict';

  const prints = Array.from(document.querySelectorAll('.print'));
  let currentIndex = -1;
  let overlay, viewer;
  let isAnimating = false;
  const preloadCache = new Map();
  const dwellTimeouts = new Map();

  let touchStartX = 0;
  let touchEndX = 0;

  const icons = {
    left: `<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>`,
    right: `<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>`
  };

  function getOptimizedUrl(url) {
    if (!url || !url.includes('cloudinary.com')) return url;
    return url.replace('/upload/', '/upload/q_auto:good,f_auto,w_1800,c_limit/');
  }

  function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = entry.target;
          if (target.classList.contains('visible')) return;
          const timeout = setTimeout(() => {
            target.classList.add('visible');
          }, 500);
          dwellTimeouts.set(target, timeout);
        }
      });
    }, { threshold: 0.05 });

    prints.forEach(p => {
      const img = p.querySelector('img');
      if (img) img.classList.add('photo-frame');
      observer.observe(p);
    });
  }

  async function preloadImage(index) {
    if (index < 0 || index >= prints.length) return;
    const url = getOptimizedUrl(prints[index].getAttribute('href'));
    if (preloadCache.has(url)) return preloadCache.get(url);
    const img = new Image();
    img.src = url;
    const p = img.decode().then(() => img).catch(() => img);
    preloadCache.set(url, p);
    return p;
  }

  function createFrame(index) {
    const anchor = prints[index];
    const thumb = anchor.querySelector('img');
    const fullSrc = getOptimizedUrl(anchor.getAttribute('href'));
    const originalSrc = anchor.getAttribute('href');
    const capText = anchor.querySelector('.print-caption')?.textContent || "";

    const frame = document.createElement('div');
    frame.className = 'gv-content-item photo-frame';

    // CRITICAL FIX: Set width/height immediately from thumb to prevent resizing
    // We use the thumbnail's bounding box as the blueprint
    const thumbRect = thumb.getBoundingClientRect();
    const ratio = thumb.naturalWidth / thumb.naturalHeight;

    // Determine the max width the image should take based on screen
    const screenW = window.innerWidth * 0.9;
    const screenH = window.innerHeight * 0.72;

    let targetW = screenH * ratio;
    if (targetW > screenW) targetW = screenW;

    frame.style.width = `${Math.round(targetW)}px`;

    const imgContainer = document.createElement('div');
    imgContainer.className = 'gv-img-container';
    imgContainer.onclick = (e) => { e.stopPropagation(); window.open(originalSrc, '_blank'); };

    const thumbImg = document.createElement('img');
    thumbImg.className = 'gv-image';
    thumbImg.src = thumb.src;

    const fullImg = document.createElement('img');
    fullImg.className = 'gv-image gv-image-full';
    fullImg.src = fullSrc;
    fullImg.onload = () => fullImg.classList.add('gv-loaded');

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

  async function navigate(direction) {
    if (isAnimating) return;
    isAnimating = true;

    const oldFrame = viewer.querySelector('.gv-content-item');
    currentIndex = (currentIndex + direction + prints.length) % prints.length;

    const newFrame = createFrame(currentIndex);
    newFrame.classList.add(direction === 1 ? 'enter-right' : 'enter-left');
    viewer.appendChild(newFrame);

    void newFrame.offsetWidth;

    requestAnimationFrame(() => {
      if (oldFrame) {
        oldFrame.classList.add(direction === 1 ? 'exit-left' : 'exit-right');
        oldFrame.classList.remove('ready');
      }
      newFrame.classList.remove('enter-right', 'enter-left');
      newFrame.classList.add('ready');
    });

    setTimeout(() => {
      if (oldFrame) oldFrame.remove();
      isAnimating = false;
      preloadImage((currentIndex + 1) % prints.length);
      preloadImage((currentIndex - 1 + prints.length) % prints.length);
    }, 600);
  }

  function initModal() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'gv-overlay';
    overlay.innerHTML = `
      <button class="gv-close">${icons.close}</button>
      <button class="gv-arrow gv-arrow--left">${icons.left}</button>
      <div class="gv-viewer"></div>
      <button class="gv-arrow gv-arrow--right">${icons.right}</button>
    `;
    document.body.appendChild(overlay);
    viewer = overlay.querySelector('.gv-viewer');

    overlay.querySelector('.gv-close').onclick = closeOverlay;
    overlay.querySelector('.gv-arrow--left').onclick = (e) => { e.stopPropagation(); navigate(-1); };
    overlay.querySelector('.gv-arrow--right').onclick = (e) => { e.stopPropagation(); navigate(1); };

    overlay.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, {passive: true});
    overlay.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) navigate(diff > 0 ? 1 : -1);
    }, {passive: true});

    overlay.onclick = (e) => { if (e.target === overlay || e.target === viewer) closeOverlay(); };
  }

  function openOverlay(index) {
    initModal();
    currentIndex = index;
    viewer.innerHTML = '';
    const firstFrame = createFrame(index);
    viewer.appendChild(firstFrame);
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      firstFrame.classList.add('ready');
    });

    preloadImage((index + 1) % prints.length);
    preloadImage((index - 1 + prints.length) % prints.length);
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.style.display = 'none';
    viewer.innerHTML = '';
    document.body.style.overflow = '';
    isAnimating = false;
  }

  prints.forEach((a, i) => {
    a.onclick = (e) => { e.preventDefault(); openOverlay(i); };
  });

  document.addEventListener('keydown', (e) => {
    if (overlay?.style.display === 'block') {
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'Escape') closeOverlay();
    }
  });

  initScrollReveal();
})();