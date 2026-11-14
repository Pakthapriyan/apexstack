import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT) || 3000;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function handleAiError(res: express.Response, error: unknown, context: string) {
  console.error(`[AI Error - ${context}]:`, error);
  let message = error instanceof Error ? error.message : 'Unexpected AI service error';
  try {
    const parsed = JSON.parse(message) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      message = parsed.error.message;
    }
  } catch {
    // Keep original message when not serialized JSON
  }
  const status = message.includes('GEMINI_API_KEY') ? 500 : 502;
  res.status(status).json({ error: message });
}

type Domain = 'Angular' | 'FastAPI' | 'DevOps' | 'AWS' | 'GCP';
type SkillTier = 'Foundational' | 'Senior' | 'Top 1%';
type SkillPriority = 'Critical' | 'High' | 'Normal';
type MissionRank = 'C-Rank' | 'B-Rank' | 'A-Rank' | 'S-Rank';
type QuestRank = 'E-Rank' | 'D-Rank' | 'C-Rank' | 'B-Rank' | 'A-Rank' | 'S-Rank';
type QuestType = 'Project Execution' | 'Domain Mastery' | 'Production Drill' | 'Active Recall';

const VALID_DOMAINS: Domain[] = ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'];
const VALID_TIERS: SkillTier[] = ['Foundational', 'Senior', 'Top 1%'];
const VALID_PRIORITIES: SkillPriority[] = ['Critical', 'High', 'Normal'];
const VALID_MISSION_RANKS: MissionRank[] = ['C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'];
const VALID_QUEST_RANKS: QuestRank[] = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'];
const VALID_QUEST_TYPES: QuestType[] = [
  'Project Execution',
  'Domain Mastery',
  'Production Drill',
  'Active Recall',
];

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function inferDomainFromText(text: string): Domain {
  const lower = text.toLowerCase();
  const scores: Record<Domain, number> = {
    Angular: 0,
    FastAPI: 0,
    DevOps: 0,
    AWS: 0,
    GCP: 0,
  };

  const patterns: Array<[Domain, RegExp]> = [
    ['AWS', /\b(aws|sqs|s3|eks|rds|alb|iam|irsa|cloudfront|cloudwatch|ec2|lambda|ecs)\b/g],
    ['GCP', /\b(gcp|google cloud|gke|cloud run|bigquery|pub\/sub|cloud sql|vpc service)\b/g],
    ['DevOps', /\b(devops|kubernetes|k8s|argo|keda|ingress|helm|terraform|docker|ci\/cd|oidc|keycloak|opentelemetry|observability|rollout)\b/g],
    ['FastAPI', /\b(fastapi|pydantic|python|uvicorn|asyncio|dependency injection|lifespan|duckdb|pyarrow|sqlalchemy|postgres)\b/g],
    ['Angular', /\b(angular|rxjs|zoneless|tosignal|toobservable|signal|computed|interceptor|sse)\b/g],
  ];

  for (const [domain, regex] of patterns) {
    const matches = lower.match(regex);
    scores[domain] = matches ? matches.length : 0;
  }

  let best: Domain = 'AWS';
  let bestScore = -1;
  for (const d of VALID_DOMAINS) {
    if (scores[d] > bestScore) {
      best = d;
      bestScore = scores[d];
    }
  }
  return bestScore > 0 ? best : 'DevOps';
}

function normalizeDomain(value: unknown, fallbackText = '', fallbackDomain?: Domain): Domain {
  if (typeof value === 'string') {
    const cleaned = value.trim().toLowerCase();
    const direct = VALID_DOMAINS.find((d) => d.toLowerCase() === cleaned);
    if (direct) return direct;
    if (cleaned.includes('angular') || cleaned.includes('frontend') || cleaned.includes('ui')) {
      return 'Angular';
    }
    if (cleaned.includes('fastapi') || cleaned.includes('python') || cleaned.includes('api') || cleaned.includes('data')) {
      return 'FastAPI';
    }
    if (cleaned.includes('aws') || cleaned.includes('amazon') || cleaned.includes('sqs') || cleaned.includes('eks')) {
      return 'AWS';
    }
    if (cleaned.includes('gcp') || cleaned.includes('google') || cleaned.includes('gke')) {
      return 'GCP';
    }
    if (cleaned.includes('devops') || cleaned.includes('k8s') || cleaned.includes('kubernetes') || cleaned.includes('infra') || cleaned.includes('security')) {
      return 'DevOps';
    }
  }
  return fallbackDomain || inferDomainFromText(fallbackText);
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value === 'string') {
    const cleaned = value.trim().toLowerCase();
    const match = allowed.find((item) => item.toLowerCase() === cleaned);
    if (match) return match;
  }
  return fallback;
}

function parseJsonResponse(rawText: string | undefined, context: string): Record<string, unknown> {
  const cleaned = (rawText ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!cleaned) {
    throw new Error(`Empty JSON response received from Gemini for ${context}. Please try again.`);
  }

  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    throw new Error(`Incomplete JSON payload returned for ${context}. Please try again.`);
  }
  return parsed as Record<string, unknown>;
}

const AI_QUOTA_NOTICE =
  'Gemini API credits are depleted (402). Structured your request using the local curriculum engine so your syllabus and daily quests continue uninterrupted. Top up credits in AI Studio to re-enable full LLM reasoning.';

function isQuotaOrBillingError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  return (
    lower.includes('402') ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('prepayment credits') ||
    lower.includes('quota') ||
    lower.includes('gemini_api_key is not configured')
  );
}

async function generateWithModelFallback(
  params: Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  const ai = getAiClient();
  try {
    return await ai.models.generateContent(params);
  } catch (primaryErr) {
    if (params.model !== 'gemini-3.1-flash-lite' && isQuotaOrBillingError(primaryErr)) {
      const { config, ...rest } = params;
      const fallbackConfig = config ? { ...config } : undefined;
      if (fallbackConfig && 'thinkingConfig' in fallbackConfig) {
        delete (fallbackConfig as Record<string, unknown>).thinkingConfig;
      }
      return await ai.models.generateContent({
        ...rest,
        model: 'gemini-3.1-flash-lite',
        config: fallbackConfig,
      });
    }
    throw primaryErr;
  }
}

function rankDomainsFromText(text: string): Domain[] {
  const lower = text.toLowerCase();
  const patterns: Array<[Domain, RegExp]> = [
    ['AWS', /\b(aws|sqs|s3|eks|rds|alb|iam|irsa|cloudfront|cloudwatch|ec2|lambda|ecs)\b/g],
    ['DevOps', /\b(devops|kubernetes|k8s|argo|keda|ingress|helm|terraform|docker|ci\/cd|oidc|keycloak|opentelemetry|observability|rollout|prestop|readinessprobe)\b/g],
    ['FastAPI', /\b(fastapi|pydantic|python|uvicorn|asyncio|dependency injection|lifespan|duckdb|pyarrow|sqlalchemy|postgres|postgresql)\b/g],
    ['Angular', /\b(angular|rxjs|zoneless|tosignal|toobservable|signal|computed|interceptor|sse|pkce)\b/g],
    ['GCP', /\b(gcp|google cloud|gke|cloud run|bigquery|pub\/sub|cloud sql|vpc service)\b/g],
  ];

  return patterns
    .map(([domain, regex]) => ({
      domain,
      count: (lower.match(regex) || []).length,
    }))
    .sort((a, b) => b.count - a.count)
    .filter((entry) => entry.count > 0)
    .map((entry) => entry.domain);
}

interface ParsedBriefSection {
  title: string;
  domain: Domain;
  bullets: string[];
  labs: Array<{ title: string; detail: string }>;
}

function parseProjectBriefSections(rawTaskBrief: string, fallbackDomain: Domain): ParsedBriefSection[] {
  const lines = rawTaskBrief
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const sections: ParsedBriefSection[] = [];
  let current: ParsedBriefSection | null = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (sectionMatch) {
      if (current) sections.push(current);
      const heading = sectionMatch[2].trim();
      current = {
        title: heading.slice(0, 140),
        domain: inferDomainFromText(heading),
        bullets: [],
        labs: [],
      };
      continue;
    }

    const labMatch = line.match(/^Lab\s+[\d\.]+\s*(?:\(([^)]+)\))?\s*:?\s*(.*)$/i);
    if (labMatch) {
      const labTitle = (labMatch[1] || `Hands-on Lab`).trim();
      const labDetail = (labMatch[2] || line).trim();
      if (!current) {
        current = {
          title: 'Project Core Execution',
          domain: fallbackDomain,
          bullets: [],
          labs: [],
        };
      }
      current.labs.push({ title: labTitle.slice(0, 120), detail: labDetail.slice(0, 500) });
      continue;
    }

    if (!current) {
      current = {
        title: 'Project Core Execution',
        domain: inferDomainFromText(line) || fallbackDomain,
        bullets: [],
        labs: [],
      };
    }
    current.bullets.push(line.replace(/^[-*•]\s*/, ''));
  }

  if (current) sections.push(current);

  for (const s of sections) {
    const combined = `${s.title}\n${s.bullets.join('\n')}\n${s.labs.map((l) => `${l.title}: ${l.detail}`).join('\n')}`;
    const ranked = rankDomainsFromText(combined);
    if (ranked.length > 0) {
      s.domain = ranked[0];
    }
  }

  return sections;
}

function buildStructuredProjectPlanFromBrief(params: {
  projectName?: string;
  rawTaskBrief: string;
  currentSkills: Array<{
    domain: string;
    title: string;
    tier: string;
    priority?: string;
    mastery: number;
  }>;
}) {
  const brief = params.rawTaskBrief.trim();
  const rankedDomains = rankDomainsFromText(brief);
  const primaryDomain: Domain = rankedDomains[0] || 'AWS';
  const involvedDomains: Domain[] = (
    rankedDomains.length > 0 ? rankedDomains : [primaryDomain]
  ).slice(0, 5);

  const sections = parseProjectBriefSections(brief, primaryDomain);
  const inferredTitle =
    asString(params.projectName) ||
    (sections.length > 1
      ? `${sections[0].title.replace(/\([^)]*\)/g, '').trim()} + Multi-Domain Stack`
      : sections[0]?.title) ||
    'Active Cloud Engineering Project';

  const cleanProjectName = inferredTitle.slice(0, 120);

  const masterSyllabusModules = (sections.length > 0 ? sections : [{
    title: `${cleanProjectName} Architecture`,
    domain: primaryDomain,
    bullets: [brief.slice(0, 240)],
    labs: [],
  }])
    .slice(0, 8)
    .map((sec) => {
      const objective = sec.bullets.slice(0, 2).join(' ') || `Deliver ${sec.title} to production Top 1% standards.`;
      const keyInternals =
        sec.bullets.slice(0, 4).join(' • ') ||
        `Failure modes, backpressure, security boundaries, and telemetry in ${sec.domain}.`;
      const verification =
        sec.labs.length > 0
          ? sec.labs.map((l) => `${l.title}: ${l.detail}`).join(' | ')
          : `Verify reliability, IAM/auth boundaries, and observability under load for ${sec.title}.`;

      return {
        title: sec.title.slice(0, 160),
        domain: sec.domain,
        tier: 'Top 1%' as SkillTier,
        objective: objective.slice(0, 400),
        keyInternals: keyInternals.slice(0, 600),
        verificationCriteria: verification.slice(0, 400),
      };
    });

  // Match existing skills with token overlap against the uploaded curriculum
  const briefTokens = new Set(
    brief
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
  );
  const existingSkillsToElevate = (params.currentSkills || [])
    .filter((s) => {
      const titleTokens = s.title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4);
      const overlap = titleTokens.some((t) => briefTokens.has(t));
      return overlap || involvedDomains.includes(normalizeDomain(s.domain, '', primaryDomain));
    })
    .slice(0, 6)
    .map((s) => ({
      existingTitle: s.title,
      priority: (normalizeDomain(s.domain, '', primaryDomain) === primaryDomain
        ? 'Critical'
        : 'High') as SkillPriority,
      reason: `Directly exercised by ${cleanProjectName} across ${s.domain}.`,
    }));

  // Build missing Top 1% skill nodes from extracted labs or top sections
  const existingTitlesLower = new Set((params.currentSkills || []).map((s) => s.title.toLowerCase()));
  const newSkillNodes: Array<{
    domain: Domain;
    title: string;
    tier: SkillTier;
    priority: SkillPriority;
    description: string;
    studyBrief: string;
    labPrompt: string;
  }> = [];

  for (const sec of sections) {
    if (newSkillNodes.length >= 5) break;
    if (sec.labs.length > 0) {
      for (const lab of sec.labs) {
        if (newSkillNodes.length >= 5) break;
        const candidateTitle = `${lab.title} (${sec.domain})`;
        if (existingTitlesLower.has(candidateTitle.toLowerCase())) continue;
        newSkillNodes.push({
          domain: sec.domain,
          title: candidateTitle.slice(0, 160),
          tier: 'Top 1%',
          priority: sec.domain === primaryDomain ? 'Critical' : 'High',
          description: `${sec.title}: ${lab.detail}`.slice(0, 600),
          studyBrief: (
            sec.bullets.join('\n• ') ||
            `Deep engineering patterns and failure modes for ${lab.title}.`
          ).slice(0, 3000),
          labPrompt: `Lab (${lab.title}): ${lab.detail}`.slice(0, 1800),
        });
      }
    } else if (!existingTitlesLower.has(sec.title.toLowerCase())) {
      newSkillNodes.push({
        domain: sec.domain,
        title: sec.title.slice(0, 160),
        tier: 'Top 1%',
        priority: sec.domain === primaryDomain ? 'Critical' : 'High',
        description: (sec.bullets[0] || sec.title).slice(0, 600),
        studyBrief: (sec.bullets.join('\n• ') || sec.title).slice(0, 3000),
        labPrompt: `Implement and verify ${sec.title} with full failure-mode testing and observability.`.slice(
          0,
          1800
        ),
      });
    }
  }

  const weeklyFocusOrder: Domain[] = Array.from(
    new Set([...involvedDomains, ...VALID_DOMAINS])
  ).slice(0, 5);

  const primaryMod = masterSyllabusModules[0];
  const secondaryMod = masterSyllabusModules[1] || primaryMod;
  const tertiaryMod = masterSyllabusModules[2] || primaryMod;

  const dailyQuests = [
    {
      domain: primaryMod.domain,
      questType: 'Project Execution' as QuestType,
      rank: 'A-Rank' as QuestRank,
      title: `Ship Core Module: ${primaryMod.title}`.slice(0, 180),
      objective: primaryMod.objective.slice(0, 1000),
      masteryChecklist: [
        `Review internals: ${primaryMod.keyInternals.slice(0, 180)}`,
        `Implement primary slice for ${cleanProjectName}`,
        `Verify acceptance: ${primaryMod.verificationCriteria.slice(0, 180)}`,
      ],
      linkedSkillTitle: newSkillNodes[0]?.title || primaryMod.title,
      estimatedMinutes: 60,
      xpReward: 120,
    },
    {
      domain: secondaryMod.domain,
      questType: 'Domain Mastery' as QuestType,
      rank: 'A-Rank' as QuestRank,
      title: `Master Internals: ${secondaryMod.title}`.slice(0, 180),
      objective: secondaryMod.objective.slice(0, 1000),
      masteryChecklist: [
        `Map failure modes across ${secondaryMod.domain}`,
        `Verify contract & boundary conditions`,
        `Document Staff-level trade-offs`,
      ],
      linkedSkillTitle: newSkillNodes[1]?.title || secondaryMod.title,
      estimatedMinutes: 45,
      xpReward: 95,
    },
    {
      domain: tertiaryMod.domain,
      questType: 'Production Drill' as QuestType,
      rank: 'S-Rank' as QuestRank,
      title: `Hardening Drill: ${tertiaryMod.title}`.slice(0, 180),
      objective: `Stress-test failure recovery, least-privilege IAM/auth, and zero-downtime behavior in ${tertiaryMod.title}.`,
      masteryChecklist: [
        `Simulate transient failure or retry storm`,
        `Verify telemetry / tracing continuity`,
        `Confirm zero-regression rollout behavior`,
      ],
      linkedSkillTitle: newSkillNodes[2]?.title || tertiaryMod.title,
      estimatedMinutes: 45,
      xpReward: 110,
    },
    {
      domain: primaryDomain,
      questType: 'Active Recall' as QuestType,
      rank: 'B-Rank' as QuestRank,
      title: `${primaryDomain} Failure-Mode Recall Sprint`.slice(0, 180),
      objective: `Test rapid recall on critical architecture invariants across ${involvedDomains.join(', ')}.`,
      masteryChecklist: [
        `Explain root-cause mechanism without notes`,
        `State concrete mitigation and monitoring signal`,
      ],
      linkedSkillTitle: existingSkillsToElevate[0]?.existingTitle || primaryMod.title,
      estimatedMinutes: 25,
      xpReward: 65,
    },
  ];

  const suggestedCards = masterSyllabusModules.slice(0, 2).map((mod) => ({
    domain: mod.domain,
    skillTitle: mod.title,
    prompt: `In ${mod.title}, what production failure mode occurs if key internals (${mod.keyInternals.slice(0, 140)}) are misconfigured?`,
    answer: mod.verificationCriteria,
    explanation: `${mod.objective} (${mod.keyInternals.slice(0, 240)})`,
  }));

  return {
    projectName: cleanProjectName,
    primaryDomain,
    domains: involvedDomains,
    rank: (sections.length >= 4 ? 'S-Rank' : 'A-Rank') as MissionRank,
    masteryGoal: `Deliver ${cleanProjectName} while mastering Top 1% internals across ${involvedDomains.join(', ')}.`.slice(
      0,
      600
    ),
    systemAnnouncement: `${cleanProjectName} activated (${involvedDomains.join(' · ')}). ${masterSyllabusModules.length} syllabus modules & Day 1 quests issued.`,
    weeklyFocusOrder,
    masterSyllabusModules,
    existingSkillsToElevate,
    newSkillNodes,
    dailyQuests,
    suggestedCards,
    aiNotice: AI_QUOTA_NOTICE,
  };
}

