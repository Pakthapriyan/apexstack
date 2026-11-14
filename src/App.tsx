import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Swords, Upload, User as UserIcon } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { CalibrationView } from './components/CalibrationView';
import { CelebrationOverlay, type CelebrationEvent } from './components/CelebrationOverlay';
import { JarvisConsole } from './components/JarvisConsole';
import { ProfilePage } from './components/ProfilePage';
import { QuestsPage, type SimplePage } from './components/QuestsPage';
import { UploadTaskPage } from './components/UploadTaskPage';
import {
  askJarvisWithAi,
  generateDailyQuestsWithSystemAi,
  generateStudyBriefWithAi,
} from './lib/aiClient';
import { computeMilestones } from './data/milestones';
import { auth } from './lib/firebase';
import {
  completeDailyQuestAtomic,
  ensureUserWorkspace,
  getTodayDayKey,
  getTodayIsoDate,
  saveGeneratedDailyQuests,
  saveSkillBrief,
  subscribeDailyQuests,
  subscribeProjectMissions,
  subscribeSkills,
  subscribeUserProfile,
  subscribeWorkLogs,
} from './lib/firestoreService';
import type {
  DailyQuest,
  Domain,
  JarvisAction,
  JarvisMessage,
  JarvisTrigger,
  ProjectMission,
  SkillNode,
  SystemUploadProjectResult,
  UserProfile,
  WorkLog,
} from './types/learning';

