import type { Key } from 'ink';

export const handleNavigation = (
  key: Key,
  currentIndex: number,
  maxIndex: number,
  setter: (index: number) => void
): void => {
  if (key.upArrow && currentIndex > 0) {
    setter(currentIndex - 1);
  } else if (key.downArrow && currentIndex < maxIndex) {
    setter(currentIndex + 1);
  }
};