function buildStructuredDailyQuests(params: {
  todaySlot: string;
  mode: 'project_override' | 'normal_routine';
  activeProject?: {
    projectName: string;
    primaryDomain: string;
    masteryGoal: string;
    rawTaskBrief: string;
    masterSyllabusModules: Array<{
      title: string;
      domain: string;
      objective: string;
      keyInternals: string;
    }>;
  };
  skills: Array<{
    domain: string;
    title: string;
    tier: string;
    priority: string;
    mastery: number;
    practiceCount: number;
  }>;
}) {
  const focusDomain: Domain = params.activeProject
    ? normalizeDomain(params.activeProject.primaryDomain, params.activeProject.projectName, 'AWS')
    : VALID_DOMAINS.includes(params.todaySlot as Domain)
    ? (params.todaySlot as Domain)
    : (() => {
        const averages = VALID_DOMAINS.map((d) => {
          const subset = (params.skills || []).filter((s) => s.domain === d);
          const avg =
            subset.length > 0
              ? subset.reduce((sum, s) => sum + s.mastery, 0) / subset.length
              : 0;
          return { d, avg };
        }).sort((a, b) => a.avg - b.avg);
        return averages[0]?.d || 'AWS';
      })();

  if (params.mode === 'project_override' && params.activeProject) {
    const mods = params.activeProject.masterSyllabusModules || [];
    const prioritizedSkills = [...(params.skills || [])].sort((a, b) => {
      const aCrit = a.priority === 'Critical' ? 0 : a.priority === 'High' ? 1 : 2;
      const bCrit = b.priority === 'Critical' ? 0 : b.priority === 'High' ? 1 : 2;
      if (aCrit !== bCrit) return aCrit - bCrit;
      return a.mastery - b.mastery;
    });

    const m0 = mods[0] || {
      title: `${params.activeProject.projectName} Core`,
      domain: focusDomain,
      objective: params.activeProject.masteryGoal,
      keyInternals: 'Production internals, security, and observability',
    };
    const m1 = mods[1] || m0;
    const s0 = prioritizedSkills[0];
    const s1 = prioritizedSkills[1] || s0;

    return {
      systemDirective: `Project Override active for ${params.activeProject.projectName} (${focusDomain}). Prioritize shipping project modules to Top 1% standards.`,
      focusDomain,
      dailyQuests: [
        {
          domain: normalizeDomain(m0.domain, m0.title, focusDomain),
          questType: 'Project Execution' as QuestType,
          rank: 'A-Rank' as QuestRank,
          title: `Execute: ${m0.title}`.slice(0, 180),
          objective: (m0.objective || params.activeProject.masteryGoal).slice(0, 1000),
          masteryChecklist: [
            `Review module internals: ${(m0.keyInternals || 'architecture invariants').slice(0, 160)}`,
            `Ship vertical slice for ${params.activeProject.projectName}`,
            'Run verification checks & error-path tests',
          ],
          linkedSkillTitle: s0?.title || m0.title,
          estimatedMinutes: 60,
          xpReward: 120,
        },
        {
          domain: normalizeDomain(m1.domain, m1.title, focusDomain),
          questType: 'Domain Mastery' as QuestType,
          rank: 'A-Rank' as QuestRank,
          title: `Deepen ${m1.domain}: ${m1.title}`.slice(0, 180),
          objective: (m1.objective || `Master Staff-level internals for ${m1.title}.`).slice(0, 1000),
          masteryChecklist: [
            'Trace end-to-end request/event lifecycle',
            'Harden timeouts, retries, and idempotency',
            'Document edge cases learned',
          ],
          linkedSkillTitle: s1?.title || m1.title,
          estimatedMinutes: 45,
          xpReward: 95,
        },
        {
          domain: focusDomain,
          questType: 'Production Drill' as QuestType,
          rank: 'S-Rank' as QuestRank,
          title: `${params.activeProject.projectName}: Reliability & Blast-Radius Audit`.slice(0, 180),
          objective: `Verify failure isolation, least-privilege IAM/auth, and zero-downtime recovery across ${focusDomain}.`,
          masteryChecklist: [
            'Audit failure modes and fallback behavior',
            'Verify metrics/logs catch silent degradation',
          ],
          linkedSkillTitle: s0?.title || focusDomain,
          estimatedMinutes: 40,
          xpReward: 100,
        },
        {
          domain: focusDomain,
          questType: 'Active Recall' as QuestType,
          rank: 'B-Rank' as QuestRank,
          title: `${focusDomain} Active Recall Check`.slice(0, 180),
          objective: `Recall key internals and design trade-offs from ${params.activeProject.projectName} without docs.`,
          masteryChecklist: [
            'Write 3 architecture invariants from memory',
            'Verify against your syllabus brief',
          ],
          linkedSkillTitle: s1?.title || focusDomain,
          estimatedMinutes: 25,
          xpReward: 60,
        },
      ],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  // Normal balanced routine: pick lowest-mastery skills in focusDomain
  const domainSkills = (params.skills || [])
    .filter((s) => normalizeDomain(s.domain, '', focusDomain) === focusDomain)
    .sort((a, b) => a.mastery - b.mastery);
  const fallbackSkills = [...(params.skills || [])].sort((a, b) => a.mastery - b.mastery);
  const picks = domainSkills.length > 0 ? domainSkills : fallbackSkills;

  const sk0 = picks[0] || { domain: focusDomain, title: `${focusDomain} Core Internals`, tier: 'Senior', mastery: 30 };
  const sk1 = picks[1] || sk0;
  const sk2 = picks[2] || sk0;

  return {
    systemDirective: `Normal Routine (${params.todaySlot}): Targeting lowest-mastery ${focusDomain} nodes to raise your Top 1% baseline.`,
    focusDomain,
    dailyQuests: [
      {
        domain: focusDomain,
        questType: 'Domain Mastery' as QuestType,
        rank: 'A-Rank' as QuestRank,
        title: `Master ${sk0.title}`.slice(0, 180),
        objective: `Close gaps in ${sk0.title} (${sk0.tier}, current ${sk0.mastery}% mastery) with hands-on internals practice.`,
        masteryChecklist: [
          `Review core runtime mechanics of ${sk0.title}`,
          'Implement or inspect production config/code',
          'Validate edge cases and failure modes',
        ],
        linkedSkillTitle: sk0.title,
        estimatedMinutes: 45,
        xpReward: 95,
      },
      {
        domain: focusDomain,
        questType: 'Production Drill' as QuestType,
        rank: 'A-Rank' as QuestRank,
        title: `Production Failure Drill: ${sk1.title}`.slice(0, 180),
        objective: `Diagnose and harden a realistic outage or scaling bottleneck involving ${sk1.title}.`,
        masteryChecklist: [
          'Identify root cause & blast radius',
          'Apply least-privilege / resilience mitigation',
          'Define alert/SLO verification',
        ],
        linkedSkillTitle: sk1.title,
        estimatedMinutes: 45,
        xpReward: 100,
      },
      {
        domain: focusDomain,
        questType: 'Project Execution' as QuestType,
        rank: 'B-Rank' as QuestRank,
        title: `Hands-On Lab: ${sk2.title}`.slice(0, 180),
        objective: `Complete a 40-minute focused lab applying ${sk2.title} with verifiable output.`,
        masteryChecklist: [
          'Build working prototype or script',
          'Confirm clean behavior under retries/load',
        ],
        linkedSkillTitle: sk2.title,
        estimatedMinutes: 40,
        xpReward: 80,
      },
      {
        domain: focusDomain,
        questType: 'Active Recall' as QuestType,
        rank: 'B-Rank' as QuestRank,
        title: `${focusDomain} Architecture Recall`.slice(0, 180),
        objective: `Synthesize top trade-offs and security boundaries across ${sk0.title} and ${sk1.title}.`,
        masteryChecklist: [
          'Summarize 3 production pitfalls from memory',
          'Cross-check with your syllabus study brief',
        ],
        linkedSkillTitle: sk0.title,
        estimatedMinutes: 20,
        xpReward: 55,
      },
    ],
    aiNotice: AI_QUOTA_NOTICE,
  };
}

function buildStructuredStudyBrief(params: {
  domain: string;
  title: string;
  tier: string;
  description: string;
}) {
  return {
    studyBrief: [
      `Core Internals — ${params.title} (${params.domain} · ${params.tier})`,
      params.description || `Production architecture and failure-mode mastery for ${params.title}.`,
      '',
      'Top 1% Engineering Checklist:',
      '• Know the exact execution/concurrency lifecycle and where backpressure or lock contention happens.',
      '• Enforce strict failure isolation (bounded retries with jitter, explicit timeouts, idempotency keys, and least-privilege IAM/auth boundaries).',
      '• Instrument Golden Signals (latency quantiles, error budget burn, saturation metrics) so silent degradation surfaces immediately.',
    ].join('\n'),
    labPrompt: `45-Minute Lab (${params.title}): Implement a minimal reproducible setup in ${params.domain}, inject a transient fault (timeout, 503, permission boundary conflict, or duplicate delivery), verify automated recovery/observability, and document your verification criteria.`,
    aiNotice: AI_QUOTA_NOTICE,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/ai/map-work-log', async (req, res) => {
  try {
    const { projectName, taskSummary, minutesSpent, currentSkills } = req.body as {
      projectName: string;
      taskSummary: string;
      minutesSpent: number;
      currentSkills: Array<{ id: string; domain: string; title: string; mastery: number }>;
    };

    if (!projectName?.trim() || !taskSummary?.trim()) {
      res.status(400).json({ error: 'Project name and task summary are required.' });
      return;
    }

    const ai = getAiClient();
    const skillCatalogText = (currentSkills || [])
      .map((s) => `[${s.domain}] ${s.title} (${s.mastery}%)`)
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze this Associate Cloud Engineer's real work log and map it to their 5-domain Top 1% mastery system (Angular, FastAPI, DevOps, AWS, GCP).

Project: ${projectName}
Time Spent: ${minutesSpent || 45} minutes
Work Summary:
${taskSummary}

Existing Skill Matrix Nodes:
${skillCatalogText}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        systemInstruction:
          'You are a Principal Cloud & Full-Stack Engineering Mentor coaching an Associate Cloud Engineer toward Top 1% mastery in Angular, FastAPI, DevOps, AWS, and GCP. Be concrete, technical, and incisive. Identify which domains and existing skill titles were exercised, calculate fair XP (10 to 80 based on depth/complexity), write a sharp "elevationNote" describing what a Staff/Top 1% engineer would harden, measure, or verify next in this exact task, and create one practical spaced-repetition card capturing the deepest lesson.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            primaryDomain: {
              type: Type.STRING,
              enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
            },
            domains: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
                enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
              },
            },
            extractedSkills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 to 6 concise technical skills demonstrated in this work.',
            },
            matchedSkillTitles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Exact titles from the provided Existing Skill Matrix Nodes that align best.',
            },
            xpAwarded: {
              type: Type.INTEGER,
              description: 'XP awarded between 10 and 80.',
            },
            elevationNote: {
              type: Type.STRING,
              description:
                'Concrete Staff-level engineering feedback: what edge cases, observability, security boundaries, or architectural improvements elevate this work to Top 1% quality.',
            },
            suggestedFlashcard: {
              type: Type.OBJECT,
              properties: {
                domain: {
                  type: Type.STRING,
                  enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                },
                skillTitle: { type: Type.STRING },
                prompt: { type: Type.STRING },
                answer: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['domain', 'skillTitle', 'prompt', 'answer', 'explanation'],
            },
          },
          required: [
            'primaryDomain',
            'domains',
            'extractedSkills',
            'matchedSkillTitles',
            'xpAwarded',
            'elevationNote',
            'suggestedFlashcard',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleAiError(res, error, 'map-work-log');
  }
});

app.post('/api/ai/analyze-gaps', async (req, res) => {
  try {
    const { skills, recentWorkLogs, weeklyHoursTarget } = req.body as {
      skills: Array<{
        domain: string;
        title: string;
        tier: string;
        priority?: string;
        projectTag?: string;
        mastery: number;
      }>;
      recentWorkLogs: Array<{ projectName: string; primaryDomain: string; taskSummary: string }>;
      weeklyHoursTarget: number;
    };

    const ai = getAiClient();
    const skillSummary = (skills || [])
      .map(
        (s) =>
          `${s.domain} | ${s.tier} | Priority: ${s.priority || 'Normal'}${
            s.projectTag ? ` (${s.projectTag})` : ''
          } | ${s.title}: ${s.mastery}%`
      )
      .join('\n');
    const logSummary = (recentWorkLogs || [])
      .slice(0, 10)
      .map((l) => `- [${l.primaryDomain}] ${l.projectName}: ${l.taskSummary.slice(0, 180)}`)
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Perform a Top 1% Skill Gap Audit across Angular, FastAPI, DevOps, AWS, and GCP.
Weekly Upskilling Budget: ${weeklyHoursTarget || 10} hours/week.

Current Skill Matrix (pay special attention to Critical/High active project priorities):
${skillSummary}

Recent Work Logs:
${logSummary || 'No recent work logs recorded yet.'}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        systemInstruction:
          'You are a Principal Engineer running a rigorous Top 1% readiness audit. Prioritize active project topics marked Critical or High alongside foundational blind spots across Angular, FastAPI, DevOps, AWS, and GCP. Recommend concrete, production-realistic actions and up to 3 new Top 1% or Senior skill nodes if missing.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description:
                '2-3 sentences diagnosing overall balance, active project priority alignment, and biggest bottleneck toward Top 1%.',
            },
            priorityGaps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  title: { type: Type.STRING },
                  tier: {
                    type: Type.STRING,
                    enum: ['Foundational', 'Senior', 'Top 1%'],
                  },
                  whyItMatters: { type: Type.STRING },
                  concreteAction: { type: Type.STRING },
                },
                required: ['domain', 'title', 'tier', 'whyItMatters', 'concreteAction'],
              },
            },
            recommendedSkillsToAdd: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  title: { type: Type.STRING },
                  tier: {
                    type: Type.STRING,
                    enum: ['Foundational', 'Senior', 'Top 1%'],
                  },
                  description: { type: Type.STRING },
                  labPrompt: { type: Type.STRING },
                },
                required: ['domain', 'title', 'tier', 'description', 'labPrompt'],
              },
            },
          },
          required: ['executiveSummary', 'priorityGaps', 'recommendedSkillsToAdd'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleAiError(res, error, 'analyze-gaps');
  }
});

