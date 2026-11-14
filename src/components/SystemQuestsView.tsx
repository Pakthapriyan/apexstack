import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  FileUp,
  Flag,
  Loader2,
  RefreshCw,
  Swords,
  Upload,
} from 'lucide-react';
import { DOMAINS } from '../data/seedCurriculum';
import {
  generateDailyQuestsWithSystemAi,
  uploadProjectTaskWithSystemAi,
} from '../lib/aiClient';
import {
  activateProjectMissionAndSyllabus,
  completeDailyQuestAtomic,
  completeProjectMissionAndResumeRoutine,
  getTodayDayKey,
  getTodayIsoDate,
  saveGeneratedDailyQuests,
} from '../lib/firestoreService';
import type {
  DailyQuest,
  Domain,
  IncidentDrill,
  ProjectMission,
  SkillNode,
  UserProfile,
  WorkLog,
} from '../types/learning';
import type { WorkspaceTab } from './CommandCenterView';

interface SystemQuestsViewProps {
  profile: UserProfile;
  skills: SkillNode[];
  workLogs: WorkLog[];
  drills: IncidentDrill[];
  dueCardsCount: number;
  missions: ProjectMission[];
  quests: DailyQuest[];
  autoGenerating: boolean;
  onNavigate: (
    tab: WorkspaceTab,
    domainFilter?: Domain,
    options?: { openAdapter?: boolean; skillId?: string }
  ) => void;
}

function computeHunterRank(xp: number, overallMastery: number): {
  level: number;
  rank: string;
  nextLevelXp: number;
  xpInLevel: number;
  xpSpan: number;
} {
  const level = Math.max(1, Math.floor(xp / 250) + 1);
  const xpInLevel = xp % 250;
  const score = level * 3 + overallMastery;
  let rank = 'E-Rank Initiate';
  if (score >= 160) rank = 'National Authority';
  else if (score >= 130) rank = 'S-Rank Monarch';
  else if (score >= 105) rank = 'A-Rank Architect';
  else if (score >= 80) rank = 'B-Rank Specialist';
  else if (score >= 55) rank = 'C-Rank Engineer';
  else if (score >= 30) rank = 'D-Rank Associate';

  return {
    level,
    rank,
    nextLevelXp: 250,
    xpInLevel,
    xpSpan: 250,
  };
}

