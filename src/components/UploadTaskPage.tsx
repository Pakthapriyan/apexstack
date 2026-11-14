import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, FileUp, Flag, Loader2, Upload } from 'lucide-react';
import { computeMilestones } from '../data/milestones';
import { generateDailyQuestsWithSystemAi, uploadProjectTaskWithSystemAi } from '../lib/aiClient';
import {
  activateProjectMissionAndSyllabus,
  completeProjectMissionAndResumeRoutine,
  getTodayDayKey,
  getTodayIsoDate,
  saveGeneratedDailyQuests,
} from '../lib/firestoreService';
import type {
  DailyQuest,
  ProjectMission,
  SkillNode,
  SystemUploadProjectResult,
  UserProfile,
  WorkLog,
} from '../types/learning';
import type { CelebrationEvent } from './CelebrationOverlay';
import type { SimplePage } from './QuestsPage';

interface UploadTaskPageProps {
  profile: UserProfile;
  skills: SkillNode[];
  workLogs: WorkLog[];
  missions: ProjectMission[];
  quests: DailyQuest[];
  prefilledUpload?: { projectName?: string; rawTaskBrief?: string; nonce: number } | null;
  onNotify?: (message: string | null) => void;
  onNavigate: (page: SimplePage) => void;
  onCelebrate: (event: CelebrationEvent) => void;
  onProjectActivated?: (plan: SystemUploadProjectResult) => void;
  onAskJarvis?: (prompt: string) => void;
}

