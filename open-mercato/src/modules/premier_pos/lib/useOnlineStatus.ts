'use client'

import { useSyncExternalStore } from 'react'

function subscribe(notify: () => void) {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

// Node 24 exposes navigator without onLine. Keep SSR and initial hydration equal;
// React checks the real browser status immediately after hydration.
const serverSnapshot = () => true
const browserSnapshot = () => navigator.onLine !== false
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot)
}
