'use client';

import { useEffect } from 'react';

// Registers the service worker so the browser offers the "Install" action.
// Renders nothing. Registration is skipped in development to avoid a stale
// worker interfering with hot reload; it only runs on secure origins
// (https or localhost), which the browser requires anyway.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((error) => {
          console.error('Service worker registration failed:', error);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
