export type Domain = 'Angular' | 'FastAPI' | 'DevOps' | 'AWS' | 'GCP';

export type SkillTier = 'Foundational' | 'Senior' | 'Top 1%';

export type SkillPriority = 'Critical' | 'High' | 'Normal';

export type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type RotationSlot = Domain | 'Multi-Cloud Synthesis' | 'Review & Gap Audit';

export interface UserProfile {
  userId: string;
  displayName: string;
  roleTitle: string;
  weeklyHoursTarget: number;
  calibrated: boolean;
  streakDays: number;
  lastActiveDate: string;
  rotationMap: Record<DayKey, RotationSlot>;
  completedRotationDays: DayKey[];
  domainFocusMinutes: Record<Domain, number>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SkillNode {
  id: string;
  userId: string;
  domain: Domain;
  title: string;
  tier: SkillTier;
  priority?: SkillPriority;
  projectTag?: string;
  mastery: number;
  targetMastery: number;
  description: string;
  studyBrief: string;
  labPrompt: string;
  practiceCount: number;
  lastPracticedAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WorkLog {
  id: string;
  userId: string;
  projectName: string;
  taskSummary: string;
  primaryDomain: Domain;
  domains: Domain[];
  extractedSkills: string[];
  elevationNote: string;
  xpAwarded: number;
  minutesSpent: number;
  createdAt?: unknown;
}

export interface DrillMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

export interface DrillEvaluation {
  overallScore: number;
  architectureScore: number;
  reliabilityScore: number;
  securityScore: number;
  performanceScore: number;
  strengths: string[];
  gaps: string[];
  nextSteps: string;
}

export interface IncidentDrill {
  id: string;
  userId: string;
  domain: string;
  title: string;
  difficulty: 'Senior' | 'Staff' | 'Principal';
  scenarioPrompt: string;
  status: 'active' | 'completed';
  messages: DrillMessage[];
  evaluation?: DrillEvaluation;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReviewCard {
  id: string;
  userId: string;
  domain: Domain;
  skillTitle: string;
  prompt: string;
  answer: string;
  explanation: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: string;
  lastReviewedAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GapAuditResult {
  executiveSummary: string;
  priorityGaps: Array<{
    domain: Domain;
    title: string;
    tier: SkillTier;
    whyItMatters: string;
    concreteAction: string;
  }>;
  recommendedSkillsToAdd: Array<{
    domain: Domain;
    title: string;
    tier: SkillTier;
    description: string;
    labPrompt: string;
  }>;
}

export interface AdaptedSyllabusResult {
  adaptationSummary: string;
  recommendedWeeklyFocusOrder: Domain[];
  newTopics: Array<{
    domain: Domain;
    title: string;
    tier: SkillTier;
    priority: SkillPriority;
    description: string;
    studyBrief: string;
    labPrompt: string;
  }>;
  prioritizeExistingTitles: Array<{
    existingTitle: string;
    priority: SkillPriority;
    reason: string;
  }>;
  suggestedCards: Array<{
    domain: Domain;
    skillTitle: string;
    prompt: string;
    answer: string;
    explanation: string;
  }>;
}

export interface SyllabusProposal {
  summary: string;
  projectTag: string;
  weeklyFocusOrder: Domain[];
  addTopics: Array<{
    domain: Domain;
    title: string;
    tier: SkillTier;
    priority: SkillPriority;
    description: string;
    studyBrief: string;
    labPrompt: string;
  }>;
  updateTopics: Array<{
    existingTitle: string;
    tier: SkillTier;
    priority: SkillPriority;
    projectTag: string;
    reason: string;
    updatedStudyBrief?: string;
    updatedLabPrompt?: string;
  }>;
  removeOrDemoteTitles: Array<{
    existingTitle: string;
    action: 'demote' | 'remove';
    reason: string;
  }>;
  newReviewCards: Array<{
    domain: Domain;
    skillTitle: string;
    prompt: string;
    answer: string;
    explanation: string;
  }>;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  proposal?: SyllabusProposal;
  applied?: boolean;
}

export interface AgentSession {
  id: string;
  userId: string;
  title: string;
  projectContext: string;
  messages: AgentMessage[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SystemRank = 'E-Rank' | 'D-Rank' | 'C-Rank' | 'B-Rank' | 'A-Rank' | 'S-Rank';

export type QuestType =
  | 'Project Execution'
  | 'Domain Mastery'
  | 'Production Drill'
  | 'Active Recall';

export type SystemMode = 'project_override' | 'normal_routine';

export interface MasterSyllabusModule {
  title: string;
  domain: Domain;
  tier: SkillTier;
  objective: string;
  keyInternals: string;
  verificationCriteria: string;
}

export interface ProjectMission {
  id: string;
  userId: string;
  projectName: string;
  rawTaskBrief: string;
  primaryDomain: Domain;
  domains: Domain[];
  status: 'active' | 'completed';
  rank: 'C-Rank' | 'B-Rank' | 'A-Rank' | 'S-Rank';
  masteryGoal: string;
  linkedSkillTitles: string[];
  masterSyllabusModules: MasterSyllabusModule[];
  completedAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DailyQuest {
  id: string;
  userId: string;
  dateKey: string;
  mode: SystemMode;
  projectMissionId: string;
  projectName: string;
  domain: Domain;
  questType: QuestType;
  rank: SystemRank;
  title: string;
  objective: string;
  masteryChecklist: string[];
  linkedSkillTitle: string;
  estimatedMinutes: number;
  xpReward: number;
  status: 'pending' | 'completed';
  completedAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GeneratedQuestDraft {
  domain: Domain;
  questType: QuestType;
  rank: SystemRank;
  title: string;
  objective: string;
  masteryChecklist: string[];
  linkedSkillTitle: string;
  estimatedMinutes: number;
  xpReward: number;
}

export interface SystemUploadProjectResult {
  projectName: string;
  primaryDomain: Domain;
  domains: Domain[];
  rank: 'C-Rank' | 'B-Rank' | 'A-Rank' | 'S-Rank';
  masteryGoal: string;
  systemAnnouncement: string;
  weeklyFocusOrder: Domain[];
  masterSyllabusModules: MasterSyllabusModule[];
  existingSkillsToElevate: Array<{
    existingTitle: string;
    priority: SkillPriority;
    reason: string;
  }>;
  newSkillNodes: Array<{
    domain: Domain;
    title: string;
    tier: SkillTier;
    priority: SkillPriority;
    description: string;
    studyBrief: string;
    labPrompt: string;
  }>;
  dailyQuests: GeneratedQuestDraft[];
  suggestedCards: Array<{
    domain: Domain;
    skillTitle: string;
    prompt: string;
    answer: string;
    explanation: string;
  }>;
  aiNotice?: string;
}

export interface SystemDailyQuestsResult {
  systemDirective: string;
  focusDomain: Domain;
  dailyQuests: GeneratedQuestDraft[];
  aiNotice?: string;
}

export type JarvisTrigger = 'user_chat' | 'post_upload_brief' | 'proactive_scan';

export type JarvisInteractiveMode = 'mentor' | 'walkthrough' | 'quiz';

export type JarvisAction =
  | {
      type: 'navigate';
      page: 'quests' | 'upload' | 'profile';
      domainFilter?: Domain | 'All';
    }
  | {
      type: 'open_skill';
      skillTitle: string;
      domain?: Domain;
    }
  | {
      type: 'focus_quest';
      questIdOrTitle: string;
    }
  | {
      type: 'complete_quest';
      questIdOrTitle: string;
    }
  | {
      type: 'refresh_study_brief';
      skillTitle: string;
      domain?: Domain;
    }
  | {
      type: 'prefill_upload';
      projectName?: string;
      rawTaskBrief?: string;
    }
  | {
      type: 'refresh_quests';
    }
  | {
      type: 'close_skill_drawer';
    };

export interface JarvisResponse {
  headline: string;
  reply: string;
  codeSnippet?: string;
  interactiveMode?: JarvisInteractiveMode;
  uiActions: JarvisAction[];
  suggestedFollowUps: string[];
  aiNotice?: string;
}

export interface JarvisMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  headline?: string;
  codeSnippet?: string;
  interactiveMode?: JarvisInteractiveMode;
  executedActions?: string[];
  suggestedFollowUps?: string[];
  timestamp: string;
}


