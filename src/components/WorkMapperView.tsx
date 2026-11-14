import React, { useState } from 'react';
import { BookmarkPlus, Check, Sparkles } from 'lucide-react';
import { mapWorkLogWithAi, type MappedWorkResult } from '../lib/aiClient';
import { createReviewCards, recordMappedWorkLog } from '../lib/firestoreService';
import type { SkillNode, UserProfile, WorkLog } from '../types/learning';

interface WorkMapperViewProps {
  profile: UserProfile;
  skills: SkillNode[];
  workLogs: WorkLog[];
}

const SAMPLE_PRESETS = [
  {
    projectName: 'Billing Platform Migration',
    minutesSpent: 75,
    taskSummary:
      'Refactored FastAPI async billing webhook consumer to use SQLAlchemy async connection pooling with bounded pool_size, added Pydantic v2 discriminated union validation, and deployed to GKE Autopilot using Workload Identity to publish events to Pub/Sub.',
  },
  {
    projectName: 'Multi-Cloud Telemetry Console',
    minutesSpent: 60,
    taskSummary:
      'Built an Angular signal-based real-time log viewer replacing BehaviorSubject subscriptions, configured AWS PrivateLink interface endpoints for Secrets Manager and ECR via Terraform, and tightened IAM permission boundaries.',
  },
];

export const WorkMapperView: React.FC<WorkMapperViewProps> = ({
  profile,
  skills,
  workLogs,
}) => {
  const [projectName, setProjectName] = useState('');
  const [minutesSpent, setMinutesSpent] = useState(45);
  const [taskSummary, setTaskSummary] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [latestMapping, setLatestMapping] = useState<MappedWorkResult | null>(null);
  const [cardSaved, setCardSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !taskSummary.trim()) return;

    setSubmitting(true);
    setError(null);
    setCardSaved(false);
    try {
      const mapped = await mapWorkLogWithAi({
        projectName: projectName.trim(),
        taskSummary: taskSummary.trim(),
        minutesSpent,
        currentSkills: skills,
      });

      await recordMappedWorkLog(profile.userId, profile, skills, {
        projectName: projectName.trim(),
        taskSummary: taskSummary.trim(),
        minutesSpent,
        primaryDomain: mapped.primaryDomain,
        domains: mapped.domains,
        extractedSkills: mapped.extractedSkills,
        matchedSkillTitles: mapped.matchedSkillTitles,
        xpAwarded: mapped.xpAwarded,
        elevationNote: mapped.elevationNote,
      });

      setLatestMapping(mapped);
      setProjectName('');
      setTaskSummary('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to map work log.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSuggestedCard = async () => {
    if (!latestMapping?.suggestedFlashcard || cardSaved) return;
    setError(null);
    try {
      await createReviewCards(profile.userId, [latestMapping.suggestedFlashcard]);
      setCardSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save flashcard.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Work Task Logger */}
      <section className="lg:col-span-5 bg-[#121824] border border-slate-800/80 rounded-xl p-6 space-y-5">
        <div className="space-y-1 border-b border-slate-800/80 pb-4">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Map Active Project Work
          </h2>
          <p className="text-xs text-slate-400">
            Log a PR, ticket, or cloud change. AI decomposes it into domain skills, boosts matrix
            nodes, and highlights Staff-level hardening opportunities.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label htmlFor="projectName" className="block text-xs font-medium text-slate-300">
                Project Name
              </label>
              <input
                id="projectName"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Internal Cloud Portal"
                required
                maxLength={120}
                className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="minutesSpent" className="block text-xs font-medium text-slate-300">
                Minutes
              </label>
              <input
                id="minutesSpent"
                type="number"
                min={5}
                max={720}
                value={minutesSpent}
                onChange={(e) => setMinutesSpent(Number(e.target.value) || 30)}
                required
                className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 font-mono text-sm text-slate-100 tabular-nums focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="taskSummary" className="block text-xs font-medium text-slate-300">
              Engineering Task / PR / Architecture Summary
            </label>
            <textarea
              id="taskSummary"
              rows={5}
              value={taskSummary}
              onChange={(e) => setTaskSummary(e.target.value)}
              placeholder="Describe what you built, debugged, or deployed across Angular, FastAPI, DevOps, AWS, or GCP..."
              required
              maxLength={2500}
              className="w-full px-3 py-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 resize-y"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Examples:</span>
            {SAMPLE_PRESETS.map((preset) => (
              <button
                key={preset.projectName}
                type="button"
                onClick={() => {
                  setProjectName(preset.projectName);
                  setMinutesSpent(preset.minutesSpent);
                  setTaskSummary(preset.taskSummary);
                }}
                className="text-sky-400 hover:text-sky-300 underline underline-offset-2 cursor-pointer"
              >
                {preset.projectName}
              </button>
            ))}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-sm font-semibold transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{submitting ? 'Mapping skills & elevation notes...' : 'Analyze & Map Work Log'}</span>
          </button>
        </form>
      </section>

      {/* Right: AI Elevation Output + Work History */}
      <div className="lg:col-span-7 space-y-6">
        {latestMapping && (
          <section className="bg-[#121824] border border-sky-500/40 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div>
                <div className="text-xs font-mono text-sky-400">
                  Mapped · {latestMapping.domains.join(' / ')}
                </div>
                <h3 className="font-display text-base font-semibold text-slate-50 mt-0.5">
                  Staff Elevation Feedback
                </h3>
              </div>
              <span className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                +{latestMapping.xpAwarded} XP applied
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-mono text-slate-400">Skills Exercised</div>
              <p className="text-sm text-slate-200">
                {latestMapping.extractedSkills.join(' · ')}
              </p>
            </div>

            <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-1.5">
              <div className="text-xs font-mono text-amber-400">
                What a Top 1% Staff Engineer Hardens Next
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">
                {latestMapping.elevationNote}
              </p>
            </div>

            {latestMapping.suggestedFlashcard && (
              <div className="border-t border-slate-800/80 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-mono text-slate-400">
                    Suggested Review Card · {latestMapping.suggestedFlashcard.domain}
                  </div>
                  <div className="text-xs text-slate-200 truncate">
                    {latestMapping.suggestedFlashcard.prompt}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveSuggestedCard}
                  disabled={cardSaved}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 disabled:opacity-60 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {cardSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Saved to Queue</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5 text-sky-400" />
                      <span>Save Card</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Mapped Project History
            </h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {workLogs.length} entries
            </span>
          </div>

          {workLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No work logs recorded yet. Submit your first project task on the left to build your
              verified skill trail.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {workLogs.map((log) => (
                <article key={log.id} className="p-6 space-y-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{log.projectName}</h3>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      {log.domains.join(' / ')} · +{log.xpAwarded} XP · {log.minutesSpent}m
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{log.taskSummary}</p>
                  <div className="text-xs text-slate-400">
                    <span className="text-slate-500">Extracted: </span>
                    {log.extractedSkills.join(' · ')}
                  </div>
                  <div className="text-xs text-sky-300/90 bg-[#0B0F17] border border-slate-800/80 rounded-lg p-3 leading-relaxed">
                    <span className="font-mono text-[11px] text-amber-400 block mb-1">
                      Elevation Note
                    </span>
                    {log.elevationNote}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
