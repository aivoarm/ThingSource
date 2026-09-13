/**
 * Hamburger Menu Toggle & Mobile Drawer Handler
 * Provides seamless open/close interaction for mobile drawer navigation.
 */
document.addEventListener('DOMContentLoaded', () => {
  initHamburgerMenu();
});

function initHamburgerMenu() {
  const hamburgerBtns = document.querySelectorAll('.hamburger-btn');
  const overlay = document.querySelector('.mobile-nav-overlay');
  const closeBtns = document.querySelectorAll('.mobile-drawer-close');
  const drawerLinks = document.querySelectorAll('.mobile-drawer-link');

  if (!overlay && hamburgerBtns.length === 0) return;

  function openMenu() {
    hamburgerBtns.forEach(btn => {
      btn.classList.add('active');
      btn.setAttribute('aria-expanded', 'true');
    });
    if (overlay) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    }
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    hamburgerBtns.forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-expanded', 'false');
    });
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function toggleMenu() {
    if (overlay && overlay.classList.contains('open')) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  // Toggle on hamburger button click
  hamburgerBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  });

  // Close on close button click
  closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });
  });

  // Close on backdrop overlay click (outside drawer)
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeMenu();
      }
    });
  }

  // Close when pressing Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
      closeMenu();
    }
  });

  // Auto close menu when clicking links in drawer
  drawerLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeMenu();
    });
  });
}
