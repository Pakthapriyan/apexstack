import type {
  AdaptedSyllabusResult,
  DailyQuest,
  Domain,
  DrillEvaluation,
  DrillMessage,
  GapAuditResult,
  JarvisResponse,
  JarvisTrigger,
  ProjectMission,
  SkillNode,
  SkillPriority,
  SyllabusProposal,
  SystemDailyQuestsResult,
  SystemMode,
  SystemUploadProjectResult,
  UserProfile,
  WorkLog,
} from '../types/learning';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data as T;
}

export interface MappedWorkResult {
  primaryDomain: Domain;
  domains: Domain[];
  extractedSkills: string[];
  matchedSkillTitles: string[];
  xpAwarded: number;
  elevationNote: string;
  suggestedFlashcard: {
    domain: Domain;
    skillTitle: string;
    prompt: string;
    answer: string;
    explanation: string;
  };
}

export function mapWorkLogWithAi(payload: {
  projectName: string;
  taskSummary: string;
  minutesSpent: number;
  currentSkills: SkillNode[];
}): Promise<MappedWorkResult> {
  return postJson<MappedWorkResult>('/api/ai/map-work-log', {
    projectName: payload.projectName,
    taskSummary: payload.taskSummary,
    minutesSpent: payload.minutesSpent,
    currentSkills: payload.currentSkills.map((s) => ({
      id: s.id,
      domain: s.domain,
      title: s.title,
      mastery: s.mastery,
    })),
  });
}

export function analyzeSkillGapsWithAi(payload: {
  skills: SkillNode[];
  recentWorkLogs: WorkLog[];
  weeklyHoursTarget: number;
}): Promise<GapAuditResult> {
  return postJson<GapAuditResult>('/api/ai/analyze-gaps', {
    skills: payload.skills.map((s) => ({
      domain: s.domain,
      title: s.title,
      tier: s.tier,
      priority: s.priority || 'Normal',
      projectTag: s.projectTag || '',
      mastery: s.mastery,
    })),
    recentWorkLogs: payload.recentWorkLogs.slice(0, 10).map((l) => ({
      projectName: l.projectName,
      primaryDomain: l.primaryDomain,
      taskSummary: l.taskSummary,
    })),
    weeklyHoursTarget: payload.weeklyHoursTarget,
  });
}

export function adaptSyllabusWithAi(payload: {
  projectTag?: string;
  defaultPriority: SkillPriority;
  rawTopicsText: string;
  currentSkills: SkillNode[];
}): Promise<AdaptedSyllabusResult> {
  return postJson<AdaptedSyllabusResult>('/api/ai/adapt-syllabus', {
    projectTag: payload.projectTag,
    defaultPriority: payload.defaultPriority,
    rawTopicsText: payload.rawTopicsText,
    currentSkills: payload.currentSkills.map((s) => ({
      domain: s.domain,
      title: s.title,
      tier: s.tier,
      priority: s.priority || 'Normal',
      mastery: s.mastery,
    })),
  });
}

export interface SyllabusAgentResponse {
  sessionTitle: string;
  assistantReply: string;
  shouldProposeUpdate: boolean;
  proposal: SyllabusProposal;
}

export function runSyllabusAgentWithAi(payload: {
  userMessage: string;
  projectContext: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  profile: UserProfile;
  skills: SkillNode[];
  workLogs: WorkLog[];
  dueCardsCount: number;
}): Promise<SyllabusAgentResponse> {
  return postJson<SyllabusAgentResponse>('/api/ai/syllabus-agent', {
    userMessage: payload.userMessage,
    projectContext: payload.projectContext,
    conversationHistory: payload.conversationHistory,
    progressSnapshot: {
      weeklyHoursTarget: payload.profile.weeklyHoursTarget,
      streakDays: payload.profile.streakDays,
      rotationMap: payload.profile.rotationMap,
      domainFocusMinutes: payload.profile.domainFocusMinutes,
      dueCardsCount: payload.dueCardsCount,
      skills: payload.skills.map((s) => ({
        domain: s.domain,
        title: s.title,
        tier: s.tier,
        priority: s.priority || 'Normal',
        projectTag: s.projectTag || '',
        mastery: s.mastery,
        practiceCount: s.practiceCount,
      })),
      recentWorkLogs: payload.workLogs.slice(0, 8).map((l) => ({
        projectName: l.projectName,
        primaryDomain: l.primaryDomain,
        taskSummary: l.taskSummary,
        minutesSpent: l.minutesSpent,
      })),
    },
  });
}

export function generateStudyBriefWithAi(payload: {
  domain: Domain;
  title: string;
  tier: string;
  description: string;
}): Promise<{ studyBrief: string; labPrompt: string }> {
  return postJson<{ studyBrief: string; labPrompt: string }>('/api/ai/generate-brief', payload);
}

export function startDrillWithAi(payload: {
  domain: string;
  difficulty: 'Senior' | 'Staff' | 'Principal';
}): Promise<{ title: string; scenarioPrompt: string; initialChallenge: string }> {
  return postJson('/api/ai/drill-step', {
    mode: 'start',
    domain: payload.domain,
    difficulty: payload.difficulty,
  });
}

export function respondDrillWithAi(payload: {
  domain: string;
  difficulty: 'Senior' | 'Staff' | 'Principal';
  scenarioPrompt: string;
  messages: DrillMessage[];
}): Promise<{ reply: string }> {
  return postJson('/api/ai/drill-step', {
    mode: 'respond',
    domain: payload.domain,
    difficulty: payload.difficulty,
    scenarioPrompt: payload.scenarioPrompt,
    messages: payload.messages,
  });
}

