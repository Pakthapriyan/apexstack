import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  CheckSquare,
  Compass,
  Copy,
  HelpCircle,
  ListChecks,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Domain, JarvisMessage, ProjectMission } from '../types/learning';
import type { SimplePage } from './QuestsPage';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstanceLike;

interface JarvisConsoleProps {
  open: boolean;
  loading: boolean;
  messages: JarvisMessage[];
  activePage: SimplePage;
  profileDomainFilter: Domain | 'All';
  selectedSkillTitle: string | null;
  activeProject: ProjectMission | null;
  pendingQuestsCount: number;
  onToggleOpen: (open: boolean) => void;
  onSendMessage: (message: string) => void;
  onAnalyzeNow: () => void;
}

export const JarvisConsole: React.FC<JarvisConsoleProps> = ({
  open,
  loading,
  messages,
  activePage,
  profileDomainFilter,
  selectedSkillTitle,
  activeProject,
  pendingQuestsCount,
  onToggleOpen,
  onSendMessage,
  onAnalyzeNow,
}) => {
  const [input, setInput] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const lastSpokenIdRef = useRef<string | null>(null);

  const handleCopySnippet = async (messageId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((prev) => (prev === messageId ? null : prev));
      }, 1800);
    } catch {
      // Ignore clipboard permission errors cleanly
    }
  };

  const supportsTts =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speechCtor = useMemo<SpeechRecognitionCtor | null>(() => {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return win.SpeechRecognition || win.webkitSpeechRecognition || null;
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, loading, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Keyboard shortcut Ctrl+J / Cmd+J to toggle JARVIS
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        onToggleOpen(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onToggleOpen]);

  // Optional TTS readout for newest assistant response when voice mode is toggled on
  useEffect(() => {
    if (!voiceEnabled || !supportsTts || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (latest.role !== 'assistant' || latest.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = latest.id;

    try {
      window.speechSynthesis.cancel();
      const firstSentence = latest.content.split('\n')[0] || latest.headline || '';
      if (firstSentence.trim()) {
        const utterance = new SpeechSynthesisUtterance(firstSentence.slice(0, 320));
        utterance.rate = 1.04;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Ignore TTS failures cleanly
    }
  }, [messages, voiceEnabled, supportsTts]);

  const handleToggleVoiceOutput = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next && supportsTts) {
      window.speechSynthesis.cancel();
    }
  };

  const handleToggleMic = () => {
    if (!speechCtor) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    try {
      const rec = new speechCtor();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput('');
    onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const screenLabel =
    activePage === 'quests'
      ? `Quests (${pendingQuestsCount} pending)`
      : activePage === 'upload'
      ? 'Upload Task'
      : selectedSkillTitle
      ? `Profile · Brief: ${selectedSkillTitle.slice(0, 28)}`
      : `Profile (${profileDomainFilter})`;

  const quickStarters = useMemo(() => {
    if (activeProject) {
      return [
        `Analyze "${activeProject.projectName.slice(0, 34)}" and tell me what to do first`,
        `Open my weakest ${activeProject.primaryDomain} syllabus topic`,
        'Explain key failure modes in my current tasks',
        'Go to Upload Task screen',
      ];
    }
    return [
      'Analyze my daily quests & tell me what to do next',
      'Open my weakest syllabus topic brief',
      'Show my milestones & domain progress',
      'Explain AWS SQS visibility timeout & DLQ',
    ];
  }, [activeProject]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onToggleOpen(true)}
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#121824] hover:bg-slate-800 border border-sky-500/50 text-slate-100 text-xs font-semibold shadow-lg shadow-black/40 transition-colors cursor-pointer"
        aria-label="Open JARVIS Mentor"
      >
        <Bot className="w-4 h-4 text-sky-400 shrink-0" />
        <span>JARVIS Mentor</span>
        <span className="font-mono text-[11px] text-slate-400 border-l border-slate-700 pl-2">
          ⌘J
        </span>
      </button>
    );
  }

  return (
    <aside
      aria-label="JARVIS Interactive Command Mentor"
      className="fixed top-14 right-0 bottom-0 z-50 w-full sm:w-[440px] bg-[#121824] border-l border-slate-800 flex flex-col shadow-2xl shadow-black/60"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-800/90 flex items-center justify-between gap-2 bg-[#0F1520]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="font-display text-sm font-semibold text-slate-50 truncate">
              JARVIS Command Mentor
            </h2>
          </div>
          <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
            Screen: {screenLabel}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onAnalyzeNow}
            disabled={loading}
            title="Analyze current project & quests and switch screen"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-200 text-xs font-medium disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Analyze</span>
          </button>

          {supportsTts && (
            <button
              type="button"
              onClick={handleToggleVoiceOutput}
              title={voiceEnabled ? 'Mute voice readout' : 'Enable voice readout'}
              aria-label={voiceEnabled ? 'Mute voice readout' : 'Enable voice readout'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                voiceEnabled
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleOpen(false)}
            aria-label="Close JARVIS console"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Interactive Command Toolbar */}
      <div className="px-4 py-2 border-b border-slate-800/80 bg-[#0B0F17] flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          disabled={loading}
          onClick={() => onSendMessage('Walk me through quest 1 step by step with code')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#121824] hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-[11px] font-medium text-slate-200 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <ListChecks className="w-3 h-3 text-sky-400" />
          <span>Walkthrough #1</span>
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={() => onSendMessage('Quiz me on my active topic')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#121824] hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-[11px] font-medium text-slate-200 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <HelpCircle className="w-3 h-3 text-amber-400" />
          <span>Quiz Me</span>
        </button>

        {pendingQuestsCount > 0 && (
          <button
            type="button"
            disabled={loading}
            onClick={() => onSendMessage('Complete quest 1 and move to the next quest')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#121824] hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-[11px] font-medium text-emerald-300 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <CheckSquare className="w-3 h-3 text-emerald-400" />
            <span>Complete #1</span>
          </button>
        )}
      </div>

      {/* Messages Viewport */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800/90 space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AUTONOMOUS SCREEN CONTROL &amp; MENTORSHIP</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                I monitor your active project brief, daily quests, and 5-domain syllabus. Ask any
                technical doubt, command me to switch screens or open study briefs, or click{' '}
                <strong className="text-slate-100">Analyze</strong> to get your immediate next step.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                Quick Commands
              </div>
              <div className="grid grid-cols-1 gap-2">
                {quickStarters.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={loading}
                    onClick={() => onSendMessage(prompt)}
                    className="text-left px-3.5 py-2.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800/70 border border-slate-800 hover:border-sky-500/40 text-xs text-slate-200 transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {msg.role === 'user' ? (
                <div className="max-w-[88%] px-3.5 py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/35 text-xs text-slate-100 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full p-4 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-3">
                  {(msg.headline || (msg.interactiveMode && msg.interactiveMode !== 'mentor')) && (
                    <div className="flex items-center justify-between gap-2">
                      {msg.headline && (
                        <div className="text-[11px] font-mono text-sky-400 uppercase tracking-wider truncate">
                          {msg.headline}
                        </div>
                      )}
                      {msg.interactiveMode === 'quiz' && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 shrink-0">
                          QUIZ CHALLENGE
                        </span>
                      )}
                      {msg.interactiveMode === 'walkthrough' && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-sky-300 shrink-0">
                          WALKTHROUGH
                        </span>
                      )}
                    </div>
                  )}

                  {msg.executedActions && msg.executedActions.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-[#121824] border border-emerald-500/30 space-y-1">
                      {msg.executedActions.map((act, idx) => (
                        <div key={idx} className="text-[11px] font-mono text-emerald-300">
                          → {act}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>

                  {msg.codeSnippet && (
                    <div className="rounded-lg bg-[#080C12] border border-slate-800 overflow-hidden">
                      <div className="px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between bg-[#0D131D]">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Production Code Reference
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopySnippet(msg.id, msg.codeSnippet || '')}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-300 hover:text-sky-300 transition-colors cursor-pointer"
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-3 overflow-x-auto text-[11px] font-mono leading-relaxed text-sky-100">
                        <code>{msg.codeSnippet}</code>
                      </pre>
                    </div>
                  )}

                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                      {msg.suggestedFollowUps.map((followUp) => (
                        <button
                          key={followUp}
                          type="button"
                          disabled={loading}
                          onClick={() => onSendMessage(followUp)}
                          className="px-2.5 py-1.5 rounded-md bg-[#121824] hover:bg-slate-800 border border-slate-700/80 hover:border-sky-500/40 text-[11px] text-slate-200 transition-colors cursor-pointer text-left"
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800 flex items-center gap-2.5 text-xs text-slate-300">
            <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
            <span>JARVIS is analyzing your tasks &amp; workspace...</span>
          </div>
        )}
      </div>

      {/* Input Footer */}
      <form
        onSubmit={handleSubmit}
        className="p-3.5 border-t border-slate-800/90 bg-[#0F1520] space-y-2"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a technical doubt, command a screen switch, or ask what to do next..."
            className="flex-1 resize-none px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 focus:border-sky-500 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
          />

          {speechCtor && (
            <button
              type="button"
              onClick={handleToggleMic}
              title={listening ? 'Stop voice input' : 'Speak command or doubt'}
              aria-label={listening ? 'Stop voice input' : 'Speak command or doubt'}
              className={`p-2.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                listening
                  ? 'bg-red-500/20 border-red-500/50 text-red-300'
                  : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send message to JARVIS"
            className="p-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </aside>
  );
};