app.post('/api/ai/adapt-syllabus', async (req, res) => {
  try {
    const { projectTag, defaultPriority, rawTopicsText, currentSkills } = req.body as {
      projectTag?: string;
      defaultPriority?: 'Critical' | 'High' | 'Normal';
      rawTopicsText: string;
      currentSkills: Array<{
        domain: string;
        title: string;
        tier: string;
        priority?: string;
        mastery: number;
      }>;
    };

    if (!rawTopicsText?.trim()) {
      res.status(400).json({ error: 'Please enter at least one project topic to adapt.' });
      return;
    }

    const ai = getAiClient();
    const existingList = (currentSkills || [])
      .map(
        (s) =>
          `[${s.domain} | ${s.tier} | Priority: ${s.priority || 'Normal'} | ${s.mastery}%] ${s.title}`
      )
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `The Associate Cloud Engineer needs to adapt their Top 1% learning syllabus for active project work.

Active Project Tag: ${projectTag?.trim() || 'Active Work Project'}
Requested Priority Level: ${defaultPriority || 'Critical'}
User's Topics / Project Requirements:
${rawTopicsText.trim()}

Existing Skill Matrix Nodes:
${existingList}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        systemInstruction:
          'You are a Principal Cloud & Full-Stack Engineering Mentor. Parse every topic the engineer provided. If a topic maps cleanly to an Existing Skill Matrix Node, list it under prioritizeExistingTitles (using the exact existing title) rather than duplicating it. For every new topic not yet in the matrix, create a crisp Staff-calibrated node in newTopics with its domain (Angular, FastAPI, DevOps, AWS, or GCP), appropriate tier (Foundational, Senior, Top 1%), priority (respecting the requested priority unless clearly lower), a sharp studyBrief covering internals/failure modes, and a concrete 45-min labPrompt. Also output recommendedWeeklyFocusOrder containing all 5 domains (Angular, FastAPI, DevOps, AWS, GCP) ordered so the most urgent project domains come earliest in the Mon-Fri rotation, plus 2-3 targeted spaced-repetition cards in suggestedCards.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            adaptationSummary: {
              type: Type.STRING,
              description:
                '2-3 sentences summarizing how the syllabus and weekly rotation were adapted for these project topics.',
            },
            recommendedWeeklyFocusOrder: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
                enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
              },
              description: 'All 5 unique domains ordered from highest urgency (Mon) to lowest (Fri).',
            },
            newTopics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  title: { type: Type.STRING },
                  tier: {
                    type: Type.STRING,
                    enum: ['Foundational', 'Senior', 'Top 1%'],
                  },
                  priority: {
                    type: Type.STRING,
                    enum: ['Critical', 'High', 'Normal'],
                  },
                  description: { type: Type.STRING },
                  studyBrief: { type: Type.STRING },
                  labPrompt: { type: Type.STRING },
                },
                required: [
                  'domain',
                  'title',
                  'tier',
                  'priority',
                  'description',
                  'studyBrief',
                  'labPrompt',
                ],
              },
            },
            prioritizeExistingTitles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  existingTitle: { type: Type.STRING },
                  priority: {
                    type: Type.STRING,
                    enum: ['Critical', 'High', 'Normal'],
                  },
                  reason: { type: Type.STRING },
                },
                required: ['existingTitle', 'priority', 'reason'],
              },
            },
            suggestedCards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  skillTitle: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['domain', 'skillTitle', 'prompt', 'answer', 'explanation'],
              },
            },
          },
          required: [
            'adaptationSummary',
            'recommendedWeeklyFocusOrder',
            'newTopics',
            'prioritizeExistingTitles',
            'suggestedCards',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleAiError(res, error, 'adapt-syllabus');
  }
});

app.post('/api/ai/syllabus-agent', async (req, res) => {
  try {
    const {
      userMessage,
      projectContext,
      conversationHistory,
      progressSnapshot,
    } = req.body as {
      userMessage: string;
      projectContext?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      progressSnapshot: {
        weeklyHoursTarget: number;
        streakDays: number;
        rotationMap: Record<string, string>;
        domainFocusMinutes: Record<string, number>;
        dueCardsCount: number;
        skills: Array<{
          domain: string;
          title: string;
          tier: string;
          priority: string;
          projectTag: string;
          mastery: number;
          practiceCount: number;
        }>;
        recentWorkLogs: Array<{
          projectName: string;
          primaryDomain: string;
          taskSummary: string;
          minutesSpent: number;
        }>;
      };
    };

    if (!userMessage?.trim()) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    const ai = getAiClient();
    const skillsText = (progressSnapshot?.skills || [])
      .map(
        (s) =>
          `- [${s.domain} | ${s.tier} | Priority: ${s.priority} | Mastery: ${s.mastery}% | Reps: ${s.practiceCount}${
            s.projectTag ? ` | Project: ${s.projectTag}` : ''
          }] ${s.title}`
      )
      .join('\n');

    const logsText = (progressSnapshot?.recentWorkLogs || [])
      .slice(0, 8)
      .map(
        (l) =>
          `- [${l.primaryDomain} · ${l.minutesSpent}m] ${l.projectName}: ${l.taskSummary.slice(0, 180)}`
      )
      .join('\n');

    const historyText = (conversationHistory || [])
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'Engineer' : 'Syllabus Agent'}: ${m.content}`)
      .join('\n\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Engineer Progress Snapshot:
- Weekly Budget: ${progressSnapshot?.weeklyHoursTarget || 10} hrs/week | Streak: ${
        progressSnapshot?.streakDays || 0
      } days | Due SM-2 Cards: ${progressSnapshot?.dueCardsCount || 0}
- Current Weekly Rotation: ${JSON.stringify(progressSnapshot?.rotationMap || {})}
- Focus Minutes This Week: ${JSON.stringify(progressSnapshot?.domainFocusMinutes || {})}
- Active Project Context: ${projectContext?.trim() || 'Not specified yet'}

Current Syllabus & Mastery Matrix:
${skillsText || 'No skills loaded.'}

Recent Project Work Logs:
${logsText || 'None yet.'}

Recent Conversation:
${historyText || '(New session)'}

Engineer's Request:
${userMessage.trim()}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        systemInstruction:
          'You are an autonomous, Staff-level Learning Progress & Syllabus Architect Agent for an Associate Cloud Engineer striving for Top 1% mastery across Angular, FastAPI, DevOps, AWS, and GCP. Analyze their actual mastery metrics, focus minutes, and project requirements. If they share new project requirements, ask to structure/adapt/update their syllabus, or when their progress warrants restructuring (e.g., promoting lagging domains, deepening mastered nodes, pruning obsolete priorities), set shouldProposeUpdate=true and emit a concrete, structured SyllabusProposal that maps cleanly to their 5 domains. Only reference existing titles verbatim when placing them in updateTopics or removeOrDemoteTitles. Keep weeklyFocusOrder as all 5 unique domains (Angular, FastAPI, DevOps, AWS, GCP) ordered from highest urgency Mon to Fri. If the user is only asking a general conceptual question without wanting syllabus changes, set shouldProposeUpdate=false.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sessionTitle: {
              type: Type.STRING,
              description: 'Concise 3-6 word title summarizing this thread.',
            },
            assistantReply: {
              type: Type.STRING,
              description:
                'Direct, analytical response citing the engineer’s actual mastery/progress numbers and explaining your structuring rationale.',
            },
            shouldProposeUpdate: {
              type: Type.BOOLEAN,
              description:
                'True whenever the syllabus, topic priorities, or weekly rotation should be updated in Firestore.',
            },
            proposal: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                projectTag: { type: Type.STRING },
                weeklyFocusOrder: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                },
                addTopics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      domain: {
                        type: Type.STRING,
                        enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                      },
                      title: { type: Type.STRING },
                      tier: {
                        type: Type.STRING,
                        enum: ['Foundational', 'Senior', 'Top 1%'],
                      },
                      priority: {
                        type: Type.STRING,
                        enum: ['Critical', 'High', 'Normal'],
                      },
                      description: { type: Type.STRING },
                      studyBrief: { type: Type.STRING },
                      labPrompt: { type: Type.STRING },
                    },
                    required: [
                      'domain',
                      'title',
                      'tier',
                      'priority',
                      'description',
                      'studyBrief',
                      'labPrompt',
                    ],
                  },
                },
                updateTopics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      existingTitle: { type: Type.STRING },
                      tier: {
                        type: Type.STRING,
                        enum: ['Foundational', 'Senior', 'Top 1%'],
                      },
                      priority: {
                        type: Type.STRING,
                        enum: ['Critical', 'High', 'Normal'],
                      },
                      projectTag: { type: Type.STRING },
                      reason: { type: Type.STRING },
                      updatedStudyBrief: { type: Type.STRING },
                      updatedLabPrompt: { type: Type.STRING },
                    },
                    required: ['existingTitle', 'tier', 'priority', 'projectTag', 'reason'],
                  },
                },
                removeOrDemoteTitles: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      existingTitle: { type: Type.STRING },
                      action: {
                        type: Type.STRING,
                        enum: ['demote', 'remove'],
                      },
                      reason: { type: Type.STRING },
                    },
                    required: ['existingTitle', 'action', 'reason'],
                  },
                },
                newReviewCards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      domain: {
                        type: Type.STRING,
                        enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                      },
                      skillTitle: { type: Type.STRING },
                      prompt: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: ['domain', 'skillTitle', 'prompt', 'answer', 'explanation'],
                  },
                },
              },
              required: [
                'summary',
                'projectTag',
                'weeklyFocusOrder',
                'addTopics',
                'updateTopics',
                'removeOrDemoteTitles',
                'newReviewCards',
              ],
            },
          },
          required: ['sessionTitle', 'assistantReply', 'shouldProposeUpdate', 'proposal'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    handleAiError(res, error, 'syllabus-agent');
  }
});