export const SystemQuestsView: React.FC<SystemQuestsViewProps> = ({
  profile,
  skills,
  workLogs,
  drills,
  dueCardsCount,
  missions,
  quests,
  autoGenerating,
  onNavigate,
}) => {
  const todayKey = getTodayIsoDate();
  const todayDayKey = getTodayDayKey();
  const todaySlot = profile.rotationMap[todayDayKey];

  const activeProject = useMemo(
    () => missions.find((m) => m.status === 'active') || null,
    [missions]
  );
  const completedMissions = useMemo(
    () => missions.filter((m) => m.status === 'completed'),
    [missions]
  );

  const todayQuests = useMemo(
    () => quests.filter((q) => q.dateKey === todayKey),
    [quests, todayKey]
  );

  const [projectNameInput, setProjectNameInput] = useState('');
  const [taskBriefInput, setTaskBriefInput] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(!activeProject);

  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [completingQuestId, setCompletingQuestId] = useState<string | null>(null);
  const [completingMission, setCompletingMission] = useState(false);
  const [systemBanner, setSystemBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Derive Hunter Rank & real System XP strictly from persisted actions
  const hunterStats = useMemo(() => {
    const overallMastery =
      skills.length > 0
        ? Math.round(skills.reduce((sum, s) => sum + s.mastery, 0) / skills.length)
        : 0;
    const questXp = quests
      .filter((q) => q.status === 'completed')
      .reduce((sum, q) => sum + q.xpReward, 0);
    const workXp = workLogs.reduce((sum, l) => sum + l.xpAwarded, 0);
    const missionXp = completedMissions.length * 250;
    const drillXp = drills.filter((d) => d.status === 'completed').length * 150;
    const totalXp = questXp + workXp + missionXp + drillXp;

    return {
      totalXp,
      overallMastery,
      ...computeHunterRank(totalXp, overallMastery),
    };
  }, [skills, quests, workLogs, completedMissions.length, drills]);

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
    // Fallback to lowest mastery domain for synthesis/review days
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
    const tierOrder: Record<string, number> = {
      'Top 1%': 0,
      Senior: 1,
      Foundational: 2,
    };
    return skills
      .filter((s) => s.domain === focusDomain)
      .sort((a, b) => {
        const aProj = activeProject && a.projectTag === activeProject.projectName ? 0 : 1;
        const bProj = activeProject && b.projectTag === activeProject.projectName ? 0 : 1;
        if (aProj !== bProj) return aProj - bProj;
        if (a.tier !== b.tier) return (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
        return a.mastery - b.mastery;
      });
  }, [skills, focusDomain, activeProject]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 250 * 1024) {
      setError('Uploaded project file must be under 250 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text.trim()) {
        setError('Uploaded file appears empty.');
        return;
      }
      setUploadedFileName(file.name);
      if (!projectNameInput.trim()) {
        setProjectNameInput(file.name.replace(/\.[^.]+$/, ''));
      }
      setTaskBriefInput(text.slice(0, 4800));
      setError(null);
    };
    reader.onerror = () => {
      setError('Unable to read the selected file.');
    };
    reader.readAsText(file);
  };

  const handleUploadProjectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskBriefInput.trim() || uploading) return;

    setUploading(true);
    setError(null);
    setSystemBanner(null);

    try {
      const aiPlan = await uploadProjectTaskWithSystemAi({
        projectName: projectNameInput.trim() || undefined,
        rawTaskBrief: taskBriefInput.trim(),
        weeklyHoursTarget: profile.weeklyHoursTarget,
        currentSkills: skills,
      });

      const pendingToday = todayQuests.filter((q) => q.status === 'pending');
      await activateProjectMissionAndSyllabus(
        profile.userId,
        taskBriefInput.trim(),
        skills,
        pendingToday,
        aiPlan
      );

      setSystemBanner(
        aiPlan.systemAnnouncement ||
          `Project Priority Mode activated for ${aiPlan.projectName} (${aiPlan.primaryDomain}). Master syllabus updated and Day 1 quests issued.`
      );
      setProjectNameInput('');
      setTaskBriefInput('');
      setUploadedFileName(null);
      setShowUploadPanel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate project mission.');
    } finally {
      setUploading(false);
    }
  };

  const handleRegenerateToday = async () => {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    setSystemBanner(null);

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
        dueCardsCount,
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
      setSystemBanner(generated.systemDirective);
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
      await completeDailyQuestAtomic(profile.userId, profile, skills, quest);
      setSystemBanner(
        `Quest cleared: "${quest.title}" (+${quest.xpReward} XP · ${quest.domain} mastery & focus updated automatically).`
      );
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
    setSystemBanner(null);

    try {
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

      // Immediately issue Normal Routine quests for today so there's zero downtime
      const normalResult = await generateDailyQuestsWithSystemAi({
        dateKey: todayKey,
        todaySlot,
        mode: 'normal_routine',
        activeProject: null,
        skills,
        recentWorkLogs: workLogs,
        domainFocusMinutes: profile.domainFocusMinutes,
        dueCardsCount,
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

      setSystemBanner(
        `Project "${activeProject.projectName}" cleared (+250 XP). Returned to Balanced Normal Routine and issued today's ${normalResult.focusDomain} quests.`
      );
      setShowUploadPanel(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to complete project mission.'
      );
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

      {systemBanner && (
        <div className="p-4 rounded-xl bg-sky-500/[0.08] border border-sky-500/35 text-sm text-sky-100">
          {systemBanner}
        </div>
      )}

      {/* System Status Window (Solo Leveling-inspired clean obsidian console header) */}
      <section className="bg-[#121824] border border-sky-500/35 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
              <Swords className="w-4 h-4 shrink-0" />
              <span>SYSTEM DIRECTIVE</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="tabular-nums">{todayKey}</span>
            </div>
            <h2 className="font-display text-lg font-semibold text-slate-50">
              {activeProject
                ? `Project Priority Mode: ${activeProject.projectName}`
                : `Normal Routine Mode: ${todayDayKey} (${todaySlot})`}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowUploadPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-semibold text-sky-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{showUploadPanel ? 'Hide Project Uploader' : 'Upload Project Task'}</span>
            </button>

            <button
              type="button"
              onClick={handleRegenerateToday}
              disabled={busyGenerating}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700/80 bg-[#0B0F17] hover:bg-slate-800/70 disabled:opacity-50 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyGenerating ? 'animate-spin' : ''}`} />
              <span>{busyGenerating ? 'Issuing Quests...' : 'Refresh Today Quests'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">Engineer Rank &amp; Level</div>
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
            <div className="text-xs text-slate-400">Today&apos;s Daily Quests</div>
            <div className="font-mono text-xl font-semibold text-slate-50 tabular-nums">
              {todayProgress.completed} / {todayProgress.total}
            </div>
            <div className="text-xs font-mono text-emerald-400 tabular-nums">
              +{todayProgress.xpEarnedToday} / {todayProgress.totalXpToday} XP today
            </div>
          </div>

          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">Primary Mastery Focus</div>
            <div className="font-mono text-xl font-semibold text-slate-50">
              {focusDomain}
            </div>
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              {completedMissions.length} missions cleared · {profile.streakDays}d streak
            </div>
          </div>
        </div>
      </section>

      {/* Upload Project Task Panel (Zero-manual-effort Syllabus + Priority Override) */}
      {showUploadPanel && (
        <section className="bg-[#121824] border border-slate-800/80 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-display text-base font-semibold text-slate-100">
                Upload Project Task for Automatic Priority Override
              </h3>
              <p className="text-xs text-slate-400 max-w-2xl">
                Upload a spec file or paste your project ticket. The System will automatically update
                your Master Syllabus, prioritize that domain ahead of normal rotation, and issue
                daily execution and Top 1% mastery quests until you mark the project complete.
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.yaml,.yml,.csv,.log"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileUp className="w-3.5 h-3.5 text-sky-400" />
                <span>{uploadedFileName ? `Loaded: ${uploadedFileName}` : 'Upload Task File'}</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleUploadProjectTask} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="mission-project-name"
                  className="block text-xs font-medium text-slate-300"
                >
                  Project Name (Optional)
                </label>
                <input
                  id="mission-project-name"
                  type="text"
                  maxLength={120}
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  placeholder="Auto-inferred if blank (e.g., EKS Zero-Downtime Cutover)"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="md:col-span-2 flex items-end justify-end">
                <span className="text-xs text-slate-500">
                  Accepts `.txt`, `.md`, `.json`, `.yaml`, `.csv`, `.log` or pasted task details.
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="mission-task-brief"
                className="block text-xs font-medium text-slate-300"
              >
                Project Task Specification &amp; Deliverables
              </label>
              <textarea
                id="mission-task-brief"
                rows={4}
                required
                maxLength={5000}
                value={taskBriefInput}
                onChange={(e) => setTaskBriefInput(e.target.value)}
                placeholder="Paste your Jira ticket, sprint task, architecture requirements, or AWS/GCP/FastAPI/Angular/DevOps deliverables..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs text-slate-400">
                Automatically elevates syllabus nodes, shifts rotation, and generates Day 1 quests.
              </span>
              <button
                type="submit"
                disabled={uploading || !taskBriefInput.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Structuring Syllabus &amp; Quests...</span>
                  </>
                ) : (
                  <span>Activate Project Mission</span>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Active Project Priority Mission Banner */}
      {activeProject && (
        <section className="bg-[#121824] border border-amber-500/35 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="text-xs font-mono text-amber-400">
                {activeProject.rank} Active Project Override · {activeProject.primaryDomain} ·{' '}
                {activeProject.domains.join(' / ')}
              </div>
              <h3 className="font-display text-base font-semibold text-slate-100">
                {activeProject.projectName}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Top 1% Mastery Goal: {activeProject.masteryGoal}
              </p>
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
                  <span>Resuming Normal Routine...</span>
                </>
              ) : (
                <>
                  <Flag className="w-3.5 h-3.5" />
                  <span>Complete Project &amp; Resume Normal Routine</span>
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Main Split: Today's Daily Quests (Left) + Master Syllabus for Domain Excellence (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Daily Quests List */}
        <section className="lg:col-span-7 bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-100">
                Daily System Quests
              </h3>
              <p className="text-xs text-slate-400">
                Issued automatically each day — completing a quest updates mastery, focus time, and
                work telemetry
              </p>
            </div>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {todayProgress.completed}/{todayProgress.total} cleared
            </span>
          </div>

          {busyGenerating && todayQuests.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
              <div className="text-sm font-medium text-slate-200">
                Generating today&apos;s System Quests...
              </div>
              <p className="text-xs text-slate-400">
                Calibrating daily tasks to your active project and Top 1% mastery gaps.
              </p>
            </div>
          ) : todayQuests.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-300">No daily quests queued for {todayKey}.</p>
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

                return (
                  <div
                    key={quest.id}
                    className={`p-5 space-y-3 transition-colors ${
                      isDone ? 'bg-emerald-500/[0.03] opacity-80' : 'hover:bg-slate-800/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="text-xs font-mono text-slate-400 tabular-nums">
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

                      <button
                        type="button"
                        disabled={isDone || busy}
                        onClick={() => handleCompleteQuest(quest)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isDone
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 cursor-default'
                            : 'bg-sky-500 hover:bg-sky-400 border-sky-400 text-slate-950'
                        }`}
                      >
                        {busy ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Updating...</span>
                          </>
                        ) : isDone ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Cleared</span>
                          </>
                        ) : (
                          <>
                            <Circle className="w-3.5 h-3.5" />
                            <span>Complete Quest</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{quest.objective}</p>

                    {quest.masteryChecklist && quest.masteryChecklist.length > 0 && (
                      <ul className="space-y-1 text-xs text-slate-400 pl-3 border-l border-slate-800">
                        {quest.masteryChecklist.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    )}

                    {quest.linkedSkillTitle && (
                      <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                        <span className="truncate">
                          Syllabus Node: <span className="text-slate-300">{quest.linkedSkillTitle}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigate('matrix', quest.domain)}
                          className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <span>Inspect Domain</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Master Syllabus & Domain Excellence Blueprint */}
        <section className="lg:col-span-5 bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-100">
                {focusDomain} Master Syllabus
              </h3>
              <p className="text-xs text-slate-400">
                {activeProject
                  ? `Project-tailored Top 1% modules for ${activeProject.projectName}`
                  : `Top 1% excellence path for ${focusDomain}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('matrix', focusDomain)}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
            >
              Full Matrix
            </button>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-[680px] overflow-y-auto">
            {activeProject &&
              activeProject.masterSyllabusModules &&
              activeProject.masterSyllabusModules.length > 0 && (
                <div className="p-5 space-y-3 bg-[#0E1420]">
                  <div className="text-[11px] font-mono text-sky-400 uppercase tracking-wider">
                    Active Project Master Modules ({activeProject.masterSyllabusModules.length})
                  </div>
                  <div className="space-y-3">
                    {activeProject.masterSyllabusModules.map((mod, idx) => (
                      <div
                        key={`${mod.title}-${idx}`}
                        className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800/80 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-100">
                            {idx + 1}. {mod.title}
                          </span>
                          <span className="text-[11px] font-mono text-amber-400 shrink-0">
                            {mod.tier}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{mod.objective}</p>
                        <div className="text-[11px] text-slate-400">
                          Internals: {mod.keyInternals}
                        </div>
                        <div className="text-[11px] text-emerald-400/90">
                          Verify: {mod.verificationCriteria}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {focusDomainSkills.slice(0, 8).map((skill) => (
              <div
                key={skill.id}
                className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-800/25 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-medium text-slate-100 truncate">
                    {skill.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    <span
                      className={
                        skill.priority === 'Critical'
                          ? 'text-red-400'
                          : skill.priority === 'High'
                          ? 'text-amber-400'
                          : 'text-slate-400'
                      }
                    >
                      {skill.priority || 'Normal'}
                    </span>
                    {' · '}
                    {skill.tier}
                    {skill.projectTag ? ` · ${skill.projectTag}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-xs text-slate-300 tabular-nums">
                    {skill.mastery}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('matrix', skill.domain, { skillId: skill.id })
                    }
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
                  >
                    Brief
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
