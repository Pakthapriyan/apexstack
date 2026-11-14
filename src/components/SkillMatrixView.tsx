import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  FolderPlus,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { DOMAINS } from '../data/seedCurriculum';
import {
  adaptSyllabusWithAi,
  analyzeSkillGapsWithAi,
  generateQuizCardsWithAi,
  generateStudyBriefWithAi,
} from '../lib/aiClient';
import {
  adaptRotationToPriorities,
  applyAdaptedSyllabus,
  createReviewCards,
  createSkillNode,
  deleteSkillNode,
  saveSkillBrief,
  updateSkillMastery,
  updateSkillPriority,
} from '../lib/firestoreService';
import type {
  AdaptedSyllabusResult,
  Domain,
  GapAuditResult,
  SkillNode,
  SkillPriority,
  SkillTier,
  UserProfile,
  WorkLog,
} from '../types/learning';

interface SkillMatrixViewProps {
  profile: UserProfile;
  skills: SkillNode[];
  workLogs: WorkLog[];
  reviewPrompts: string[];
  initialDomainFilter?: Domain | 'All';
  initialSelectedSkillId?: string | null;
  initialOpenAdapter?: boolean;
}

const PRIORITY_RANK: Record<SkillPriority, number> = {
  Critical: 0,
  High: 1,
  Normal: 2,
};

