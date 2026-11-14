import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DAY_ORDER, DOMAINS } from '../data/seedCurriculum';
import { runSyllabusAgentWithAi } from '../lib/aiClient';
import {
  applyAgentSyllabusProposal,
  createAgentSession,
  deleteAgentSession,
  updateAgentSession,
} from '../lib/firestoreService';
import type {
  AgentMessage,
  AgentSession,
  Domain,
  SkillNode,
  SyllabusProposal,
  UserProfile,
  WorkLog,
} from '../types/learning';
import type { WorkspaceTab } from './CommandCenterView';

interface SyllabusAgentViewProps {
  profile: UserProfile;
  skills: SkillNode[];
  workLogs: WorkLog[];
  dueCardsCount: number;
  sessions: AgentSession[];
  onNavigate: (
    tab: WorkspaceTab,
    domainFilter?: Domain,
    options?: { openAdapter?: boolean; skillId?: string }
  ) => void;
}

const STARTER_PROMPTS = [
  {
    label: 'Structure syllabus for active project',
    prompt:
      'Analyze my current project context and recent work logs, then restructure my syllabus: add missing Top 1% topics, elevate matching skills to Critical/High, and reorder my Mon–Fri rotation.',
  },
  {
    label: 'Rebalance lagging domains',
    prompt:
      'Inspect my domain mastery scores and weekly focus minutes. Identify my biggest skill bottlenecks and propose a rebalanced weekly syllabus update.',
  },
  {
    label: 'Escalate mastered skills to Staff labs',
    prompt:
      'Review topics where my mastery is already high or practiced multiple times, and upgrade or add deeper Staff/Top 1% production failure-mode topics and SM-2 recall cards.',
  },
];

function sanitizeProposal(proposal: SyllabusProposal): SyllabusProposal {
  return JSON.parse(JSON.stringify(proposal)) as SyllabusProposal;
}

function hasActionableChanges(proposal?: SyllabusProposal): boolean {
  if (!proposal) return false;
  return (
    (proposal.addTopics && proposal.addTopics.length > 0) ||
    (proposal.updateTopics && proposal.updateTopics.length > 0) ||
    (proposal.removeOrDemoteTitles && proposal.removeOrDemoteTitles.length > 0) ||
    (proposal.newReviewCards && proposal.newReviewCards.length > 0) ||
    (proposal.weeklyFocusOrder && proposal.weeklyFocusOrder.length > 0)
  );
}