app.post('/api/ai/system-upload-project', async (req, res) => {
  const { projectName, rawTaskBrief, currentSkills, weeklyHoursTarget } = (req.body || {}) as {
    projectName?: string;
    rawTaskBrief: string;
    weeklyHoursTarget?: number;
    currentSkills: Array<{
      domain: string;
      title: string;
      tier: string;
      priority?: string;
      mastery: number;
    }>;
  };

  if (!rawTaskBrief?.trim()) {
    res.status(400).json({ error: 'Project task specification or uploaded brief is required.' });
    return;
  }

  try {
    const existingList = (currentSkills || [])
      .map(
        (s) =>
          `[${s.domain} | ${s.tier} | Priority: ${s.priority || 'Normal'} | ${s.mastery}%] ${s.title}`
      )
      .join('\n');

    const clippedBrief = rawTaskBrief.trim().slice(0, 8000);
    const response = await generateWithModelFallback({
      model: 'gemini-4-hydrogen',
      contents: `An Associate Cloud Engineer just uploaded a real project task and wants "The System" to automatically take over syllabus planning, prioritize this project above normal rotation, make them excel to Top 1% mastery in the project's domain, and issue Day 1's Daily Quests.

Optional Project Name: ${projectName?.trim() || 'Infer concise project name from brief'}
Weekly Hours Budget: ${weeklyHoursTarget || 10} hrs/week

Uploaded Project Task / Brief:
${clippedBrief}

Existing Skill Matrix Nodes:
${existingList}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        systemInstruction:
          'You are "The System" — a Principal Engineering Progression Engine. Zero manual toil for the engineer. Analyze the uploaded project task (even if multi-domain, pick the single highest-leverage primaryDomain from Angular, FastAPI, DevOps, AWS, or GCP): (1) populate projectName, primaryDomain, domains (1-5), rank (C-Rank to S-Rank), masteryGoal, systemAnnouncement, and weeklyFocusOrder (all 5 domains starting with primaryDomain); (2) produce 3-5 concise masterSyllabusModules; (3) map matching Existing Skill Matrix Nodes verbatim in existingSkillsToElevate, and synthesize 2-3 missing Top 1%/Senior nodes in newSkillNodes with concise studyBrief (500-900 chars) and 45-min labPrompt; (4) issue 4 concrete dailyQuests for today (1 Project Execution, 1 Domain Mastery, 1 Production Drill, 1 Active Recall) with 3 crisp checklist steps each, realistic minutes (15-90), and XP rewards (25-150); (5) include 2 targeted SM-2 review cards. Every required JSON field must be populated.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            primaryDomain: {
              type: Type.STRING,
              enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
            },
            domains: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
                enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
              },
            },
            rank: {
              type: Type.STRING,
              enum: ['C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'],
            },
            masteryGoal: { type: Type.STRING },
            systemAnnouncement: { type: Type.STRING },
            weeklyFocusOrder: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
                enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
              },
            },
            masterSyllabusModules: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  tier: {
                    type: Type.STRING,
                    enum: ['Foundational', 'Senior', 'Top 1%'],
                  },
                  objective: { type: Type.STRING },
                  keyInternals: { type: Type.STRING },
                  verificationCriteria: { type: Type.STRING },
                },
                required: [
                  'title',
                  'domain',
                  'tier',
                  'objective',
                  'keyInternals',
                  'verificationCriteria',
                ],
              },
            },
            existingSkillsToElevate: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  existingTitle: { type: Type.STRING },
                  priority: {
                    type: Type.STRING,
                    enum: ['Critical', 'High', 'Normal'],
                  },
                  reason: { type: Type.STRING },
                },
                required: ['existingTitle', 'priority', 'reason'],
              },
            },
            newSkillNodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  title: { type: Type.STRING },
                  tier: {
                    type: Type.STRING,
                    enum: ['Foundational', 'Senior', 'Top 1%'],
                  },
                  priority: {
                    type: Type.STRING,
                    enum: ['Critical', 'High', 'Normal'],
                  },
                  description: { type: Type.STRING },
                  studyBrief: { type: Type.STRING },
                  labPrompt: { type: Type.STRING },
                },
                required: [
                  'domain',
                  'title',
                  'tier',
                  'priority',
                  'description',
                  'studyBrief',
                  'labPrompt',
                ],
              },
            },
            dailyQuests: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  questType: {
                    type: Type.STRING,
                    enum: [
                      'Project Execution',
                      'Domain Mastery',
                      'Production Drill',
                      'Active Recall',
                    ],
                  },
                  rank: {
                    type: Type.STRING,
                    enum: ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'],
                  },
                  title: { type: Type.STRING },
                  objective: { type: Type.STRING },
                  masteryChecklist: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  linkedSkillTitle: { type: Type.STRING },
                  estimatedMinutes: { type: Type.INTEGER },
                  xpReward: { type: Type.INTEGER },
                },
                required: [
                  'domain',
                  'questType',
                  'rank',
                  'title',
                  'objective',
                  'masteryChecklist',
                  'linkedSkillTitle',
                  'estimatedMinutes',
                  'xpReward',
                ],
              },
            },
            suggestedCards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  skillTitle: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['domain', 'skillTitle', 'prompt', 'answer', 'explanation'],
              },
            },
          },
          required: [
            'projectName',
            'primaryDomain',
            'domains',
            'rank',
            'masteryGoal',
            'systemAnnouncement',
            'weeklyFocusOrder',
            'masterSyllabusModules',
            'existingSkillsToElevate',
            'newSkillNodes',
            'dailyQuests',
            'suggestedCards',
          ],
        },
      },
    });

    const parsed = parseJsonResponse(response.text, 'system-upload-project');

    const resolvedProjectName = asString(
      parsed.projectName,
      asString(projectName, 'Active Project Mission')
    ).slice(0, 120);

    const inferredPrimary = inferDomainFromText(`${resolvedProjectName}\n${clippedBrief}`);
    const resolvedPrimaryDomain = normalizeDomain(
      parsed.primaryDomain,
      `${resolvedProjectName}\n${clippedBrief}`,
      inferredPrimary
    );

    const rawDomains = Array.isArray(parsed.domains) ? parsed.domains : [];
    const normalizedDomains = Array.from(
      new Set([
        resolvedPrimaryDomain,
        ...rawDomains.map((d) => normalizeDomain(d, clippedBrief, resolvedPrimaryDomain)),
      ])
    ).slice(0, 5);

    const rawWeekly = Array.isArray(parsed.weeklyFocusOrder) ? parsed.weeklyFocusOrder : [];
    const normalizedWeekly = Array.from(
      new Set([
        resolvedPrimaryDomain,
        ...rawWeekly.map((d) => normalizeDomain(d, clippedBrief, resolvedPrimaryDomain)),
        ...VALID_DOMAINS,
      ])
    ).slice(0, 5);

    const rawModules = Array.isArray(parsed.masterSyllabusModules) ? parsed.masterSyllabusModules : [];
    const masterSyllabusModules = rawModules
      .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
      .slice(0, 8)
      .map((m, idx) => ({
        title: asString(m.title, `Module ${idx + 1}: ${resolvedProjectName} Core`),
        domain: normalizeDomain(m.domain, `${asString(m.title)} ${asString(m.objective)}`, resolvedPrimaryDomain),
        tier: normalizeEnum(m.tier, VALID_TIERS, 'Top 1%'),
        objective: asString(m.objective, `Deliver production-grade execution for ${resolvedProjectName}.`),
        keyInternals: asString(m.keyInternals, 'Failure modes, backpressure, security boundaries, and telemetry.'),
        verificationCriteria: asString(m.verificationCriteria, 'Verified under load with clean observability and tests.'),
      }));

    if (masterSyllabusModules.length === 0) {
      masterSyllabusModules.push({
        title: `${resolvedProjectName} Architecture & Internals`,
        domain: resolvedPrimaryDomain,
        tier: 'Top 1%',
        objective: `Execute ${resolvedProjectName} cleanly while mastering Top 1% ${resolvedPrimaryDomain} internals.`,
        keyInternals: 'Production reliability, security least privilege, and failure recovery.',
        verificationCriteria: 'End-to-end verification and zero-regression checks pass.',
      });
    }

    const rawElevate = Array.isArray(parsed.existingSkillsToElevate)
      ? parsed.existingSkillsToElevate
      : [];
    const existingSkillsToElevate = rawElevate
      .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
      .map((e) => ({
        existingTitle: asString(e.existingTitle),
        priority: normalizeEnum(e.priority, VALID_PRIORITIES, 'High'),
        reason: asString(e.reason, `Core competency needed for ${resolvedProjectName}.`),
      }))
      .filter((e) => e.existingTitle.length > 0);

    const rawNodes = Array.isArray(parsed.newSkillNodes) ? parsed.newSkillNodes : [];
    const newSkillNodes = rawNodes
      .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
      .slice(0, 6)
      .map((n) => ({
        domain: normalizeDomain(n.domain, `${asString(n.title)} ${asString(n.description)}`, resolvedPrimaryDomain),
        title: asString(n.title),
        tier: normalizeEnum(n.tier, VALID_TIERS, 'Top 1%'),
        priority: normalizeEnum(n.priority, VALID_PRIORITIES, 'Critical'),
        description: asString(n.description, `Mastery node synthesized from ${resolvedProjectName}.`),
        studyBrief: asString(
          n.studyBrief,
          `Focus on internals, failure modes, and verifiable production telemetry for ${resolvedProjectName}.`
        ),
        labPrompt: asString(
          n.labPrompt,
          `Build and verify a production-grade implementation for ${resolvedProjectName}.`
        ),
      }))
      .filter((n) => n.title.length > 0);

    const rawQuests = Array.isArray(parsed.dailyQuests) ? parsed.dailyQuests : [];
    const dailyQuests = rawQuests
      .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
      .slice(0, 5)
      .map((q, idx) => {
        const checklist = Array.isArray(q.masteryChecklist)
          ? q.masteryChecklist.map((c) => asString(c)).filter(Boolean).slice(0, 6)
          : [];
        return {
          domain: normalizeDomain(q.domain, `${asString(q.title)} ${asString(q.objective)}`, resolvedPrimaryDomain),
          questType: normalizeEnum(
            q.questType,
            VALID_QUEST_TYPES,
            VALID_QUEST_TYPES[idx % VALID_QUEST_TYPES.length]
          ),
          rank: normalizeEnum(q.rank, VALID_QUEST_RANKS, 'B-Rank'),
          title: asString(q.title, `${resolvedProjectName} Quest ${idx + 1}`),
          objective: asString(q.objective, `Complete core ${resolvedPrimaryDomain} execution for ${resolvedProjectName}.`),
          masteryChecklist:
            checklist.length > 0
              ? checklist
              : [
                  'Implement core module cleanly',
                  'Verify failure modes and edge cases',
                  'Document telemetry or verification check',
                ],
          linkedSkillTitle: asString(q.linkedSkillTitle, masterSyllabusModules[0].title),
          estimatedMinutes: Math.min(
            240,
            Math.max(5, Math.round(Number(q.estimatedMinutes) || 45))
          ),
          xpReward: Math.min(300, Math.max(10, Math.round(Number(q.xpReward) || 75))),
        };
      });

    if (dailyQuests.length === 0) {
      dailyQuests.push({
        domain: resolvedPrimaryDomain,
        questType: 'Project Execution',
        rank: 'A-Rank',
        title: `Kick off ${resolvedProjectName} (${resolvedPrimaryDomain})`,
        objective: `Execute the primary architecture and reliability checks for ${resolvedProjectName}.`,
        masteryChecklist: [
          'Review project requirements and failure boundaries',
          'Implement first vertical slice with tests',
          'Verify observability and error handling',
        ],
        linkedSkillTitle: masterSyllabusModules[0].title,
        estimatedMinutes: 45,
        xpReward: 90,
      });
    }

    const rawCards = Array.isArray(parsed.suggestedCards) ? parsed.suggestedCards : [];
    const suggestedCards = rawCards
      .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
      .slice(0, 4)
      .map((c) => ({
        domain: normalizeDomain(c.domain, `${asString(c.skillTitle)} ${asString(c.prompt)}`, resolvedPrimaryDomain),
        skillTitle: asString(c.skillTitle, masterSyllabusModules[0].title),
        prompt: asString(c.prompt),
        answer: asString(c.answer),
        explanation: asString(c.explanation, 'Key architectural invariant for Top 1% mastery.'),
      }))
      .filter((c) => c.prompt.length > 0 && c.answer.length > 0);

    res.json({
      projectName: resolvedProjectName,
      primaryDomain: resolvedPrimaryDomain,
      domains: normalizedDomains,
      rank: normalizeEnum(parsed.rank, VALID_MISSION_RANKS, 'A-Rank'),
      masteryGoal: asString(
        parsed.masteryGoal,
        `Ship ${resolvedProjectName} cleanly while achieving Top 1% mastery across ${normalizedDomains.join(', ')}.`
      ),
      systemAnnouncement: asString(
        parsed.systemAnnouncement,
        `${resolvedProjectName} activated. Master syllabus updated and Day 1 quests issued.`
      ),
      weeklyFocusOrder: normalizedWeekly,
      masterSyllabusModules,
      existingSkillsToElevate,
      newSkillNodes,
      dailyQuests,
      suggestedCards,
    });
  } catch (error) {
    if (isQuotaOrBillingError(error)) {
      console.warn('[system-upload-project] Gemini quota/credits unavailable; using local curriculum parser.');
      res.json(
        buildStructuredProjectPlanFromBrief({
          projectName,
          rawTaskBrief,
          currentSkills: currentSkills || [],
        })
      );
      return;
    }
    handleAiError(res, error, 'system-upload-project');
  }
});

app.post('/api/ai/system-daily-quests', async (req, res) => {
  const {
    dateKey,
    todaySlot,
    mode,
    activeProject,
    skills,
    recentWorkLogs,
    domainFocusMinutes,
    dueCardsCount,
    weeklyHoursTarget,
  } = (req.body || {}) as {
    dateKey: string;
    todaySlot: string;
    mode: 'project_override' | 'normal_routine';
    activeProject?: {
      projectName: string;
      primaryDomain: string;
      masteryGoal: string;
      rawTaskBrief: string;
      masterSyllabusModules: Array<{
        title: string;
        domain: string;
        objective: string;
        keyInternals: string;
      }>;
    };
    skills: Array<{
      domain: string;
      title: string;
      tier: string;
      priority: string;
      mastery: number;
      practiceCount: number;
    }>;
    recentWorkLogs: Array<{
      projectName: string;
      primaryDomain: string;
      taskSummary: string;
    }>;
    domainFocusMinutes: Record<string, number>;
    dueCardsCount: number;
    weeklyHoursTarget: number;
  };

  try {
    const skillText = (skills || [])
      .map(
        (s) =>
          `- [${s.domain} | ${s.tier} | Priority: ${s.priority} | Mastery: ${s.mastery}% | Reps: ${s.practiceCount}] ${s.title}`
      )
      .join('\n');

    const projectBlock = activeProject
      ? `ACTIVE PROJECT PRIORITY OVERRIDE:
- Project: ${activeProject.projectName} (${activeProject.primaryDomain})
- Mastery Goal: ${activeProject.masteryGoal}
- Task Brief: ${(activeProject.rawTaskBrief || '').slice(0, 1500)}
- Master Syllabus Modules:
${(activeProject.masterSyllabusModules || [])
  .map((m) => `  * [${m.domain}] ${m.title}: ${m.objective} (Internals: ${m.keyInternals})`)
  .join('\n')}`
      : `NORMAL ROUTINE MODE:
- Scheduled Rotation Slot Today: ${todaySlot}
- Weekly Budget: ${weeklyHoursTarget || 10} hrs/week | Due SM-2 Cards: ${dueCardsCount || 0}
- Focus Minutes This Week: ${JSON.stringify(domainFocusMinutes || {})}`;

    const logsBlock = (recentWorkLogs || [])
      .slice(0, 6)
      .map((l) => `- [${l.primaryDomain}] ${l.projectName}: ${l.taskSummary.slice(0, 150)}`)
      .join('\n');

    const response = await generateWithModelFallback({
      model: 'gemini-4-hydrogen',
      contents: `Date: ${dateKey}
Operating Mode: ${mode}

${projectBlock}

Current Skill Matrix:
${skillText}

Recent Work Telemetry:
${logsBlock || 'None yet.'}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        systemInstruction:
          'You are "The System" generating today’s automatic Daily Quests for an Associate Cloud Engineer striving for Top 1% mastery. When mode is project_override, dedicate 3 quests to shipping the active project AND mastering its primaryDomain to Top 1% internals, plus 1 Active Recall quest. When mode is normal_routine, target todaySlot (or the lowest-mastery domain if todaySlot is Multi-Cloud Synthesis / Review & Gap Audit) and prescribe 4 high-leverage Top 1% daily quests so the engineer levels up systematically without manual planning. Keep checklist steps crisp, technical, and verifiable (3-4 items per quest), estimatedMinutes between 15 and 90, and xpReward between 25 and 150.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            systemDirective: {
              type: Type.STRING,
              description:
                'Sharp 1-2 sentence System briefing explaining today’s priority and Top 1% mastery target.',
            },
            focusDomain: {
              type: Type.STRING,
              enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
            },
            dailyQuests: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  questType: {
                    type: Type.STRING,
                    enum: [
                      'Project Execution',
                      'Domain Mastery',
                      'Production Drill',
                      'Active Recall',
                    ],
                  },
                  rank: {
                    type: Type.STRING,
                    enum: ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'],
                  },
                  title: { type: Type.STRING },
                  objective: { type: Type.STRING },
                  masteryChecklist: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  linkedSkillTitle: { type: Type.STRING },
                  estimatedMinutes: { type: Type.INTEGER },
                  xpReward: { type: Type.INTEGER },
                },
                required: [
                  'domain',
                  'questType',
                  'rank',
                  'title',
                  'objective',
                  'masteryChecklist',
                  'linkedSkillTitle',
                  'estimatedMinutes',
                  'xpReward',
                ],
              },
            },
          },
          required: ['systemDirective', 'focusDomain', 'dailyQuests'],
        },
      },
    });

    const parsed = parseJsonResponse(response.text, 'system-daily-quests');
    const fallbackDomain = activeProject
      ? normalizeDomain(activeProject.primaryDomain, activeProject.projectName, 'AWS')
      : normalizeDomain(todaySlot, todaySlot, 'Angular');

    const focusDomain = normalizeDomain(parsed.focusDomain, todaySlot, fallbackDomain);
    const rawQuests = Array.isArray(parsed.dailyQuests) ? parsed.dailyQuests : [];
    const dailyQuests = rawQuests
      .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
      .slice(0, 5)
      .map((q, idx) => {
        const checklist = Array.isArray(q.masteryChecklist)
          ? q.masteryChecklist.map((c) => asString(c)).filter(Boolean).slice(0, 6)
          : [];
        return {
          domain: normalizeDomain(q.domain, `${asString(q.title)} ${asString(q.objective)}`, focusDomain),
          questType: normalizeEnum(
            q.questType,
            VALID_QUEST_TYPES,
            VALID_QUEST_TYPES[idx % VALID_QUEST_TYPES.length]
          ),
          rank: normalizeEnum(q.rank, VALID_QUEST_RANKS, 'B-Rank'),
          title: asString(q.title, `${focusDomain} Daily Mastery Quest ${idx + 1}`),
          objective: asString(q.objective, `Advance Top 1% readiness in ${focusDomain}.`),
          masteryChecklist:
            checklist.length > 0
              ? checklist
              : ['Review internal architecture', 'Execute hands-on check', 'Verify edge-case handling'],
          linkedSkillTitle: asString(q.linkedSkillTitle, skills?.[0]?.title || focusDomain),
          estimatedMinutes: Math.min(
            240,
            Math.max(5, Math.round(Number(q.estimatedMinutes) || 40))
          ),
          xpReward: Math.min(300, Math.max(10, Math.round(Number(q.xpReward) || 60))),
        };
      });

    if (dailyQuests.length === 0) {
      dailyQuests.push({
        domain: focusDomain,
        questType: mode === 'project_override' ? 'Project Execution' : 'Domain Mastery',
        rank: 'B-Rank',
        title: `${focusDomain} Deep Internals Sprint`,
        objective: `Execute a focused 45-minute engineering sprint in ${focusDomain}.`,
        masteryChecklist: [
          'Identify highest-leverage failure mode',
          'Implement and test concrete fix',
          'Summarize key invariant learned',
        ],
        linkedSkillTitle: skills.find((s) => s.domain === focusDomain)?.title || focusDomain,
        estimatedMinutes: 45,
        xpReward: 75,
      });
    }

    res.json({
      systemDirective: asString(
        parsed.systemDirective,
        `Today's focus is ${focusDomain} toward Top 1% production mastery.`
      ),
      focusDomain,
      dailyQuests,
    });
  } catch (error) {
    if (isQuotaOrBillingError(error)) {
      console.warn('[system-daily-quests] Gemini quota/credits unavailable; issuing local routine quests.');
      res.json(
        buildStructuredDailyQuests({
          todaySlot: todaySlot || 'AWS',
          mode: mode || 'normal_routine',
          activeProject,
          skills: skills || [],
        })
      );
      return;
    }
    handleAiError(res, error, 'system-daily-quests');
  }
});

