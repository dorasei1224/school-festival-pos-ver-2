'use client';

import { useEffect, useMemo, useState } from 'react';

export const TUTORIAL_SEEN_KEY = 'festival_pos_tutorial_seen_v1';

export type TutorialStep = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  targetId: string;
  align?: 'left' | 'right';
};

export function hasSeenTutorial(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(TUTORIAL_SEEN_KEY) === 'true';
}

export function markTutorialSeen() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
}

export function TutorialModal({
  open,
  onClose,
  steps,
  stepIndex,
  onStepChange,
}: {
  open: boolean;
  onClose: () => void;
  steps: TutorialStep[];
  stepIndex: number;
  onStepChange: (nextIndex: number) => void;
}) {
  const [position, setPosition] = useState({ top: 80, left: 80 });

  useEffect(() => {
    if (!open || steps.length === 0) return;

    const updatePosition = () => {
      const target = document.getElementById(steps[stepIndex]?.targetId ?? '');
      if (!target) {
        setPosition({ top: 80, left: 80 });
        return;
      }

      const rect = target.getBoundingClientRect();
      const popupWidth = 280;
      const popupHeight = 220;
      const margin = 16;
      let align = steps[stepIndex]?.align ?? 'right';

      let left = align === 'right' ? rect.right + 18 : rect.left - popupWidth - 18;
      if (left + popupWidth > window.innerWidth - margin) {
        left = rect.left - popupWidth - 18;
        align = 'left';
      }
      if (left < margin) {
        left = rect.right + 18;
        align = 'right';
      }

      let top = rect.top + rect.height / 2 - 70;
      if (top + popupHeight > window.innerHeight - margin) {
        top = window.innerHeight - popupHeight - margin;
      }
      if (top < margin) {
        top = margin;
      }

      left = Math.min(Math.max(left, margin), window.innerWidth - popupWidth - margin);
      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, stepIndex, steps]);

  const step = steps[stepIndex] ?? steps[0];
  if (!open || !step) return null;

  const handleClose = () => {
    onClose();
  };

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      onStepChange(stepIndex + 1);
      return;
    }
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div className="absolute inset-0 bg-transparent" />

      <div
        className="pointer-events-auto absolute w-[270px] max-w-[calc(100vw-32px)] rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm"
        style={{ top: position.top, left: position.left }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">help</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-[10px] font-bold text-neutral-500 hover:text-neutral-800"
          >
            閉じる
          </button>
        </div>

        <h3 className="text-sm font-black text-neutral-900">{step.title}</h3>
        <p className="mt-1 text-[11px] font-bold text-neutral-600">{step.subtitle}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-700">{step.description}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 w-1.5 rounded-full ${idx === stepIndex ? 'bg-neutral-900' : 'bg-neutral-300'}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStepChange(Math.max(stepIndex - 1, 0))}
              disabled={stepIndex === 0}
              className="rounded-lg border border-neutral-200 px-2 py-1 text-[10px] font-bold text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[10px] font-bold text-white"
            >
              {stepIndex === steps.length - 1 ? '完了' : '次へ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HelpButton({
  onClick,
  className = '',
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="使い方を見る"
      title="使い方を見る"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-base font-black text-neutral-700 shadow-sm transition hover:bg-neutral-100 ${className}`}
    >
      ?
    </button>
  );
}
