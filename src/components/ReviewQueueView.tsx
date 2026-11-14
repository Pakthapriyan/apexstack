import React, { useMemo, useState } from 'react';
import { Eye, Sparkles, Trash2 } from 'lucide-react';
import { DOMAINS } from '../data/seedCurriculum';
import { generateQuizCardsWithAi } from '../lib/aiClient';
import {
  calculateSm2,
  createReviewCards,
  deleteReviewCard,
  gradeReviewCard,
} from '../lib/firestoreService';
import type { Domain, ReviewCard, UserProfile } from '../types/learning';

interface ReviewQueueViewProps {
  profile: UserProfile;
  cards: ReviewCard[];
}

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({ profile, cards }) => {
  const [domainFilter, setDomainFilter] = useState<Domain | 'All'>('All');
  const [queueMode, setQueueMode] = useState<'due' | 'all'>('due');
  const [revealed, setRevealed] = useState(false);

  const [genDomain, setGenDomain] = useState<Domain>('AWS');
  const [genTopic, setGenTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nowIso = new Date().toISOString();

  const filteredCards = useMemo(() => {
    return cards
      .filter((c) => (domainFilter === 'All' ? true : c.domain === domainFilter))
      .filter((c) => (queueMode === 'due' ? c.nextReviewAt <= nowIso : true))
      .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
  }, [cards, domainFilter, queueMode, nowIso]);

  const activeCard = filteredCards[0] || null;

  const intervalPreviews = useMemo(() => {
    if (!activeCard) return null;
    return {
      again: calculateSm2(activeCard, 1).intervalDays,
      hard: calculateSm2(activeCard, 3).intervalDays,
      good: calculateSm2(activeCard, 4).intervalDays,
      easy: calculateSm2(activeCard, 5).intervalDays,
    };
  }, [activeCard]);

  const handleGrade = async (quality: 1 | 3 | 4 | 5) => {
    if (!activeCard || grading) return;
    setGrading(true);
    setError(null);
    try {
      await gradeReviewCard(profile.userId, activeCard, quality);
      setRevealed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to grade review card.');
    } finally {
      setGrading(false);
    }
  };

  const handleGenerateCards = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const res = await generateQuizCardsWithAi({
        domain: genDomain,
        topic: genTopic.trim() || undefined,
        existingPrompts: cards.map((c) => c.prompt),
      });
      await createReviewCards(profile.userId, res.cards);
      setGenTopic('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate quiz cards.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteCard = async (id: string) => {
    setError(null);
    try {
      await deleteReviewCard(profile.userId, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete card.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls & AI Card Generator */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg overflow-x-auto">
            {(['All', ...DOMAINS] as const).map((dom) => (
              <button
                key={dom}
                type="button"
                onClick={() => {
                  setDomainFilter(dom);
                  setRevealed(false);
                }}
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
            <button
              type="button"
              onClick={() => {
                setQueueMode('due');
                setRevealed(false);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                queueMode === 'due'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Due Now
            </button>
            <button
              type="button"
              onClick={() => {
                setQueueMode('all');
                setRevealed(false);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                queueMode === 'all'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Deck ({cards.length})
            </button>
          </div>
        </div>

        <form onSubmit={handleGenerateCards} className="flex flex-wrap items-center gap-2">
          <select
            value={genDomain}
            onChange={(e) => setGenDomain(e.target.value as Domain)}
            aria-label="Target domain for new cards"
            className="px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {DOMAINS.map((dom) => (
              <option key={dom} value={dom}>
                {dom}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={genTopic}
            onChange={(e) => setGenTopic(e.target.value)}
            placeholder="Optional topic (e.g., EKS CNI)"
            className="px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 w-48"
          />
          <button
            type="submit"
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{generating ? 'Generating...' : 'AI Generate 3 Cards'}</span>
          </button>
        </form>
      </section>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Active Study Stage */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl p-6 md:p-8">
        {!activeCard ? (
          <div className="py-8 text-center space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-100">
              {queueMode === 'due' ? 'Review queue clear' : 'No cards in this filter'}
            </h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              All due SM-2 spaced-repetition cards for this selection are complete. Switch to
              &ldquo;All Deck&rdquo; or generate fresh Staff-level cards above.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400 border-b border-slate-800/80 pb-3 tabular-nums">
              <span>
                {activeCard.domain} · {activeCard.skillTitle}
              </span>
              <span>
                {filteredCards.length} remaining · Interval {activeCard.intervalDays}d · Ease{' '}
                {activeCard.easeFactor.toFixed(2)}
              </span>
            </div>

            <div className="space-y-4">
              <h2 className="font-display text-xl font-semibold text-slate-50 leading-snug">
                {activeCard.prompt}
              </h2>

              {!revealed ? (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-semibold transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Reveal Staff Answer</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-5 pt-2">
                  <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-5 space-y-3">
                    <div>
                      <div className="text-xs font-mono text-emerald-400 mb-1">Core Answer</div>
                      <p className="text-sm text-slate-100 leading-relaxed">{activeCard.answer}</p>
                    </div>
                    <div className="border-t border-slate-800/80 pt-3">
                      <div className="text-xs font-mono text-sky-400 mb-1">
                        Staff Internals & Context
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {activeCard.explanation}
                      </p>
                    </div>
                  </div>

                  {intervalPreviews && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <button
                        type="button"
                        disabled={grading}
                        onClick={() => handleGrade(1)}
                        className="px-3 py-2.5 rounded-lg bg-red-950/30 border border-red-800/60 hover:bg-red-950/50 text-left transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-red-300">Again</div>
                        <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {intervalPreviews.again}d
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={grading}
                        onClick={() => handleGrade(3)}
                        className="px-3 py-2.5 rounded-lg bg-amber-950/30 border border-amber-800/60 hover:bg-amber-950/50 text-left transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-amber-300">Hard</div>
                        <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {intervalPreviews.hard}d
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={grading}
                        onClick={() => handleGrade(4)}
                        className="px-3 py-2.5 rounded-lg bg-sky-950/30 border border-sky-800/60 hover:bg-sky-950/50 text-left transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-sky-300">Good</div>
                        <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {intervalPreviews.good}d
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={grading}
                        onClick={() => handleGrade(5)}
                        className="px-3 py-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/60 hover:bg-emerald-950/50 text-left transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-emerald-300">Easy</div>
                        <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {intervalPreviews.easy}d
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Full Deck Inspection Table */}
      <section className="bg-[#121824] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Active Recall Deck
          </h3>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {filteredCards.length} cards shown
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-6 font-medium">Prompt</th>
                <th className="py-3 px-4 font-medium">Domain</th>
                <th className="py-3 px-4 font-medium text-right">Interval</th>
                <th className="py-3 px-4 font-medium text-right">Status</th>
                <th className="py-3 px-6 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredCards.map((card) => {
                const isDue = card.nextReviewAt <= nowIso;
                return (
                  <tr key={card.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-6 text-slate-200 max-w-md truncate">{card.prompt}</td>
                    <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {card.domain}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                      {card.intervalDays}d
                    </td>
                    <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                      <span className={isDue ? 'text-amber-400' : 'text-emerald-400'}>
                        {isDue ? 'Due now' : 'Scheduled'}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteCard(card.id)}
                        className="text-slate-500 hover:text-red-400 cursor-pointer"
                        aria-label={`Delete card ${card.skillTitle}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
