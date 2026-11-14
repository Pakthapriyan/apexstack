import { DOMAINS } from './seedCurriculum';
import type { DailyQuest, ProjectMission, SkillNode, UserProfile } from '../types/learning';

export interface MilestoneItem {
  id: string;
  title: string;
  category: 'Quests' | 'Projects' | 'Mastery' | 'Consistency';
  description: string;
  current: number;
  target: number;
  unlocked: boolean;
  rewardLabel: string;
}

export function computeMilestones(params: {
  profile: UserProfile;
  skills: SkillNode[];
  missions: ProjectMission[];
  quests: DailyQuest[];
  todayKey: string;
}): MilestoneItem[] {
  const { profile, skills, missions, quests, todayKey } = params;

  const completedQuestsCount = quests.filter((q) => q.status === 'completed').length;
  const todayQuests = quests.filter((q) => q.dateKey === todayKey);
  const todayCleared = todayQuests.filter((q) => q.status === 'completed').length;
  const todayTarget = Math.max(1, todayQuests.length);
  const completedMissionsCount = missions.filter((m) => m.status === 'completed').length;

  const domainAvgs = DOMAINS.map((domain) => {
    const subset = skills.filter((s) => s.domain === domain);
    return subset.length > 0
      ? Math.round(subset.reduce((sum, s) => sum + s.mastery, 0) / subset.length)
      : 0;
  });
  const bestDomainAvg = Math.max(0, ...domainAvgs);
  const overallMastery =
    skills.length > 0
      ? Math.round(skills.reduce((sum, s) => sum + s.mastery, 0) / skills.length)
      : 0;
  const top1Mastered = skills.filter((s) => s.tier === 'Top 1%' && s.mastery >= 80).length;

  return [
    {
      id: 'first-quest',
      title: 'First Quest Cleared',
      category: 'Quests',
      description: 'Complete your first daily System Quest.',
      current: Math.min(1, completedQuestsCount),
      target: 1,
      unlocked: completedQuestsCount >= 1,
      rewardLabel: '+1 Quest Streak Start',
    },
    {
      id: 'daily-sweep',
      title: 'Daily Full Clear',
      category: 'Quests',
      description: 'Complete every quest assigned for today.',
      current: todayQuests.length > 0 ? todayCleared : 0,
      target: todayTarget,
      unlocked: todayQuests.length > 0 && todayCleared >= todayQuests.length,
      rewardLabel: '100% Daily Clearance',
    },
    {
      id: 'quest-veteran',
      title: '10 Quests Completed',
      category: 'Quests',
      description: 'Clear 10 daily engineering and mastery quests.',
      current: Math.min(10, completedQuestsCount),
      target: 10,
      unlocked: completedQuestsCount >= 10,
      rewardLabel: 'B-Rank Momentum',
    },
    {
      id: 'project-vanguard',
      title: 'Project Override Activated',
      category: 'Projects',
      description: 'Upload a project task so the System restructures your syllabus.',
      current: Math.min(1, missions.length),
      target: 1,
      unlocked: missions.length >= 1,
      rewardLabel: 'Priority Syllabus Sync',
    },
    {
      id: 'mission-cleared',
      title: 'Project Mission Completed',
      category: 'Projects',
      description: 'Finish an active project mission and return to Normal Routine.',
      current: Math.min(1, completedMissionsCount),
      target: 1,
      unlocked: completedMissionsCount >= 1,
      rewardLabel: '+250 Mission Bonus XP',
    },
    {
      id: 'streak-3',
      title: '3-Day Consistency Streak',
      category: 'Consistency',
      description: 'Stay active across 3 consecutive days.',
      current: Math.min(3, profile.streakDays),
      target: 3,
      unlocked: profile.streakDays >= 3,
      rewardLabel: 'Habit Lock-In',
    },
    {
      id: 'domain-60',
      title: 'Domain Specialist (60%)',
      category: 'Mastery',
      description: 'Reach 60% average mastery in any of the 5 core domains.',
      current: Math.min(60, bestDomainAvg),
      target: 60,
      unlocked: bestDomainAvg >= 60,
      rewardLabel: 'Senior Domain Readiness',
    },
    {
      id: 'top1-nodes-3',
      title: 'Top 1% Contender',
      category: 'Mastery',
      description: 'Reach 80%+ mastery on 3 Top 1% tier syllabus nodes.',
      current: Math.min(3, top1Mastered),
      target: 3,
      unlocked: top1Mastered >= 3,
      rewardLabel: 'Staff-Level Depth',
    },
    {
      id: 's-rank-80',
      title: 'S-Rank Architect (80%)',
      category: 'Mastery',
      description: 'Reach 80% overall mastery across all 5 engineering domains.',
      current: Math.min(80, overallMastery),
      target: 80,
      unlocked: overallMastery >= 80,
      rewardLabel: 'Top 1% Multi-Cloud Mastery',
    },
  ];
}

export function computeHunterStats(params: {
  skills: SkillNode[];
  quests: DailyQuest[];
  missions: ProjectMission[];
}) {
  const { skills, quests, missions } = params;
  const overallMastery =
    skills.length > 0
      ? Math.round(skills.reduce((sum, s) => sum + s.mastery, 0) / skills.length)
      : 0;
  const questXp = quests
    .filter((q) => q.status === 'completed')
    .reduce((sum, q) => sum + q.xpReward, 0);
  const missionXp = missions.filter((m) => m.status === 'completed').length * 250;
  const totalXp = questXp + missionXp;

  const level = Math.max(1, Math.floor(totalXp / 250) + 1);
  const xpInLevel = totalXp % 250;
  const xpSpan = 250;

  const score = level * 3 + overallMastery;
  let rank = 'E-Rank Initiate';
  if (score >= 160) rank = 'National Authority';
  else if (score >= 130) rank = 'S-Rank Monarch';
  else if (score >= 105) rank = 'A-Rank Architect';
  else if (score >= 80) rank = 'B-Rank Specialist';
  else if (score >= 55) rank = 'C-Rank Engineer';
  else if (score >= 30) rank = 'D-Rank Associate';

  return {
    totalXp,
    overallMastery,
    level,
    rank,
    xpInLevel,
    xpSpan,
  };
}
