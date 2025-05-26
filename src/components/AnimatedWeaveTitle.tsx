import React, { useState, useEffect } from 'react';
import { createText } from '../utils/uiHelpers.js';
import { COLORS, TIMEOUTS } from '../constants/index.js';

export const AnimatedWeaveTitle: React.FC = React.memo(() => {
  const [frame, setFrame] = useState<number>(0);
  const [direction, setDirection] = useState<number>(1);

  useEffect(() => {
    const patterns = [
      'w   e   a   v   e',
      'w ─ e   a   v   e',
      'w ─ e ─ a   v   e',
      'w ─ e ─ a ─ v   e',
      'w ─ e ─ a ─ v ─ e',
      'w │ e ─ a ─ v ─ e',
      'w │ e │ a ─ v ─ e',
      'w │ e │ a │ v ─ e',
      'w │ e │ a │ v │ e'
    ];

    const interval = setInterval(() => {
      setFrame(prev => {
        const nextFrame = prev + direction;

        if (nextFrame >= patterns.length - 1) {
          setDirection(-1);
          return patterns.length - 1;
        }
        if (nextFrame <= 0) {
          setDirection(1);
          return 0;
        }

        return nextFrame;
      });
    }, TIMEOUTS.ANIMATION);

    return () => clearInterval(interval);
  }, [direction]);

  const patterns = [
    'w   e   a   v   e',
    'w ─ e   a   v   e',
    'w ─ e ─ a   v   e',
    'w ─ e ─ a ─ v   e',
    'w ─ e ─ a ─ v ─ e',
    'w │ e ─ a ─ v ─ e',
    'w │ e │ a ─ v ─ e',
    'w │ e │ a │ v ─ e',
    'w │ e │ a │ v │ e'
  ];

  return createText({ bold: true, color: COLORS.PRIMARY, fontSize: 24 }, patterns[frame]);
});