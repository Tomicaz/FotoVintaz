(function () {
  'use strict';

  /* -------------------------
     1. Inject CSS
  ------------------------- */
  const injectedCSS = `
.gv-film-hover { transition: transform 220ms ease; transform-origin: center center; }
.gv-film-hover.gv-hovered { transform: scale(1.035); box-shadow: 6px 6px 10px rgba(0,0,0,0.18); }

.gv-overlay { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(6,6,6,0.96); z-index: 9999; padding: 0; -webkit-tap-highlight-color: transparent; }

.gv-viewer { position: relative; max-width: 100%; max-height: 100%; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center; overflow: hidden; }

/* Wrapper for Image + Caption unit */
.gv-content-item {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center;
  will-change: transform, opacity; width: auto; max-width: 100vw;
}

.gv-image {
  display: block; transition: opacity 320ms ease; user-select: none; -webkit-user-drag: none;
  max-width: 100vw; max-height: 78vh; box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  object-fit: contain; opacity: 0;
}

.gv-image.gv-loaded { opacity: 1; }

.gv-caption {
  margin-top: 12px; color: rgba(255,255,255,0.86); font-family: 'Roboto Mono', monospace;
  font-size: 14px; text-align: center; pointer-events: none; max-width: 90%;
  opacity: 0; transition: opacity 500ms ease;
}

/* Revealed only after lockImageSize runs */
.gv-caption.gv-cap-visible { opacity: 1; }

.gv-arrow { position: absolute; top: 50%; transform: translateY(-50%);
  width: 56px; height: 56px; border-radius: 28px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.06);
  transition: background 160ms ease, transform 160ms ease; z-index: 10001; }
.gv-arrow:hover { transform: translateY(-50%) scale(1.06); background: rgba(255,255,255,0.1); }
.gv-arrow__icon { width: 18px; height: 18px; fill: rgba(255,255,255,0.9); }
.gv-arrow--left { left: 18px; } .gv-arrow--right { right: 18px; }

.gv-close { position: absolute; top: 18px; right: 18px; z-index: 10002;
  width: 44px; height: 44px; border-radius: 22px; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  cursor: pointer; transition: background 140ms ease, transform 140ms ease; }
.gv-close:hover { transform: scale(1.06); background: rgba(255,255,255,0.08); }
.gv-close__icon { width: 18px; height: 18px; fill: rgba(255,255,255,0.9); }

@media (max-width:600px) {
  .gv-arrow { width: 44px; height: 44px; background: rgba(0,0,0,0.3); }
  .gv-image { max-height: 82vh; }
  .gv-caption { font-size: 12px; }
}
`;

  function injectStyle(css) {
    const s = document.createElement('style');
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  /* -------------------------
     2. Utility: Reveal & Header
  ------------------------- */
  function initReveal() {
    const prints = Array.from(document.querySelectorAll('.print'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = prints.indexOf(entry.target);
          setTimeout(() => entry.target.classList.add('visible'), index * 90);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -20% 0px' });
    prints.forEach(p => observer.observe(p));
  }

  function initHeaderHideShow() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      header.classList.toggle('hidden', y > lastY && y > 100);
      lastY = y;
    }, { passive: true });
  }

  function initHoverScale() {
    const frames = document.querySelectorAll('img');
    frames.forEach(f => {
      f.classList.add('gv-film-hover');
      f.onpointerenter = () => f.classList.add('gv-hovered');
      f.onpointerleave = () => f.classList.remove('gv-hovered');
    });
  }

  /* -------------------------
     3. Modal Gallery Logic
  ------------------------- */
  function initModalGallery() {
    const printAnchors = Array.from(document.querySelectorAll('.print'));
    if (!printAnchors.length) return;

    const items = printAnchors.map(a => {
      const img = a.querySelector('img');
      const rawHref = a.getAttribute('href') || '';
      let full = rawHref.includes('/upload/') ? rawHref.replace(/\/upload\/[^/]+\//, '/upload/') : rawHref;
      return {
        thumb: img ? img.src : '',
        full: full || (img ? img.src : ''),
        caption: a.querySelector('.print-caption')?.textContent.trim() || ''
      };
    });

    let currentIndex = -1, overlay = null, viewer = null, currentImgEl = null, isAnimating = false;
    const loaders = new WeakMap();

    function buildOverlay() {
      overlay = document.createElement('div'); overlay.className = 'gv-overlay';
      viewer = document.createElement('div'); viewer.className = 'gv-viewer';
      const leftBtn = document.createElement('button'); leftBtn.className = 'gv-arrow gv-arrow--left';
      leftBtn.innerHTML = `<svg class="gv-arrow__icon" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
      const rightBtn = document.createElement('button'); rightBtn.className = 'gv-arrow gv-arrow--right';
      rightBtn.innerHTML = `<svg class="gv-arrow__icon" viewBox="0 0 24 24"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>`;
      const closeBtn = document.createElement('button'); closeBtn.className = 'gv-close';
      closeBtn.innerHTML = `<svg class="gv-close__icon" viewBox="0 0 24 24"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/></svg>`;
      overlay.append(viewer, leftBtn, rightBtn, closeBtn);
      document.body.appendChild(overlay);
      leftBtn.onclick = (e) => { e.stopPropagation(); navigate(-1); };
      rightBtn.onclick = (e) => { e.stopPropagation(); navigate(1); };
      closeBtn.onclick = (e) => { e.stopPropagation(); closeOverlay(); };
      overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };
      document.addEventListener('keydown', (e) => {
        if (overlay.style.display !== 'flex') return;
        if (e.key === 'Escape') closeOverlay();
        if (e.key === 'ArrowLeft') navigate(-1);
        if (e.key === 'ArrowRight') navigate(1);
      });
    }

    function lockImageSize(img) {
      if (img.dataset.sizeLocked) return;
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        img.style.height = rect.height + 'px';
        img.dataset.sizeLocked = 'true';
        // Delay revealing caption until the container is stable
        const cap = img.parentNode.querySelector('.gv-caption');
        if (cap) cap.classList.add('gv-cap-visible');
      }
    }

    function attachLoadHandlers(imgEl, onReady) {
      const done = () => {
        if (imgEl.naturalWidth === 0) { requestAnimationFrame(done); return; }
        imgEl.classList.add('gv-loaded');
        imgEl.style.opacity = '1';
        requestAnimationFrame(() => {
          lockImageSize(imgEl);
          if (onReady) onReady();
        });
      };
      if (imgEl.complete && imgEl.naturalWidth !== 0) done();
      else { imgEl.onload = done; imgEl.onerror = done; }
    }

    function createContent(item, src) {
      const wrap = document.createElement('div');
      wrap.className = 'gv-content-item';

      const img = document.createElement('img');
      img.className = 'gv-image';
      img.src = src;
      img.setAttribute('draggable', 'false');
      // Add pointer cursor to indicate it's clickable
      img.style.cursor = 'zoom-in';

      // New: Open full image in new tab on click
      img.onclick = (e) => {
        e.stopPropagation(); // Prevents the overlay from closing
        window.open(item.full, '_blank');
      };

      const cap = document.createElement('div');
      cap.className = 'gv-caption';
      cap.textContent = item.caption;

      wrap.append(img, cap);
      return { wrap, img };
    }

    function showAtIndex(index, options = {}) {
      if (isAnimating) return;
      const idx = (index + items.length) % items.length;
      const item = items[idx];
      const startSrc = item.thumb || item.full;

      if (!currentImgEl || options.instant) {
        if (currentImgEl) currentImgEl.closest('.gv-content-item').remove();
        const { wrap, img } = createContent(item, startSrc);
        viewer.appendChild(wrap);
        currentImgEl = img;
        attachLoadHandlers(img, () => {
          if (item.full !== startSrc) preloadThenSwap(img, item.full);
        });
        return;
      }

      isAnimating = true;
      const dir = options.direction || 1;
      const { wrap: newWrap, img: newImg } = createContent(item, startSrc);
      newWrap.style.transform = `translate(-50%, -50%) translateX(${dir * 150}%)`;
      newWrap.style.opacity = '0';
      viewer.appendChild(newWrap);
      const oldWrap = currentImgEl.closest('.gv-content-item');

      requestAnimationFrame(() => {
        newWrap.style.transition = oldWrap.style.transition = 'transform 400ms cubic-bezier(.22,.9,.28,1), opacity 400ms ease';
        oldWrap.style.transform = `translate(-50%, -50%) translateX(${dir * -150}%)`;
        oldWrap.style.opacity = '0';
        newWrap.style.transform = 'translate(-50%, -50%) translateX(0)';
        newWrap.style.opacity = '1';
        newWrap.addEventListener('transitionend', () => {
          if (oldWrap) oldWrap.remove();
          currentImgEl = newImg;
          isAnimating = false;
          attachLoadHandlers(currentImgEl, () => {
            if (item.full !== startSrc) preloadThenSwap(currentImgEl, item.full);
          });
        }, { once: true });
      });
    }

    function preloadThenSwap(imgEl, fullSrc) {
      const loader = new Image();
      loaders.set(imgEl, loader);
      loader.onload = () => { if (loaders.get(imgEl) === loader) imgEl.src = loader.src; };
      loader.src = fullSrc;
    }

    function navigate(delta) {
      if (isAnimating) return;
      currentIndex = (currentIndex + delta + items.length) % items.length;
      showAtIndex(currentIndex, { instant: false, direction: delta });
    }

    function openOverlay(index) {
      if (!overlay) buildOverlay();
      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      void overlay.offsetWidth;
      currentIndex = index;
      showAtIndex(index, { instant: true });
    }

    function closeOverlay() {
      overlay.style.display = 'none';
      if (currentImgEl) currentImgEl.closest('.gv-content-item').remove();
      currentImgEl = null; document.body.style.overflow = '';
      currentIndex = -1;
    }

    printAnchors.forEach((a, i) => {
      a.onclick = (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault(); openOverlay(i);
      };
    });

    window.addEventListener('resize', () => {
      if (currentImgEl) {
        currentImgEl.style.width = ''; currentImgEl.style.height = '';
        currentImgEl.removeAttribute('data-size-locked');
        // Temporarily hide caption during resize to prevent jump
        const cap = currentImgEl.parentNode.querySelector('.gv-caption');
        if (cap) cap.classList.remove('gv-cap-visible');
        requestAnimationFrame(() => lockImageSize(currentImgEl));
      }
    });
  }

  /* -------------------------
     4. Boot
  ------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    injectStyle(injectedCSS);
    initReveal();
    initHeaderHideShow();
    initHoverScale();
    initModalGallery();
  });
})();