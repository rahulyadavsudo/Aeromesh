import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  // Always initialize to true so Node SSR (where navigator.onLine is undefined)
  // matches the first browser hydration pass cleanly.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const readOnline = () =>
      typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
        ? navigator.onLine
        : true;

    setIsOnline(readOnline());

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
