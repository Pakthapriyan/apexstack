import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';

export const AuthGate: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to complete sign-in. Please retry.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#F1F5F9] flex flex-col justify-between px-6 py-8 md:px-12">
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-8 pb-6 border-b border-slate-800/80">
        <span className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          ApexStack
        </span>
        <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
          Angular · FastAPI · DevOps · AWS · GCP
        </span>
      </header>

      <main className="max-w-6xl w-full mx-auto py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-mono tracking-wider text-sky-400">
            Associate Cloud Engineer to Top 1% Mastery
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-slate-50 leading-[1.1]">
            Turn daily project execution into compound mastery across all five stacks.
          </h1>
          <p className="text-base text-slate-300 leading-relaxed max-w-2xl">
            Stop letting sprint pressure pull your growth into a single silo. ApexStack balances
            your weekly rotation across Angular, FastAPI, DevOps, AWS, and GCP—mapping live work
            tickets to Staff-level competencies, auditing blind spots, and drilling real
            production incidents.
          </p>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-sm text-red-200 max-w-xl"
            >
              {error}
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{loading ? 'Connecting workspace...' : 'Sign in with Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="inline-flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Private cloud sync per verified account</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#121824] border border-slate-800/80 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h2 className="font-display text-sm font-semibold text-slate-200">
              Balanced Weekly Architecture
            </h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">5 Stacks</span>
          </div>

          <div className="divide-y divide-slate-800/60 text-sm">
            {[
              { day: 'Mon', domain: 'Angular', focus: 'Signals, Zone-less CD & SSR Hydration' },
              { day: 'Tue', domain: 'FastAPI', focus: 'Asyncio Loops, Pydantic v2 & OTel' },
              { day: 'Wed', domain: 'DevOps', focus: 'K8s QoS, Terraform & Supply Chain' },
              { day: 'Thu', domain: 'AWS', focus: 'IAM Boundaries, PrivateLink & EKS' },
              { day: 'Fri', domain: 'GCP', focus: 'VPC-SC, Workload Identity & GKE' },
              { day: 'Sat', domain: 'Multi-Cloud', focus: 'Cross-Cloud Incident & Design Drills' },
              { day: 'Sun', domain: 'Review', focus: 'SM-2 Active Recall & Gap Rebalancing' },
            ].map((row) => (
              <div key={row.day} className="py-2.5 flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="font-mono text-xs text-slate-500 w-8 shrink-0">{row.day}</span>
                  <span className="font-medium text-slate-100 shrink-0">{row.domain}</span>
                </div>
                <span className="text-xs text-slate-400 truncate text-right">{row.focus}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto pt-6 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
        <span>ApexStack Engineering Console</span>
        <span>Cloud Firestore Sync Enabled</span>
      </footer>
    </div>
  );
};
