import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Award,
  Bot,
  CheckCircle2,
  Circle,
  Flag,
  Loader2,
  RefreshCw,
  Swords,
} from 'lucide-react';
import { computeHunterStats, computeMilestones } from '../data/milestones';
import { DOMAINS } from '../data/seedCurriculum';
import { generateDailyQuestsWithSystemAi } from '../lib/aiClient';
import {
  completeDailyQuestAtomic,
  completeProjectMissionAndResumeRoutine,
  getTodayDayKey,
  getTodayIsoDate,
  saveGeneratedDailyQuests,
} from '../lib/firestoreService';
import type {
  DailyQuest,
  Domain,
  ProjectMission,
  SkillNode,
  UserProfile,
  WorkLog,
} from '../types/learning';
import type { CelebrationEvent } from './CelebrationOverlay';

export type SimplePage = 'quests' | 'upload' | 'profile';

interface QuestsPageProps {
  profile: UserProfile;
  skills: SkillNode[];
  workLogs: WorkLog[];
  missions: ProjectMission[];
  quests: DailyQuest[];
  autoGenerating: boolean;
  focusedQuestId?: string | null;
  systemNotice?: string | null;
  onDismissNotice?: () => void;
  onNavigate: (page: SimplePage, domainFilter?: Domain) => void;
  onCelebrate: (event: CelebrationEvent) => void;
  onAskJarvis?: (prompt: string) => void;
}

