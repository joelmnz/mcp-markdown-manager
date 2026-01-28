import { useState, useEffect, useCallback, useRef } from 'react';

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const requestWakeLock = useCallback(async () => {
    // If we already have a lock that is not released, do nothing
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      return;
    }

    try {
      if ('wakeLock' in navigator) {
        const sentinel = await navigator.wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);

        sentinel.addEventListener('release', () => {
          // Check if this sentinel is still the current one (avoid race conditions)
          if (wakeLockRef.current === sentinel) {
            setWakeLockActive(false);
            wakeLockRef.current = null;
          }
        });
      }
    } catch (err) {
      // Silently fail if wake lock is denied or fails
      // console.debug('Wake lock request failed:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        // console.debug('Wake lock release failed:', err);
      } finally {
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
    }
  }, []);

  // Manage wake lock based on fullscreen state
  useEffect(() => {
    if (isFullscreen) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [isFullscreen, requestWakeLock, releaseWakeLock]);

  // Handle visibility changes (re-acquire lock if tab becomes visible and still fullscreen)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isFullscreen) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isFullscreen, requestWakeLock]);

  const enterFullscreen = useCallback((element: HTMLElement) => {
    if (element.requestFullscreen) {
      element.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }, []);

  const toggleFullscreen = useCallback((element: HTMLElement) => {
    if (document.fullscreenElement) {
      exitFullscreen();
    } else {
      enterFullscreen(element);
    }
  }, [enterFullscreen, exitFullscreen]);

  return {
    isFullscreen,
    wakeLockActive,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
