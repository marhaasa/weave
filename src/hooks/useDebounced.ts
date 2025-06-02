import { useRef, useCallback } from 'react';

export const useDebounced = (
  callback: (...args: any[]) => void,
  delay: number = 300
): ((...args: any[]) => void) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((...args: any[]) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
};

export const useDebouncedAsync = (
  callback: (...args: any[]) => Promise<void>,
  delay: number = 300
): ((...args: any[]) => Promise<void>) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isExecutingRef = useRef<boolean>(false);

  return useCallback(async (...args: any[]) => {
    return new Promise<void>((resolve) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (isExecutingRef.current) {
        resolve(); // Resolve immediately if already executing
        return;
      }

      timeoutRef.current = setTimeout(async () => {
        if (isExecutingRef.current) {
          resolve();
          return;
        }
        
        isExecutingRef.current = true;
        try {
          await callback(...args);
          resolve();
        } catch (error) {
          resolve(); // Still resolve to prevent hanging
        } finally {
          isExecutingRef.current = false;
        }
      }, delay);
    });
  }, [callback, delay]);
};