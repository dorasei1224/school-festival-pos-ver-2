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
      const align = steps[stepIndex]?.align ?? 'right';
      const top = Math.min(window.innerHeight - 150, Math.max(20, rect.top + rect.height / 2 - 70));
      const left = align === 'right' ? Math.max(16, rect.right + 18) : Math.min(window.innerWidth - 300, rect.left - 280);
      setPosition({ top, left: Math.max(12, Math.min(window.innerWidth - 290, left)) });
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
        className="pointer-events-auto absolute w-[270px] rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm"
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
