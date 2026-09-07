document.addEventListener('DOMContentLoaded', () => {
  // Mobile Burger Menu - single DOM socials
  const burgerBtn = document.querySelector('.burger-btn');
  const socialsTop = document.getElementById('socials');

  if (burgerBtn && socialsTop) {
    burgerBtn.addEventListener('click', () => {
      const isOpen = socialsTop.classList.toggle('is-open');
      burgerBtn.classList.toggle('is-active');
      burgerBtn.setAttribute('aria-expanded', isOpen);
      socialsTop.setAttribute('aria-hidden', !isOpen);
    });

    // Close when clicking backdrop
    socialsTop.addEventListener('click', (e) => {
      if (e.target === socialsTop) {
        socialsTop.classList.remove('is-open');
        burgerBtn.classList.remove('is-active');
        burgerBtn.setAttribute('aria-expanded', 'false');
        socialsTop.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // Client-side rate limit: 2 sends / 12h via localStorage + server KV (least writes)
  const CONTACT_LIMIT = 2;
  const CONTACT_WINDOW_MS = 12 * 60 * 60 * 1000;
  const getContactRL = () => { try { return JSON.parse(localStorage.getItem("contact:rl") || "null"); } catch { return null; } };
  const setContactRL = (v) => { try { localStorage.setItem("contact:rl", JSON.stringify(v)); } catch {} };
  const canContactSend = () => { const rl = getContactRL(); if (!rl) return true; if (Date.now() > rl.until) { try { localStorage.removeItem("contact:rl"); } catch {} return true; } return rl.count < CONTACT_LIMIT; };

  // Contact accordion
  const contactToggle = document.querySelector('.contact-toggle');
  const contactPanel = document.getElementById('contact-panel');
  if (contactToggle && contactPanel) {
    contactToggle.addEventListener('click', () => {
      const isOpen = contactToggle.getAttribute('aria-expanded') === 'true';
      contactToggle.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) {
        contactPanel.hidden = false;
        requestAnimationFrame(() => contactPanel.classList.add('is-open'));
        // check server-side KV (in case localStorage cleared) → re-lock button
        fetch('/api/contact', { method: 'GET' }).then(r => r.json()).then(data => {
          if (data.limited) {
            setContactRL({ count: data.count, until: data.until });
            const btn = document.querySelector('#contact-form button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = "I'll be in touch"; btn.classList.add("is-limited"); }
          }
        }).catch(() => {});
      } else {
        contactPanel.classList.remove('is-open');
        contactPanel.addEventListener('transitionend', () => {
          if (!contactPanel.classList.contains('is-open')) contactPanel.hidden = true;
        }, { once: true });
      }
    });
  }

  // Contact form - send without mail client via Cloudflare Worker/Function
  const contactForm = document.getElementById('contact-form');
  const blocked = ['exe','bat','sh','msi','dmg','dll','so','zip','rar','tar','gz','7z','js','mjs','cjs','ts','tsx','py','php','pl','rb','rs','go','java','c','cpp','cs','html','htm','css','svg','png','jpg','jpeg','gif','webp','bmp','ico','tiff','psd','ai','sketch','ps1','cmd','com','scr','vbs','jar','apk','ipa'];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const allowedSubjects = ["Booking / Performance", "Collaboration", "Brand / Commercial", "Press / Media", "General Enquiries"];
  const containsHarmful = (s) => {
    if (!s) return false;
    if (/<\s*(script|iframe|object|embed|form|img|svg|link|style|meta|base)\b/i.test(s)) return true;
    if (/javascript\s*:/i.test(s) || /data\s*:\s*text\/html/i.test(s) || /vbscript\s*:/i.test(s)) return true;
    if (/on\w+\s*=\s*["']?[^"'\s>]+/i.test(s)) return true;
    if (/```|<\s*code\b/i.test(s)) return true;
    const re = new RegExp(`(?:https?:\\/\\/|www\\.)[^\\s]+\\.(${blocked.join('|')})(?:[?#][^\\s]*)?\\b`, 'i');
    return re.test(s);
  };

  if (contactForm) {
    const messageField = document.getElementById('contact-message');
    const charCount = document.getElementById('contact-char-count');
    const contactBtnEarly = contactForm.querySelector('button[type="submit"]');
    const refreshContactLimit = () => {
      if (!contactBtnEarly) return true;
      if (!canContactSend()) {
        contactBtnEarly.disabled = true;
        contactBtnEarly.textContent = "I'll be in touch";
        contactBtnEarly.classList.add("is-limited");
        return false;
      }
      contactBtnEarly.disabled = false;
      contactBtnEarly.classList.remove("is-limited");
      return true;
    };
    if (messageField && charCount) {
      const updateCount = () => {
        charCount.textContent = `${messageField.value.length}/1000`;
        if (messageField.offsetParent !== null) {
          messageField.style.height = 'auto';
          void messageField.offsetHeight;
          messageField.style.height = Math.max(120, messageField.scrollHeight) + 'px';
        }
      };
      messageField.addEventListener('input', updateCount);
      // initial
      charCount.textContent = `${messageField.value.length}/1000`;
      if (messageField.offsetParent !== null) updateCount();
      contactForm.addEventListener('reset', () => setTimeout(updateCount, 0));
      // re-check when panel opens
      const contactPanelEarly = document.getElementById('contact-panel');
      if (contactPanelEarly) contactPanelEarly.addEventListener('transitionend', (e) => { if (e.propertyName === 'grid-template-rows' && contactPanelEarly.classList.contains('is-open')) updateCount(); });
    }
    const nameInputEarly = contactForm.querySelector('#contact-name');
    const emailInputEarly = contactForm.querySelector('#contact-email');
    const subjectInputEarly = contactForm.querySelector('#contact-subject');
    if (nameInputEarly) nameInputEarly.addEventListener('input', () => nameInputEarly.setCustomValidity(""));
    if (emailInputEarly) emailInputEarly.addEventListener('input', () => emailInputEarly.setCustomValidity(""));
    if (subjectInputEarly) subjectInputEarly.addEventListener('change', () => subjectInputEarly.setCustomValidity(""));
    if (messageField) messageField.addEventListener('input', () => messageField.setCustomValidity(""));
    refreshContactLimit();
    setInterval(() => {
      if (!canContactSend()) refreshContactLimit();
      else if (contactBtnEarly && contactBtnEarly.textContent === "I'll be in touch") {
        contactBtnEarly.textContent = "Send Message";
        contactBtnEarly.disabled = false;
        contactBtnEarly.classList.remove("is-limited");
      }
    }, 60000);

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = contactForm.querySelector('#contact-name');
      const emailInput = contactForm.querySelector('#contact-email');
      const subjectInput = contactForm.querySelector('#contact-subject');
      const nameVal = nameInput.value.trim();
      const emailVal = emailInput.value.trim();
      const subjectVal = subjectInput.value.trim();
      const msgVal = messageField ? messageField.value : "";

      if (nameVal.length > 80) { nameInput.setCustomValidity("Name must be 80 characters or less"); nameInput.reportValidity(); return; } else nameInput.setCustomValidity("");
      if (emailVal.length > 254) { emailInput.setCustomValidity("Email must be 254 characters or less"); emailInput.reportValidity(); return; } else emailInput.setCustomValidity("");
      if (!emailRegex.test(emailVal)) { emailInput.setCustomValidity("Invalid email"); emailInput.reportValidity(); return; } else emailInput.setCustomValidity("");
      if (!allowedSubjects.includes(subjectVal)) { subjectInput.setCustomValidity("Please select a subject"); subjectInput.reportValidity(); return; } else subjectInput.setCustomValidity("");
      if (msgVal.length > 1000) { if (messageField) { messageField.setCustomValidity("Message must be 1000 characters or less"); messageField.reportValidity(); } return; } else if (messageField) messageField.setCustomValidity("");
      for (const [field, val, el] of [["name", nameVal, nameInput], ["subject", subjectVal, subjectInput], ["message", msgVal, messageField]]) {
        if (val && containsHarmful(val)) { el.setCustomValidity("Links to exe/image/code or script not allowed"); el.reportValidity(); return; } else if (el) el.setCustomValidity("");
      }
      if (!canContactSend()) {
        const b = contactForm.querySelector('button[type="submit"]');
        b.disabled = true;
        b.textContent = "I'll be in touch";
        b.classList.add("is-limited");
        return;
      }
      const btn = contactForm.querySelector('button[type="submit"]');
      const orig = btn.textContent;
      btn.textContent = 'Sending...';
      btn.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(contactForm).entries());
        const res = await fetch(contactForm.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          if (res.status === 429) {
            const errData = await res.json().catch(() => ({}));
            const until = errData.until || (Date.now() + (errData.retryAfter ? errData.retryAfter * 1000 : 12 * 60 * 60 * 1000));
            const count = errData.count || 2;
            setContactRL({ count, until });
            const b = contactForm.querySelector('button[type="submit"]');
            b.disabled = true;
            b.textContent = "I'll be in touch";
            b.classList.add("is-limited");
            throw new Error("Rate limited — try again later");
          }
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed');
        }
        btn.textContent = 'Sent ✓';
        contactForm.reset();
        if (messageField && charCount) {
          charCount.textContent = '0/1000';
          messageField.style.height = 'auto';
        }
        // update rate limit
        let rl = getContactRL();
        if (!rl || Date.now() > rl.until) rl = { count: 0, until: Date.now() + CONTACT_WINDOW_MS };
        rl.count++;
        setContactRL(rl);
        if (!canContactSend()) {
          setTimeout(() => {
            btn.textContent = "I'll be in touch";
            btn.disabled = true;
            btn.classList.add("is-limited");
          }, 6000);
          return;
        }
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 6000);
      } catch (err) {
        const msg = err.message || 'Error - try again';
        if (msg.includes("Rate limited")) return;
        btn.textContent = msg.includes("country code") || msg.includes("1000") ? msg : 'Error - try again';
        btn.disabled = false;
        setTimeout(() => btn.textContent = orig, 6000);
      }
    });
  }

  // Newsletter - Kit v4 via /api/newsletter
  const newsletterForm = document.querySelector('.newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = newsletterForm.querySelector('input[type="email"]');
      const emailVal = email.value.trim();
      if (emailVal.length > 254) { email.setCustomValidity("Email too long"); email.reportValidity(); return; }
      if (!emailRegex.test(emailVal)) { email.setCustomValidity("Invalid email"); email.reportValidity(); return; }
      if (/https?:\/\//i.test(emailVal)) { email.setCustomValidity("Links not allowed in email"); email.reportValidity(); return; }
      email.setCustomValidity("");
      const btn = newsletterForm.querySelector('button[type="submit"]');
      const orig = btn.textContent;
      btn.textContent = 'Sending...';
      btn.disabled = true;
      try {
        const res = await fetch(newsletterForm.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email_address: emailVal }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          btn.textContent = 'Already subscribed';
          btn.disabled = false;
          setTimeout(() => { btn.textContent = orig; }, 6000);
          return;
        }
        if (!res.ok) throw new Error(data.error || data.errors?.[0] || 'Failed');
        btn.textContent = 'Subscribed ✓';
        newsletterForm.reset();
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 6000);
      } catch (err) {
        btn.textContent = err.message || 'Error - try again';
        btn.disabled = false;
        setTimeout(() => btn.textContent = orig, 6000);
      }
    });
    const nEmail = newsletterForm.querySelector('input[type="email"]');
    if (nEmail) nEmail.addEventListener('input', () => nEmail.setCustomValidity(""));
  }

  const track = document.querySelector('.carousel-track');
  const slides = document.querySelectorAll('.carousel-slide');
  const prevBtn = document.querySelector('.carousel-btn.prev');
  const nextBtn = document.querySelector('.carousel-btn.next');
  const dotsContainer = document.querySelector('.carousel-dots');
  if (track && slides.length) {
    let current = 0;
  const total = slides.length;

  const platformsData = [
    {
      links: [
        { href: 'https://open.spotify.com/track/6vWTmxhYT8RoSn99kNX6dJ', icon: 'assets/icons/spotify.svg', alt: 'Spotify' },
        { href: 'https://music.apple.com/us/song/khadhambariye/6794283060', icon: 'assets/icons/apple-music.svg', alt: 'Apple Music' },
        { href: 'https://music.youtube.com/watch?v=Fc-5HR2P4rM', icon: 'assets/icons/youtube-music.svg', alt: 'YouTube Music' },
        { href: 'https://music.amazon.com/albums/B0HBBR9KPN', icon: 'assets/icons/amazon-music.svg', alt: 'Amazon Music' },
        { href: 'https://soundcloud.com/isaactimothy/khadhambariye', icon: 'assets/icons/soundcloud.svg', alt: 'SoundCloud' },
        { href: 'https://link.deezer.com/s/34dNggTwC0ef2gUTkYLqa', icon: 'assets/icons/deezer.svg', alt: 'Deezer' },
        { href: 'https://tidal.com/album/545997216/track/545997218', icon: 'assets/icons/tidal.svg', alt: 'Tidal' },
      ]
    },
    {
      links: [
        { href: 'https://open.spotify.com/track/0f858Tv5lqvBkJzZuuSHed', icon: 'assets/icons/spotify.svg', alt: 'Spotify' },
        { href: 'https://music.apple.com/us/song/arctic-eyes/6789503937', icon: 'assets/icons/apple-music.svg', alt: 'Apple Music' },
        { href: 'https://music.youtube.com/watch?v=OPV2sNcmSuc', icon: 'assets/icons/youtube-music.svg', alt: 'YouTube Music' },
        { href: 'https://music.amazon.com/tracks/B0H8D6M5YN', icon: 'assets/icons/amazon-music.svg', alt: 'Amazon Music' },
        { href: 'https://www.deezer.com/us/album/1025788072', icon: 'assets/icons/deezer.svg', alt: 'Deezer' },
        { href: 'https://tidal.com/album/541878355', icon: 'assets/icons/tidal.svg', alt: 'Tidal' },
      ]
    },
    {
      links: [
        { href: 'https://open.spotify.com/album/3Wz6p7cQdFck6ID5VZJcHZ', icon: 'assets/icons/spotify.svg', alt: 'Spotify' },
        { href: 'https://music.apple.com/us/album/akaalaye-single/1843887424', icon: 'assets/icons/apple-music.svg', alt: 'Apple Music' },
        { href: 'https://music.youtube.com/watch?v=cNU_81ld8Rc', icon: 'assets/icons/youtube-music.svg', alt: 'YouTube Music' },
        { href: 'https://music.amazon.com/albums/B0FTT4D9JB', icon: 'assets/icons/amazon-music.svg', alt: 'Amazon Music' },
        { href: 'https://soundcloud.com/isaactimothy/akaalaye', icon: 'assets/icons/soundcloud.svg', alt: 'SoundCloud' },
        { href: 'https://www.deezer.com/us/album/831969221', icon: 'assets/icons/deezer.svg', alt: 'Deezer' },
        { href: 'https://tidal.com/album/464686077', icon: 'assets/icons/tidal.svg', alt: 'Tidal' },
      ]
    },
    {
      links: [
        { href: 'https://www.youtube.com/watch?v=1P2cQqoRTDg', icon: 'assets/icons/youtube.svg', alt: 'YouTube' },
      ]
    },
    {
      links: [
        { href: 'https://www.youtube.com/watch?v=p1qOVspA-8Y', icon: 'assets/icons/youtube.svg', alt: 'YouTube' },
      ]
    },
    {
      links: [
        { href: 'https://www.youtube.com/watch?v=_TyjXzWGDag', icon: 'assets/icons/youtube.svg', alt: 'YouTube' },
      ]
    },
    {
      links: [
        { href: 'https://www.youtube.com/watch?v=qxYF9LP64kg', icon: 'assets/icons/youtube.svg', alt: 'YouTube' },
      ]
    },
  ];

  const platformsLogos = document.getElementById('carousel-platforms-logos');

  function renderPlatforms(index) {
    if (!platformsLogos) return;
    const data = platformsData[index];
    if (!data) return;
    platformsLogos.innerHTML = data.links.map(l => `<a href="${l.href}" target="_blank" rel="noopener noreferrer" aria-label="${l.alt}"><img src="${l.icon}" alt="${l.alt}" width="28" height="28"></a>`).join('');
  }

  // create dots
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
    dot.setAttribute('aria-label', `Go to video ${i + 1}`);
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });
  const dots = document.querySelectorAll('.carousel-dot');

  function pauseAllVideos() {
    slides.forEach(slide => {
      const iframe = slide.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', 'https://www.youtube-nocookie.com');
      }
    });
  }

  function update() {
    track.style.transform = `translateX(-${current * 100}%)`;
    slides.forEach((s, i) => s.classList.toggle('is-active', i === current));
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === current);
      d.setAttribute('aria-selected', i === current ? 'true' : 'false');
    });
    renderPlatforms(current);
  }

  function goTo(index) {
    pauseAllVideos();
    current = (index + total) % total;
    update();
  }

  update();

  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));

  // swipe support
  let startX = 0;
  let isDragging = false;
  track.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
  });
  track.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    const diff = e.changedTouches[0].clientX - startX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goTo(current - 1);
      else goTo(current + 1);
    }
    isDragging = false;
  });

    // keyboard
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowLeft') goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });

    // arrow transparency based on playing state (lazy-load YouTube API on first interaction)
    const carouselEl = document.querySelector('.carousel');
    let playingCount = 0;
    let ytLoaded = false;
    const setPlaying = (playing) => {
      if (playing) playingCount++;
      else playingCount = Math.max(0, playingCount - 1);
      if (playingCount > 0) carouselEl.classList.add('is-playing');
      else carouselEl.classList.remove('is-playing');
    };
    const loadYouTubeAPI = () => {
      if (ytLoaded) return;
      ytLoaded = true;
      if (window.YT && window.YT.Player) { initYTPlayers(); return; }
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    };
    window.onYouTubeIframeAPIReady = () => initYTPlayers();
    const initYTPlayers = () => {
      if (!window.YT || !window.YT.Player) return;
      slides.forEach(slide => {
        const iframe = slide.querySelector('iframe');
        if (!iframe) return;
        new YT.Player(iframe, {
          events: {
            'onStateChange': (e) => {
              if (e.data === YT.PlayerState.PLAYING) setPlaying(true);
              else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setPlaying(false);
            }
          }
        });
      });
    };
    // load API only when carousel enters viewport or user interacts
    const videosSection = document.getElementById('videos');
    if (videosSection && 'IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) { loadYouTubeAPI(); obs.disconnect(); }
        });
      }, { rootMargin: '200px' });
      obs.observe(videosSection);
    }
    carouselEl.addEventListener('pointerdown', loadYouTubeAPI, { once: true });
  }
});