export const SkillMatrixView: React.FC<SkillMatrixViewProps> = ({
  profile,
  skills,
  workLogs,
  reviewPrompts,
  initialDomainFilter = 'All',
  initialSelectedSkillId = null,
  initialOpenAdapter = false,
}) => {
  const [domainFilter, setDomainFilter] = useState<Domain | 'All'>(initialDomainFilter);
  const [tierFilter, setTierFilter] = useState<SkillTier | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<SkillPriority | 'All'>('All');
  const [search, setSearch] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(initialSelectedSkillId);

  // Project Topics & Syllabus Adapter state
  const [adapterOpen, setAdapterOpen] = useState(initialOpenAdapter);
  const [adapterMode, setAdapterMode] = useState<'ai' | 'manual'>('ai');
  const [projectTag, setProjectTag] = useState('');
  const [defaultPriority, setDefaultPriority] = useState<SkillPriority>('Critical');
  const [rawTopicsText, setRawTopicsText] = useState('');
  const [adaptRotation, setAdaptRotation] = useState(true);
  const [addSuggestedCards, setAddSuggestedCards] = useState(true);
  const [adapting, setAdapting] = useState(false);
  const [adaptedSummary, setAdaptedSummary] = useState<AdaptedSyllabusResult | null>(null);

  // Manual quick-add topic state
  const [manualDomain, setManualDomain] = useState<Domain>('AWS');
  const [manualTier, setManualTier] = useState<SkillTier>('Senior');
  const [manualPriority, setManualPriority] = useState<SkillPriority>('Critical');
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualLab, setManualLab] = useState('');
  const [addingManual, setAddingManual] = useState(false);

  // Gap audit state
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<GapAuditResult | null>(null);
  const [addedTitles, setAddedTitles] = useState<string[]>([]);

  // Detail drawer actions
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [drawerProjectTag, setDrawerProjectTag] = useState('');
  const [drawerTagEdited, setDrawerTagEdited] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) || null,
    [skills, selectedSkillId]
  );

  const activeDrawerTag = drawerTagEdited
    ? drawerProjectTag
    : selectedSkill?.projectTag || '';

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills
      .filter((s) => (domainFilter === 'All' ? true : s.domain === domainFilter))
      .filter((s) => (tierFilter === 'All' ? true : s.tier === tierFilter))
      .filter((s) =>
        priorityFilter === 'All' ? true : (s.priority || 'Normal') === priorityFilter
      )
      .filter((s) =>
        q
          ? s.title.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.domain.toLowerCase().includes(q) ||
            (s.projectTag || '').toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => {
        const pA = PRIORITY_RANK[a.priority || 'Normal'];
        const pB = PRIORITY_RANK[b.priority || 'Normal'];
        if (pA !== pB) return pA - pB;

        const tierOrder: Record<SkillTier, number> = {
          'Top 1%': 0,
          Senior: 1,
          Foundational: 2,
        };
        if (tierOrder[a.tier] !== tierOrder[b.tier]) {
          return tierOrder[a.tier] - tierOrder[b.tier];
        }
        return a.mastery - b.mastery;
      });
  }, [skills, domainFilter, tierFilter, priorityFilter, search]);

  const handleSelectSkill = (skill: SkillNode) => {
    setSelectedSkillId(skill.id);
    setDrawerTagEdited(false);
    setDrawerProjectTag(skill.projectTag || '');
  };

  const handleAdaptSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawTopicsText.trim()) return;

    setAdapting(true);
    setError(null);
    try {
      const adapted = await adaptSyllabusWithAi({
        projectTag: projectTag.trim() || undefined,
        defaultPriority,
        rawTopicsText: rawTopicsText.trim(),
        currentSkills: skills,
      });

      const counts = await applyAdaptedSyllabus(
        profile.userId,
        skills,
        projectTag.trim() || 'Active Project',
        adapted,
        {
          adaptWeeklyRotation: adaptRotation,
          addSuggestedCards,
        }
      );

      setAdaptedSummary(adapted);
      setRawTopicsText('');
      setToast(
        `Syllabus adapted: ${counts.addedCount} new topics added, ${counts.prioritizedCount} existing nodes prioritized.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to adapt syllabus.');
    } finally {
      setAdapting(false);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    setAddingManual(true);
    setError(null);
    try {
      await createSkillNode(profile.userId, {
        domain: manualDomain,
        title: manualTitle.trim(),
        tier: manualTier,
        priority: manualPriority,
        projectTag: projectTag.trim() || 'Active Project',
        description:
          manualDescription.trim() || `Project-critical ${manualDomain} competency.`,
        labPrompt:
          manualLab.trim() ||
          `Build and verify a production-hardened implementation of ${manualTitle.trim()} in your project.`,
      });

      if (manualPriority !== 'Normal') {
        await adaptRotationToPriorities(profile.userId, [
          ...skills,
          {
            id: 'temp',
            userId: profile.userId,
            domain: manualDomain,
            title: manualTitle.trim(),
            tier: manualTier,
            priority: manualPriority,
            mastery: 15,
            targetMastery: 95,
            description: '',
            studyBrief: '',
            labPrompt: '',
            practiceCount: 0,
            lastPracticedAt: '',
          },
        ]);
      }

      setToast(`Added "${manualTitle.trim()}" (${manualPriority} priority) to ${manualDomain}.`);
      setManualTitle('');
      setManualDescription('');
      setManualLab('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add topic.');
    } finally {
      setAddingManual(false);
    }
  };

  const handleRunGapAudit = async () => {
    setAuditing(true);
    setError(null);
    try {
      const res = await analyzeSkillGapsWithAi({
        skills,
        recentWorkLogs: workLogs,
        weeklyHoursTarget: profile.weeklyHoursTarget,
      });
      setAuditResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete gap audit.');
    } finally {
      setAuditing(false);
    }
  };

  const handleAddRecommendedSkill = async (item: GapAuditResult['recommendedSkillsToAdd'][0]) => {
    setError(null);
    try {
      await createSkillNode(profile.userId, {
        domain: item.domain,
        title: item.title,
        tier: item.tier,
        priority: 'High',
        projectTag: 'Gap Audit',
        description: item.description,
        labPrompt: item.labPrompt,
      });
      setAddedTitles((prev) => [...prev, item.title]);
      setToast(`Added "${item.title}" to ${item.domain} matrix.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add skill node.');
    }
  };

  const handlePriorityChange = async (
    skill: SkillNode,
    nextPriority: SkillPriority,
    nextTag: string
  ) => {
    setSavingPriority(true);
    setError(null);
    try {
      await updateSkillPriority(profile.userId, skill.id, nextPriority, nextTag);
      const updatedList = skills.map((s) =>
        s.id === skill.id ? { ...s, priority: nextPriority, projectTag: nextTag } : s
      );
      await adaptRotationToPriorities(profile.userId, updatedList);
      setDrawerTagEdited(false);
      setToast(`Updated priority to ${nextPriority} and adapted weekly learning path.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update topic priority.');
    } finally {
      setSavingPriority(false);
    }
  };

  const handleRefreshBrief = async (skill: SkillNode) => {
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
      setToast('Updated study brief and hands-on lab.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate study brief.');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleGenerateTopicCards = async (skill: SkillNode) => {
    setGeneratingCards(true);
    setError(null);
    try {
      const res = await generateQuizCardsWithAi({
        domain: skill.domain,
        topic: skill.title,
        existingPrompts: reviewPrompts,
      });
      await createReviewCards(profile.userId, res.cards);
      setToast(`Added ${res.cards.length} spaced-repetition cards for ${skill.title}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate cards.');
    } finally {
      setGeneratingCards(false);
    }
  };

  const handleMasteryAdjust = async (skill: SkillNode, nextVal: number, countPractice: boolean) => {
    setError(null);
    try {
      await updateSkillMastery(profile.userId, skill, nextVal, countPractice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update mastery.');
    }
  };

  const handleDeleteSkill = async (skill: SkillNode) => {
    setError(null);
    try {
      await deleteSkillNode(profile.userId, skill.id);
      setSelectedSkillId(null);
      setToast(`Removed "${skill.title}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete skill.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-[#121824] border border-slate-800/80 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg overflow-x-auto">
              {(['All', ...DOMAINS] as const).map((dom) => (
                <button
                  key={dom}
                  type="button"
                  onClick={() => setDomainFilter(dom)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    domainFilter === dom
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {dom}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              {(['All', 'Critical', 'High', 'Normal'] as const).map((prio) => (
                <button
                  key={prio}
                  type="button"
                  onClick={() => setPriorityFilter(prio)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    priorityFilter === prio
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {prio === 'All' ? 'All Priorities' : prio}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              {(['All', 'Top 1%', 'Senior', 'Foundational'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setTierFilter(tier)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    tierFilter === tier
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-52">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search topics or projects..."
                aria-label="Filter skills"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setAdapterOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-sky-500/50 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>{adapterOpen ? 'Close Topic Adapter' : 'Add Project Topics'}</span>
            </button>

            <button
              type="button"
              onClick={handleRunGapAudit}
              disabled={auditing}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{auditing ? 'Auditing...' : 'Run Gap Audit'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add Project Topics & Adapt Syllabus Panel */}
      {adapterOpen && (
        <section className="bg-[#121824] border border-sky-500/40 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Add Project Topics & Adapt Syllabus
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Feed in topics from your active projects. ApexStack prioritizes them in your
                learning path, generates Staff study briefs, and adapts your weekly rotation.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAdapterMode('ai')}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                    adapterMode === 'ai'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  AI Multi-Topic Adapter
                </button>
                <button
                  type="button"
                  onClick={() => setAdapterMode('manual')}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                    adapterMode === 'manual'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  Quick Single Topic
                </button>
              </div>
              <button
                type="button"
                onClick={() => setAdapterOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
                aria-label="Close topic adapter"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {adapterMode === 'ai' ? (
            <form onSubmit={handleAdaptSyllabus} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label htmlFor="adapterProjectTag" className="block text-xs font-medium text-slate-300">
                    Active Project Name / Tag
                  </label>
                  <input
                    id="adapterProjectTag"
                    type="text"
                    value={projectTag}
                    onChange={(e) => setProjectTag(e.target.value)}
                    placeholder="e.g., Customer Billing API & Multi-Cloud Infra"
                    maxLength={80}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="defaultPriority" className="block text-xs font-medium text-slate-300">
                    Learning Path Priority
                  </label>
                  <select
                    id="defaultPriority"
                    value={defaultPriority}
                    onChange={(e) => setDefaultPriority(e.target.value as SkillPriority)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    <option value="Critical">Critical (Top of Path)</option>
                    <option value="High">High Priority</option>
                    <option value="Normal">Normal</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rawTopicsText" className="block text-xs font-medium text-slate-300">
                  Paste Your Project Topics, Tech Stack Items, or Sprint Requirements
                </label>
                <textarea
                  id="rawTopicsText"
                  rows={4}
                  value={rawTopicsText}
                  onChange={(e) => setRawTopicsText(e.target.value)}
                  placeholder="Example:&#10;- Angular Signals store with RxJS WebSocket streaming&#10;- FastAPI Redis distributed locking and Alembic async migrations&#10;- AWS IAM cross-account STS assume-role + Terraform modules&#10;- GCP Cloud Run VPC connector + Pub/Sub dead-letter retries"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 resize-y"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex flex-wrap items-center gap-5 text-xs text-slate-300">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adaptRotation}
                      onChange={(e) => setAdaptRotation(e.target.checked)}
                      className="accent-sky-400"
                    />
                    <span>Re-order Mon–Fri weekly rotation to match urgency</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addSuggestedCards}
                      onChange={(e) => setAddSuggestedCards(e.target.checked)}
                      className="accent-sky-400"
                    />
                    <span>Generate SM-2 recall cards for these topics</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={adapting || !rawTopicsText.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {adapting ? 'Adapting Syllabus & Learning Path...' : 'Adapt Syllabus & Prioritize'}
                  </span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleManualAdd} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="manualDomain" className="block text-xs font-medium text-slate-300">
                    Domain
                  </label>
                  <select
                    id="manualDomain"
                    value={manualDomain}
                    onChange={(e) => setManualDomain(e.target.value as Domain)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100"
                  >
                    {DOMAINS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="manualTier" className="block text-xs font-medium text-slate-300">
                    Target Depth
                  </label>
                  <select
                    id="manualTier"
                    value={manualTier}
                    onChange={(e) => setManualTier(e.target.value as SkillTier)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100"
                  >
                    <option value="Top 1%">Top 1%</option>
                    <option value="Senior">Senior</option>
                    <option value="Foundational">Foundational</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="manualPriority" className="block text-xs font-medium text-slate-300">
                    Priority
                  </label>
                  <select
                    id="manualPriority"
                    value={manualPriority}
                    onChange={(e) => setManualPriority(e.target.value as SkillPriority)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Normal">Normal</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="manualProject" className="block text-xs font-medium text-slate-300">
                    Project Tag
                  </label>
                  <input
                    id="manualProject"
                    type="text"
                    value={projectTag}
                    onChange={(e) => setProjectTag(e.target.value)}
                    placeholder="e.g., Core Migration"
                    maxLength={80}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="manualTitle" className="block text-xs font-medium text-slate-300">
                    Topic Title
                  </label>
                  <input
                    id="manualTitle"
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="e.g., FastAPI Redis Distributed Locks"
                    required
                    maxLength={160}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="manualDesc" className="block text-xs font-medium text-slate-300">
                    Project Goal / Scope
                  </label>
                  <input
                    id="manualDesc"
                    type="text"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder="What do you need to ship or harden?"
                    maxLength={600}
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={addingManual || !manualTitle.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{addingManual ? 'Adding...' : 'Add & Prioritize Topic'}</span>
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Adaptation Result Confirmation Card */}
      {adaptedSummary && (
        <section className="bg-[#121824] border border-emerald-500/40 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-emerald-400">
                Syllabus & Learning Path Adapted
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">
                {adaptedSummary.adaptationSummary}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdaptedSummary(null)}
              className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
              aria-label="Dismiss adaptation summary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border-t border-slate-800/80 pt-4">
            <div className="space-y-1.5">
              <div className="font-mono text-sky-400">New Prioritized Topics Added</div>
              {adaptedSummary.newTopics.length === 0 ? (
                <p className="text-slate-500">All topics mapped to existing matrix nodes.</p>
              ) : (
                <ul className="space-y-1 text-slate-300">
                  {adaptedSummary.newTopics.map((t, i) => (
                    <li key={i}>
                      <span className="text-slate-100 font-medium">{t.title}</span>
                      <span className="text-slate-500 font-mono">
                        {' '}
                        · {t.domain} · {t.priority}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="font-mono text-amber-400">Updated Weekly Focus Order (Mon–Fri)</div>
              <p className="font-mono text-slate-200">
                {adaptedSummary.recommendedWeeklyFocusOrder.join(' → ')}
              </p>
              {adaptedSummary.prioritizeExistingTitles.length > 0 && (
                <div className="pt-1 text-slate-400">
                  Elevated existing:{' '}
                  {adaptedSummary.prioritizeExistingTitles
                    .map((m) => `${m.existingTitle} (${m.priority})`)
                    .join(' · ')}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {toast && (
        <div className="px-4 py-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 flex items-center justify-between">
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-emerald-300 hover:text-emerald-100 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* AI Gap Audit Findings Panel */}
      {auditResult && (
        <section className="bg-[#121824] border border-sky-500/40 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Principal Engineer Gap Audit
              </h2>
              <p className="text-xs text-slate-300 mt-1">{auditResult.executiveSummary}</p>
            </div>
            <button
              type="button"
              onClick={() => setAuditResult(null)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              aria-label="Close audit panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
            <div className="p-6 space-y-4">
              <h3 className="text-xs font-mono text-amber-400 uppercase tracking-wider">
                Priority Blind Spots
              </h3>
              <div className="divide-y divide-slate-800/60">
                {auditResult.priorityGaps.map((gap, idx) => (
                  <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-100">{gap.title}</span>
                      <span className="text-xs font-mono text-slate-400 shrink-0">
                        {gap.domain} · {gap.tier}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{gap.whyItMatters}</p>
                    <p className="text-xs text-sky-300">Next action: {gap.concreteAction}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-4">
              <h3 className="text-xs font-mono text-sky-400 uppercase tracking-wider">
                Recommended Syllabus Additions
              </h3>
              <div className="divide-y divide-slate-800/60">
                {auditResult.recommendedSkillsToAdd.map((rec, idx) => {
                  const alreadyInMatrix =
                    addedTitles.includes(rec.title) ||
                    skills.some((s) => s.title.toLowerCase() === rec.title.toLowerCase());
                  return (
                    <div key={idx} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="text-sm font-medium text-slate-100">{rec.title}</div>
                        <div className="text-xs font-mono text-slate-400">
                          {rec.domain} · {rec.tier}
                        </div>
                        <p className="text-xs text-slate-400">{rec.description}</p>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyInMatrix}
                        onClick={() => handleAddRecommendedSkill(rec)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{alreadyInMatrix ? 'Added' : 'Add Node'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Matrix + Detail Drawer Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section
          className={`${
            selectedSkill ? 'lg:col-span-7' : 'lg:col-span-12'
          } bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden`}
        >
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Prioritized Learning Path & Competency Tree
              </h2>
              <p className="text-xs text-slate-400">
                Ordered by active project priority, Staff tier, and lowest mastery
              </p>
            </div>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {filteredSkills.length} nodes
            </span>
          </div>

          {filteredSkills.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No competency nodes match your current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-6 font-medium">Competency</th>
                    <th className="py-3 px-4 font-medium">Priority</th>
                    <th className="py-3 px-4 font-medium">Stack · Tier</th>
                    <th className="py-3 px-4 font-medium text-right">Mastery</th>
                    <th className="py-3 px-6 font-medium text-right">Reps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {filteredSkills.map((skill) => {
                    const isSelected = skill.id === selectedSkillId;
                    const priority = skill.priority || 'Normal';
                    const priorityTextClass =
                      priority === 'Critical'
                        ? 'text-red-400 font-semibold'
                        : priority === 'High'
                        ? 'text-amber-400 font-medium'
                        : 'text-slate-500';
                    const masteryColor =
                      skill.mastery >= 80
                        ? 'text-emerald-400'
                        : skill.mastery >= 45
                        ? 'text-sky-400'
                        : 'text-amber-400';

                    return (
                      <tr
                        key={skill.id}
                        onClick={() => handleSelectSkill(skill)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-sky-500/10' : 'hover:bg-slate-800/35'
                        }`}
                      >
                        <td className="py-3.5 px-6">
                          <div className="font-medium text-slate-100">{skill.title}</div>
                          <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                            {skill.projectTag ? `${skill.projectTag} · ` : ''}
                            {skill.description}
                          </div>
                        </td>
                        <td className={`py-3.5 px-4 font-mono text-xs whitespace-nowrap ${priorityTextClass}`}>
                          {priority}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-300 whitespace-nowrap">
                          {skill.domain} · {skill.tier}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className={masteryColor}>{skill.mastery}%</span>
                          <span className="text-slate-600 text-xs"> / {skill.targetMastery}%</span>
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono text-xs text-slate-400 tabular-nums">
                          {skill.practiceCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedSkill && (
          <aside className="lg:col-span-5 bg-[#121824] border border-slate-800/80 rounded-xl p-6 space-y-5 lg:sticky lg:top-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="space-y-1 min-w-0">
                <div className="text-xs font-mono text-sky-400">
                  {selectedSkill.domain} · {selectedSkill.tier} · {selectedSkill.priority || 'Normal'}
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-50">
                  {selectedSkill.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSkillId(null)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer shrink-0"
                aria-label="Close skill details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Priority & Active Project Controls */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-300">Learning Path Priority</span>
                <div className="flex items-center gap-1">
                  {(['Critical', 'High', 'Normal'] as const).map((prio) => {
                    const active = (selectedSkill.priority || 'Normal') === prio;
                    return (
                      <button
                        key={prio}
                        type="button"
                        disabled={savingPriority}
                        onClick={() =>
                          handlePriorityChange(selectedSkill, prio, activeDrawerTag)
                        }
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${
                          active
                            ? prio === 'Critical'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                              : prio === 'High'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                              : 'bg-slate-800 text-slate-100 border border-slate-700'
                            : 'text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        {prio}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={activeDrawerTag}
                  onChange={(e) => {
                    setDrawerTagEdited(true);
                    setDrawerProjectTag(e.target.value);
                  }}
                  placeholder="Assign project tag (e.g., Auth Migration)"
                  maxLength={80}
                  className="flex-1 px-2.5 py-1.5 rounded bg-[#121824] border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                />
                {drawerTagEdited && (
                  <button
                    type="button"
                    disabled={savingPriority}
                    onClick={() =>
                      handlePriorityChange(
                        selectedSkill,
                        selectedSkill.priority || 'Normal',
                        activeDrawerTag
                      )
                    }
                    className="px-2.5 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Save Tag
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Mastery Level</span>
                <span className="font-mono text-slate-100 tabular-nums">
                  {selectedSkill.mastery}% / {selectedSkill.targetMastery}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#0B0F17] overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-sky-400 transition-all duration-200"
                  style={{ width: `${selectedSkill.mastery}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    handleMasteryAdjust(selectedSkill, selectedSkill.mastery + 5, true)
                  }
                  className="px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Log Practice (+5%)
                </button>
                <button
                  type="button"
                  onClick={() => handleRefreshBrief(selectedSkill)}
                  disabled={generatingBrief}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0B0F17] border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{generatingBrief ? 'Generating...' : 'Deepen Study Brief'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateTopicCards(selectedSkill)}
                  disabled={generatingCards}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0B0F17] border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{generatingCards ? 'Creating...' : 'Create 3 Cards'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-800/80 pt-4">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Staff Engineering Brief
              </div>
              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {selectedSkill.studyBrief}
              </p>
            </div>

            <div className="space-y-2 border-t border-slate-800/80 pt-4">
              <div className="text-xs font-mono text-sky-400 uppercase tracking-wider">
                Hands-On Lab Exercise
              </div>
              <p className="text-xs text-slate-300 leading-relaxed bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5">
                {selectedSkill.labPrompt}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono tabular-nums">
                {selectedSkill.practiceCount} sessions logged
              </span>
              <button
                type="button"
                onClick={() => handleDeleteSkill(selectedSkill)}
                className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove node</span>
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
