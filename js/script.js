// js/script.js — robust, simple, drop-in
// js/script.js — re-animates every time element re-enters view
document.addEventListener('DOMContentLoaded', () => {
  const prints = Array.from(document.querySelectorAll('.print'));
  if (!prints.length) return;

  const delayPer = 90; // stagger delay per item

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const print = entry.target;
      const img = print.querySelector('img');

      if (entry.isIntersecting) {
        // === ENTER VIEW ===
        const reveal = () => {
          requestAnimationFrame(() => {
            void print.offsetWidth; // force reflow
            const index = prints.indexOf(print);
            setTimeout(() => {
              print.classList.add('visible');
            }, index * delayPer);
          });
        };

        if (!img || img.complete) {
          reveal();
        } else {
          img.addEventListener('load', reveal, { once: true });
          img.addEventListener('error', reveal, { once: true });
        }

      } else {
        // === EXIT VIEW ===
        print.classList.remove('visible');
      }
    });
  }, {
    threshold: 0,
    rootMargin: '0px 0px -30% 0px'
  });

  prints.forEach(p => observer.observe(p));
});



(function () {
  const header = document.querySelector('.site-header');

  let lastY = window.scrollY;
  let direction = null;
  let directionStart = 0;

  const DIRECTION_LOCK_MS = 0;  // must scroll 0s in same direction
  const ACTION_DELAY_MS    = 100; // wait 0.1s before sliding

  let hideTO = null;
  let showTO = null;

  function clearTimers() {
    clearTimeout(hideTO); hideTO = null;
    clearTimeout(showTO); showTO = null;
  }

  function hide() { header.classList.add('hidden'); }
  function show() { header.classList.remove('hidden'); }

  function onScroll() {
    const y = window.scrollY;
    const delta = y - lastY;
    const now = performance.now();

    let newDir = delta > 0 ? "down"
        : delta < 0 ? "up"
            : null;

    if (!newDir) {
      lastY = y;
      return;
    }

    // direction changed? reset lock timer
    if (newDir !== direction) {
      direction = newDir;
      directionStart = now;
      clearTimers();
      lastY = y;
      return;
    }

    // direction held for at least 0.1s?
    if (now - directionStart >= DIRECTION_LOCK_MS) {

      if (direction === "down") {
        clearTimers();
        hideTO = setTimeout(hide, ACTION_DELAY_MS);
      }

      if (direction === "up") {
        clearTimers();
        showTO = setTimeout(show, ACTION_DELAY_MS);
      }
    }

    lastY = y;
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        onScroll();
        ticking = false;
      });
      ticking = true;
    }
  });

})();