export function evaluateDrillWithAi(payload: {
  domain: string;
  difficulty: 'Senior' | 'Staff' | 'Principal';
  scenarioPrompt: string;
  messages: DrillMessage[];
}): Promise<DrillEvaluation> {
  return postJson('/api/ai/drill-step', {
    mode: 'evaluate',
    domain: payload.domain,
    difficulty: payload.difficulty,
    scenarioPrompt: payload.scenarioPrompt,
    messages: payload.messages,
  });
}

export function generateQuizCardsWithAi(payload: {
  domain: Domain;
  topic?: string;
  existingPrompts: string[];
}): Promise<{
  cards: Array<{
    domain: Domain;
    skillTitle: string;
    prompt: string;
    answer: string;
    explanation: string;
  }>;
}> {
  return postJson('/api/ai/generate-quiz', payload);
}

export function uploadProjectTaskWithSystemAi(payload: {
  projectName?: string;
  rawTaskBrief: string;
  weeklyHoursTarget: number;
  currentSkills: SkillNode[];
}): Promise<SystemUploadProjectResult> {
  return postJson<SystemUploadProjectResult>('/api/ai/system-upload-project', {
    projectName: payload.projectName,
    rawTaskBrief: payload.rawTaskBrief,
    weeklyHoursTarget: payload.weeklyHoursTarget,
    currentSkills: payload.currentSkills.map((s) => ({
      domain: s.domain,
      title: s.title,
      tier: s.tier,
      priority: s.priority || 'Normal',
      mastery: s.mastery,
    })),
  });
}

export function generateDailyQuestsWithSystemAi(payload: {
  dateKey: string;
  todaySlot: string;
  mode: SystemMode;
  activeProject?: ProjectMission | null;
  skills: SkillNode[];
  recentWorkLogs: WorkLog[];
  domainFocusMinutes: Record<Domain, number>;
  dueCardsCount: number;
  weeklyHoursTarget: number;
}): Promise<SystemDailyQuestsResult> {
  return postJson<SystemDailyQuestsResult>('/api/ai/system-daily-quests', {
    dateKey: payload.dateKey,
    todaySlot: payload.todaySlot,
    mode: payload.mode,
    activeProject: payload.activeProject
      ? {
          projectName: payload.activeProject.projectName,
          primaryDomain: payload.activeProject.primaryDomain,
          masteryGoal: payload.activeProject.masteryGoal,
          rawTaskBrief: payload.activeProject.rawTaskBrief,
          masterSyllabusModules: payload.activeProject.masterSyllabusModules,
        }
      : undefined,
    skills: payload.skills.map((s) => ({
      domain: s.domain,
      title: s.title,
      tier: s.tier,
      priority: s.priority || 'Normal',
      mastery: s.mastery,
      practiceCount: s.practiceCount,
    })),
    recentWorkLogs: payload.recentWorkLogs.slice(0, 6).map((l) => ({
      projectName: l.projectName,
      primaryDomain: l.primaryDomain,
      taskSummary: l.taskSummary,
    })),
    domainFocusMinutes: payload.domainFocusMinutes,
    dueCardsCount: payload.dueCardsCount,
    weeklyHoursTarget: payload.weeklyHoursTarget,
  });
}

export function askJarvisWithAi(payload: {
  userMessage: string;
  trigger: JarvisTrigger;
  currentScreen: {
    activePage: 'quests' | 'upload' | 'profile';
    profileDomainFilter: Domain | 'All';
    selectedSkillTitle?: string | null;
  };
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  profile: UserProfile;
  activeProject?: ProjectMission | null;
  skills: SkillNode[];
  todayQuests: DailyQuest[];
}): Promise<JarvisResponse> {
  return postJson<JarvisResponse>('/api/ai/jarvis', {
    userMessage: payload.userMessage,
    trigger: payload.trigger,
    currentScreen: payload.currentScreen,
    conversationHistory: payload.conversationHistory.slice(-8),
    context: {
      weeklyHoursTarget: payload.profile.weeklyHoursTarget,
      streakDays: payload.profile.streakDays,
      rotationMap: payload.profile.rotationMap,
      domainFocusMinutes: payload.profile.domainFocusMinutes,
      activeProject: payload.activeProject
        ? {
            projectName: payload.activeProject.projectName,
            primaryDomain: payload.activeProject.primaryDomain,
            domains: payload.activeProject.domains,
            rank: payload.activeProject.rank,
            masteryGoal: payload.activeProject.masteryGoal,
            masterSyllabusModules: payload.activeProject.masterSyllabusModules,
          }
        : null,
      skills: payload.skills.map((s) => ({
        domain: s.domain,
        title: s.title,
        tier: s.tier,
        priority: s.priority || 'Normal',
        mastery: s.mastery,
        description: s.description,
        studyBrief: (s.studyBrief || '').slice(0, 900),
        labPrompt: (s.labPrompt || '').slice(0, 600),
      })),
      todayQuests: payload.todayQuests.map((q) => ({
        id: q.id,
        title: q.title,
        domain: q.domain,
        questType: q.questType,
        rank: q.rank,
        status: q.status,
        objective: q.objective,
        masteryChecklist: q.masteryChecklist,
        linkedSkillTitle: q.linkedSkillTitle,
        estimatedMinutes: q.estimatedMinutes,
        xpReward: q.xpReward,
      })),
    },
  });
}