app.post('/api/ai/generate-brief', async (req, res) => {
  const { domain, title, tier, description } = (req.body || {}) as {
    domain: string;
    title: string;
    tier: string;
    description: string;
  };

  if (!domain || !title) {
    res.status(400).json({ error: 'Domain and skill title are required.' });
    return;
  }

  try {
    const response = await generateWithModelFallback({
      model: 'gemini-4-hydrogen',
      contents: `Generate a Top 1% Staff-level study brief and hands-on lab for:
Domain: ${domain}
Skill: ${title}
Target Tier: ${tier}
Context: ${description}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        systemInstruction:
          'Write a razor-sharp engineering study brief without fluff. Focus on internals, failure modes, trade-offs, production pitfalls, and verification commands/patterns that separate top 1% engineers from average practitioners.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studyBrief: {
              type: Type.STRING,
              description:
                'Structured markdown-free or clean plain-text technical brief covering internals, failure modes, and architectural trade-offs (under 3500 chars).',
            },
            labPrompt: {
              type: Type.STRING,
              description: 'A concrete 45-minute hands-on engineering lab exercise with clear acceptance criteria.',
            },
          },
          required: ['studyBrief', 'labPrompt'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (error) {
    if (isQuotaOrBillingError(error)) {
      console.warn('[generate-brief] Gemini quota/credits unavailable; returning structured study brief.');
      res.json(buildStructuredStudyBrief({ domain, title, tier: tier || 'Top 1%', description: description || '' }));
      return;
    }
    handleAiError(res, error, 'generate-brief');
  }
});

app.post('/api/ai/drill-step', async (req, res) => {
  try {
    const { mode, domain, difficulty, scenarioPrompt, messages } = req.body as {
      mode: 'start' | 'respond' | 'evaluate';
      domain: string;
      difficulty: 'Senior' | 'Staff' | 'Principal';
      scenarioPrompt?: string;
      messages?: Array<{ role: 'assistant' | 'user'; content: string }>;
    };

    const ai = getAiClient();

    if (mode === 'start') {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create a high-realism ${difficulty}-level production incident or architecture review drill in the ${domain} domain.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          systemInstruction:
            'You are a Principal SRE & Cloud Architect running a live war-room or architecture review simulation for an Associate Cloud Engineer aiming for Top 1% mastery. Present realistic telemetry/constraints, an urgent production symptom or design requirement, and ask the candidate for their immediate diagnostic or architectural plan.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              scenarioPrompt: {
                type: Type.STRING,
                description: 'Detailed scenario briefing with architecture context, metrics, and constraints.',
              },
              initialChallenge: {
                type: Type.STRING,
                description: 'Direct first question to kick off the multi-turn drill.',
              },
            },
            required: ['title', 'scenarioPrompt', 'initialChallenge'],
          },
        },
      });
      res.json(JSON.parse((response.text ?? '{}').trim()));
      return;
    }

    const transcript = (messages || [])
      .map((m) => `${m.role === 'assistant' ? 'Principal Reviewer' : 'Engineer'}: ${m.content}`)
      .join('\n\n');

    if (mode === 'respond') {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Scenario Context (${domain} · ${difficulty}):
${scenarioPrompt}

Conversation Transcript:
${transcript}

Provide your next incisive Principal Reviewer turn. Acknowledge strong points briefly, then introduce a deeper twist, hidden failure mode, blast-radius concern, or trade-off probe.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction:
            'Stay in role as a demanding yet constructive Principal Engineer. Keep responses crisp, concrete, and focused on internals, reliability, security, and cost/latency trade-offs.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
            },
            required: ['reply'],
          },
        },
      });
      res.json(JSON.parse((response.text ?? '{}').trim()));
      return;
    }

    if (mode === 'evaluate') {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Evaluate the engineer's performance in this ${difficulty}-level ${domain} drill.

Scenario:
${scenarioPrompt}

Transcript:
${transcript}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          systemInstruction:
            'Grade strictly against a Top 1% Staff Engineer rubric across Architecture, Reliability, Security, and Performance/Cost (0 to 100 each). Be fair but calibrated: reward deep root-cause reasoning, blast-radius thinking, and concrete mitigations; flag hand-waving.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.INTEGER },
              architectureScore: { type: Type.INTEGER },
              reliabilityScore: { type: Type.INTEGER },
              securityScore: { type: Type.INTEGER },
              performanceScore: { type: Type.INTEGER },
              strengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              gaps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              nextSteps: {
                type: Type.STRING,
                description: 'Concrete post-mortem action plan for reaching Top 1% on this scenario.',
              },
            },
            required: [
              'overallScore',
              'architectureScore',
              'reliabilityScore',
              'securityScore',
              'performanceScore',
              'strengths',
              'gaps',
              'nextSteps',
            ],
          },
        },
      });
      res.json(JSON.parse((response.text ?? '{}').trim()));
      return;
    }

    res.status(400).json({ error: 'Invalid drill mode.' });
  } catch (error) {
    handleAiError(res, error, 'drill-step');
  }
});

app.post('/api/ai/generate-quiz', async (req, res) => {
  try {
    const { domain, topic, existingPrompts } = req.body as {
      domain: 'Angular' | 'FastAPI' | 'DevOps' | 'AWS' | 'GCP';
      topic?: string;
      existingPrompts?: string[];
    };

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Generate 3 Top 1% spaced-repetition technical cards for domain: ${domain}.
Focus Topic: ${topic || 'Deep production internals, failure modes, and subtle edge cases'}
Avoid duplicating these existing prompts:
${(existingPrompts || []).slice(0, 15).join('\n')}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        systemInstruction:
          'Design high-signal active-recall questions that test deep understanding rather than trivia—e.g., debugging a subtle async deadlock, IAM trust boundary, hydration mismatch, K8s scheduling constraint, or multi-cloud egress bottleneck.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  skillTitle: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['domain', 'skillTitle', 'prompt', 'answer', 'explanation'],
              },
            },
          },
          required: ['cards'],
        },
      },
    });

    res.json(JSON.parse((response.text ?? '{}').trim()));
  } catch (error) {
    handleAiError(res, error, 'generate-quiz');
  }
});

type JarvisPage = 'quests' | 'upload' | 'profile';
type JarvisInteractiveMode = 'mentor' | 'walkthrough' | 'quiz';
type JarvisAction =
  | { type: 'navigate'; page: JarvisPage; domainFilter?: Domain | 'All' }
  | { type: 'open_skill'; skillTitle: string; domain?: Domain }
  | { type: 'focus_quest'; questIdOrTitle: string }
  | { type: 'complete_quest'; questIdOrTitle: string }
  | { type: 'refresh_study_brief'; skillTitle: string; domain?: Domain }
  | { type: 'prefill_upload'; projectName?: string; rawTaskBrief?: string }
  | { type: 'refresh_quests' }
  | { type: 'close_skill_drawer' };

interface JarvisSkillContext {
  domain: string;
  title: string;
  tier: string;
  priority: string;
  mastery: number;
  description?: string;
  studyBrief?: string;
  labPrompt?: string;
}

interface JarvisQuestContext {
  id: string;
  title: string;
  domain: string;
  questType: string;
  rank: string;
  status: string;
  objective: string;
  masteryChecklist: string[];
  linkedSkillTitle: string;
  estimatedMinutes: number;
  xpReward: number;
}

interface JarvisProjectContext {
  projectName: string;
  primaryDomain: string;
  domains: string[];
  rank: string;
  masteryGoal: string;
  masterSyllabusModules: Array<{
    title: string;
    domain: string;
    tier?: string;
    objective: string;
    keyInternals: string;
    verificationCriteria: string;
  }>;
}

interface JarvisKnowledgeEntry {
  keywords: string[];
  domain: Domain;
  topic: string;
  explanation: string;
  codeSnippet: string;
  quizQuestion: string;
  quizExpectedConcepts: string[];
}

const JARVIS_TECH_KB: JarvisKnowledgeEntry[] = [
  {
    keywords: ['zoneless', 'zone.js', 'providezonelesschangedetection', 'change detection', 'modern angular'],
    domain: 'Angular',
    topic: 'Angular Zoneless Change Detection',
    explanation:
      'Zoneless Angular (`provideZonelessChangeDetection()`) removes Zone.js monkey-patching of timers, XHR, and Promises. Angular schedules targeted view dirtying strictly from `signal()` writes read in templates, `AsyncPipe`, DOM event bindings, and explicit `ChangeDetectorRef.markForCheck()`. Pitfall: mutating plain object fields inside `setTimeout` or `fetch` callbacks leaves the UI stale until a signal updates.',
    codeSnippet: `bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideHttpClient(withInterceptors([retryInterceptor]))]
});

// Signal-driven state ensures zoneless UI updates cleanly
readonly builds = signal<BuildStage[]>([]);
readonly completedCount = computed(() => this.builds().filter(b => b.done).length);`,
    quizQuestion:
      'In a zoneless Angular component, you update a plain property `this.status = "ready"` inside a `setTimeout` callback without using a Signal or `markForCheck()`. What happens to the rendered DOM, and how do you fix it?',
    quizExpectedConcepts: ['signal', 'markforcheck', 'stale', 'not update', 'zone.js'],
  },
  {
    keywords: ['signal', 'computed', 'effect', 'tosignal', 'toobservable', 'switchmap', 'exhaustmap', 'rxjs'],
    domain: 'Angular',
    topic: 'Signals & RxJS Interop (switchMap vs exhaustMap)',
    explanation:
      'Use `signal()` for mutable sync state, `computed()` for glitch-free derived values, and `effect()` strictly for external side effects (logging, storage, DOM sync). For RxJS streams: `switchMap` cancels prior in-flight requests (ideal for typeahead/filters), whereas `exhaustMap` drops new clicks until the current request settles (ideal for form submits & credit deductions).',
    codeSnippet: `private search$ = toObservable(this.query).pipe(
  debounceTime(200),
  switchMap(q => this.api.search(q).pipe(catchError(() => of([]))))
);
readonly results = toSignal(this.search$, { initialValue: [] });`,
    quizQuestion:
      'When triggering a billing or build-launch POST request from a button stream, why choose `exhaustMap` instead of `switchMap`?',
    quizExpectedConcepts: ['duplicate', 'cancel', 'ignore', 'in-flight', 'double'],
  },
  {
    keywords: ['interceptor', 'retry', 'backoff', 'jitter', '502', '503', 'idempotent'],
    domain: 'Angular',
    topic: 'Resilient HTTP Interceptor & Full-Jitter Backoff',
    explanation:
      'Restrict automatic retries to idempotent methods (`GET`, `HEAD`, `OPTIONS`) or requests carrying an explicit `Idempotency-Key` header on transient `0`, `502`, `503`, `504` errors. Apply Full Jitter (`random(0, min(capMs, baseMs * 2^attempt))`) so disconnected tabs do not synchronize retry storms against FastAPI/ALB.',
    codeSnippet: `return next(req).pipe(
  retry({
    count: 3,
    delay: (err, attempt) => {
      const retryable = ['GET', 'HEAD'].includes(req.method) || req.headers.has('Idempotency-Key');
      if (!retryable || ![0, 502, 503, 504].includes(err.status)) throw err;
      const cap = Math.min(8000, 400 * 2 ** (attempt - 1));
      return timer(Math.floor(Math.random() * cap));
    }
  })
);`,
    quizQuestion:
      'If your HTTP retry interceptor retries a `POST /api/builds` that timed out at the ALB (`504`) after hitting FastAPI, what production hazard occurs without an `Idempotency-Key`?',
    quizExpectedConcepts: ['duplicate', 'double', 'charge', 'twice', 'side effect'],
  },
  {
    keywords: ['multipart', 'presigned', 's3', 'upload', 'chunk', 'slice'],
    domain: 'AWS',
    topic: 'Direct-to-S3 Multipart Upload',
    explanation:
      'Stream multi-GB datasets straight from browser to S3 via presigned `UploadPart` URLs so FastAPI workers never buffer files in RAM. Slice with `File.slice` (>=5MB parts except last), cap concurrency at 4–6 parallel PUTs via a semaphore, store each returned `ETag` (remember `ExposeHeaders: ["ETag"]` in S3 CORS!), and finalize with `CompleteMultipartUpload`.',
    codeSnippet: `// Semaphore-capped concurrent part uploads
const etags: Array<{ PartNumber: number; ETag: string }> = [];
for (const part of presignedParts) {
  const chunk = file.slice(part.start, part.end);
  const res = await fetch(part.url, { method: 'PUT', body: chunk, signal: abortCtrl.signal });
  etags.push({ PartNumber: part.partNumber, ETag: res.headers.get('ETag')! });
}`,
    quizQuestion:
      'Your browser direct-to-S3 multipart PUT succeeds with 200 OK, yet `res.headers.get("ETag")` returns `null` in JS, causing `CompleteMultipartUpload` to fail. Which S3 CORS setting fixes this?',
    quizExpectedConcepts: ['exposeheaders', 'etag', 'cors', 'expose'],
  },
  {
    keywords: ['sse', 'eventsource', 'server-sent', 'polling', '22-stage', 'stream'],
    domain: 'Angular',
    topic: 'Real-Time SSE + Adaptive Polling Fallback',
    explanation:
      'Server-Sent Events carry automatic browser reconnects with `Last-Event-ID`. Emit `: keepalive\\n\\n` comments every 15s so ALB/CloudFront idle timeouts do not kill quiet connections, and degrade cleanly to adaptive polling (`2s → 5s → 15s`) after consecutive SSE errors.',
    codeSnippet: `const es = new EventSource(\`/api/v1/builds/\${id}/events\`);
es.addEventListener('stage', (e) => stageSignal.set(JSON.parse(e.data)));
es.onerror = () => {
  es.close();
  startAdaptivePolling(id); // 2s -> 5s -> 15s backoff
};`,
    quizQuestion:
      'Why do idle SSE streams through AWS ALB or CloudFront drop after 60 seconds unless the server emits `: keepalive` comments?',
    quizExpectedConcepts: ['idle', 'timeout', 'proxy', 'alb', '60'],
  },
  {
    keywords: ['depends', 'dependency injection', 'lifespan', 'asynccontextmanager', 'pydantic', 'fastapi'],
    domain: 'FastAPI',
    topic: 'FastAPI Lifespan, DI DAG & Pydantic v2',
    explanation:
      'Initialize connection pools (asyncpg, HTTPX, aioboto3) inside `@asynccontextmanager async def lifespan(app)` and attach them to `app.state` so sockets reuse cleanly across requests and flush on SIGTERM. Compose request validation, tenant resolution, and RBAC checks as layered `Depends()` functions (cached per-request by default).',
    codeSnippet: `@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_pool = await asyncpg.create_pool(settings.DATABASE_URL, min_size=5, max_size=20)
    try:
        yield
    finally:
        await app.state.db_pool.close()`,
    quizQuestion:
      'What goes wrong under load if a FastAPI route creates a brand-new `httpx.AsyncClient()` or database engine per request instead of managing it in `lifespan`?',
    quizExpectedConcepts: ['exhaust', 'pool', 'socket', 'connection', 'latency', 'leak'],
  },
  {
    keywords: ['for update', 'acid', 'credit', 'double-spend', 'idempotency', 'row lock', 'concurrency'],
    domain: 'FastAPI',
    topic: 'ACID Credit Reservation (`SELECT ... FOR UPDATE`)',
    explanation:
      'Prevent race-condition double spending by starting a DB transaction, checking `(tenant_id, idempotency_key)` first, locking the account row via `SELECT balance FROM wallets WHERE tenant_id = :t FOR UPDATE`, verifying funds, deducting, and committing. Never hold a `FOR UPDATE` row lock across external S3/SQS network calls.',
    codeSnippet: `async with db.begin():
    existing = await db.execute(select(IdempotencyRecord).where(IdempotencyRecord.key == idem_key))
    if row := existing.scalar_one_or_none():
        return row.cached_response
    wallet = (await db.execute(select(Wallet).where(Wallet.tenant_id == tenant_id).with_for_update())).scalar_one()
    if wallet.credits < cost:
        raise HTTPException(402, "Insufficient credits")
    wallet.credits -= cost`,
    quizQuestion:
      'Why is checking `if wallet.credits >= cost` in Python BEFORE updating without `SELECT ... FOR UPDATE` unsafe when two concurrent POST requests hit FastAPI simultaneously?',
    quizExpectedConcepts: ['race', 'both read', 'double', 'stale', 'dirty', 'serialize'],
  },
  {
    keywords: ['rbac', 'multi-tenant', 'tenant', 'viewer', 'admin', 'member'],
    domain: 'FastAPI',
    topic: 'Multi-Tenant RBAC Dependencies',
    explanation:
      'Use a closure dependency factory `require_role({"admin", "member"})` chained after JWT verification and tenant membership lookup. Always enforce `tenant_id == ctx.tenant_id` in SQL queries (or Postgres RLS) rather than checking ownership in Python after fetching rows.',
    codeSnippet: `def require_role(*allowed: str):
    async def checker(ctx: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        if ctx.role not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient role for tenant")
        return ctx
    return checker`,
    quizQuestion:
      'How do you guarantee a multi-tenant FastAPI service never leaks Tenant B records even if a developer forgets `.where(Model.tenant_id == ctx.tenant_id)`?',
    quizExpectedConcepts: ['rls', 'row level security', 'repository', 'base query', 'session'],
  },
  {
    keywords: ['sqs', 'fifo', 'long polling', 'waittimeseconds', 'emptyreceives', 'visibility', 'heartbeat', 'changemessagevisibility', 'dlq', 'redrive', 'poison'],
    domain: 'AWS',
    topic: 'AWS SQS Long Polling, Visibility Heartbeat & DLQ',
    explanation:
      '1) `WaitTimeSeconds=20` activates Long Polling: SQS waits up to 20s before returning empty, cutting API costs by >95%. `NumberOfEmptyReceives` hitting 30+ over 10m proves pollers are alive and polling an idle queue, while `ApproximateNumberOfMessagesVisible = 0` means workers keep pace cleanly.\n2) For jobs longer than `VisibilityTimeout`, spawn an async heartbeat calling `ChangeMessageVisibility` every 15s (before lock expiry) so duplicate workers never grab the message.\n3) Set `maxReceiveCount=3` to send poison pills to a DLQ; inspect root causes before replaying via redrive.',
    codeSnippet: `async def heartbeat(sqs, queue_url: str, receipt: str, stop: asyncio.Event):
    while not stop.is_set():
        await asyncio.sleep(15)
        if not stop.is_set():
            await sqs.change_message_visibility(QueueUrl=queue_url, ReceiptHandle=receipt, VisibilityTimeout=45)`,
    quizQuestion:
      'Your CloudWatch dashboard shows `ApproximateNumberOfMessagesVisible = 0` and `NumberOfEmptyReceives = 35`. Is your SQS worker broken or healthy, and why?',
    quizExpectedConcepts: ['healthy', 'long polling', 'wait', 'fast', 'idle', 'active'],
  },
  {
    keywords: ['traceparent', 'opentelemetry', 'otel', 'tracing', 'w3c'],
    domain: 'DevOps',
    topic: 'Distributed Tracing Across SQS (W3C traceparent)',
    explanation:
      'Async queues strip HTTP headers. Use `opentelemetry.propagate.inject(carrier)` when publishing to serialize `traceparent` into SQS `MessageAttributes`, and `propagate.extract(carrier)` inside the SQS consumer to link HTTP → Worker → Argo Workflow spans into one flamegraph.',
    codeSnippet: `carrier = {}
propagate.inject(carrier)
await sqs.send_message(
    QueueUrl=queue_url,
    MessageBody=payload,
    MessageAttributes={k: {"DataType": "String", "StringValue": v} for k, v in carrier.items()}
)`,
    quizQuestion:
      'Why must `traceparent` be placed inside SQS `MessageAttributes` rather than only in HTTP request headers?',
    quizExpectedConcepts: ['async', 'decouple', 'http ends', 'boundary', 'propagate'],
  },
  {
    keywords: ['argo', 'crd', 'workflow', 'workflowtemplate', 'customobjectsapi', 'pod-proxy', 'keda', 'scaledobject'],
    domain: 'DevOps',
    topic: 'Argo Workflows CRDs, Pod-Proxy & KEDA Autoscaling',
    explanation:
      'Submit and watch Argo `Workflow` CRDs programmatically via Kubernetes Python `CustomObjectsApi` (`argoproj.io/v1alpha1`). Enforce per-step `requests`/`limits` (1vCPU/2GB up to 8vCPU/16GB) + `ttlStrategy` so finished pods don’t bloat etcd, and use KEDA `ScaledObject` targeting SQS depth to scale workers 2 → 10 replicas automatically.',
    codeSnippet: `custom_api.create_namespaced_custom_object(
    group="argoproj.io",
    version="v1alpha1",
    namespace="compute",
    plural="workflows",
    body=workflow_manifest,
)`,
    quizQuestion:
      'Why does KEDA SQS scaling avoid cold-start lag better than standard Kubernetes CPU HPA for queue-backed build workers?',
    quizExpectedConcepts: ['queue depth', 'before cpu', 'backlog', 'proactive', 'lag'],
  },
  {
    keywords: ['duckdb', 'pyarrow', 'zero-copy', 'profiler', 'quantile', 'cardinality', '512mb', 'data engineering'],
    domain: 'FastAPI',
    topic: 'Zero-Copy S3 Profiling under 512MB RAM (DuckDB + PyArrow)',
    explanation:
      'DuckDB `httpfs` reads Parquet footers and streams only requested byte ranges directly from S3 with zero local disk download. Under a strict `512MB` pod limit, cap DuckDB memory (`SET memory_limit=\'360MB\'`), limit threads (`SET threads=2`), and compute single-pass `approx_count_distinct` + `approx_quantile` so large datasets never OOMKill.',
    codeSnippet: `con = duckdb.connect(":memory:")
con.execute("INSTALL httpfs; LOAD httpfs; SET memory_limit='360MB'; SET threads=2;")
stats = con.execute("""
  SELECT COUNT(*) AS rows, APPROX_COUNT_DISTINCT(user_id) AS card,
         APPROX_QUANTILE(latency_ms, [0.25, 0.5, 0.75, 0.95]) AS q
  FROM read_parquet('s3://bucket/dataset.parquet')
""").fetchall()`,
    quizQuestion:
      'How does DuckDB profile a 20GB Parquet file in S3 inside a 512MB RAM container without OOMKilling?',
    quizExpectedConcepts: ['range', 'column', 'projection', 'memory_limit', 'approx', 'stream'],
  },
  {
    keywords: ['alb', 'ingress', 'cors', 'cloudfront', 'options', 'preflight', 'irsa', 'permission boundary', 'accessdenied', 'prestop', 'readinessprobe', 'startupprobe', 'zero-downtime'],
    domain: 'DevOps',
    topic: 'EKS ALB Ingress, CORS, IRSA Boundaries & Zero-Downtime Rollouts',
    explanation:
      '1) CORS across CloudFront + ALB: forward `Origin` & `Access-Control-Request-*` headers so `OPTIONS` preflight isn’t stripped before FastAPI.\n2) IRSA `AccessDeniedException`: effective IAM permissions = `Role Policy ∩ Permission Boundary`. Updating only the Role policy fails if the Permission Boundary omits `sqs:SendMessage` or `s3:PutObject`.\n3) Zero-downtime rollouts: combine `startupProbe`, `readinessProbe`, and `preStop: sleep 5` so Kubernetes drains the pod IP from ALB target groups BEFORE sending `SIGTERM`.',
    codeSnippet: `lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 5"]
readinessProbe:
  httpGet: { path: /healthz, port: 8000 }
  periodSeconds: 5`,
    quizQuestion:
      'During a rolling deployment on EKS, why do brief 502 errors occur if you omit `preStop: sleep 5` even though `readinessProbe` is configured?',
    quizExpectedConcepts: ['race', 'sigterm', 'alb', 'endpoint', 'deregister', 'in-flight'],
  },
  {
    keywords: ['migration', 'not null', 'table lock', 'alter table', 'backfill', 'postgres', 'rds'],
    domain: 'FastAPI',
    topic: 'Zero-Lock 3-Step PostgreSQL Migration Pattern',
    explanation:
      'Adding a constrained/backfilled column naively can acquire an `ACCESS EXCLUSIVE` lock and block live traffic. Safe 3-step rollout: (1) `ADD COLUMN vcpu INT NULL` (instant metadata change); (2) batched backfill (`LIMIT 5000` loops) + dual-write in code; (3) `ADD CONSTRAINT ... CHECK (vcpu IS NOT NULL) NOT VALID`, followed by `VALIDATE CONSTRAINT` (concurrent `SHARE UPDATE EXCLUSIVE` lock).',
    codeSnippet: `-- Step 1: instant nullable add
ALTER TABLE builds ADD COLUMN vcpu INT;
-- Step 2: batched backfill in app/script (5k rows/tx)
-- Step 3: non-blocking validation
ALTER TABLE builds ADD CONSTRAINT builds_vcpu_nn CHECK (vcpu IS NOT NULL) NOT VALID;
ALTER TABLE builds VALIDATE CONSTRAINT builds_vcpu_nn;`,
    quizQuestion:
      'Why does adding `CHECK (...) NOT VALID` followed by `VALIDATE CONSTRAINT` avoid production downtime compared to a direct `SET NOT NULL` on a 50M-row Postgres table?',
    quizExpectedConcepts: ['lock', 'access exclusive', 'read', 'write', 'concurrent', 'scan'],
  },
  {
    keywords: ['oidc', 'pkce', 'keycloak', 'client credentials', 'm2m', 'oauth', 'security'],
    domain: 'DevOps',
    topic: 'Enterprise OIDC: Auth Code + PKCE & Client Credentials',
    explanation:
      'Browser SPAs are public clients — never embed a `client_secret`. Use Authorization Code + PKCE (`code_verifier` → SHA-256 `code_challenge`) so intercepted auth codes cannot be redeemed. For backend service-to-service calls (`dataset-profiler` → `meridian-api`), use OAuth2 `client_credentials` with short-lived JWTs verified via Keycloak JWKS.',
    codeSnippet: `// Browser PKCE verifier -> challenge
const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
const challenge = base64Url(new Uint8Array(digest));`,
    quizQuestion:
      'In an Angular SPA using Keycloak, why is PKCE mandatory even though HTTPS encrypts traffic?',
    quizExpectedConcepts: ['public client', 'secret', 'intercept', 'authorization code', 'redirect'],
  },
  {
    keywords: ['gcp', 'cloud run', 'gke', 'workload identity', 'pub/sub', 'bigquery'],
    domain: 'GCP',
    topic: 'GCP Cloud Run, GKE Workload Identity & Pub/Sub',
    explanation:
      'Bind Kubernetes ServiceAccounts to Google IAM via Workload Identity Federation (zero static JSON keys). Set Pub/Sub `ackDeadlineSeconds` beyond job runtime + attach a Dead-Letter Topic (`maxDeliveryAttempts`), and disable CPU throttling on Cloud Run if handling async background work.',
    codeSnippet: `# Bind GKE KSA to Google Service Account via Workload Identity
gcloud iam service-accounts add-iam-policy-binding gsa@project.iam.gserviceaccount.com \\
  --role roles/iam.workloadIdentityUser \\
  --member "serviceAccount:project.svc.id.goog[compute/worker-ksa]"`,
    quizQuestion:
      'What happens in GCP Pub/Sub if a worker takes 90 seconds to process a message whose `ackDeadlineSeconds` is 30 seconds without extending the ack deadline?',
    quizExpectedConcepts: ['redeliver', 'duplicate', 'expire', 'another worker', 'nack'],
  },
];

function scoreTextMatch(queryTokens: string[], fullQueryLower: string, candidateText: string): number {
  const lower = candidateText.toLowerCase();
  let score = 0;
  if (fullQueryLower.length >= 4 && lower.includes(fullQueryLower)) {
    score += 14;
  }
  for (const tok of queryTokens) {
    if (lower.includes(tok)) {
      score += tok.length >= 6 ? 4 : 2;
    }
  }
  return score;
}

function findBestKbEntry(text: string): { entry: JarvisKnowledgeEntry; score: number } | null {
  const lower = text.toLowerCase();
  let best: { entry: JarvisKnowledgeEntry; score: number } | null = null;
  for (const entry of JARVIS_TECH_KB) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        score += kw.length >= 6 ? 9 : 5;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }
  return best;
}

