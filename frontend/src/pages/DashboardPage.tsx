import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Sparkles,
  Users,
  FileText,
  SpellCheck,
  TrendingUp,
  CreditCard,
  PieChart,
  Search,
  SlidersHorizontal,
  Star,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ChevronDown,
  Bell,
  Cpu,
  Flame,
  Zap,
  BarChart3,
  Layers,
  GraduationCap,
  Bookmark,
  Award,
} from 'lucide-react';
import { EnergyDashboard } from '../components/Dashboard/EnergyDashboard';
import { CostComparison } from '../components/Dashboard/CostComparison';
import { TraceDebugger } from '../components/Dashboard/TraceDebugger';
import { ApprovalBell } from '../components/ApprovalBell';
import { useAppStore } from '../lib/store';

type Category =
  | 'All Writer'
  | 'Favorites'
  | 'Writing & Content'
  | 'IELTS'
  | 'Academic & Education'
  | 'Research & PHD';

type FilterTab = 'Trending' | 'Popular' | 'New';

interface ToolItem {
  id: string;
  title: string;
  rating: number;
  description: string;
  category: Category[];
  color: string;
  iconBg: string;
  iconColor: string;
  icon: typeof Sparkles;
  prompt: string;
}

const TOOLS: ToolItem[] = [
  {
    id: 'mock-interview',
    title: 'Mock Interview',
    rating: 4.8,
    description:
      'Practice real interview questions with AI. Build confidence and improve your answers with instant feedback.',
    category: ['All Writer', 'Favorites', 'Academic & Education'],
    color: '#EC4899',
    iconBg: 'rgba(236, 72, 153, 0.12)',
    iconColor: '#DB2777',
    icon: Users,
    prompt:
      'I want to practice a realistic mock interview. Please act as a professional interviewer. First, ask me what role I am interviewing for, then ask questions one by one and give me constructive feedback on each answer.',
  },
  {
    id: 'ai-content',
    title: 'AI-Generated Content',
    rating: 4.9,
    description:
      'Generate full-length articles in seconds using AI. Great for blogs, assignments, and content creation.',
    category: ['All Writer', 'Writing & Content', 'Favorites'],
    color: '#3B82F6',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    iconColor: '#2563EB',
    icon: FileText,
    prompt:
      'Help me write high-quality, engaging, and structured content. What topic, audience, and format should we focus on?',
  },
  {
    id: 'grammar-checker',
    title: 'Grammar Checker',
    rating: 4.7,
    description:
      'Instantly correct grammar, punctuation, and sentence structure. Get clear suggestions to improve your writing.',
    category: ['All Writer', 'Writing & Content', 'IELTS'],
    color: '#10B981',
    iconBg: 'rgba(16, 185, 129, 0.12)',
    iconColor: '#059669',
    icon: SpellCheck,
    prompt:
      'Please act as my personal grammar, punctuation, and tone editor. I will share text with you, and you will correct errors and provide enhanced phrasing.',
  },
  {
    id: 'ielts-coach',
    title: 'IELTS Speaking & Essay Coach',
    rating: 4.9,
    description:
      'Boost your IELTS band score with targeted essay evaluations, vocabulary upgrades, and Speaking test mockups.',
    category: ['All Writer', 'IELTS', 'Academic & Education'],
    color: '#8B5CF6',
    iconBg: 'rgba(139, 92, 246, 0.12)',
    iconColor: '#7C3AED',
    icon: GraduationCap,
    prompt:
      'Please act as an official IELTS examiner and tutor. Evaluate my writing or speaking responses according to the official IELTS Band Descriptors (Task Achievement, Coherence, Lexical Resource, Grammatical Accuracy).',
  },
  {
    id: 'research-synth',
    title: 'Research & Literature Synthesizer',
    rating: 4.8,
    description:
      'Extract critical insights, synthesize academic literature, and formulate bibliographies for thesis and PhD research.',
    category: ['All Writer', 'Research & PHD', 'Academic & Education'],
    color: '#F59E0B',
    iconBg: 'rgba(245, 158, 11, 0.12)',
    iconColor: '#D97706',
    icon: Award,
    prompt:
      'Act as my PhD research advisor. Help me outline my literature review, critique research methodology, and synthesize scholarly sources.',
  },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<Category>('All Writer');
  const [filterTab, setFilterTab] = useState<FilterTab>('Trending');
  const [viewMode, setViewMode] = useState<'assistant' | 'telemetry'>('assistant');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);

  const selectedModel = useAppStore((s) => s.selectedModel);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setVoiceModalOpen = useAppStore((s) => s.setVoiceModalOpen);
  const addMessage = useAppStore((s) => s.addMessage);
  const userName = useAppStore((s) => s.settings.userName) || 'Sahil Yadav';
  const firstName = userName.split(' ')[0] || 'Sahil';
  const userInitials =
    userName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'SY';

  // Filter tools
  const filteredTools = TOOLS.filter((tool) => {
    const matchesCategory =
      activeCategory === 'All Writer' || tool.category.includes(activeCategory);
    const matchesSearch =
      !searchQuery ||
      tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleLaunchTool = (tool: ToolItem) => {
    navigate('/');
    setTimeout(() => {
      // Prefill or set up input if needed
    }, 100);
  };

  // Get current time greeting
  const hour = new Date().getHours();
  const greetingTime =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const categories: Category[] = [
    'All Writer',
    'Favorites',
    'Writing & Content',
    'IELTS',
    'Academic & Education',
    'Research & PHD',
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 w-full" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-6xl mx-auto flex flex-col gap-6">

        {/* Top bar: Greeting & Profile */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold tracking-tight"
              style={{ color: 'var(--color-text)' }}
            >
              {greetingTime}, {firstName}!
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              How can F.R.I.D.A.Y. assist you today?
            </p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {/* View Switcher: Assistant Tools vs Hardware Telemetry */}
            <div
              className="p-1 rounded-xl flex items-center gap-1"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <button
                onClick={() => setViewMode('assistant')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
                style={{
                  background: viewMode === 'assistant' ? 'var(--color-surface)' : 'transparent',
                  color: viewMode === 'assistant' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                  boxShadow: viewMode === 'assistant' ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <Sparkles size={13} style={{ color: viewMode === 'assistant' ? 'var(--color-accent)' : 'currentColor' }} />
                AI Tools
              </button>
              <button
                onClick={() => setViewMode('telemetry')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
                style={{
                  background: viewMode === 'telemetry' ? 'var(--color-surface)' : 'transparent',
                  color: viewMode === 'telemetry' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                  boxShadow: viewMode === 'telemetry' ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <BarChart3 size={13} style={{ color: viewMode === 'telemetry' ? 'var(--color-accent)' : 'currentColor' }} />
                Telemetry
              </button>
            </div>

            {/* Notification Bell */}
            <div
              className="p-1 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <ApprovalBell embedded />
            </div>

            {/* Profile Avatar Capsule */}
            <div
              className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full cursor-pointer transition-all hover:shadow-sm"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
              onClick={() => navigate('/settings')}
              title={`${userName} (Settings)`}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-indigo-500 flex items-center justify-center text-white text-xs font-semibold overflow-hidden shadow-inner">
                <span>{userInitials}</span>
              </div>
              <span className="text-xs font-medium truncate max-w-[120px]" style={{ color: 'var(--color-text)' }}>
                {userName}
              </span>
              <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
          </div>
        </div>

        {/* View Mode: Telemetry view */}
        {viewMode === 'telemetry' ? (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <EnergyDashboard />
              <CostComparison />
            </div>
            <TraceDebugger />
          </div>
        ) : (
          /* View Mode: AI Assistant Tools (Exact Match to Reference Screenshot) */
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">

            {/* Hero Banner Section */}
            <div className="flex flex-col items-center text-center py-4 px-2">
              {/* Glowing F.R.I.D.A.Y. Arc Reactor Core */}
              <div
                className="relative mb-3 flex items-center justify-center group cursor-pointer"
                onClick={() => setVoiceModalOpen(true)}
                title="Launch F.R.I.D.A.Y. Voice Assistant (Talk with Friday)"
              >
                <div className="absolute -inset-3 rounded-full bg-gradient-to-tr from-orange-500/25 via-amber-500/35 to-cyan-500/25 blur-lg group-hover:blur-xl transition-all animate-pulse" />
                <img
                  src="/friday-core.jpg"
                  alt="F.R.I.D.A.Y. HUD Core"
                  className="relative w-20 h-20 md:w-24 md:h-24 rounded-full object-cover shadow-2xl ring-2 ring-orange-500/70 shadow-orange-500/30 transition-transform duration-500 group-hover:scale-110"
                />
                <span className="absolute -bottom-2 px-2.5 py-0.5 rounded-full text-[9px] font-mono tracking-widest bg-black/85 text-orange-400 border border-orange-500/50 backdrop-blur-md uppercase shadow-md opacity-90 group-hover:opacity-100 group-hover:bg-orange-500 group-hover:text-black transition-all">
                  Voice Core • Talk
                </span>
              </div>

              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3 shadow-xs"
                style={{
                  background: '#FEF9C3',
                  color: '#854D0E',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                }}
              >
                <span>Get Early Access • F.R.I.D.A.Y. OS</span>
              </div>

              <h2
                className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2.5"
                style={{ color: 'var(--color-text)' }}
              >
                AI Personal Assistant Tools
              </h2>

              <p
                className="text-xs md:text-sm max-w-xl leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Smart, task focused AI tools designed to boost productivity, streamline writing and support your academic and professional goals.
              </p>

              {/* Category Pills Bar */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-6 max-w-4xl">
                {categories.map((cat) => {
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className="px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap"
                      style={{
                        background: isActive ? '#2563EB' : 'var(--color-surface)',
                        color: isActive ? '#ffffff' : 'var(--color-text-secondary)',
                        border: isActive ? '1px solid #2563EB' : '1px solid var(--color-border)',
                        boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sub-filter tabs & Search/Filter buttons row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div
                className="inline-flex p-1 rounded-xl"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
              >
                {(['Trending', 'Popular', 'New'] as FilterTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterTab(t)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
                    style={{
                      background: filterTab === t ? 'var(--color-surface)' : 'transparent',
                      color: filterTab === t ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                      boxShadow: filterTab === t ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {showSearchInput ? (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search tools..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onBlur={() => !searchQuery && setShowSearchInput(false)}
                      className="bg-transparent outline-none text-xs w-32 md:w-44"
                      style={{ color: 'var(--color-text)' }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSearchInput(true)}
                    className="p-2.5 rounded-xl transition-colors cursor-pointer"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                    title="Search tools"
                  >
                    <Search size={15} />
                  </button>
                )}

                <button
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <SlidersHorizontal size={14} />
                  <span>Filter</span>
                </button>
              </div>
            </div>

            {/* 3 AI Tool Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTools.slice(0, 3).map((tool) => {
                const IconComponent = tool.icon;
                return (
                  <div
                    key={tool.id}
                    onClick={() => handleLaunchTool(tool)}
                    className="group relative p-6 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 12px 24px -4px rgba(0, 0, 0, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 20px -2px rgba(0, 0, 0, 0.04)';
                    }}
                  >
                    <div>
                      {/* Top icon and rating */}
                      <div className="flex items-center justify-between mb-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
                          style={{ background: tool.iconBg, color: tool.iconColor }}
                        >
                          <IconComponent size={20} />
                        </div>
                        <div className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                          <Star size={13} className="fill-amber-400 text-amber-400" />
                          <span>{tool.rating.toFixed(1)}</span>
                        </div>
                      </div>

                      {/* Tool Title */}
                      <h3
                        className="text-base font-bold mb-2 group-hover:text-blue-600 transition-colors"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {tool.title}
                      </h3>

                      {/* Tool Description */}
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {tool.description}
                      </p>
                    </div>

                    <div className="mt-5 pt-4 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 opacity-90 group-hover:opacity-100">
                      <span>Launch with Friday AI</span>
                      <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Section: Performance & Total Activity Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">

              {/* Performance Widget (Col span 2) */}
              <div
                className="lg:col-span-2 p-6 rounded-2xl flex flex-col justify-between"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                      <PieChart size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                        Performance
                      </h4>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        Total performance progress status
                      </p>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">
                    <TrendingUp size={12} />
                    <span>+235,21%</span>
                  </div>
                </div>

                {/* Stat boxes + Bar Chart */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  {/* Credit score */}
                  <div
                    className="p-4 rounded-xl flex flex-col justify-between h-28"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                      <CreditCard size={15} />
                    </div>
                    <div>
                      <span className="text-[11px] block" style={{ color: 'var(--color-text-secondary)' }}>
                        Credit Score
                      </span>
                      <span className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>
                        2,442
                      </span>
                    </div>
                  </div>

                  {/* Loss Credit score */}
                  <div
                    className="p-4 rounded-xl flex flex-col justify-between h-28"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                      <CreditCard size={15} />
                    </div>
                    <div>
                      <span className="text-[11px] block" style={{ color: 'var(--color-text-secondary)' }}>
                        Loss Credit Score
                      </span>
                      <span className="text-xl font-extrabold tracking-tight text-rose-500">
                        -1,205
                      </span>
                    </div>
                  </div>

                  {/* Weekly Bar Chart */}
                  <div className="flex items-end justify-between gap-1.5 h-28 pt-2 px-2">
                    {[
                      { day: 'SUN', val: 55 },
                      { day: 'TUE', val: 78 },
                      { day: 'WED', val: 42 },
                      { day: 'THU', val: 68 },
                      { day: 'FRI', val: 88 },
                      { day: 'SAT', val: 62 },
                      { day: 'SUN', val: 94 },
                    ].map((item, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                        <div
                          className="w-full max-w-[14px] rounded-full transition-all duration-300 group-hover:opacity-80"
                          style={{
                            height: `${item.val}%`,
                            background:
                              idx === 6
                                ? 'linear-gradient(180deg, #3B82F6 0%, #60A5FA 100%)'
                                : 'linear-gradient(180deg, rgba(99, 102, 241, 0.45) 0%, rgba(147, 197, 253, 0.25) 100%)',
                          }}
                          title={`${item.day}: ${item.val}%`}
                        />
                        <span className="text-[9px] font-semibold text-zinc-400 group-hover:text-blue-500">
                          {item.day}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Total Activity Widget (Col span 1) */}
              <div
                className="p-6 rounded-2xl flex flex-col justify-between"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div>
                  <h4 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
                    64% <span className="text-sm font-medium text-zinc-400 ml-1">Total Activity</span>
                  </h4>

                  {/* Segmented Progress Bar */}
                  <div className="w-full h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex overflow-hidden my-6 gap-1 p-0.5">
                    <div className="h-full rounded-full bg-purple-500" style={{ width: '20%' }} title="In Progress: 20%" />
                    <div className="h-full rounded-full bg-blue-500" style={{ width: '35%' }} title="Completed: 35%" />
                    <div className="h-full rounded-full bg-orange-500" style={{ width: '45%' }} title="Up Coming: 41%" />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 px-0.5 mb-6">
                    <span>20%</span>
                    <span>35%</span>
                    <span>41%</span>
                  </div>
                </div>

                {/* 3 Metric Pills */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex flex-col items-center text-center">
                    <span className="w-2 h-2 rounded-full bg-purple-500 mb-1.5" />
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>8</span>
                    <span className="text-[10px] text-zinc-400">In Progress</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mb-1.5" />
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>12</span>
                    <span className="text-[10px] text-zinc-400">Completed</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <span className="w-2 h-2 rounded-full bg-orange-500 mb-1.5" />
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>14</span>
                    <span className="text-[10px] text-zinc-400">Up Coming</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