const NAV_ITEMS: Array<{
  id: SimplePage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'quests', label: 'Quests', icon: Swords },
  { id: 'upload', label: 'Upload Task', icon: Upload },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [skills, setSkills] = useState<SkillNode[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [projectMissions, setProjectMissions] = useState<ProjectMission[]>([]);
  const [dailyQuests, setDailyQuests] = useState<DailyQuest[]>([]);
  const [missionsSynced, setMissionsSynced] = useState(false);
  const [questsSynced, setQuestsSynced] = useState(false);
  const [autoGeneratingQuests, setAutoGeneratingQuests] = useState(false);
  const autoQuestAttemptRef = useRef<string | null>(null);

  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const [activePage, setActivePage] = useState<SimplePage>('quests');
  const [profileDomainFilter, setProfileDomainFilter] = useState<Domain | 'All'>('All');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [focusedQuestId, setFocusedQuestId] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);

  // JARVIS command mentor state
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [jarvisLoading, setJarvisLoading] = useState(false);
  const [jarvisMessages, setJarvisMessages] = useState<JarvisMessage[]>([]);
  const [prefilledUpload, setPrefilledUpload] = useState<{
    projectName?: string;
    rawTaskBrief?: string;
    nonce: number;
  } | null>(null);
  const proactiveScanUserRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setSkills([]);
        setWorkLogs([]);
        setProjectMissions([]);
        setDailyQuests([]);
        setMissionsSynced(false);
        setQuestsSynced(false);
        autoQuestAttemptRef.current = null;
        proactiveScanUserRef.current = null;
        setWorkspaceReady(false);
        setJarvisMessages([]);
        setJarvisOpen(false);
        setPrefilledUpload(null);
        setSelectedSkillId(null);
        setFocusedQuestId(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    let active = true;
    const unsubs: Array<() => void> = [];

    async function init() {
      if (!user) return;
      try {
        await ensureUserWorkspace(user.uid, user.displayName || user.email || 'Engineer');
        if (!active) return;

        // Subscribe only to active collections to keep Firestore free-tier usage minimal
        unsubs.push(
          subscribeUserProfile(user.uid, (p) => {
            setProfile(p);
            setWorkspaceReady(true);
          }),
          subscribeSkills(user.uid, setSkills),
          subscribeWorkLogs(user.uid, setWorkLogs),
          subscribeProjectMissions(user.uid, (rows) => {
            setProjectMissions(rows);
            setMissionsSynced(true);
          }),
          subscribeDailyQuests(user.uid, (rows) => {
            setDailyQuests(rows);
            setQuestsSynced(true);
          })
        );
      } catch (err) {
        if (active) {
          setBootError(err instanceof Error ? err.message : 'Failed to initialize workspace.');
        }
      }
    }

    void init();

    return () => {
      active = false;
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, user]);

  const activeProject = useMemo(
    () => projectMissions.find((m) => m.status === 'active') || null,
    [projectMissions]
  );

  const todayKey = getTodayIsoDate();

  const todayQuests = useMemo(
    () => dailyQuests.filter((q) => q.dateKey === todayKey),
    [dailyQuests, todayKey]
  );

  const pendingTodayQuestsCount = useMemo(
    () => todayQuests.filter((q) => q.status === 'pending').length,
    [todayQuests]
  );

  const selectedSkillTitle = useMemo(
    () => skills.find((s) => s.id === selectedSkillId)?.title || null,
    [skills, selectedSkillId]
  );

  // Automatically issue today's daily quests when calibrated and none exist for today
  useEffect(() => {
    if (
      !workspaceReady ||
      !profile?.calibrated ||
      !missionsSynced ||
      !questsSynced ||
      skills.length === 0 ||
      autoGeneratingQuests
    ) {
      return;
    }

    if (todayQuests.length > 0) return;

    const mode = activeProject ? 'project_override' : 'normal_routine';
    const attemptKey = `${profile.userId}-${todayKey}-${mode}-${activeProject?.id || 'normal'}`;
    if (autoQuestAttemptRef.current === attemptKey) return;

    autoQuestAttemptRef.current = attemptKey;
    setAutoGeneratingQuests(true);

    const todaySlot = profile.rotationMap[getTodayDayKey()];
    generateDailyQuestsWithSystemAi({
      dateKey: todayKey,
      todaySlot,
      mode,
      activeProject,
      skills,
      recentWorkLogs: workLogs,
      domainFocusMinutes: profile.domainFocusMinutes,
      dueCardsCount: 0,
      weeklyHoursTarget: profile.weeklyHoursTarget,
    })
      .then((res) => {
        if (res.aiNotice) {
          setSystemNotice(res.aiNotice);
        }
        return saveGeneratedDailyQuests(
          profile.userId,
          todayKey,
          mode,
          activeProject,
          [],
          res.dailyQuests
        );
      })
      .catch((err) => {
        console.error('Auto daily quest generation failed:', err);
        setSystemNotice(
          err instanceof Error ? err.message : 'Unable to automatically generate daily quests.'
        );
      })
      .finally(() => {
        setAutoGeneratingQuests(false);
      });
  }, [
    workspaceReady,
    profile,
    missionsSynced,
    questsSynced,
    skills,
    todayQuests,
    activeProject,
    workLogs,
    autoGeneratingQuests,
    todayKey,
  ]);

  const handleNavigate = useCallback((page: SimplePage, domainFilter?: Domain) => {
    if (page === 'profile') {
      setProfileDomainFilter(domainFilter || 'All');
    } else {
      setSelectedSkillId(null);
    }
    setActivePage(page);
  }, []);

  const refreshDailyQuestsFromJarvis = useCallback(async () => {
    if (!profile || autoGeneratingQuests) return;
    setAutoGeneratingQuests(true);
    try {
      const mode = activeProject ? 'project_override' : 'normal_routine';
      const todaySlot = profile.rotationMap[getTodayDayKey()];
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
      if (generated.aiNotice) {
        setSystemNotice(generated.aiNotice);
      }
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
      setSystemNotice(
        err instanceof Error ? err.message : 'Unable to refresh daily quests.'
      );
    } finally {
      setAutoGeneratingQuests(false);
    }
  }, [profile, autoGeneratingQuests, activeProject, todayKey, skills, workLogs, todayQuests]);

  const completeQuestFromJarvis = useCallback(
    async (quest: DailyQuest) => {
      if (!profile || quest.status === 'completed') return;
      try {
        const beforeUnlocked = new Set(
          computeMilestones({
            profile,
            skills,
            missions: projectMissions,
            quests: dailyQuests,
            todayKey,
          })
            .filter((m) => m.unlocked)
            .map((m) => m.id)
        );

        await completeDailyQuestAtomic(profile.userId, profile, skills, quest);

        const simulatedQuests = dailyQuests.map((q) =>
          q.id === quest.id ? { ...q, status: 'completed' as const } : q
        );
        const afterMilestones = computeMilestones({
          profile,
          skills,
          missions: projectMissions,
          quests: simulatedQuests,
          todayKey,
        });
        const newlyUnlocked = afterMilestones
          .filter((m) => m.unlocked && !beforeUnlocked.has(m.id))
          .map((m) => m.title);

        const nextPending = todayQuests.find(
          (q) => q.id !== quest.id && q.status === 'pending'
        );
        setFocusedQuestId(nextPending ? nextPending.id : null);

        setCelebration({
          kind: 'quest',
          title: `${quest.title} Cleared`,
          subtitle: `JARVIS verified quest completion. +${quest.xpReward} XP and ${quest.domain} mastery boosted.`,
          xpAwarded: quest.xpReward,
          domain: quest.domain,
          unlockedMilestones: newlyUnlocked,
        });
      } catch (err) {
        setSystemNotice(
          err instanceof Error ? err.message : 'Unable to complete quest via JARVIS.'
        );
      }
    },
    [profile, skills, projectMissions, dailyQuests, todayKey, todayQuests]
  );

  const refreshSkillBriefFromJarvis = useCallback(
    async (skill: SkillNode) => {
      if (!profile) return;
      try {
        const res = await generateStudyBriefWithAi({
          domain: skill.domain,
          title: skill.title,
          tier: skill.tier,
          description: skill.description,
        });
        await saveSkillBrief(profile.userId, skill.id, res.studyBrief, res.labPrompt);
      } catch (err) {
        setSystemNotice(
          err instanceof Error ? err.message : 'Unable to refresh study brief.'
        );
      }
    },
    [profile]
  );

  const executeJarvisActions = useCallback(
    (actions: JarvisAction[], candidateQuests: DailyQuest[] = todayQuests): string[] => {
      const trace: string[] = [];

      const findSkill = (title: string, domain?: Domain) => {
        const targetLower = (title || '').toLowerCase();
        return (
          skills.find((s) => s.title.toLowerCase() === targetLower) ||
          skills.find(
            (s) =>
              targetLower.length > 0 &&
              (s.title.toLowerCase().includes(targetLower) ||
                targetLower.includes(s.title.toLowerCase()))
          ) ||
          (domain
            ? skills
                .filter((s) => s.domain === domain)
                .sort((a, b) => a.mastery - b.mastery)[0]
            : undefined)
        );
      };

      const findQuest = (questIdOrTitle: string, pendingOnly = false) => {
        const pool = pendingOnly
          ? candidateQuests.filter((q) => q.status === 'pending')
          : candidateQuests;
        const qLower = (questIdOrTitle || '').toLowerCase();
        return (
          pool.find((q) => q.id === questIdOrTitle) ||
          pool.find((q) => q.title.toLowerCase() === qLower) ||
          pool.find(
            (q) =>
              qLower.length > 0 &&
              (q.title.toLowerCase().includes(qLower) ||
                qLower.includes(q.title.toLowerCase()))
          ) ||
          pool[0] ||
          candidateQuests[0]
        );
      };

      for (const act of actions) {
        if (act.type === 'navigate') {
          if (act.page === 'profile') {
            setProfileDomainFilter(act.domainFilter || 'All');
            trace.push(
              `Switched screen → Profile${act.domainFilter && act.domainFilter !== 'All' ? ` (${act.domainFilter})` : ''}`
            );
          } else if (act.page === 'upload') {
            setSelectedSkillId(null);
            trace.push('Switched screen → Upload Task');
          } else {
            setSelectedSkillId(null);
            trace.push('Switched screen → Quests');
          }
          setActivePage(act.page);
        } else if (act.type === 'open_skill') {
          const matchedSkill = findSkill(act.skillTitle, act.domain);
          if (matchedSkill) {
            setProfileDomainFilter(act.domain || matchedSkill.domain);
            setActivePage('profile');
            setSelectedSkillId(matchedSkill.id);
            trace.push(`Opened Study Brief → ${matchedSkill.title}`);
          } else {
            setProfileDomainFilter(act.domain || 'All');
            setActivePage('profile');
            trace.push(`Switched screen → Profile (${act.domain || 'All'})`);
          }
        } else if (act.type === 'refresh_study_brief') {
          const matchedSkill = findSkill(act.skillTitle, act.domain);
          if (matchedSkill) {
            setProfileDomainFilter(act.domain || matchedSkill.domain);
            setActivePage('profile');
            setSelectedSkillId(matchedSkill.id);
            void refreshSkillBriefFromJarvis(matchedSkill);
            trace.push(`Refreshed Study Brief → ${matchedSkill.title}`);
          }
        } else if (act.type === 'close_skill_drawer') {
          setSelectedSkillId(null);
          trace.push('Closed Study Brief drawer');
        } else if (act.type === 'focus_quest') {
          const matchedQuest = findQuest(act.questIdOrTitle, false);
          setSelectedSkillId(null);
          setActivePage('quests');
          if (matchedQuest) {
            setFocusedQuestId(matchedQuest.id);
            trace.push(`Focused Quest → ${matchedQuest.title}`);
          }
        } else if (act.type === 'complete_quest') {
          const matchedQuest = findQuest(act.questIdOrTitle, true);
          setSelectedSkillId(null);
          setActivePage('quests');
          if (matchedQuest && matchedQuest.status === 'pending') {
            void completeQuestFromJarvis(matchedQuest);
            trace.push(`Completed Quest → ${matchedQuest.title} (+${matchedQuest.xpReward} XP)`);
          }
        } else if (act.type === 'prefill_upload') {
          setSelectedSkillId(null);
          setPrefilledUpload({
            projectName: act.projectName,
            rawTaskBrief: act.rawTaskBrief,
            nonce: Date.now(),
          });
          setActivePage('upload');
          trace.push(
            `Opened Upload Task & prefilled "${act.projectName || 'Project Spec'}"`
          );
        } else if (act.type === 'refresh_quests') {
          setSelectedSkillId(null);
          setActivePage('quests');
          void refreshDailyQuestsFromJarvis();
          trace.push('Triggered Daily Quest refresh');
        }
      }

      return Array.from(new Set(trace));
    },
    [
      skills,
      todayQuests,
      refreshDailyQuestsFromJarvis,
      completeQuestFromJarvis,
      refreshSkillBriefFromJarvis,
    ]
  );

  const runJarvisTurn = useCallback(
    async (opts: {
      userMessage: string;
      trigger: JarvisTrigger;
      showUserBubble?: boolean;
      overrideActiveProject?: ProjectMission | null;
      overrideTodayQuests?: DailyQuest[];
    }) => {
      if (!profile || jarvisLoading) return;

      const trimmed = opts.userMessage.trim();
      const historySnapshot = jarvisMessages
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      if (opts.showUserBubble !== false && trimmed) {
        const userEntry: JarvisMessage = {
          id: `u-${Date.now()}`,
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
        };
        setJarvisMessages((prev) => [...prev, userEntry]);
      }

      setJarvisOpen(true);
      setJarvisLoading(true);

      const effectiveProject =
        opts.overrideActiveProject !== undefined ? opts.overrideActiveProject : activeProject;
      const effectiveQuests =
        opts.overrideTodayQuests !== undefined ? opts.overrideTodayQuests : todayQuests;

      try {
        const res = await askJarvisWithAi({
          userMessage: trimmed,
          trigger: opts.trigger,
          currentScreen: {
            activePage,
            profileDomainFilter,
            selectedSkillTitle,
          },
          conversationHistory: historySnapshot,
          profile,
          activeProject: effectiveProject,
          skills,
          todayQuests: effectiveQuests,
        });

        const executedActions = executeJarvisActions(res.uiActions || [], effectiveQuests);
        const assistantEntry: JarvisMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          headline: res.headline,
          content: res.reply,
          codeSnippet: res.codeSnippet || undefined,
          interactiveMode: res.interactiveMode || 'mentor',
          executedActions,
          suggestedFollowUps: res.suggestedFollowUps,
          timestamp: new Date().toISOString(),
        };
        setJarvisMessages((prev) => [...prev, assistantEntry]);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'Unable to reach JARVIS mentor right now.';
        setJarvisMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            headline: 'Command Warning',
            content: errMsg,
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setJarvisLoading(false);
      }
    },
    [
      profile,
      jarvisLoading,
      jarvisMessages,
      activeProject,
      todayQuests,
      activePage,
      profileDomainFilter,
      selectedSkillTitle,
      skills,
      executeJarvisActions,
    ]
  );

  const handleProjectActivated = useCallback(
    (aiPlan: SystemUploadProjectResult) => {
      if (!profile) return;

      // Construct immediate snapshot so JARVIS analyzes the uploaded plan even before Firestore listener ticks
      const syntheticProject: ProjectMission = {
        id: 'pending-sync',
        userId: profile.userId,
        projectName: aiPlan.projectName,
        rawTaskBrief: aiPlan.masteryGoal,
        primaryDomain: aiPlan.primaryDomain,
        domains: aiPlan.domains,
        status: 'active',
        rank: aiPlan.rank,
        masteryGoal: aiPlan.masteryGoal,
        linkedSkillTitles: [],
        masterSyllabusModules: aiPlan.masterSyllabusModules,
        completedAt: '',
      };

      const syntheticQuests: DailyQuest[] =
        todayQuests.some((q) => q.projectName === aiPlan.projectName)
          ? todayQuests
          : aiPlan.dailyQuests.map((q, idx) => ({
              id: `draft-${idx}`,
              userId: profile.userId,
              dateKey: todayKey,
              mode: 'project_override',
              projectMissionId: 'pending-sync',
              projectName: aiPlan.projectName,
              domain: q.domain,
              questType: q.questType,
              rank: q.rank,
              title: q.title,
              objective: q.objective,
              masteryChecklist: q.masteryChecklist,
              linkedSkillTitle: q.linkedSkillTitle,
              estimatedMinutes: q.estimatedMinutes,
              xpReward: q.xpReward,
              status: 'pending',
              completedAt: '',
            }));

      void runJarvisTurn({
        userMessage: `Analyze newly uploaded project "${aiPlan.projectName}" and tell me step-by-step what to execute first.`,
        trigger: 'post_upload_brief',
        showUserBubble: false,
        overrideActiveProject: syntheticProject,
        overrideTodayQuests: syntheticQuests,
      });
    },
    [profile, todayQuests, todayKey, runJarvisTurn]
  );

  const handleAskJarvisFromScreen = useCallback(
    (prompt: string) => {
      void runJarvisTurn({
        userMessage: prompt,
        trigger: 'user_chat',
        showUserBubble: true,
      });
    },
    [runJarvisTurn]
  );

  // Proactive JARVIS startup briefing once workspace, skills, missions, and quests sync on desktop
  useEffect(() => {
    if (
      !workspaceReady ||
      !profile?.calibrated ||
      !missionsSynced ||
      !questsSynced ||
      skills.length === 0 ||
      todayQuests.length === 0 ||
      jarvisMessages.length > 0 ||
      jarvisLoading
    ) {
      return;
    }

    if (proactiveScanUserRef.current === profile.userId) return;
    proactiveScanUserRef.current = profile.userId;

    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      void runJarvisTurn({
        userMessage: 'Analyze my active project and today’s quests and tell me what to do next.',
        trigger: 'proactive_scan',
        showUserBubble: false,
      });
    }
  }, [
    workspaceReady,
    profile,
    missionsSynced,
    questsSynced,
    skills,
    todayQuests,
    jarvisMessages.length,
    jarvisLoading,
    runJarvisTurn,
  ]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center">
        <div className="text-xs font-mono text-slate-400">Initializing session...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  if (bootError) {
    return (
      <div className="min-h-screen bg-[#0B0F17] text-[#F1F5F9] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-[#121824] border border-red-800/60 rounded-xl p-6 space-y-4">
          <h1 className="font-display text-lg font-semibold text-red-200">
            Workspace Sync Error
          </h1>
          <p className="text-xs font-mono text-red-300/90 break-words">{bootError}</p>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 cursor-pointer"
          >
            Sign out and retry
          </button>
        </div>
      </div>
    );
  }

  if (!workspaceReady || !profile) {
    return (
      <div className="min-h-screen bg-[#0B0F17] p-6 md:p-10">
        <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
          <div className="h-10 w-56 bg-[#121824] rounded-lg border border-slate-800/80" />
          <div className="h-28 bg-[#121824] rounded-xl border border-slate-800/80" />
          <div className="h-72 bg-[#121824] rounded-xl border border-slate-800/80" />
        </div>
      </div>
    );
  }

  if (!profile.calibrated) {
    return <CalibrationView profile={profile} skills={skills} />;
  }

  return (
    <div
      className={`min-h-screen bg-[#0B0F17] text-[#F1F5F9] flex flex-col transition-[padding] duration-200 ${
        jarvisOpen ? 'lg:pr-[440px]' : ''
      }`}
    >
      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur-sm border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Wordmark */}
          <span className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
            ApexStack
          </span>

          {/* Zone 2: 3 Primary Pages */}
          <nav className="flex items-center gap-4 sm:gap-6" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`inline-flex items-center gap-1.5 py-1 text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'border-sky-400 text-slate-50 font-semibold'
                      : 'border-transparent text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                  <span>{item.label}</span>
                  {item.id === 'quests' && pendingTodayQuestsCount > 0 && (
                    <span className="font-mono text-[11px] text-sky-400 tabular-nums">
                      ({pendingTodayQuestsCount})
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="hidden sm:flex items-center shrink-0">
            <button
              type="button"
              onClick={() =>
                handleNavigate(activePage === 'upload' ? 'quests' : 'upload')
              }
              className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {activePage === 'upload' ? 'View Quests' : 'Upload Project'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-8 pb-20">
        {activePage === 'quests' && (
          <QuestsPage
            profile={profile}
            skills={skills}
            workLogs={workLogs}
            missions={projectMissions}
            quests={dailyQuests}
            autoGenerating={autoGeneratingQuests}
            focusedQuestId={focusedQuestId}
            systemNotice={systemNotice}
            onDismissNotice={() => setSystemNotice(null)}
            onNavigate={handleNavigate}
            onCelebrate={setCelebration}
            onAskJarvis={handleAskJarvisFromScreen}
          />
        )}

        {activePage === 'upload' && (
          <UploadTaskPage
            profile={profile}
            skills={skills}
            workLogs={workLogs}
            missions={projectMissions}
            quests={dailyQuests}
            prefilledUpload={prefilledUpload}
            onNotify={setSystemNotice}
            onNavigate={(page) => handleNavigate(page)}
            onCelebrate={setCelebration}
            onProjectActivated={handleProjectActivated}
            onAskJarvis={handleAskJarvisFromScreen}
          />
        )}

        {activePage === 'profile' && (
          <ProfilePage
            user={user}
            profile={profile}
            skills={skills}
            missions={projectMissions}
            quests={dailyQuests}
            domainFilter={profileDomainFilter}
            onDomainFilterChange={setProfileDomainFilter}
            selectedSkillId={selectedSkillId}
            onSelectSkillId={setSelectedSkillId}
            onAskJarvis={handleAskJarvisFromScreen}
            jarvisOpen={jarvisOpen}
          />
        )}
      </main>

      <JarvisConsole
        open={jarvisOpen}
        loading={jarvisLoading}
        messages={jarvisMessages}
        activePage={activePage}
        profileDomainFilter={profileDomainFilter}
        selectedSkillTitle={selectedSkillTitle}
        activeProject={activeProject}
        pendingQuestsCount={pendingTodayQuestsCount}
        onToggleOpen={setJarvisOpen}
        onSendMessage={(msg) =>
          void runJarvisTurn({
            userMessage: msg,
            trigger: 'user_chat',
            showUserBubble: true,
          })
        }
        onAnalyzeNow={() =>
          void runJarvisTurn({
            userMessage: 'Analyze my active project and today’s quests and tell me what to do next.',
            trigger: 'proactive_scan',
            showUserBubble: true,
          })
        }
      />

      <CelebrationOverlay
        event={celebration}
        onDismiss={() => setCelebration(null)}
      />
    </div>
  );
}

