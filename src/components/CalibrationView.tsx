import React, { useState } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import { DOMAINS } from '../data/seedCurriculum';
import { saveCalibration } from '../lib/firestoreService';
import type { Domain, SkillNode, UserProfile } from '../types/learning';

interface CalibrationViewProps {
  profile: UserProfile;
  skills: SkillNode[];
}

const PRESETS: Array<{ label: string; score: number; hint: string }> = [
  { label: 'Foundational', score: 28, hint: 'Building basics' },
  { label: 'Practitioner', score: 45, hint: 'Shipping project tasks' },
  { label: 'Solid Mid', score: 62, hint: 'Independent execution' },
  { label: 'Senior', score: 78, hint: 'System ownership' },
];

export const CalibrationView: React.FC<CalibrationViewProps> = ({ profile, skills }) => {
  const [roleTitle, setRoleTitle] = useState(profile.roleTitle || 'Associate Cloud Engineer');
  const [weeklyHours, setWeeklyHours] = useState(profile.weeklyHoursTarget || 10);
  const [ratings, setRatings] = useState<Record<Domain, number>>({
    Angular: 45,
    FastAPI: 45,
    DevOps: 45,
    AWS: 45,
    GCP: 45,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveCalibration(profile.userId, weeklyHours, roleTitle, ratings, skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save calibration.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#F1F5F9] px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-2 border-b border-slate-800/80 pb-6">
          <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Initial Baseline Calibration</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-50">
            Calibrate your 5-domain baseline
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Set your current confidence in each stack and weekly upskilling hours. ApexStack
            seeds 20 Staff-level competency nodes and a balanced weekly rotation tailored to your
            baseline.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#121824] border border-slate-800/80 rounded-xl p-6">
            <div className="space-y-2">
              <label htmlFor="roleTitle" className="block text-xs font-medium text-slate-300">
                Current Role Title
              </label>
              <input
                id="roleTitle"
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                required
                maxLength={120}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="weeklyHours" className="block text-xs font-medium text-slate-300">
                  Weekly Upskilling Budget
                </label>
                <span className="font-mono text-xs text-sky-400 tabular-nums">
                  {weeklyHours} hrs / week
                </span>
              </div>
              <input
                id="weeklyHours"
                type="range"
                min={3}
                max={30}
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer mt-2"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                <span>3h light</span>
                <span>10h balanced</span>
                <span>20h+ intensive</span>
              </div>
            </div>
          </div>

          <div className="bg-[#121824] border border-slate-800/80 rounded-xl divide-y divide-slate-800/80">
            <div className="px-6 py-4 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Current Domain Proficiency
              </h2>
              <span className="text-xs text-slate-400">Select closest level per stack</span>
            </div>

            {DOMAINS.map((domain) => (
              <div
                key={domain}
                className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm text-slate-100">{domain}</div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    Baseline seed: {ratings[domain]}%
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESETS.map((preset) => {
                    const active = ratings[domain] === preset.score;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setRatings((prev) => ({ ...prev, [domain]: preset.score }))}
                        className={`px-3 py-2 rounded-lg text-left border transition-colors cursor-pointer ${
                          active
                            ? 'bg-sky-500/15 border-sky-500/70 text-sky-200'
                            : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-medium whitespace-nowrap">{preset.label}</div>
                        <div className="text-[11px] text-slate-500 truncate">{preset.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'Initializing console...' : 'Initialize Mastery Console'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