export const SyllabusAgentView: React.FC<SyllabusAgentViewProps> = ({
  profile,
  skills,
  workLogs,
  dueCardsCount,
  sessions,
  onNavigate,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    sessions[0]?.id ?? null
  );
  const [isNewThread, setIsNewThread] = useState(sessions.length === 0);

  const activeSession = useMemo(() => {
    if (isNewThread) return null;
    if (selectedSessionId) {
      const found = sessions.find((s) => s.id === selectedSessionId);
      if (found) return found;
    }
    return sessions[0] ?? null;
  }, [isNewThread, selectedSessionId, sessions]);

  const [projectContext, setProjectContext] = useState<string>(
    activeSession?.projectContext || ''
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    if (activeSession) {
      setProjectContext(activeSession.projectContext || '');
    }
  }, [activeSession?.id]);

  // Progress snapshot metrics displayed to the user
  const progressSummary = useMemo(() => {
    const overallMastery =
      skills.length > 0
        ? Math.round(skills.reduce((sum, s) => sum + s.mastery, 0) / skills.length)
        : 0;

    const domainAvgs = DOMAINS.map((domain) => {
      const subset = skills.filter((s) => s.domain === domain);
      const avg =
        subset.length > 0
          ? Math.round(subset.reduce((sum, s) => sum + s.mastery, 0) / subset.length)
          : 0;
      return { domain, avg };
    }).sort((a, b) => a.avg - b.avg);

    const activePriorityCount = skills.filter(
      (s) => s.priority === 'Critical' || s.priority === 'High'
    ).length;

    return {
      overallMastery,
      laggingDomain: domainAvgs[0]?.domain || 'GCP',
      laggingAvg: domainAvgs[0]?.avg ?? 0,
      activePriorityCount,
    };
  }, [skills]);

  const handleStartNewThread = () => {
    setIsNewThread(true);
    setSelectedSessionId(null);
    setProjectContext('');
    setError(null);
    setStatusNote(null);
  };

  const handleSelectSession = (session: AgentSession) => {
    setIsNewThread(false);
    setSelectedSessionId(session.id);
    setProjectContext(session.projectContext || '');
    setError(null);
    setStatusNote(null);
  };

  const handleSaveProjectContext = async () => {
    if (!activeSession) return;
    setSavingContext(true);
    setError(null);
    setStatusNote(null);
    try {
      await updateAgentSession(profile.userId, activeSession.id, {
        title: activeSession.title,
        projectContext,
        messages: activeSession.messages,
      });
      setStatusNote('Project context pinned to this agent thread.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save project context.');
    } finally {
      setSavingContext(false);
    }
  };

  const handleSend = async (overridePrompt?: string) => {
    const messageText = (overridePrompt ?? draft).trim();
    if (!messageText || sending) return;

    setSending(true);
    setError(null);
    setStatusNote(null);
    if (!overridePrompt) {
      setDraft('');
    }

    const existingMessages = activeSession?.messages || [];
    const userMsg: AgentMessage = {
      role: 'user',
      content: messageText.slice(0, 4000),
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await runSyllabusAgentWithAi({
        userMessage: messageText,
        projectContext: projectContext.trim(),
        conversationHistory: existingMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        profile,
        skills,
        workLogs,
        dueCardsCount,
      });

      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: response.assistantReply,
        timestamp: new Date().toISOString(),
        ...(response.shouldProposeUpdate && response.proposal
          ? { proposal: sanitizeProposal(response.proposal), applied: false }
          : {}),
      };

      const nextMessages = [...existingMessages, userMsg, assistantMsg].slice(-30);

      if (activeSession) {
        await updateAgentSession(profile.userId, activeSession.id, {
          title: activeSession.title || response.sessionTitle,
          projectContext,
          messages: nextMessages,
        });
      } else {
        const newId = await createAgentSession(
          profile.userId,
          response.sessionTitle || 'Syllabus Structuring Session',
          projectContext,
          nextMessages
        );
        setIsNewThread(false);
        setSelectedSessionId(newId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Syllabus Agent failed to respond.');
      if (!overridePrompt) {
        setDraft(messageText);
      }
    } finally {
      setSending(false);
    }
  };

  const handleApplyProposal = async (msgIdx: number, proposal: SyllabusProposal) => {
    if (!activeSession || applyingIndex !== null) return;
    setApplyingIndex(msgIdx);
    setError(null);
    setStatusNote(null);
    try {
      const result = await applyAgentSyllabusProposal(
        profile.userId,
        skills,
        activeSession,
        msgIdx,
        proposal
      );
      setStatusNote(
        `Syllabus updated: ${result.added} topics added, ${result.updated} updated, ${result.demotedOrRemoved} demoted/removed, ${result.cardsAdded} SM-2 cards queued, and weekly rotation aligned.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply syllabus update.');
    } finally {
      setApplyingIndex(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setDeletingId(sessionId);
    setError(null);
    try {
      await deleteAgentSession(profile.userId, sessionId);
      if (selectedSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        if (remaining.length > 0) {
          setSelectedSessionId(remaining[0].id);
          setIsNewThread(false);
        } else {
          setSelectedSessionId(null);
          setIsNewThread(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
          {error}
        </div>
      )}

      {statusNote && (
        <div className="p-3.5 rounded-lg bg-emerald-950/35 border border-emerald-700/50 text-sm text-emerald-200 flex flex-wrap items-center justify-between gap-3">
          <span>{statusNote}</span>
          <button
            type="button"
            onClick={() => onNavigate('matrix')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200 cursor-pointer whitespace-nowrap"
          >
            <span>Open Skill Matrix</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Live Progress Context + Persisted Agent Threads */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-[#121824] border border-slate-800/80 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Live Learning Telemetry
              </h2>
              <span className="font-mono text-xs text-sky-400 tabular-nums">
                {progressSummary.overallMastery}% avg
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800/80 space-y-0.5">
                <div className="text-slate-500">Lagging Domain</div>
                <div className="font-mono text-slate-100 font-medium tabular-nums">
                  {progressSummary.laggingDomain} · {progressSummary.laggingAvg}%
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800/80 space-y-0.5">
                <div className="text-slate-500">Priority Topics</div>
                <div className="font-mono text-slate-100 font-medium tabular-nums">
                  {progressSummary.activePriorityCount} active · {dueCardsCount} due
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                Current Weekly Rotation
              </div>
              <div className="text-xs font-mono text-slate-300 leading-relaxed">
                {DAY_ORDER.slice(0, 5)
                  .map((day) => `${day}: ${profile.rotationMap[day]}`)
                  .join(' · ')}
              </div>
            </div>
          </section>

          <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Agent Sessions
              </h2>
              <button
                type="button"
                onClick={handleStartNewThread}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Thread</span>
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="p-5 text-xs text-slate-400">
                No agent sessions yet. Start a thread on the right to structure your syllabus around
                your current project requirements.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 max-h-[380px] overflow-y-auto">
                {sessions.map((session) => {
                  const isSelected = !isNewThread && activeSession?.id === session.id;
                  const appliedCount = session.messages.filter((m) => m.applied).length;

                  return (
                    <div
                      key={session.id}
                      className={`px-5 py-3.5 flex items-start justify-between gap-3 transition-colors ${
                        isSelected ? 'bg-sky-500/[0.08]' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectSession(session)}
                        className="flex-1 min-w-0 text-left space-y-1 cursor-pointer"
                      >
                        <div className="text-sm font-medium text-slate-100 truncate">
                          {session.title}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                          {session.messages.length} msgs
                          {appliedCount > 0 ? ` · ${appliedCount} applied` : ''}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSession(session.id)}
                        disabled={deletingId === session.id}
                        aria-label={`Delete ${session.title}`}
                        className="p-1.5 rounded-md text-slate-500 hover:text-red-300 hover:bg-slate-800/60 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Workspace: Interactive Syllabus Architect Agent */}
        <section className="lg:col-span-8 bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden flex flex-col min-h-[640px]">
          {/* Header + Active Project Requirements Input */}
          <div className="p-5 border-b border-slate-800/80 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Bot className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-100">
                    {activeSession ? activeSession.title : 'Syllabus Architect Agent'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Reasons over your live mastery, focus minutes, and project requirements to
                    propose atomic syllabus updates.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="agent-project-context"
                  className="text-xs font-medium text-slate-300"
                >
                  Active Project Requirements & Stack Context
                </label>
                {activeSession && (
                  <button
                    type="button"
                    onClick={handleSaveProjectContext}
                    disabled={savingContext}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
                  >
                    {savingContext ? 'Saving...' : 'Save Context'}
                  </button>
                )}
              </div>
              <input
                id="agent-project-context"
                type="text"
                value={projectContext}
                onChange={(e) => setProjectContext(e.target.value)}
                maxLength={2000}
                placeholder="e.g., Project Phoenix: Angular 19 SSR portal + FastAPI async Postgres + AWS ECS + GCP Pub/Sub observability"
                className="w-full px-3.5 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 p-5 space-y-5 overflow-y-auto max-h-[620px]">
            {!activeSession || activeSession.messages.length === 0 ? (
              <div className="py-10 space-y-6">
                <div className="max-w-xl mx-auto text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 mx-auto">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-100">
                    Adaptive Syllabus & Progress Strategist
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Describe what you are building at work, paste sprint requirements, or ask the
                    agent to audit your mastery gaps. Every proposed syllabus mutation can be
                    reviewed and applied directly to your Skill Matrix, SM-2 queue, and weekly
                    rotation.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={sending}
                      onClick={() => handleSend(item.prompt)}
                      className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800/90 hover:border-sky-500/50 text-left space-y-1.5 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-sky-400">{item.label}</div>
                      <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                        {item.prompt}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeSession.messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const showProposal = !isUser && hasActionableChanges(msg.proposal);

                return (
                  <div
                    key={`${msg.timestamp}-${idx}`}
                    className={`space-y-3 ${
                      isUser ? 'ml-auto max-w-2xl' : 'mr-auto max-w-3xl'
                    }`}
                  >
                    <div
                      className={`p-4 rounded-xl border ${
                        isUser
                          ? 'bg-sky-500/10 border-sky-500/30 text-slate-100'
                          : 'bg-[#0B0F17] border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                          {isUser ? 'Engineer' : 'Syllabus Agent'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>

                    {showProposal && msg.proposal && (
                      <div className="rounded-xl bg-[#0E1420] border border-sky-500/30 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="text-xs font-semibold text-sky-300">
                              Proposed Syllabus &amp; Learning Path Update
                            </div>
                            <div className="text-xs text-slate-400">
                              {msg.proposal.summary}
                              {msg.proposal.projectTag
                                ? ` · Tag: ${msg.proposal.projectTag}`
                                : ''}
                            </div>
                          </div>

                          {msg.applied ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>Applied to Syllabus</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApplyProposal(idx, msg.proposal!)}
                              disabled={applyingIndex !== null}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {applyingIndex === idx ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Applying...</span>
                                </>
                              ) : (
                                <span>Apply Syllabus Update</span>
                              )}
                            </button>
                          )}
                        </div>

                        <div className="p-4 space-y-4 text-xs">
                          {msg.proposal.weeklyFocusOrder &&
                            msg.proposal.weeklyFocusOrder.length > 0 && (
                              <div className="space-y-1">
                                <div className="font-mono text-[11px] text-slate-500 uppercase tracking-wider">
                                  Weekly Rotation Shift (Mon–Fri)
                                </div>
                                <div className="font-mono text-slate-200">
                                  {msg.proposal.weeklyFocusOrder
                                    .map((dom, dIdx) => `${DAY_ORDER[dIdx]}: ${dom}`)
                                    .join(' · ')}
                                </div>
                              </div>
                            )}

                          {msg.proposal.addTopics && msg.proposal.addTopics.length > 0 && (
                            <div className="space-y-2">
                              <div className="font-mono text-[11px] text-emerald-400 uppercase tracking-wider">
                                New Topics to Add ({msg.proposal.addTopics.length})
                              </div>
                              <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded-lg bg-[#0B0F17]">
                                {msg.proposal.addTopics.map((t, tIdx) => (
                                  <div key={`${t.title}-${tIdx}`} className="p-3 space-y-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-medium text-slate-100">
                                        + {t.title}
                                      </span>
                                      <span className="font-mono text-[11px] text-slate-400">
                                        {t.domain} · {t.tier} ·{' '}
                                        <span
                                          className={
                                            t.priority === 'Critical'
                                              ? 'text-red-400'
                                              : t.priority === 'High'
                                              ? 'text-amber-400'
                                              : 'text-slate-400'
                                          }
                                        >
                                          {t.priority}
                                        </span>
                                      </span>
                                    </div>
                                    <p className="text-slate-400">{t.description}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {msg.proposal.updateTopics && msg.proposal.updateTopics.length > 0 && (
                            <div className="space-y-2">
                              <div className="font-mono text-[11px] text-sky-400 uppercase tracking-wider">
                                Existing Topics to Restructure ({msg.proposal.updateTopics.length})
                              </div>
                              <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded-lg bg-[#0B0F17]">
                                {msg.proposal.updateTopics.map((u, uIdx) => (
                                  <div
                                    key={`${u.existingTitle}-${uIdx}`}
                                    className="p-3 space-y-1"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-medium text-slate-100">
                                        ↑ {u.existingTitle}
                                      </span>
                                      <span className="font-mono text-[11px] text-slate-400">
                                        {u.tier} · {u.priority}
                                        {u.projectTag ? ` · ${u.projectTag}` : ''}
                                      </span>
                                    </div>
                                    <p className="text-slate-400">{u.reason}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {msg.proposal.removeOrDemoteTitles &&
                            msg.proposal.removeOrDemoteTitles.length > 0 && (
                              <div className="space-y-2">
                                <div className="font-mono text-[11px] text-amber-400 uppercase tracking-wider">
                                  Demote or Remove ({msg.proposal.removeOrDemoteTitles.length})
                                </div>
                                <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded-lg bg-[#0B0F17]">
                                  {msg.proposal.removeOrDemoteTitles.map((r, rIdx) => (
                                    <div
                                      key={`${r.existingTitle}-${rIdx}`}
                                      className="p-3 space-y-1"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium text-slate-200">
                                          ↓ {r.existingTitle}
                                        </span>
                                        <span className="font-mono text-[11px] uppercase text-amber-400">
                                          {r.action}
                                        </span>
                                      </div>
                                      <p className="text-slate-400">{r.reason}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                          {msg.proposal.newReviewCards &&
                            msg.proposal.newReviewCards.length > 0 && (
                              <div className="text-slate-400 font-mono text-[11px]">
                                + {msg.proposal.newReviewCards.length} targeted SM-2 recall card
                                {msg.proposal.newReviewCards.length === 1 ? '' : 's'} queued:{' '}
                                {msg.proposal.newReviewCards
                                  .map((c) => `${c.domain} (${c.skillTitle})`)
                                  .join(' · ')}
                              </div>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {sending && (
              <div className="max-w-xl p-4 rounded-xl bg-[#0B0F17] border border-slate-800 flex items-center gap-3 text-xs text-slate-300">
                <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                <span>
                  Analyzing mastery telemetry, project requirements, and syllabus structure...
                </span>
              </div>
            )}
          </div>

          {/* Prompt Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="p-4 border-t border-slate-800/80 bg-[#0E131D] space-y-2"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Tell the agent your project requirements, blockers, or ask how to restructure your Top 1% syllabus (Ctrl/Cmd+Enter to send)..."
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 sm:self-end"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sending ? 'Thinking...' : 'Send to Agent'}</span>
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};
