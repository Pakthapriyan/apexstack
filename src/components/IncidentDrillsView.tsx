import React, { useMemo, useState } from 'react';
import { Award, Play, Send, ShieldAlert } from 'lucide-react';
import { DOMAINS } from '../data/seedCurriculum';
import {
  evaluateDrillWithAi,
  respondDrillWithAi,
  startDrillWithAi,
} from '../lib/aiClient';
import {
  appendDrillMessages,
  completeIncidentDrill,
  createIncidentDrill,
} from '../lib/firestoreService';
import type { DrillMessage, IncidentDrill, UserProfile } from '../types/learning';

interface IncidentDrillsViewProps {
  profile: UserProfile;
  drills: IncidentDrill[];
}

const DRILL_DOMAINS = ['Multi-Cloud AWS+GCP', ...DOMAINS] as const;

export const IncidentDrillsView: React.FC<IncidentDrillsViewProps> = ({
  profile,
  drills,
}) => {
  const [selectedDomain, setSelectedDomain] = useState<string>('Multi-Cloud AWS+GCP');
  const [difficulty, setDifficulty] = useState<'Senior' | 'Staff' | 'Principal'>('Staff');
  const [activeDrillId, setActiveDrillId] = useState<string | null>(drills[0]?.id ?? null);

  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activeDrill = useMemo(
    () => drills.find((d) => d.id === activeDrillId) || drills[0] || null,
    [drills, activeDrillId]
  );

  const handleStartDrill = async () => {
    setStarting(true);
    setError(null);
    try {
      const generated = await startDrillWithAi({
        domain: selectedDomain,
        difficulty,
      });
      const newId = await createIncidentDrill(profile.userId, {
        domain: selectedDomain,
        title: generated.title,
        difficulty,
        scenarioPrompt: generated.scenarioPrompt,
        initialChallenge: generated.initialChallenge,
      });
      setActiveDrillId(newId);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start drill.');
    } finally {
      setStarting(false);
    }
  };

  const handleSendResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDrill || activeDrill.status === 'completed' || !draft.trim()) return;

    const userMsg: DrillMessage = {
      role: 'user',
      content: draft.trim(),
      timestamp: new Date().toISOString(),
    };
    const nextMessages = [...activeDrill.messages, userMsg];

    setSending(true);
    setError(null);
    setDraft('');
    try {
      await appendDrillMessages(profile.userId, activeDrill.id, nextMessages);
      const aiReply = await respondDrillWithAi({
        domain: activeDrill.domain,
        difficulty: activeDrill.difficulty,
        scenarioPrompt: activeDrill.scenarioPrompt,
        messages: nextMessages,
      });
      const withAssistant: DrillMessage[] = [
        ...nextMessages,
        {
          role: 'assistant',
          content: aiReply.reply,
          timestamp: new Date().toISOString(),
        },
      ];
      await appendDrillMessages(profile.userId, activeDrill.id, withAssistant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process drill turn.');
    } finally {
      setSending(false);
    }
  };

  const handleEvaluateDrill = async () => {
    if (!activeDrill || activeDrill.status === 'completed') return;
    setEvaluating(true);
    setError(null);
    try {
      const evaluation = await evaluateDrillWithAi({
        domain: activeDrill.domain,
        difficulty: activeDrill.difficulty,
        scenarioPrompt: activeDrill.scenarioPrompt,
        messages: activeDrill.messages,
      });
      await completeIncidentDrill(
        profile.userId,
        activeDrill.id,
        activeDrill.messages,
        evaluation
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grade drill.');
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Launcher Bar */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="drillDomain" className="text-xs text-slate-400">
              Scope
            </label>
            <select
              id="drillDomain"
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {DRILL_DOMAINS.map((dom) => (
                <option key={dom} value={dom}>
                  {dom}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
            {(['Senior', 'Staff', 'Principal'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  difficulty === level
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartDrill}
          disabled={starting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{starting ? 'Provisioning Scenario...' : 'Start Live Incident Drill'}</span>
        </button>
      </section>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Drill List */}
        <aside className="lg:col-span-4 bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Drill Sessions
            </h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {drills.length}
            </span>
          </div>

          {drills.length === 0 ? (
            <div className="p-6 text-xs text-slate-400 leading-relaxed">
              No drills started yet. Launch a Staff or Principal scenario above to stress-test your
              architecture and incident triage instincts.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {drills.map((d) => {
                const selected = activeDrill?.id === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setActiveDrillId(d.id)}
                    className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                      selected ? 'bg-sky-500/10' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-100 line-clamp-1">
                      {d.title}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
                      <span>
                        {d.domain} · {d.difficulty}
                      </span>
                      <span
                        className={
                          d.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'
                        }
                      >
                        {d.status === 'completed' && d.evaluation
                          ? `${d.evaluation.overallScore}/100`
                          : 'Active'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right: Active War Room Stage */}
        <section className="lg:col-span-8 bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
          {!activeDrill ? (
            <div className="p-10 text-center space-y-3">
              <ShieldAlert className="w-8 h-8 text-sky-400 mx-auto" />
              <h3 className="font-display text-base font-semibold text-slate-100">
                Ready for Architecture & Incident Simulation
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Practice defending multi-cloud failovers, diagnosing FastAPI asyncio bottlenecks,
                or resolving Kubernetes cascading evictions under Staff-level scrutiny.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {/* Scenario Header */}
              <div className="p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-sky-400">
                    {activeDrill.domain} · {activeDrill.difficulty} Drill
                  </span>
                  {activeDrill.status === 'active' && (
                    <button
                      type="button"
                      onClick={handleEvaluateDrill}
                      disabled={evaluating || activeDrill.messages.length < 2}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-40 text-xs font-medium text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>{evaluating ? 'Grading...' : 'End & Grade Drill'}</span>
                    </button>
                  )}
                </div>
                <h2 className="font-display text-lg font-semibold text-slate-50">
                  {activeDrill.title}
                </h2>
                <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                  {activeDrill.scenarioPrompt}
                </div>
              </div>

              {/* Evaluation Scorecard (if completed) */}
              {activeDrill.status === 'completed' && activeDrill.evaluation && (
                <div className="p-6 bg-emerald-950/15 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold text-emerald-300">
                      Staff Rubric Evaluation
                    </h3>
                    <span className="font-mono text-lg font-semibold text-slate-50 tabular-nums">
                      Overall {activeDrill.evaluation.overallScore}/100
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Architecture', val: activeDrill.evaluation.architectureScore },
                      { label: 'Reliability', val: activeDrill.evaluation.reliabilityScore },
                      { label: 'Security', val: activeDrill.evaluation.securityScore },
                      { label: 'Perf & Cost', val: activeDrill.evaluation.performanceScore },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3"
                      >
                        <div className="text-[11px] text-slate-400">{metric.label}</div>
                        <div className="font-mono text-base font-semibold text-slate-100 tabular-nums mt-0.5">
                          {metric.val}/100
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1.5">
                      <div className="font-mono text-emerald-400">Strengths</div>
                      <ul className="space-y-1 text-slate-300 list-disc pl-4">
                        {activeDrill.evaluation.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1.5">
                      <div className="font-mono text-amber-400">Gaps to Harden</div>
                      <ul className="space-y-1 text-slate-300 list-disc pl-4">
                        {activeDrill.evaluation.gaps.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="text-xs text-slate-200 bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5">
                    <span className="font-mono text-sky-400 block mb-1">Next Steps</span>
                    {activeDrill.evaluation.nextSteps}
                  </div>
                </div>
              )}

              {/* Transcript */}
              <div className="p-6 space-y-4 max-h-[460px] overflow-y-auto">
                {activeDrill.messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg p-4 text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === 'assistant'
                        ? 'bg-[#0B0F17] border border-slate-800 text-slate-200'
                        : 'bg-sky-500/10 border border-sky-500/30 text-slate-100 ml-6'
                    }`}
                  >
                    <div className="font-mono text-[11px] text-slate-400 mb-1.5">
                      {msg.role === 'assistant' ? 'Principal Reviewer' : 'Your Response'}
                    </div>
                    {msg.content}
                  </div>
                ))}
              </div>

              {/* Response Composer */}
              {activeDrill.status === 'active' && (
                <form onSubmit={handleSendResponse} className="p-5 space-y-3 bg-[#0E131D]">
                  <textarea
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Lay out your root-cause hypothesis, blast-radius containment, or architectural trade-offs..."
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 resize-y"
                  />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">
                      Submit at least one response before grading
                    </span>
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sending ? 'Reviewer typing...' : 'Submit Response'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
