import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  RefreshCw,
} from 'lucide-react';
import { DAY_ORDER, DOMAINS } from '../data/seedCurriculum';
import {
  adaptRotationToPriorities,
  getTodayDayKey,
  rebalanceWeeklyRotation,
  toggleRotationDayComplete,
} from '../lib/firestoreService';
import type {
  DayKey,
  Domain,
  IncidentDrill,
  ReviewCard,
  SkillNode,
  UserProfile,
  WorkLog,
} from '../types/learning';

export type WorkspaceTab = 'command' | 'system' | 'matrix' | 'mapper' | 'drills' | 'reviews' | 'agent';

interface CommandCenterViewProps {
  profile: UserProfile;
  skills: SkillNode[];
  workLogs: WorkLog[];
  drills: IncidentDrill[];
  reviewCards: ReviewCard[];
  onNavigate: (
    tab: WorkspaceTab,
    domainFilter?: Domain,
    options?: { openAdapter?: boolean; skillId?: string }
  ) => void;
}

const DOMAIN_COLORS: Record<Domain, string> = {
  Angular: '#38BDF8',
  FastAPI: '#10B981',
  DevOps: '#F59E0B',
  AWS: '#FB923C',
  GCP: '#818CF8',
};

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  profile,
  skills,
  workLogs,
  drills,
  reviewCards,
  onNavigate,
}) => {
  const [rebalancing, setRebalancing] = useState(false);
  const [prioritizing, setPrioritizing] = useState(false);
  const [togglingDay, setTogglingDay] = useState<DayKey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const todayKey = getTodayDayKey();
  const todaySlot = profile.rotationMap[todayKey];
  const minutesPerBlock = Math.round((profile.weeklyHoursTarget * 60) / 7);

  const stats = useMemo(() => {
    const overallMastery =
      skills.length > 0
        ? Math.round(skills.reduce((sum, s) => sum + s.mastery, 0) / skills.length)
        : 0;

    const totalWeeklyMinutes = Object.values(profile.domainFocusMinutes || {}).reduce(
      (sum, m) => sum + (m || 0),
      0
    );

    const nowIso = new Date().toISOString();
    const dueCards = reviewCards.filter((c) => c.nextReviewAt <= nowIso);

    const top1NodesMastered = skills.filter(
      (s) => s.tier === 'Top 1%' && s.mastery >= 80
    ).length;
    const totalTop1Nodes = skills.filter((s) => s.tier === 'Top 1%').length;

    const prioritizedSkills = skills
      .filter((s) => s.priority === 'Critical' || s.priority === 'High')
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority === 'Critical' ? -1 : 1;
        }
        return a.mastery - b.mastery;
      });

    const domainSummaries = DOMAINS.map((domain) => {
      const domSkills = skills.filter((s) => s.domain === domain);
      const avgMastery =
        domSkills.length > 0
          ? Math.round(domSkills.reduce((acc, s) => acc + s.mastery, 0) / domSkills.length)
          : 0;
      const topNodes = domSkills.filter((s) => s.tier === 'Top 1%').length;
      const topReady = domSkills.filter((s) => s.tier === 'Top 1%' && s.mastery >= 80).length;
      const focusMin = profile.domainFocusMinutes?.[domain] || 0;
      const dueCount = dueCards.filter((c) => c.domain === domain).length;
      return {
        domain,
        avgMastery,
        topNodes,
        topReady,
        focusMin,
        dueCount,
      };
    });

    const completedDrills = drills.filter((d) => d.status === 'completed').length;

    return {
      overallMastery,
      totalWeeklyMinutes,
      dueCards,
      top1NodesMastered,
      totalTop1Nodes,
      prioritizedSkills,
      domainSummaries,
      completedDrills,
    };
  }, [skills, profile, reviewCards, drills]);

  const handleToggleDay = async (day: DayKey) => {
    setTogglingDay(day);
    setActionError(null);
    try {
      await toggleRotationDayComplete(profile.userId, profile, day, minutesPerBlock);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update rotation day.');
    } finally {
      setTogglingDay(null);
    }
  };

  const handleRebalance = async () => {
    setRebalancing(true);
    setActionError(null);
    try {
      await rebalanceWeeklyRotation(profile.userId, skills, profile);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to rebalance schedule.');
    } finally {
      setRebalancing(false);
    }
  };

  const handleAdaptToPriorities = async () => {
    setPrioritizing(true);
    setActionError(null);
    try {
      await adaptRotationToPriorities(profile.userId, skills);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to adapt rotation.');
    } finally {
      setPrioritizing(false);
    }
  };

  // Pentagon Radar Chart Geometry (center 130, 130, radius 92)
  const radarGeometry = useMemo(() => {
    const cx = 135;
    const cy = 135;
    const r = 90;
    const angleStep = (Math.PI * 2) / 5;
    const startAngle = -Math.PI / 2;

    const getPoint = (index: number, pct: number) => {
      const angle = startAngle + index * angleStep;
      const dist = (pct / 100) * r;
      return {
        x: cx + dist * Math.cos(angle),
        y: cy + dist * Math.sin(angle),
      };
    };

    const rings = [25, 50, 75, 100].map((level) =>
      DOMAINS.map((_, idx) => {
        const pt = getPoint(idx, level);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join(' ')
    );

    const axes = DOMAINS.map((domain, idx) => {
      const edge = getPoint(idx, 100);
      const label = getPoint(idx, 122);
      return { domain, edge, label };
    });

    const dataPolygon = stats.domainSummaries
      .map((item, idx) => {
        const pt = getPoint(idx, Math.max(8, item.avgMastery));
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ');

    const targetPolygon = DOMAINS.map((_, idx) => {
      const pt = getPoint(idx, 95);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }).join(' ');

    return { cx, cy, rings, axes, dataPolygon, targetPolygon };
  }, [stats.domainSummaries]);

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
          {actionError}
        </div>
      )}

      {/* Top 4-column telemetry strip */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400">Overall Mastery Index</div>
          <div className="font-mono text-2xl font-semibold text-slate-50 tabular-nums">
            {stats.overallMastery}%
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {stats.top1NodesMastered}/{stats.totalTop1Nodes} Top 1% nodes ready
          </div>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400">Weekly Focus Logged</div>
          <div className="font-mono text-2xl font-semibold text-slate-50 tabular-nums">
            {(stats.totalWeeklyMinutes / 60).toFixed(1)}h
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Target {profile.weeklyHoursTarget}.0h / week
          </div>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400">SM-2 Reviews Due</div>
          <div className="font-mono text-2xl font-semibold text-amber-400 tabular-nums">
            {stats.dueCards.length}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('reviews')}
            className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Open review queue</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400">Consistency & Drills</div>
          <div className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
            {profile.streakDays}d streak
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {stats.completedDrills} drills · {workLogs.length} work logs
          </div>
        </div>
      </section>

      {/* Balanced Weekly Rotation Planner */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Balanced Weekly Rotation
            </h2>
            <p className="text-xs text-slate-400">
              Today ({todayKey}) focus: <span className="text-sky-400 font-medium">{todaySlot}</span>
              <span aria-hidden="true" className="mx-1.5 text-slate-600">
                ·
              </span>
              <span className="font-mono tabular-nums">{minutesPerBlock} min block</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleAdaptToPriorities}
              disabled={prioritizing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-[#0B0F17] hover:bg-slate-800/70 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{prioritizing ? 'Adapting...' : 'Prioritize Active Topics'}</span>
            </button>
            <button
              type="button"
              onClick={handleRebalance}
              disabled={rebalancing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-[#0B0F17] hover:bg-slate-800/70 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rebalancing ? 'animate-spin' : ''}`} />
              <span>{rebalancing ? 'Rebalancing...' : 'Rebalance by Lag'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (DOMAINS.includes(todaySlot as Domain)) {
                  onNavigate('matrix', todaySlot as Domain);
                } else if (todaySlot === 'Multi-Cloud Synthesis') {
                  onNavigate('drills');
                } else {
                  onNavigate('reviews');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Launch Today&apos;s Focus</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-slate-800/80">
          {DAY_ORDER.map((day) => {
            const slot = profile.rotationMap[day];
            const isToday = day === todayKey;
            const isDone = profile.completedRotationDays.includes(day);
            const busy = togglingDay === day;

            return (
              <div
                key={day}
                className={`p-4 flex flex-col justify-between gap-3 transition-colors ${
                  isToday ? 'bg-sky-500/[0.06]' : 'bg-transparent'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs font-semibold ${
                        isToday ? 'text-sky-400' : 'text-slate-400'
                      }`}
                    >
                      {day}
                      {isToday ? ' · Today' : ''}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {minutesPerBlock}m
                    </span>
                  </div>
                  <div className="text-sm font-medium text-slate-100 leading-snug">{slot}</div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleDay(day)}
                  disabled={busy}
                  className={`w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    isDone
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {isDone ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Completed</span>
                    </>
                  ) : (
                    <>
                      <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Mark Done</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Active Project Priority Queue */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Active Project Priority Path
            </h2>
            <p className="text-xs text-slate-400">
              Critical and High topics prioritized for your active projects
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate('system')}
              className="text-xs font-medium text-sky-300 hover:text-sky-200 cursor-pointer whitespace-nowrap"
            >
              System Quests
            </button>
            <button
              type="button"
              onClick={() => onNavigate('agent')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer whitespace-nowrap"
            >
              Ask Syllabus Agent
            </button>
            <button
              type="button"
              onClick={() => onNavigate('matrix', undefined, { openAdapter: true })}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
            >
              + Add Project Topics
            </button>
          </div>
        </div>

        {stats.prioritizedSkills.length === 0 ? (
          <div className="px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              No active project topics prioritized yet. Add your current sprint or project topics
              to automatically adapt your Top 1% syllabus and weekly rotation.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('matrix', undefined, { openAdapter: true })}
              className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              Add Project Topics
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {stats.prioritizedSkills.slice(0, 6).map((skill) => (
              <div
                key={skill.id}
                className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-800/25 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-medium text-slate-100 truncate">{skill.title}</div>
                  <div className="text-xs font-mono text-slate-400">
                    <span
                      className={
                        skill.priority === 'Critical' ? 'text-red-400 font-semibold' : 'text-amber-400'
                      }
                    >
                      {skill.priority}
                    </span>
                    {' · '}
                    {skill.domain}
                    {skill.projectTag ? ` · ${skill.projectTag}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-mono text-xs text-slate-300 tabular-nums">
                    {skill.mastery}% / {skill.targetMastery}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('matrix', skill.domain, { skillId: skill.id })
                    }
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
                  >
                    Open Brief
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Radar Balance + Domain Breakdown Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-5 bg-[#121824] border border-slate-800/80 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                5-Domain Balance Radar
              </h2>
              <p className="text-xs text-slate-400">Current mastery vs 95% Top 1% benchmark</p>
            </div>
          </div>

          <div className="flex items-center justify-center py-2">
            <svg viewBox="0 0 270 270" className="w-full max-w-[270px] h-auto" role="img" aria-label="Five domain mastery radar chart">
              {radarGeometry.rings.map((points, i) => (
                <polygon
                  key={i}
                  points={points}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.16)"
                  strokeWidth="1"
                />
              ))}
              {radarGeometry.axes.map((axis) => (
                <g key={axis.domain}>
                  <line
                    x1={radarGeometry.cx}
                    y1={radarGeometry.cy}
                    x2={axis.edge.x}
                    y2={axis.edge.y}
                    stroke="rgba(148, 163, 184, 0.16)"
                    strokeWidth="1"
                  />
                  <text
                    x={axis.label.x}
                    y={axis.label.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#CBD5E1"
                    fontSize="11"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {axis.domain}
                  </text>
                </g>
              ))}
              <polygon
                points={radarGeometry.targetPolygon}
                fill="none"
                stroke="rgba(16, 185, 129, 0.45)"
                strokeWidth="1.25"
                strokeDasharray="4 3"
              />
              <polygon
                points={radarGeometry.dataPolygon}
                fill="rgba(56, 189, 248, 0.18)"
                stroke="#38BDF8"
                strokeWidth="2"
              />
            </svg>
          </div>

          <div className="flex items-center justify-center gap-6 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-0.5 bg-sky-400 inline-block" />
              Current Mastery
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-0.5 border-t border-dashed border-emerald-400 inline-block" />
              Top 1% Target (95%)
            </span>
          </div>
        </section>

        <section className="lg:col-span-7 bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Domain Readiness Matrix
              </h2>
              <p className="text-xs text-slate-400">
                Click any domain to inspect its Top 1% syllabus and labs
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('matrix')}
              className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
            >
              Full Matrix
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-6 font-medium">Domain</th>
                  <th className="py-3 px-4 font-medium text-right">Mastery</th>
                  <th className="py-3 px-4 font-medium text-right">Top 1% Ready</th>
                  <th className="py-3 px-4 font-medium text-right">Focus</th>
                  <th className="py-3 px-4 font-medium text-right">Due</th>
                  <th className="py-3 px-6 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {stats.domainSummaries.map((row) => (
                  <tr key={row.domain} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-6 font-medium text-slate-100">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2 h-2 rounded-xs shrink-0"
                          style={{ backgroundColor: DOMAIN_COLORS[row.domain] }}
                        />
                        <span>{row.domain}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200">
                      {row.avgMastery}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {row.topReady}/{row.topNodes}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-400">
                      {row.focusMin}m
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <span className={row.dueCount > 0 ? 'text-amber-400' : 'text-slate-500'}>
                        {row.dueCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onNavigate('matrix', row.domain)}
                        className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Recent Work-to-Skill Feed */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Recent Project-to-Skill Telemetry
            </h2>
            <p className="text-xs text-slate-400">
              Everyday work tasks mapped automatically to domain mastery
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('mapper')}
            className="text-xs font-medium text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
          >
            + Log Work Task
          </button>
        </div>

        {workLogs.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-slate-300">No project work logged yet.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Log a ticket, PR, or cloud change from your active projects and let the assistant
              extract exercised skills plus Staff-level hardening notes.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('mapper')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
            >
              Log First Project Task
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {workLogs.slice(0, 4).map((log) => (
              <div key={log.id} className="px-6 py-4 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-100">{log.projectName}</div>
                  <div className="text-xs font-mono text-slate-400 tabular-nums">
                    {log.primaryDomain} · +{log.xpAwarded} XP · {log.minutesSpent}m
                  </div>
                </div>
                <p className="text-xs text-slate-300 line-clamp-2">{log.taskSummary}</p>
                <div className="text-xs text-slate-500">
                  Skills: {log.extractedSkills.join(' · ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
