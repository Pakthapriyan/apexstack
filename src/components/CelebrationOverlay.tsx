import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Award, CheckCircle2, Sparkles, Trophy, X } from 'lucide-react';

export interface CelebrationEvent {
  kind: 'quest' | 'daily_clear' | 'milestone' | 'project';
  title: string;
  subtitle: string;
  xpAwarded?: number;
  domain?: string;
  unlockedMilestones?: string[];
}

interface CelebrationOverlayProps {
  event: CelebrationEvent | null;
  onDismiss: () => void;
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  event,
  onDismiss,
}) => {
  return (
    <AnimatePresence>
      {event && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#121824] border border-sky-500/50 rounded-xl p-6 space-y-5 relative overflow-hidden"
          >
            {/* Subtle celebratory burst particles using compositor transforms */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0.9, scale: 0.5, x: '50%', y: '30%' }}
                  animate={{
                    opacity: 0,
                    scale: 1.2,
                    x: `${18 + i * 14}%`,
                    y: `${i % 2 === 0 ? 8 : 65}%`,
                  }}
                  transition={{ duration: 0.85, ease: 'easeOut', delay: i * 0.04 }}
                  className="absolute w-1.5 h-1.5 rounded-full bg-sky-400"
                />
              ))}
            </div>

            <div className="flex items-start justify-between gap-4 relative">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-300 shrink-0">
                  {event.kind === 'project' || event.kind === 'daily_clear' ? (
                    <Trophy className="w-5 h-5 text-amber-400" />
                  ) : event.kind === 'milestone' ? (
                    <Award className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-sky-300" />
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-mono text-sky-400 uppercase tracking-wider">
                    {event.kind === 'project'
                      ? 'Project Mission Complete'
                      : event.kind === 'daily_clear'
                      ? 'Daily Sweep Complete'
                      : event.kind === 'milestone'
                      ? 'Milestone Unlocked'
                      : 'Quest Cleared'}
                  </div>
                  <h3 className="font-display text-lg font-semibold text-slate-50 leading-snug">
                    {event.title}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={onDismiss}
                aria-label="Close celebration"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed relative">{event.subtitle}</p>

            {(event.xpAwarded || event.domain) && (
              <div className="flex flex-wrap items-center gap-4 py-3 px-4 rounded-lg bg-[#0B0F17] border border-slate-800 font-mono text-xs tabular-nums relative">
                {event.xpAwarded ? (
                  <span className="text-emerald-400 font-semibold">+{event.xpAwarded} XP</span>
                ) : null}
                {event.domain ? (
                  <span className="text-sky-300">Domain Elevated: {event.domain}</span>
                ) : null}
              </div>
            )}

            {event.unlockedMilestones && event.unlockedMilestones.length > 0 && (
              <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/35 space-y-1.5 relative">
                <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    New Milestone{event.unlockedMilestones.length > 1 ? 's' : ''} Unlocked
                  </span>
                </div>
                <div className="text-xs text-emerald-100">
                  {event.unlockedMilestones.join(' · ')}
                </div>
              </div>
            )}

            <div className="flex justify-end relative">
              <button
                type="button"
                onClick={onDismiss}
                className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