function resolveReferencedQuest(
  msg: string,
  todayQuests: JarvisQuestContext[]
): JarvisQuestContext | null {
  const lower = msg.toLowerCase();
  const numMatch = lower.match(/(?:quest|task|step|#)\s*(\d+)/i);
  if (numMatch) {
    const idx = Number(numMatch[1]) - 1;
    if (idx >= 0 && idx < todayQuests.length) {
      return todayQuests[idx];
    }
  }
  const tokens = lower.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  let best: { q: JarvisQuestContext; score: number } | null = null;
  for (const q of todayQuests) {
    const s = scoreTextMatch(tokens, lower, `${q.title} ${q.domain} ${q.linkedSkillTitle}`);
    if (s > 0 && (!best || s > best.score)) {
      best = { q, score: s };
    }
  }
  return best && best.score >= 4 ? best.q : todayQuests.find((q) => q.status !== 'completed') || todayQuests[0] || null;
}

function buildJarvisFallbackResponse(params: {
  userMessage: string;
  trigger: 'user_chat' | 'post_upload_brief' | 'proactive_scan';
  currentScreen: {
    activePage: JarvisPage;
    profileDomainFilter?: Domain | 'All';
    selectedSkillTitle?: string | null;
  };
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  activeProject?: JarvisProjectContext | null;
  skills: JarvisSkillContext[];
  todayQuests: JarvisQuestContext[];
  streakDays?: number;
}) {
  const msg = (params.userMessage || '').trim();
  const lower = msg.toLowerCase();
  const history = params.conversationHistory || [];
  const lastAssistantMsg = [...history].reverse().find((m) => m.role === 'assistant')?.content || '';
  const recentHistoryContext = history.slice(-4).map((m) => m.content).join(' ');

  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'what', 'how', 'can', 'you',
    'why', 'please', 'tell', 'show', 'open', 'explain', 'walk', 'through',
    'step', 'guide', 'about', 'more', 'give', 'code', 'example', 'help',
  ]);
  const queryTokens = Array.from(
    new Set(lower.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !stopWords.has(t)))
  );

  const pendingQuests = (params.todayQuests || []).filter((q) => q.status !== 'completed');
  const topQuest = pendingQuests[0] || (params.todayQuests || [])[0] || null;

  const sortedSkills = [...(params.skills || [])].sort((a, b) => {
    const pRank = (p: string) => (p === 'Critical' ? 0 : p === 'High' ? 1 : 2);
    const diff = pRank(a.priority) - pRank(b.priority);
    if (diff !== 0) return diff;
    return a.mastery - b.mastery;
  });

  // 1. Post-upload automatic tactical briefing
  if (params.trigger === 'post_upload_brief' && params.activeProject) {
    const mods = params.activeProject.masterSyllabusModules || [];
    const actions: JarvisAction[] = [{ type: 'navigate', page: 'quests' }];
    if (topQuest) {
      actions.push({ type: 'focus_quest', questIdOrTitle: topQuest.id || topQuest.title });
    }

    const stepLines = pendingQuests.slice(0, 3).map((q, idx) => {
      const checklistHint = q.masteryChecklist?.[0] ? ` — Start with: ${q.masteryChecklist[0]}` : '';
      return `${idx + 1}. [${q.rank} · ${q.domain}] ${q.title}${checklistHint}`;
    });

    const firstModule = mods[0];
    const kb = firstModule ? findBestKbEntry(`${firstModule.title} ${firstModule.keyInternals}`) : null;

    return {
      headline: `Mission Brief · ${params.activeProject.projectName}`,
      interactiveMode: 'walkthrough' as JarvisInteractiveMode,
      reply: [
        `Analysis complete for "${params.activeProject.projectName}" (${params.activeProject.rank} · Primary: ${params.activeProject.primaryDomain}). I switched your screen to Quests and locked focus on your #1 priority task.`,
        firstModule
          ? `Critical Module #1: ${firstModule.title}\n• Goal: ${firstModule.objective}\n• Key Internals: ${firstModule.keyInternals}`
          : `Mastery Goal: ${params.activeProject.masteryGoal}`,
        stepLines.length > 0
          ? `Your Ordered Action Plan:\n${stepLines.join('\n')}`
          : 'Inspect your syllabus nodes in Profile to drill internals.',
        `Tell me "Walk me through Quest 1", ask any doubt, or say "Quiz me" to test your readiness.`,
      ].join('\n\n'),
      codeSnippet: kb?.entry.codeSnippet,
      uiActions: actions,
      suggestedFollowUps: [
        topQuest ? `Walk me through "${topQuest.title.slice(0, 36)}"` : 'What should I build first?',
        'Quiz me on this project',
        `Open ${params.activeProject.primaryDomain} syllabus`,
      ],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  // 2. Interactive Quiz Answer Evaluation (if last JARVIS turn was a quiz challenge and user didn't give a command)
  const wasQuizTurn =
    lastAssistantMsg.includes('Quiz Challenge') || lastAssistantMsg.includes('Answer Question:');
  const isCommandOverride = /\b(go to|switch|open|refresh|complete quest|mark .* done|upload|close drawer|analyze|quiz me|test me)\b/i.test(
    lower
  );

  if (wasQuizTurn && !isCommandOverride && msg.length >= 4) {
    const matchedKb = findBestKbEntry(`${lastAssistantMsg} ${recentHistoryContext}`);
    const expected = matchedKb?.entry.quizExpectedConcepts || ['idempotency', 'lock', 'timeout', 'retry', 'boundary'];
    const hits = expected.filter((kw) => lower.includes(kw));
    const misses = expected.filter((kw) => !lower.includes(kw));

    const verdict =
      hits.length >= 2
        ? `Strong answer! You nailed ${hits.map((h) => `"${h}"`).join(', ')}.`
        : hits.length === 1
        ? `Partially right — good catch on "${hits[0]}", though Staff-level rigor also watches for ${misses.slice(0, 2).join(' and ')}.`
        : `Good attempt — here is the key Staff-level insight you want in mind: ${misses.slice(0, 3).join(', ')}.`;

    return {
      headline: `Quiz Feedback · ${matchedKb?.entry.topic || 'Architecture Check'}`,
      interactiveMode: 'quiz' as JarvisInteractiveMode,
      reply: [
        verdict,
        matchedKb
          ? `Reference Mechanism (${matchedKb.entry.domain}):\n${matchedKb.entry.explanation}`
          : 'Focus on the exact concurrency/retry/IAM failure boundary and verify it with telemetry.',
        topQuest
          ? `Ready to mark "${topQuest.title}" complete, or want another scenario question?`
          : 'Want another challenge question or should we inspect your next syllabus topic?',
      ].join('\n\n'),
      codeSnippet: matchedKb?.entry.codeSnippet,
      uiActions: [],
      suggestedFollowUps: [
        'Quiz me with another question',
        topQuest ? `Complete quest: ${topQuest.title.slice(0, 34)}` : 'Open weakest skill brief',
        'Walk me through Quest 1',
      ],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  // 3. Direct Quest Completion via Conversation
  if (
    /\b(complete|finish|finished|mark done|done with|check off)\b/i.test(lower) &&
    (/\b(quest|task|this|step|1|2|3|4)\b/i.test(lower) || pendingQuests.length > 0) &&
    !/\bproject\b/i.test(lower)
  ) {
    const targetQuest = resolveReferencedQuest(msg, pendingQuests.length ? pendingQuests : params.todayQuests);
    if (targetQuest && targetQuest.status !== 'completed') {
      const remaining = pendingQuests.filter((q) => q.id !== targetQuest.id);
      const nextQ = remaining[0];
      return {
        headline: `Quest Completed · +${targetQuest.xpReward} XP`,
        interactiveMode: 'mentor' as JarvisInteractiveMode,
        reply: [
          `Marked "${targetQuest.title}" (${targetQuest.domain}) as completed and logged +${targetQuest.xpReward} XP + mastery progress automatically!`,
          nextQ
            ? `Next up on screen: "${nextQ.title}" (${nextQ.rank} · ${nextQ.domain} · ${nextQ.estimatedMinutes}m).\nObjective: ${nextQ.objective}`
            : `All of today's quests are now cleared! Say "Quiz me" for bonus recall or "Open my weakest topic" to keep leveling up.`,
        ].join('\n\n'),
        uiActions: [
          { type: 'navigate', page: 'quests' },
          { type: 'complete_quest', questIdOrTitle: targetQuest.id || targetQuest.title },
          ...(nextQ ? [{ type: 'focus_quest', questIdOrTitle: nextQ.id || nextQ.title } as JarvisAction] : []),
        ],
        suggestedFollowUps: nextQ
          ? [`Walk me through "${nextQ.title.slice(0, 36)}"`, 'Quiz me on this domain']
          : ['Open my weakest skill brief', 'Upload a new project task'],
        aiNotice: AI_QUOTA_NOTICE,
      };
    }
  }

  // 4. Interactive Quiz Trigger
  if (/\b(quiz|test me|ask me|interview|challenge me|recall check)\b/i.test(lower)) {
    const mentionedDomain = VALID_DOMAINS.find((d) =>
      new RegExp(`\\b${d.toLowerCase()}\\b`, 'i').test(msg)
    );
    const contextSeed = `${msg} ${params.currentScreen.selectedSkillTitle || ''} ${topQuest?.title || ''} ${params.activeProject?.masterSyllabusModules?.[0]?.title || ''} ${recentHistoryContext}`;
    const matchedKb =
      (mentionedDomain
        ? JARVIS_TECH_KB.find((e) => e.domain === mentionedDomain)
        : null) ||
      findBestKbEntry(contextSeed)?.entry ||
      JARVIS_TECH_KB[0];

    return {
      headline: `Interactive Quiz · ${matchedKb.domain}`,
      interactiveMode: 'quiz' as JarvisInteractiveMode,
      reply: `Quiz Challenge (${matchedKb.topic}):\n\n${matchedKb.quizQuestion}\n\nReply with your reasoning below and I will grade it against Top 1% invariants.`,
      uiActions: [],
      suggestedFollowUps: [
        'Explain the answer & show code',
        'Walk me through Quest 1',
      ],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  // 5. Direct Upload via pasted text or upload navigation
  if (msg.length > 260 && (msg.includes('\n') || /\b(lab|module|architecture|fastapi|angular|aws|kubernetes)\b/i.test(lower))) {
    const firstLine = (msg.split('\n')[0] || '').trim();
    const projectMatch = msg.match(/(?:project|title|mission)\s*[:\-]\s*([^\n]{3,80})/i);
    const inferredProjectName = (
      projectMatch?.[1] ||
      firstLine.replace(/^#+\s*/, '').replace(/^\d+[\.\)]\s*/, '')
    )
      .trim()
      .slice(0, 80);

    return {
      headline: 'Loaded Brief into Upload Screen',
      interactiveMode: 'mentor' as JarvisInteractiveMode,
      reply:
        'I detected a detailed project specification in your message, switched you to the Upload Task screen, and pre-filled the Project Name and Task Brief. Click "Activate Project & Update Syllabus" to compile your modules and Day 1 quests.',
      uiActions: [
        {
          type: 'prefill_upload',
          projectName: inferredProjectName || undefined,
          rawTaskBrief: msg.slice(0, 10000),
        },
      ],
      suggestedFollowUps: ['Analyze my current quests instead', 'Back to Quests'],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  // 6. Explicit UI commands
  const mentionedDomain = VALID_DOMAINS.find((d) =>
    new RegExp(`\\b${d.toLowerCase()}\\b`, 'i').test(msg)
  );

  if (/\b(close|dismiss)\s+(drawer|brief|panel|syllabus)\b/i.test(lower)) {
    return {
      headline: 'Screen Updated · Drawer Closed',
      interactiveMode: 'mentor' as JarvisInteractiveMode,
      reply: 'Closed the Study Brief drawer so you have a clear view of the workspace.',
      uiActions: [{ type: 'close_skill_drawer' } as JarvisAction],
      suggestedFollowUps: ['Analyze my pending quests', 'Go back to Quests', 'Quiz me'],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  if (/\b(refresh|regenerate|re-issue|new)\s+(daily\s+)?quests?\b/i.test(lower)) {
    return {
      headline: 'Refreshing Daily Quests',
      interactiveMode: 'mentor' as JarvisInteractiveMode,
      reply:
        'Switched to Quests and re-issued today’s prioritized Daily Quests based on your active project and skill gaps.',
      uiActions: [{ type: 'navigate', page: 'quests' }, { type: 'refresh_quests' }],
      suggestedFollowUps: ['Walk me through Quest 1', 'Open my weakest topic'],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  if (/\b(upload|new project|add project|new task|paste brief)\b/i.test(lower) && !/\buploaded\b/i.test(lower)) {
    return {
      headline: 'Navigated · Upload Project Task',
      interactiveMode: 'mentor' as JarvisInteractiveMode,
      reply:
        'Opened the Upload Task screen. Paste your deliverable list or upload a file (`.txt`, `.md`, etc.) — or paste the brief right here in chat and I’ll pre-fill it for you.',
      uiActions: [{ type: 'navigate', page: 'upload' }],
      suggestedFollowUps: ['Analyze my current tasks', 'Back to Quests'],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  if (/\b(weakest|lowest|gap|blind ?spot|behind)\b/i.test(lower)) {
    const pool = mentionedDomain
      ? sortedSkills.filter((s) => normalizeDomain(s.domain, '', 'AWS') === mentionedDomain)
      : sortedSkills;
    const weakest = pool[0] || sortedSkills[0];
    if (weakest) {
      const kb = findBestKbEntry(`${weakest.title} ${weakest.description || ''} ${weakest.studyBrief || ''}`);
      return {
        headline: `Priority Gap · ${weakest.domain} (${weakest.mastery}%)`,
        interactiveMode: 'mentor' as JarvisInteractiveMode,
        reply: [
          `Opened your highest-leverage gap${mentionedDomain ? ` in ${mentionedDomain}` : ''}: "${weakest.title}" (${weakest.tier} · ${weakest.mastery}% mastery). The Study Brief drawer is open alongside this console.`,
          kb ? `Core Mechanism:\n${kb.entry.explanation}` : weakest.studyBrief?.slice(0, 500) || weakest.description || '',
          weakest.labPrompt ? `Hands-on Lab Target:\n${weakest.labPrompt.slice(0, 380)}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        codeSnippet: kb?.entry.codeSnippet,
        uiActions: [
          {
            type: 'open_skill',
            skillTitle: weakest.title,
            domain: normalizeDomain(weakest.domain, weakest.title, 'AWS'),
          },
        ],
        suggestedFollowUps: [
          `Quiz me on ${weakest.domain}`,
          'Switch back to Quests',
          'Walk me through Quest 1',
        ],
        aiNotice: AI_QUOTA_NOTICE,
      };
    }
  }

  // 7. Walkthrough / Step-by-Step Guide Intent
  const isWalkthrough = /\b(walk ?me ?through|step by step|steps|how do i (solve|start|build|do|execute|implement)|guide me)\b/i.test(
    lower
  );
  if (isWalkthrough) {
    const targetQuest = resolveReferencedQuest(msg, params.todayQuests);
    if (targetQuest) {
      const matchedMod = (params.activeProject?.masterSyllabusModules || []).find((m) =>
        scoreTextMatch(
          targetQuest.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
          targetQuest.title.toLowerCase(),
          `${m.title} ${m.objective}`
        ) >= 4
      );
      const matchedSkill = (params.skills || []).find(
        (s) =>
          s.title.toLowerCase() === targetQuest.linkedSkillTitle.toLowerCase() ||
          scoreTextMatch(
            targetQuest.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
            targetQuest.title.toLowerCase(),
            `${s.title} ${s.description || ''}`
          ) >= 4
      );
      const kb = findBestKbEntry(
        `${targetQuest.title} ${targetQuest.objective} ${matchedMod?.keyInternals || ''} ${matchedSkill?.studyBrief || ''}`
      );

      const checklistLines = (targetQuest.masteryChecklist || []).map((c, i) => `Step ${i + 1}: ${c}`);

      return {
        headline: `Walkthrough · ${targetQuest.title.slice(0, 42)}`,
        interactiveMode: 'walkthrough' as JarvisInteractiveMode,
        reply: [
          `Focused "${targetQuest.title}" (${targetQuest.rank} · ${targetQuest.domain} · ${targetQuest.estimatedMinutes}m) on screen. Here is your concrete execution blueprint:`,
          `Objective: ${targetQuest.objective}`,
          checklistLines.length ? `Execution Steps:\n${checklistLines.join('\n')}` : '',
          matchedMod
            ? `Verification Bar (${matchedMod.title}): ${matchedMod.verificationCriteria}`
            : '',
          kb
            ? `Key Architecture Pattern (${kb.entry.topic}):\n${kb.entry.explanation}`
            : matchedSkill?.studyBrief?.slice(0, 450) || '',
          `Ask me a doubt about any step above, or tell me "Complete quest" when you finish!`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        codeSnippet: kb?.entry.codeSnippet,
        uiActions: [
          { type: 'navigate', page: 'quests' },
          { type: 'focus_quest', questIdOrTitle: targetQuest.id || targetQuest.title },
        ],
        suggestedFollowUps: [
          `Complete "${targetQuest.title.slice(0, 34)}"`,
          `Quiz me on ${targetQuest.domain}`,
          'Show code & failure modes',
        ],
        aiNotice: AI_QUOTA_NOTICE,
      };
    }
  }

  // 8. Proactive scan / status / "what should I do next"
  const isAnalyzeIntent =
    params.trigger === 'proactive_scan' ||
    /\b(analyze|analysis|what should i do|what next|next step|prioritize|brief me|my tasks?|daily plan|status|routine)\b/i.test(
      lower
    );

  if (isAnalyzeIntent) {
    const actions: JarvisAction[] = [{ type: 'navigate', page: 'quests' }];
    if (topQuest) {
      actions.push({ type: 'focus_quest', questIdOrTitle: topQuest.id || topQuest.title });
    }

    const doneCount = (params.todayQuests || []).length - pendingQuests.length;
    const weakestOverall = sortedSkills[0];
    const kb = topQuest ? findBestKbEntry(`${topQuest.title} ${topQuest.objective}`) : null;

    const lines: string[] = [];
    if (params.activeProject) {
      lines.push(
        `Active Project Priority: "${params.activeProject.projectName}" (${params.activeProject.rank} · ${params.activeProject.primaryDomain}).`
      );
    } else {
      lines.push(
        `Balanced Routine Active (${params.streakDays ?? 1}d streak · No active project override).`
      );
    }

    if (pendingQuests.length > 0 && topQuest) {
      lines.push(
        `${pendingQuests.length} pending quest(s) remaining (${doneCount} cleared). I switched focus onto Quest #1: "${topQuest.title}" (${topQuest.domain} · ${topQuest.estimatedMinutes}m · +${topQuest.xpReward} XP).`
      );
      lines.push(
        `What to do right now:\n${(topQuest.masteryChecklist || [topQuest.objective])
          .map((c, i) => `${i + 1}. ${c}`)
          .join('\n')}`
      );
    } else {
      lines.push(
        'All quests for today are completed!' +
          (weakestOverall
            ? ` Opening your weakest high-leverage topic next: "${weakestOverall.title}" (${weakestOverall.domain} · ${weakestOverall.mastery}%).`
            : ' Upload a new project brief whenever ready.')
      );
      if (weakestOverall) {
        actions.length = 0;
        actions.push({
          type: 'open_skill',
          skillTitle: weakestOverall.title,
          domain: normalizeDomain(weakestOverall.domain, weakestOverall.title, 'AWS'),
        });
      }
    }

    return {
      headline: topQuest ? `Mission Focus · ${topQuest.domain}` : 'Daily Sweep Complete',
      interactiveMode: 'mentor' as JarvisInteractiveMode,
      reply: lines.join('\n\n'),
      codeSnippet: kb?.entry.codeSnippet,
      uiActions: actions,
      suggestedFollowUps: [
        topQuest ? `Walk me through "${topQuest.title.slice(0, 34)}"` : 'Upload a new project task',
        `Quiz me on ${topQuest?.domain || 'AWS'}`,
        'Open my weakest topic brief',
      ],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  // 9. Explicit Profile / Quests Navigation
  if (
    /\b(profile|milestone|progress|streak|rotation|syllabus|topics)\b/i.test(lower) &&
    !/\b(how|why|what is|explain|difference|debug|error|doubt)\b/i.test(lower)
  ) {
    return {
      headline: `Navigated · Profile${mentionedDomain ? ` (${mentionedDomain})` : ''}`,
      interactiveMode: 'mentor' as JarvisInteractiveMode,
      reply: `Switched your screen to Profile${mentionedDomain ? ` (${mentionedDomain})` : ''}. Pick any syllabus node to open its brief side-by-side, or tell me "Open weakest topic".`,
      uiActions: [
        { type: 'navigate', page: 'profile', domainFilter: mentionedDomain || 'All' },
      ],
      suggestedFollowUps: [
        `Open weakest ${mentionedDomain || ''} topic`.trim(),
        'Back to Quests',
        'Quiz me',
      ],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  if (/\b(go to quests?|back to quests?|show quests?|daily tasks?)\b/i.test(lower)) {
    const actions: JarvisAction[] = [{ type: 'navigate', page: 'quests' }];
    if (topQuest) actions.push({ type: 'focus_quest', questIdOrTitle: topQuest.id || topQuest.title });
    return {
      headline: 'Navigated · Daily Quests',
      interactiveMode: 'mentor' as JarvisInteractiveMode,
      reply: topQuest
        ? `Returned to Quests and highlighted "${topQuest.title}" (${topQuest.domain} · +${topQuest.xpReward} XP).`
        : 'Returned to your Quests screen.',
      uiActions: actions,
      suggestedFollowUps: ['Walk me through Quest 1', 'Quiz me'],
      aiNotice: AI_QUOTA_NOTICE,
    };
  }

  // 10. Context-Aware Follow-up & Technical Doubt Solver
  const isShortFollowUp =
    queryTokens.length <= 2 &&
    /\b(why|how|example|code|more|detail|elaborate|next|explain|pitfall|failure)\b/i.test(lower);

  const effectiveSearchQuery = isShortFollowUp
    ? `${msg} ${params.currentScreen.selectedSkillTitle || ''} ${recentHistoryContext} ${topQuest?.title || ''}`
    : msg;

  const effectiveTokens = Array.from(
    new Set(
      effectiveSearchQuery
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !stopWords.has(t))
    )
  );

  let bestSkill: { item: JarvisSkillContext; score: number } | null = null;
  for (const s of params.skills || []) {
    const score = scoreTextMatch(
      effectiveTokens,
      effectiveSearchQuery.toLowerCase(),
      `${s.title} ${s.domain} ${s.description || ''} ${s.studyBrief || ''} ${s.labPrompt || ''}`
    );
    if (!bestSkill || score > bestSkill.score) {
      bestSkill = { item: s, score };
    }
  }

  let bestModule: {
    item: JarvisProjectContext['masterSyllabusModules'][number];
    score: number;
  } | null = null;
  for (const m of params.activeProject?.masterSyllabusModules || []) {
    const score = scoreTextMatch(
      effectiveTokens,
      effectiveSearchQuery.toLowerCase(),
      `${m.title} ${m.domain} ${m.objective} ${m.keyInternals} ${m.verificationCriteria}`
    );
    if (!bestModule || score > bestModule.score) {
      bestModule = { item: m, score };
    }
  }

  const bestKb = findBestKbEntry(effectiveSearchQuery);
  const actions: JarvisAction[] = [];
  const sections: string[] = [];
  let headline = 'JARVIS Technical Mentor';
  let codeSnippet: string | undefined;

  if (bestKb) {
    headline = `Doubt Resolved · ${bestKb.entry.topic}`;
    sections.push(`${bestKb.entry.topic} (${bestKb.entry.domain}):\n${bestKb.entry.explanation}`);
    codeSnippet = bestKb.entry.codeSnippet;
  }

  if (bestModule && bestModule.score >= 4) {
    if (!bestKb) headline = `Project Module · ${bestModule.item.title}`;
    sections.push(
      `Project Context (${params.activeProject?.projectName} — ${bestModule.item.title}):\n• Goal: ${bestModule.item.objective}\n• Key Internals: ${bestModule.item.keyInternals}\n• Verification: ${bestModule.item.verificationCriteria}`
    );
  }

  if (bestSkill && bestSkill.score >= 4) {
    const matchedDomain = normalizeDomain(bestSkill.item.domain, bestSkill.item.title, 'AWS');
    actions.push({ type: 'open_skill', skillTitle: bestSkill.item.title, domain: matchedDomain });
    if (!bestKb) headline = `Brief Opened · ${bestSkill.item.title}`;
    if (bestSkill.item.studyBrief) {
      sections.push(
        `Opened Study Brief Side-by-Side (${bestSkill.item.title} · ${bestSkill.item.mastery}%):\n${bestSkill.item.studyBrief.slice(0, 550)}`
      );
    }
    if (bestSkill.item.labPrompt) {
      sections.push(`Hands-on Lab:\n${bestSkill.item.labPrompt.slice(0, 350)}`);
    }
  }

  if (sections.length === 0) {
    const targetDomain = mentionedDomain || (params.activeProject?.primaryDomain as Domain) || 'AWS';
    const domainKb = JARVIS_TECH_KB.find((e) => e.domain === targetDomain) || JARVIS_TECH_KB[0];
    const domainSkill = sortedSkills.find(
      (s) => normalizeDomain(s.domain, '', 'AWS') === targetDomain
    );
    if (domainSkill) {
      actions.push({ type: 'open_skill', skillTitle: domainSkill.title, domain: targetDomain });
    }
    headline = `Guidance · ${targetDomain} Architecture`;
    sections.push(
      `Let's tackle "${msg}" concretely in ${targetDomain}. I opened "${domainSkill?.title || targetDomain}" on screen so you can follow along.`
    );
    sections.push(`Key Reference (${domainKb.topic}):\n${domainKb.explanation}`);
    codeSnippet = domainKb.codeSnippet;
  }

  return {
    headline,
    interactiveMode: 'mentor' as JarvisInteractiveMode,
    reply: sections.join('\n\n'),
    codeSnippet,
    uiActions: actions,
    suggestedFollowUps: [
      `Quiz me on ${bestKb?.entry.domain || mentionedDomain || topQuest?.domain || 'AWS'}`,
      topQuest ? `Walk me through "${topQuest.title.slice(0, 34)}"` : 'Analyze my tasks',
      'What should I do next?',
    ],
    aiNotice: AI_QUOTA_NOTICE,
  };
}

app.post('/api/ai/jarvis', async (req, res) => {
  const {
    userMessage,
    trigger,
    currentScreen,
    conversationHistory,
    context,
  } = (req.body || {}) as {
    userMessage?: string;
    trigger?: 'user_chat' | 'post_upload_brief' | 'proactive_scan';
    currentScreen?: {
      activePage: JarvisPage;
      profileDomainFilter?: Domain | 'All';
      selectedSkillTitle?: string | null;
    };
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    context?: {
      weeklyHoursTarget?: number;
      streakDays?: number;
      rotationMap?: Record<string, string>;
      domainFocusMinutes?: Record<string, number>;
      activeProject?: JarvisProjectContext | null;
      skills?: JarvisSkillContext[];
      todayQuests?: JarvisQuestContext[];
    };
  };

  const effectiveTrigger = trigger || 'user_chat';
  const effectiveMessage =
    asString(userMessage) ||
    (effectiveTrigger === 'post_upload_brief'
      ? 'Analyze the newly uploaded project task, tell me the exact execution plan, and focus my screen on where to start.'
      : 'Analyze my current tasks and tell me what to do next.');

  const safeScreen = currentScreen || { activePage: 'quests', profileDomainFilter: 'All' };
  const skills = Array.isArray(context?.skills) ? context.skills : [];
  const todayQuests = Array.isArray(context?.todayQuests) ? context.todayQuests : [];
  const activeProject = context?.activeProject || null;
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  try {
    const projectSummary = activeProject
      ? `ACTIVE PROJECT: ${activeProject.projectName} (${activeProject.rank} | Primary: ${activeProject.primaryDomain})
Goal: ${activeProject.masteryGoal}
Modules:
${(activeProject.masterSyllabusModules || [])
  .map((m, i) => `  ${i + 1}. [${m.domain}] ${m.title}: ${m.objective} | Internals: ${m.keyInternals}`)
  .join('\n')}`
      : 'ACTIVE PROJECT: None (Balanced Normal Routine active)';

    const questsSummary =
      todayQuests.length > 0
        ? todayQuests
            .map(
              (q, i) =>
                `${i + 1}. [id=${q.id}] [${q.status.toUpperCase()}] [${q.rank} | ${q.domain} | ${q.questType} | ${q.estimatedMinutes}m | +${q.xpReward}XP] ${q.title} — ${q.objective}`
            )
            .join('\n')
        : 'No quests issued yet for today.';

    const topSkillsSummary = [...skills]
      .sort((a, b) => {
        const p = (v: string) => (v === 'Critical' ? 0 : v === 'High' ? 1 : 2);
        return p(a.priority) - p(b.priority) || a.mastery - b.mastery;
      })
      .slice(0, 30)
      .map((s) => `- [${s.domain} | ${s.tier} | ${s.priority} | ${s.mastery}%] ${s.title}`)
      .join('\n');

    const historyBlock = history
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'Engineer' : 'JARVIS'}: ${m.content}`)
      .join('\n');

    const response = await generateWithModelFallback({
      model: 'gemini-4-hydrogen',
      contents: `Trigger: ${effectiveTrigger}
Current Screen: page=${safeScreen.activePage}, domainFilter=${safeScreen.profileDomainFilter || 'All'}, openSkill=${safeScreen.selectedSkillTitle || 'None'}
Streak: ${context?.streakDays || 1}d | Weekly Target: ${context?.weeklyHoursTarget || 10}h

${projectSummary}

TODAY'S DAILY QUESTS:
${questsSummary}

KEY SYLLABUS NODES (Priority/Mastery):
${topSkillsSummary}

RECENT CHAT:
${historyBlock || 'None'}

ENGINEER REQUEST / DOUBT:
${effectiveMessage}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        systemInstruction: `You are JARVIS, an autonomous, highly interactive Principal Cloud & Full-Stack Engineering Command Mentor inside ApexStack (Angular, FastAPI, DevOps, AWS, GCP).
You actively drive the user's learning workspace, walk them step-by-step through tasks, run interactive active-recall quizzes, provide crisp production code snippets, and solve technical doubts deeply.

Allowed uiActions objects:
- { "type": "navigate", "page": "quests" | "upload" | "profile", "domainFilter": "All" | "Angular" | "FastAPI" | "DevOps" | "AWS" | "GCP" }
- { "type": "open_skill", "skillTitle": "<title from KEY SYLLABUS NODES>", "domain": "<Domain>" }
- { "type": "focus_quest", "questIdOrTitle": "<id or title from TODAY'S DAILY QUESTS>" }
- { "type": "complete_quest", "questIdOrTitle": "<id or title>" } (actually completes the quest in Firestore & awards XP when user finishes or asks to complete)
- { "type": "refresh_study_brief", "skillTitle": "<title>", "domain": "<Domain>" }
- { "type": "prefill_upload", "projectName": "<optional>", "rawTaskBrief": "<brief text>" } (when user pastes a spec in chat)
- { "type": "refresh_quests" }
- { "type": "close_skill_drawer" }

Rules:
- Be concise, direct, Principal-level technical, and interactive (end with a sharp check-in question or concrete next action).
- Include "codeSnippet" whenever concrete TypeScript/Python/SQL/YAML code resolves a doubt or walkthrough.
- Set "interactiveMode" to "quiz" when posing/grading a challenge question, "walkthrough" for step-by-step task guides, or "mentor" otherwise.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            reply: { type: Type.STRING },
            codeSnippet: { type: Type.STRING },
            interactiveMode: {
              type: Type.STRING,
              enum: ['mentor', 'walkthrough', 'quiz'],
            },
            uiActions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    enum: [
                      'navigate',
                      'open_skill',
                      'focus_quest',
                      'complete_quest',
                      'refresh_study_brief',
                      'prefill_upload',
                      'refresh_quests',
                      'close_skill_drawer',
                    ],
                  },
                  page: {
                    type: Type.STRING,
                    enum: ['quests', 'upload', 'profile'],
                  },
                  domainFilter: {
                    type: Type.STRING,
                    enum: ['All', 'Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  skillTitle: { type: Type.STRING },
                  domain: {
                    type: Type.STRING,
                    enum: ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'],
                  },
                  questIdOrTitle: { type: Type.STRING },
                  projectName: { type: Type.STRING },
                  rawTaskBrief: { type: Type.STRING },
                },
                required: ['type'],
              },
            },
            suggestedFollowUps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['headline', 'reply', 'uiActions', 'suggestedFollowUps'],
        },
      },
    });

    const parsed = parseJsonResponse(response.text, 'jarvis');
    const rawActions = Array.isArray(parsed.uiActions) ? parsed.uiActions : [];
    const normalizedActions: JarvisAction[] = [];

    for (const act of rawActions) {
      if (!act || typeof act !== 'object') continue;
      const a = act as Record<string, unknown>;
      const t = asString(a.type);
      if (t === 'navigate') {
        const page = normalizeEnum(a.page, ['quests', 'upload', 'profile'] as const, 'quests');
        const df = asString(a.domainFilter);
        const domainFilter =
          df === 'All'
            ? 'All'
            : VALID_DOMAINS.includes(df as Domain)
            ? (df as Domain)
            : undefined;
        normalizedActions.push({ type: 'navigate', page, domainFilter });
      } else if (t === 'open_skill' && asString(a.skillTitle)) {
        const dom = asString(a.domain);
        normalizedActions.push({
          type: 'open_skill',
          skillTitle: asString(a.skillTitle),
          domain: VALID_DOMAINS.includes(dom as Domain) ? (dom as Domain) : undefined,
        });
      } else if (t === 'focus_quest' && asString(a.questIdOrTitle)) {
        normalizedActions.push({
          type: 'focus_quest',
          questIdOrTitle: asString(a.questIdOrTitle),
        });
      } else if (t === 'complete_quest' && asString(a.questIdOrTitle)) {
        normalizedActions.push({
          type: 'complete_quest',
          questIdOrTitle: asString(a.questIdOrTitle),
        });
      } else if (t === 'refresh_study_brief' && asString(a.skillTitle)) {
        const dom = asString(a.domain);
        normalizedActions.push({
          type: 'refresh_study_brief',
          skillTitle: asString(a.skillTitle),
          domain: VALID_DOMAINS.includes(dom as Domain) ? (dom as Domain) : undefined,
        });
      } else if (t === 'prefill_upload') {
        normalizedActions.push({
          type: 'prefill_upload',
          projectName: asString(a.projectName) || undefined,
          rawTaskBrief: asString(a.rawTaskBrief) || undefined,
        });
      } else if (t === 'refresh_quests') {
        normalizedActions.push({ type: 'refresh_quests' });
      } else if (t === 'close_skill_drawer') {
        normalizedActions.push({ type: 'close_skill_drawer' });
      }
    }

    const suggestedFollowUps = Array.isArray(parsed.suggestedFollowUps)
      ? parsed.suggestedFollowUps.map((f) => asString(f)).filter(Boolean).slice(0, 3)
      : [];

    res.json({
      headline: asString(parsed.headline, 'JARVIS Command Briefing'),
      reply: asString(parsed.reply, 'Ready. Ask any doubt or command me to inspect your quests or syllabus.'),
      codeSnippet: asString(parsed.codeSnippet) || undefined,
      interactiveMode: normalizeEnum(
        parsed.interactiveMode,
        ['mentor', 'walkthrough', 'quiz'] as const,
        'mentor'
      ),
      uiActions: normalizedActions,
      suggestedFollowUps,
    });
  } catch (error) {
    if (isQuotaOrBillingError(error)) {
      console.warn('[jarvis] Gemini quota/credits unavailable; using local JARVIS reasoning engine.');
      res.json(
        buildJarvisFallbackResponse({
          userMessage: effectiveMessage,
          trigger: effectiveTrigger,
          currentScreen: safeScreen,
          conversationHistory: history,
          activeProject,
          skills,
          todayQuests,
          streakDays: context?.streakDays,
        })
      );
      return;
    }
    handleAiError(res, error, 'jarvis');
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay {}
`);
    });
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ApexStack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