export const UploadTaskPage: React.FC<UploadTaskPageProps> = ({
  profile,
  skills,
  workLogs,
  missions,
  quests,
  prefilledUpload,
  onNotify,
  onNavigate,
  onCelebrate,
  onProjectActivated,
  onAskJarvis,
}) => {
  const todayKey = getTodayIsoDate();
  const todaySlot = profile.rotationMap[getTodayDayKey()];

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

  const milestones = useMemo(
    () => computeMilestones({ profile, skills, missions, quests, todayKey }),
    [profile, skills, missions, quests, todayKey]
  );

  const [projectNameInput, setProjectNameInput] = useState('');
  const [taskBriefInput, setTaskBriefInput] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!prefilledUpload) return;
    if (prefilledUpload.projectName) {
      setProjectNameInput(prefilledUpload.projectName.slice(0, 120));
    }
    if (prefilledUpload.rawTaskBrief) {
      setTaskBriefInput(prefilledUpload.rawTaskBrief.slice(0, 10000));
    }
    setUploadedFileName(null);
    setError(null);
  }, [prefilledUpload]);

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
      setTaskBriefInput(text.slice(0, 10000));
      setError(null);
    };
    reader.onerror = () => setError('Unable to read selected file.');
    reader.readAsText(file);
  };

  const handleActivateMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskBriefInput.trim() || uploading) return;

    setUploading(true);
    setError(null);
    try {
      const beforeUnlocked = new Set(milestones.filter((m) => m.unlocked).map((m) => m.id));

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

      const newlyUnlocked =
        !beforeUnlocked.has('project-vanguard') ? ['Project Override Activated'] : [];

      setProjectNameInput('');
      setTaskBriefInput('');
      setUploadedFileName(null);
      onNotify?.(aiPlan.aiNotice || null);

      onCelebrate({
        kind: 'milestone',
        title: `${aiPlan.projectName} Activated`,
        subtitle:
          aiPlan.systemAnnouncement ||
          `Master syllabus updated for ${aiPlan.primaryDomain} and Day 1 priority quests are ready on your Quests page.`,
        domain: aiPlan.primaryDomain,
        unlockedMilestones: newlyUnlocked,
      });
      onNavigate('quests');
      onProjectActivated?.(aiPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload project task.');
    } finally {
      setUploading(false);
    }
  };

  const handleCompleteProject = async () => {
    if (!activeProject || completing) return;
    setCompleting(true);
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

      const newlyUnlocked = !beforeUnlocked.has('mission-cleared')
        ? ['Project Mission Completed']
        : [];

      onCelebrate({
        kind: 'project',
        title: `${activeProject.projectName} Completed`,
        subtitle: `Returned to Normal Routine and issued today's ${normalResult.focusDomain} mastery quests.`,
        xpAwarded: 250,
        domain: activeProject.primaryDomain,
        unlockedMilestones: newlyUnlocked,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete project.');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Upload Project Task Form */}
        <section className="lg:col-span-7 bg-[#121824] border border-slate-800/80 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
                <Upload className="w-4 h-4" />
                <span>PROJECT PRIORITY UPLOAD</span>
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-50">
                Upload Current Project Task
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                Upload a task specification file or paste your work deliverables. Your syllabus
                automatically adapts to make you excel in that domain and prioritizes it until you
                mark the project complete.
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
                <span>{uploadedFileName ? uploadedFileName : 'Choose File'}</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleActivateMission} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="upload-project-name"
                className="block text-xs font-medium text-slate-300"
              >
                Project Name (Optional)
              </label>
              <input
                id="upload-project-name"
                type="text"
                maxLength={120}
                value={projectNameInput}
                onChange={(e) => setProjectNameInput(e.target.value)}
                placeholder="Auto-detected if left blank (e.g., FastAPI Async Queue Migration)"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="upload-task-brief"
                className="block text-xs font-medium text-slate-300"
              >
                Project Task Details / Requirements
              </label>
              <textarea
                id="upload-task-brief"
                rows={7}
                required
                maxLength={10000}
                value={taskBriefInput}
                onChange={(e) => setTaskBriefInput(e.target.value)}
                placeholder="Paste your Jira ticket, sprint task, architecture spec, or Terraform/FastAPI/Angular/AWS/GCP work requirements..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <span className="text-xs text-slate-500">
                Supports `.txt`, `.md`, `.json`, `.yaml`, `.csv`, `.log` ·{' '}
                {taskBriefInput.length.toLocaleString()} / 10,000 chars
              </span>

              <button
                type="submit"
                disabled={uploading || !taskBriefInput.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating Syllabus &amp; Issuing Quests...</span>
                  </>
                ) : (
                  <>
                    <span>Activate Project &amp; Update Syllabus</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Active Project & Past Missions */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800/80">
              <h3 className="font-display text-base font-semibold text-slate-100">
                Current Active Project
              </h3>
            </div>

            {!activeProject ? (
              <div className="p-6 text-xs text-slate-400 space-y-2">
                <p>No project override active right now.</p>
                <p className="text-slate-500">
                  Your Quests page is following your Normal Balanced 5-Domain Routine. Upload a
                  project task on the left whenever you want the System to prioritize a specific
                  project and domain.
                </p>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-mono text-amber-400">
                    {activeProject.rank} · {activeProject.primaryDomain}
                  </div>
                  <h4 className="text-base font-semibold text-slate-100">
                    {activeProject.projectName}
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {activeProject.masteryGoal}
                  </p>
                </div>

                {activeProject.masterSyllabusModules?.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                      Generated Master Syllabus ({activeProject.masterSyllabusModules.length})
                    </div>
                    <ul className="space-y-2">
                      {activeProject.masterSyllabusModules.map((m, i) => (
                        <li
                          key={`${m.title}-${i}`}
                          className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800/80 text-xs space-y-0.5"
                        >
                          <div className="font-medium text-slate-100">
                            {i + 1}. {m.title}
                          </div>
                          <div className="text-slate-400">{m.objective}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  {onAskJarvis && (
                    <button
                      type="button"
                      onClick={() =>
                        onAskJarvis(
                          `Analyze "${activeProject.projectName}" and guide me step-by-step on what to build and study first.`
                        )
                      }
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>Ask JARVIS for Execution Plan</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCompleteProject}
                    disabled={completing}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {completing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Completing Project...</span>
                      </>
                    ) : (
                      <>
                        <Flag className="w-3.5 h-3.5" />
                        <span>Complete Project &amp; Resume Normal Routine</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>

          {completedMissions.length > 0 && (
            <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800/80">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Completed Projects ({completedMissions.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
                {completedMissions.map((m) => (
                  <div
                    key={m.id}
                    className="px-6 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">
                        {m.projectName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {m.primaryDomain} · {m.rank}
                      </div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