export const QuestsPage: React.FC<QuestsPageProps> = ({
  profile,
  skills,
  workLogs,
  missions,
  quests,
  autoGenerating,
  focusedQuestId,
  systemNotice,
  onDismissNotice,
  onNavigate,
  onCelebrate,
  onAskJarvis,
}) => {
  const questRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!focusedQuestId) return;
    const target = questRefs.current[focusedQuestId];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedQuestId]);
  const todayKey = getTodayIsoDate();
  const todayDayKey = getTodayDayKey();
  const todaySlot = profile.rotationMap[todayDayKey];

  const activeProject = useMemo(
    () => missions.find((m) => m.status === 'active') || null,
    [missions]
  );

  const todayQuests = useMemo(
    () => quests.filter((q) => q.dateKey === todayKey),
    [quests, todayKey]
  );

  const [regenerating, setRegenerating] = useState(false);
  const [completingQuestId, setCompletingQuestId] = useState<string | null>(null);
  const [completingMission, setCompletingMission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hunterStats = useMemo(
    () => computeHunterStats({ skills, quests, missions }),
    [skills, quests, missions]
  );

  const milestones = useMemo(
    () => computeMilestones({ profile, skills, missions, quests, todayKey }),
    [profile, skills, missions, quests, todayKey]
  );

  const unlockedCount = milestones.filter((m) => m.unlocked).length;

  const todayProgress = useMemo(() => {
    const total = todayQuests.length;
    const completed = todayQuests.filter((q) => q.status === 'completed').length;
    const xpEarnedToday = todayQuests
      .filter((q) => q.status === 'completed')
      .reduce((sum, q) => sum + q.xpReward, 0);
    const totalXpToday = todayQuests.reduce((sum, q) => sum + q.xpReward, 0);
    return { total, completed, xpEarnedToday, totalXpToday };
  }, [todayQuests]);

  const focusDomain: Domain = useMemo(() => {
    if (activeProject) return activeProject.primaryDomain;
    if (DOMAINS.includes(todaySlot as Domain)) return todaySlot as Domain;
    const ranked = DOMAINS.map((d) => {
      const subset = skills.filter((s) => s.domain === d);
      const avg =
        subset.length > 0
          ? subset.reduce((sum, s) => sum + s.mastery, 0) / subset.length
          : 0;
      return { domain: d, avg };
    }).sort((a, b) => a.avg - b.avg);
    return ranked[0]?.domain || 'AWS';
  }, [activeProject, todaySlot, skills]);

  const focusDomainSkills = useMemo(() => {
    return skills
      .filter((s) => s.domain === focusDomain)
      .sort((a, b) => {
        const aProj = activeProject && a.projectTag === activeProject.projectName ? 0 : 1;
        const bProj = activeProject && b.projectTag === activeProject.projectName ? 0 : 1;
        if (aProj !== bProj) return aProj - bProj;
        return a.mastery - b.mastery;
      });
  }, [skills, focusDomain, activeProject]);

  const handleRegenerateToday = async () => {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const mode = activeProject ? 'project_override' : 'normal_routine';
      const generated = await generateDailyQuestsWithSystemAi({
        dateKey: todayKey,
        todaySlot,
        mode,
        activeProject,
        skills,
        recentWorkLogs: workLogs,
        domainFocusMinutes: profile.domainFocusMinutes,
        dueCardsCount: 0,
        weeklyHoursTarget: profile.weeklyHoursTarget,
      });

      const pendingToday = todayQuests.filter((q) => q.status === 'pending');
      await saveGeneratedDailyQuests(
        profile.userId,
        todayKey,
        mode,
        activeProject,
        pendingToday,
        generated.dailyQuests
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate daily quests.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCompleteQuest = async (quest: DailyQuest) => {
    if (quest.status === 'completed' || completingQuestId) return;
    setCompletingQuestId(quest.id);
    setError(null);

    try {
      // Snapshot unlocked milestones before completing
      const beforeUnlocked = new Set(milestones.filter((m) => m.unlocked).map((m) => m.id));

      await completeDailyQuestAtomic(profile.userId, profile, skills, quest);

      // Compute projected unlocked milestones immediately for celebratory feedback
      const masteryGain = Math.min(12, Math.max(4, Math.round(quest.xpReward / 12)));
      const linkedNode =
        skills.find((s) => s.title.toLowerCase() === quest.linkedSkillTitle.toLowerCase()) ||
        skills.filter((s) => s.domain === quest.domain).sort((a, b) => a.mastery - b.mastery)[0];

      const projectedSkills = skills.map((s) =>
        linkedNode && s.id === linkedNode.id
          ? { ...s, mastery: Math.min(100, s.mastery + masteryGain) }
          : s
      );
      const projectedQuests = quests.map((q) =>
        q.id === quest.id ? { ...q, status: 'completed' as const } : q
      );
      const projectedStreak =
        profile.lastActiveDate !== todayKey ? profile.streakDays + 1 : profile.streakDays;

      const afterMilestones = computeMilestones({
        profile: { ...profile, streakDays: projectedStreak },
        skills: projectedSkills,
        missions,
        quests: projectedQuests,
        todayKey,
      });

      const newlyUnlocked = afterMilestones
        .filter((m) => m.unlocked && !beforeUnlocked.has(m.id))
        .map((m) => m.title);

      const allTodayNowCleared =
        todayQuests.length > 0 &&
        todayQuests.every((q) => q.id === quest.id || q.status === 'completed');

      onCelebrate({
        kind: allTodayNowCleared
          ? 'daily_clear'
          : newlyUnlocked.length > 0
          ? 'milestone'
          : 'quest',
        title: allTodayNowCleared ? 'All Daily Quests Cleared' : quest.title,
        subtitle: allTodayNowCleared
          ? `Every quest for ${todayKey} is complete. Your ${quest.domain} mastery and daily streak have been automatically updated.`
          : `${quest.domain} mastery increased by +${masteryGain}% and ${quest.estimatedMinutes}m of focus time was logged automatically.`,
        xpAwarded: quest.xpReward,
        domain: quest.domain,
        unlockedMilestones: newlyUnlocked,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete quest.');
    } finally {
      setCompletingQuestId(null);
    }
  };

  const handleCompleteProjectMission = async () => {
    if (!activeProject || completingMission) return;
    setCompletingMission(true);
    setError(null);

    try {
      const beforeUnlocked = new Set(milestones.filter((m) => m.unlocked).map((m) => m.id));
      const pendingProjectQuests = todayQuests.filter(
        (q) => q.status === 'pending' && q.mode === 'project_override'
      );

      await completeProjectMissionAndResumeRoutine(
        profile.userId,
        profile,
        skills,
        activeProject,
        pendingProjectQuests
      );

      const normalResult = await generateDailyQuestsWithSystemAi({
        dateKey: todayKey,
        todaySlot,
        mode: 'normal_routine',
        activeProject: null,
        skills,
        recentWorkLogs: workLogs,
        domainFocusMinutes: profile.domainFocusMinutes,
        dueCardsCount: 0,
        weeklyHoursTarget: profile.weeklyHoursTarget,
      });

      await saveGeneratedDailyQuests(
        profile.userId,
        todayKey,
        'normal_routine',
        null,
        [],
        normalResult.dailyQuests
      );

      const projectedMissions = missions.map((m) =>
        m.id === activeProject.id ? { ...m, status: 'completed' as const } : m
      );
      const afterMilestones = computeMilestones({
        profile,
        skills,
        missions: projectedMissions,
        quests,
        todayKey,
      });
      const newlyUnlocked = afterMilestones
        .filter((m) => m.unlocked && !beforeUnlocked.has(m.id))
        .map((m) => m.title);

      onCelebrate({
        kind: 'project',
        title: `${activeProject.projectName} Cleared`,
        subtitle: `Project mission complete! Your syllabus has returned to the Balanced Normal Routine and today's ${normalResult.focusDomain} quests are ready.`,
        xpAwarded: 250,
        domain: activeProject.primaryDomain,
        unlockedMilestones: newlyUnlocked,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete project mission.');
    } finally {
      setCompletingMission(false);
    }
  };

  const busyGenerating = autoGenerating || regenerating;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
          {error}
        </div>
      )}

      {systemNotice && (
        <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-700/50 text-xs text-amber-200 flex items-start justify-between gap-3">
          <span>{systemNotice}</span>
          {onDismissNotice && (
            <button
              type="button"
              onClick={onDismissNotice}
              className="text-amber-300 hover:text-amber-100 font-medium shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* System Quest Summary Header */}
      <section className="bg-[#121824] border border-sky-500/35 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
              <Swords className="w-4 h-4 shrink-0" />
              <span>DAILY SYSTEM QUESTS</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="tabular-nums">{todayKey}</span>
            </div>
            <h2 className="font-display text-lg font-semibold text-slate-50">
              {activeProject
                ? `Project Priority: ${activeProject.projectName}`
                : `Normal Routine: ${todayDayKey} (${todaySlot})`}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('upload')}
              className="px-3.5 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-semibold text-sky-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Upload Project Task
            </button>
            <button
              type="button"
              onClick={handleRegenerateToday}
              disabled={busyGenerating}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700/80 bg-[#0B0F17] hover:bg-slate-800/70 disabled:opacity-50 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyGenerating ? 'animate-spin' : ''}`} />
              <span>{busyGenerating ? 'Issuing...' : 'Refresh Quests'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">Rank &amp; Level</div>
            <div className="font-mono text-xl font-semibold text-sky-300 tabular-nums">
              Lv. {hunterStats.level}
            </div>
            <div className="text-xs font-mono text-slate-400">{hunterStats.rank}</div>
          </div>

          <div className="p-5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>System XP</span>
              <span className="font-mono tabular-nums text-slate-300">
                {hunterStats.totalXp} XP
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#0B0F17] overflow-hidden border border-slate-800">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{
                  width: `${Math.round((hunterStats.xpInLevel / hunterStats.xpSpan) * 100)}%`,
                }}
              />
            </div>
            <div className="text-[11px] font-mono text-slate-500 tabular-nums">
              {hunterStats.xpInLevel}/{hunterStats.xpSpan} XP to Lv. {hunterStats.level + 1}
            </div>
          </div>

          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">Today&apos;s Quests</div>
            <div className="font-mono text-xl font-semibold text-slate-50 tabular-nums">
              {todayProgress.completed} / {todayProgress.total}
            </div>
            <div className="text-xs font-mono text-emerald-400 tabular-nums">
              +{todayProgress.xpEarnedToday} / {todayProgress.totalXpToday} XP
            </div>
          </div>

          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">Milestones Unlocked</div>
            <div className="font-mono text-xl font-semibold text-slate-50 tabular-nums">
              {unlockedCount} / {milestones.length}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View all progress</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </section>

      {/* Active Project Priority Mission Banner */}
      {activeProject && (
        <section className="bg-[#121824] border border-amber-500/35 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="text-xs font-mono text-amber-400">
              {activeProject.rank} Active Project Override · {activeProject.primaryDomain}
            </div>
            <div className="text-sm font-semibold text-slate-100">
              {activeProject.projectName}
            </div>
            <p className="text-xs text-slate-300">{activeProject.masteryGoal}</p>
          </div>

          <button
            type="button"
            onClick={handleCompleteProjectMission}
            disabled={completingMission}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {completingMission ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Completing...</span>
              </>
            ) : (
              <>
                <Flag className="w-3.5 h-3.5" />
                <span>Complete Project &amp; Resume Normal Routine</span>
              </>
            )}
          </button>
        </section>
      )}

      {/* Main Two-Column Grid: Today's Quests + Milestones & Master Syllabus */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Daily Quests */}
        <section className="lg:col-span-7 bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-100">
                Today&apos;s Tasks
              </h3>
              <p className="text-xs text-slate-400">
                Automatically updated daily — complete quests to earn XP and advance mastery
              </p>
            </div>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {todayProgress.completed}/{todayProgress.total} done
            </span>
          </div>

          {busyGenerating && todayQuests.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
              <div className="text-sm font-medium text-slate-200">
                Issuing today&apos;s quests...
              </div>
              <p className="text-xs text-slate-400">
                Tailoring tasks to your active project and {focusDomain} syllabus.
              </p>
            </div>
          ) : todayQuests.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-300">No tasks generated for {todayKey} yet.</p>
              <button
                type="button"
                onClick={handleRegenerateToday}
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                Generate Today&apos;s Quests
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {todayQuests.map((quest) => {
                const isDone = quest.status === 'completed';
                const busy = completingQuestId === quest.id;
                const isFocused = focusedQuestId === quest.id;

                return (
                  <div
                    key={quest.id}
                    ref={(el) => {
                      questRefs.current[quest.id] = el;
                    }}
                    className={`p-5 space-y-3 transition-colors ${
                      isFocused
                        ? 'bg-sky-500/[0.06] ring-1 ring-inset ring-sky-400/70'
                        : isDone
                        ? 'bg-emerald-500/[0.03] opacity-80'
                        : 'hover:bg-slate-800/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="text-xs font-mono text-slate-400 tabular-nums">
                          {isFocused && (
                            <span className="text-sky-300 font-semibold mr-2">
                              [JARVIS FOCUS]
                            </span>
                          )}
                          <span
                            className={
                              quest.rank === 'S-Rank' || quest.rank === 'A-Rank'
                                ? 'text-amber-400 font-semibold'
                                : 'text-sky-400'
                            }
                          >
                            {quest.rank}
                          </span>
                          {' · '}
                          {quest.domain}
                          {' · '}
                          {quest.questType}
                          {' · '}
                          {quest.estimatedMinutes}m
                          {' · '}
                          <span className="text-emerald-400">+{quest.xpReward} XP</span>
                        </div>
                        <h4
                          className={`text-sm font-semibold ${
                            isDone ? 'line-through text-slate-400' : 'text-slate-100'
                          }`}
                        >
                          {quest.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {onAskJarvis && (
                          <button
                            type="button"
                            onClick={() =>
                              onAskJarvis(
                                `Guide me step-by-step on "${quest.title}" (${quest.domain}) and resolve any key production pitfalls.`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700/80 bg-[#0B0F17] hover:bg-slate-800 text-xs font-medium text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Bot className="w-3.5 h-3.5" />
                            <span>Ask JARVIS</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isDone || busy}
                          onClick={() => handleCompleteQuest(quest)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            isDone
                              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 cursor-default'
                              : 'bg-sky-500 hover:bg-sky-400 border-sky-400 text-slate-950'
                          }`}
                        >
                          {busy ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : isDone ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Completed</span>
                            </>
                          ) : (
                            <>
                              <Circle className="w-3.5 h-3.5" />
                              <span>Complete Quest</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{quest.objective}</p>

                    {quest.masteryChecklist && quest.masteryChecklist.length > 0 && (
                      <ul className="space-y-1 text-xs text-slate-400 pl-3 border-l border-slate-800">
                        {quest.masteryChecklist.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Milestones Tracker + Focus Domain Master Syllabus */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Active Milestones
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
              >
                All {milestones.length}
              </button>
            </div>

            <div className="divide-y divide-slate-800/60">
              {milestones.slice(0, 4).map((m) => (
                <div key={m.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-medium ${
                        m.unlocked ? 'text-emerald-300' : 'text-slate-100'
                      }`}
                    >
                      {m.unlocked ? '✓ ' : ''}
                      {m.title}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                      {m.current}/{m.target}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#0B0F17] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        m.unlocked ? 'bg-emerald-400' : 'bg-sky-400'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round((m.current / m.target) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400">{m.description}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  {focusDomain} Master Syllabus
                </h3>
                <p className="text-xs text-slate-400">
                  {activeProject
                    ? `Project modules for ${activeProject.projectName}`
                    : `Top 1% mastery path`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('profile', focusDomain)}
                className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
              >
                Full Syllabus
              </button>
            </div>

            <div className="divide-y divide-slate-800/60 max-h-[360px] overflow-y-auto">
              {activeProject &&
                activeProject.masterSyllabusModules?.map((mod, idx) => (
                  <div key={`${mod.title}-${idx}`} className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-100">
                        {idx + 1}. {mod.title}
                      </span>
                      <span className="text-[11px] font-mono text-amber-400 shrink-0">
                        {mod.tier}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{mod.objective}</p>
                  </div>
                ))}

              {(!activeProject || !activeProject.masterSyllabusModules?.length) &&
                focusDomainSkills.slice(0, 5).map((skill) => (
                  <div
                    key={skill.id}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-100 truncate">
                        {skill.title}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">{skill.tier}</div>
                    </div>
                    <span className="font-mono text-xs text-slate-300 tabular-nums shrink-0">
                      {skill.mastery}%
                    </span>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
