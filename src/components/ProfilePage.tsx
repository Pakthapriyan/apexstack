import React, { useMemo, useState } from 'react';
import { signOut, type User } from 'firebase/auth';
import { Award, Bot, CheckCircle2, LogOut, RefreshCw, X } from 'lucide-react';
import { computeHunterStats, computeMilestones } from '../data/milestones';
import { DAY_ORDER, DOMAINS } from '../data/seedCurriculum';
import { generateStudyBriefWithAi } from '../lib/aiClient';
import { auth } from '../lib/firebase';
import {
  getTodayIsoDate,
  rebalanceWeeklyRotation,
  saveSkillBrief,
  updateSkillMastery,
} from '../lib/firestoreService';
import type {
  DailyQuest,
  Domain,
  ProjectMission,
  SkillNode,
  UserProfile,
} from '../types/learning';

interface ProfilePageProps {
  user: User;
  profile: UserProfile;
  skills: SkillNode[];
  missions: ProjectMission[];
  quests: DailyQuest[];
  domainFilter: Domain | 'All';
  onDomainFilterChange: (domain: Domain | 'All') => void;
  selectedSkillId: string | null;
  onSelectSkillId: (id: string | null) => void;
  onAskJarvis?: (prompt: string) => void;
  jarvisOpen?: boolean;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  profile,
  skills,
  missions,
  quests,
  domainFilter,
  onDomainFilterChange,
  selectedSkillId,
  onSelectSkillId,
  onAskJarvis,
  jarvisOpen = false,
}) => {
  const todayKey = getTodayIsoDate();
  const [rebalancing, setRebalancing] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hunterStats = useMemo(
    () => computeHunterStats({ skills, quests, missions }),
    [skills, quests, missions]
  );

  const milestones = useMemo(
    () => computeMilestones({ profile, skills, missions, quests, todayKey }),
    [profile, skills, missions, quests, todayKey]
  );

  const unlockedMilestones = milestones.filter((m) => m.unlocked).length;
  const completedQuestsCount = quests.filter((q) => q.status === 'completed').length;
  const completedProjectsCount = missions.filter((m) => m.status === 'completed').length;

  const totalWeeklyMinutes = useMemo(
    () =>
      Object.values(profile.domainFocusMinutes || {}).reduce((sum, m) => sum + (m || 0), 0),
    [profile.domainFocusMinutes]
  );

  const domainBreakdown = useMemo(() => {
    return DOMAINS.map((domain) => {
      const subset = skills.filter((s) => s.domain === domain);
      const avg =
        subset.length > 0
          ? Math.round(subset.reduce((sum, s) => sum + s.mastery, 0) / subset.length)
          : 0;
      const topReady = subset.filter((s) => s.tier === 'Top 1%' && s.mastery >= 80).length;
      const topTotal = subset.filter((s) => s.tier === 'Top 1%').length;
      const focusMin = profile.domainFocusMinutes?.[domain] || 0;
      return { domain, avg, topReady, topTotal, focusMin, count: subset.length };
    });
  }, [skills, profile.domainFocusMinutes]);

  const filteredSkills = useMemo(() => {
    return skills
      .filter((s) => (domainFilter === 'All' ? true : s.domain === domainFilter))
      .sort((a, b) => {
        const aProj = a.priority === 'Critical' ? 0 : a.priority === 'High' ? 1 : 2;
        const bProj = b.priority === 'Critical' ? 0 : b.priority === 'High' ? 1 : 2;
        if (aProj !== bProj) return aProj - bProj;
        return a.mastery - b.mastery;
      });
  }, [skills, domainFilter]);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) || null,
    [skills, selectedSkillId]
  );

  const handleRebalance = async () => {
    setRebalancing(true);
    setError(null);
    try {
      await rebalanceWeeklyRotation(profile.userId, skills, profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rebalance weekly schedule.');
    } finally {
      setRebalancing(false);
    }
  };

  const handleGenerateBrief = async (skill: SkillNode) => {
    setGeneratingBrief(true);
    setError(null);
    try {
      const res = await generateStudyBriefWithAi({
        domain: skill.domain,
        title: skill.title,
        tier: skill.tier,
        description: skill.description,
      });
      await saveSkillBrief(profile.userId, skill.id, res.studyBrief, res.labPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate study brief.');
    } finally {
      setGeneratingBrief(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Profile Header & Overall Progress Strip */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sm font-mono text-sky-300 shrink-0">
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="space-y-0.5">
              <div className="text-xs font-mono text-sky-400">
                Lv. {hunterStats.level} · {hunterStats.rank}
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-50">
                {profile.displayName}
              </h2>
              <div className="text-xs text-slate-400">
                {profile.roleTitle} · Target {profile.weeklyHoursTarget}h / week
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => signOut(auth)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">Overall Mastery</div>
            <div className="font-mono text-2xl font-semibold text-slate-50 tabular-nums">
              {hunterStats.overallMastery}%
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              Target 95% Top 1%
            </div>
          </div>

          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">System XP</div>
            <div className="font-mono text-2xl font-semibold text-sky-300 tabular-nums">
              {hunterStats.totalXp}
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              {completedQuestsCount} quests · {completedProjectsCount} projects
            </div>
          </div>

          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">Weekly Focus</div>
            <div className="font-mono text-2xl font-semibold text-slate-50 tabular-nums">
              {(totalWeeklyMinutes / 60).toFixed(1)}h
            </div>
            <div className="text-xs text-emerald-400 font-mono tabular-nums">
              {profile.streakDays}d active streak
            </div>
          </div>

          <div className="p-5 space-y-1">
            <div className="text-xs text-slate-400">Milestones Earned</div>
            <div className="font-mono text-2xl font-semibold text-amber-400 tabular-nums">
              {unlockedMilestones} / {milestones.length}
            </div>
            <div className="text-xs text-slate-500">Engineering achievements</div>
          </div>
        </div>
      </section>

      {/* Milestones Showcase */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="font-display text-base font-semibold text-slate-100">
              Milestones &amp; Achievements
            </h3>
          </div>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {unlockedMilestones} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800/60">
          {milestones.map((m) => (
            <div
              key={m.id}
              className={`p-5 space-y-2.5 border-b border-slate-800/60 ${
                m.unlocked ? 'bg-emerald-500/[0.04]' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                    {m.category}
                  </div>
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                    {m.unlocked && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    <span>{m.title}</span>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
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

              <p className="text-xs text-slate-400">{m.description}</p>
              <div className="text-[11px] font-mono text-sky-400/90">{m.rewardLabel}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 5-Domain Progress & Weekly Routine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-[#121824] border border-slate-800/80 rounded-xl p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-slate-100">
            5-Domain Mastery Progress
          </h3>

          <div className="space-y-4">
            {domainBreakdown.map((item) => (
              <div key={item.domain} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{item.domain}</span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {item.avg}% avg · {item.topReady}/{item.topTotal} Top 1% · {item.focusMin}m
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#0B0F17] overflow-hidden border border-slate-800/80">
                  <div
                    className="h-full bg-sky-400 transition-all duration-300"
                    style={{ width: `${item.avg}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-100">
                Weekly Rotation
              </h3>
              <p className="text-xs text-slate-400">Auto-adapts with active projects</p>
            </div>
            <button
              type="button"
              onClick={handleRebalance}
              disabled={rebalancing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rebalancing ? 'animate-spin' : ''}`} />
              <span>Rebalance</span>
            </button>
          </div>
          <div className="divide-y divide-slate-800/60">
            {DAY_ORDER.map((day) => (
              <div key={day} className="px-6 py-3 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-400">{day}</span>
                <span className="font-medium text-slate-100">{profile.rotationMap[day]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Master Syllabus Inspector */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">
              Master Syllabus ({filteredSkills.length} Topics)
            </h3>
            <p className="text-xs text-slate-400">
              Select any topic to inspect its Staff-level study brief and hands-on lab
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800">
            {(['All', ...DOMAINS] as const).map((dom) => (
              <button
                key={dom}
                type="button"
                onClick={() => onDomainFilterChange(dom)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  domainFilter === dom
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {dom}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-800/60 max-h-[460px] overflow-y-auto">
          {filteredSkills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => onSelectSkillId(skill.id)}
              className="w-full text-left px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-800/25 transition-colors cursor-pointer"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="text-sm font-medium text-slate-100 truncate">{skill.title}</div>
                <div className="text-xs font-mono text-slate-400">
                  {skill.domain} · {skill.tier}
                  {skill.priority && skill.priority !== 'Normal' ? ` · ${skill.priority}` : ''}
                  {skill.projectTag ? ` · ${skill.projectTag}` : ''}
                </div>
              </div>
              <span className="font-mono text-xs text-sky-300 tabular-nums shrink-0">
                {skill.mastery}%
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Slide-over Study Brief Drawer */}
      {selectedSkill && (
        <div
          className={`fixed inset-0 z-40 flex justify-end ${
            jarvisOpen ? 'lg:justify-start lg:pr-[440px]' : ''
          }`}
        >
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => onSelectSkillId(null)}
          />
          <aside
            className={`relative z-10 w-full max-w-xl bg-[#121824] border-slate-800 h-full overflow-y-auto p-6 space-y-6 ${
              jarvisOpen ? 'border-l lg:border-l-0 lg:border-r' : 'border-l'
            }`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="text-xs font-mono text-sky-400">
                  {selectedSkill.domain} · {selectedSkill.tier}
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-50">
                  {selectedSkill.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onAskJarvis && (
                  <button
                    type="button"
                    onClick={() =>
                      onAskJarvis(
                        `Explain "${selectedSkill.title}" (${selectedSkill.domain}) in depth, including common production failure modes and how to pass its 45-minute lab.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-medium text-sky-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>Ask JARVIS</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectSkillId(null)}
                  aria-label="Close topic details"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Mastery</span>
                <span className="font-mono text-slate-100 tabular-nums">
                  {selectedSkill.mastery}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={selectedSkill.mastery}
                onChange={(e) =>
                  updateSkillMastery(
                    profile.userId,
                    selectedSkill,
                    Number(e.target.value),
                    false
                  )
                }
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Top 1% Study Brief
                </h4>
                <button
                  type="button"
                  onClick={() => handleGenerateBrief(selectedSkill)}
                  disabled={generatingBrief}
                  className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  {generatingBrief ? 'Generating...' : 'Refresh with AI'}
                </button>
              </div>
              <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {selectedSkill.studyBrief || selectedSkill.description}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                45-Minute Hands-On Lab
              </h4>
              <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {selectedSkill.labPrompt}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
