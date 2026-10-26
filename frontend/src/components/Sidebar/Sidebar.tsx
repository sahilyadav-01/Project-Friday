import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Home,
  BarChart3,
  MessageSquare,
  FileText,
  Users,
  Zap,
  Settings,
  Plus,
  Search,
  PanelLeftClose,
  PanelLeft,
  Cpu,
  Rocket,
  Sun,
  Moon,
  Loader2,
} from 'lucide-react';
import { ConversationList } from './ConversationList';
import { useAppStore } from '../../lib/store';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const deepResearch = useAppStore((s) => s.deepResearch);

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const isDark = settings.theme === 'dark';

  const messages = useAppStore((s) => s.messages);
  const handleNewChat = () => {
    if (messages.length === 0) {
      navigate('/');
      return;
    }
    createConversation(selectedModel);
    navigate('/');
  };

  const dockNavItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    { path: '/chat', icon: MessageSquare, label: 'Chat', onClick: handleNewChat },
    { path: '/data-sources', icon: FileText, label: 'Data Sources' },
    { path: '/agents', icon: Users, label: 'Agents' },
    { path: '/logs', icon: Zap, label: 'Logs' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="flex h-full shrink-0 z-30 select-none">
      {/* ── Mini Icon Dock (Matching Reference Screenshot) ── */}
      <aside
        className="w-16 md:w-[70px] h-full flex flex-col items-center justify-between py-4 shrink-0 transition-colors"
        style={{
          background: '#0D0E12',
          borderRight: '1px solid rgba(255, 255, 255, 0.07)',
        }}
      >
        {/* Top: Mac Window Control Dots & F.R.I.D.A.Y. Core */}
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex items-center gap-1.5 pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] shadow-xs cursor-pointer hover:opacity-80 transition-opacity" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] shadow-xs cursor-pointer hover:opacity-80 transition-opacity" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] shadow-xs cursor-pointer hover:opacity-80 transition-opacity" />
          </div>

          {/* F.R.I.D.A.Y. Holographic Arc Reactor Core */}
          <button
            onClick={() => navigate('/')}
            className="relative w-10 h-10 rounded-full cursor-pointer transition-transform duration-300 hover:scale-110 group focus:outline-none"
            title="F.R.I.D.A.Y. AI Assistant Core"
          >
            <div className="absolute -inset-1 rounded-full bg-orange-500/30 blur-sm group-hover:bg-orange-500/50 transition-all animate-pulse" />
            <img
              src="/friday-core.jpg"
              alt="F.R.I.D.A.Y. Core"
              className="relative w-full h-full rounded-full object-cover ring-2 ring-orange-500/70 shadow-md shadow-orange-500/30"
            />
          </button>

          {/* Navigation Icon Stack */}
          <nav className="flex flex-col items-center gap-2.5 w-full px-2">
            {dockNavItems.map((item) => {
              const isActive =
                item.path === '/'
                  ? location.pathname === '/' && !sidebarOpen
                  : location.pathname === item.path;

              return (
                <button
                  key={item.label}
                  onClick={() => {
                    if (item.onClick) {
                      item.onClick();
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className={`
                    w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group
                    ${isActive ? 'bg-[#2563EB] text-white shadow-lg shadow-blue-500/30' : 'text-zinc-400 hover:text-white hover:bg-white/10'}
                  `}
                  title={item.label}
                >
                  <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />

                  {/* Tooltip */}
                  <span className="absolute left-full ml-3 px-2 py-1 rounded-md bg-zinc-900 text-white text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md z-50">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Sun/Moon Pill Switch & Profile Avatar */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* History drawer toggle button */}
          <button
            onClick={toggleSidebar}
            className={`
              w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer text-zinc-400 hover:text-white hover:bg-white/10
              ${sidebarOpen ? 'bg-white/15 text-white' : ''}
            `}
            title={sidebarOpen ? 'Collapse chat history' : 'Open chat history'}
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeft size={17} />}
          </button>

          {/* Vertical Theme Capsule Switch */}
          <div
            className="flex flex-col items-center p-1 rounded-full bg-zinc-900 border border-white/10 gap-1"
          >
            <button
              onClick={() => updateSettings({ theme: 'light' })}
              className={`p-1.5 rounded-full transition-all cursor-pointer ${
                !isDark ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Light theme"
            >
              <Sun size={13} />
            </button>
            <button
              onClick={() => updateSettings({ theme: 'dark' })}
              className={`p-1.5 rounded-full transition-all cursor-pointer ${
                isDark ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Dark theme"
            >
              <Moon size={13} />
            </button>
          </div>

          {/* User Profile Avatar with ring */}
          <button
            onClick={() => navigate('/settings')}
            className="w-9 h-9 rounded-full ring-2 ring-white/20 p-0.5 overflow-hidden transition-transform hover:scale-105 cursor-pointer bg-gradient-to-tr from-amber-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow-md"
            title={`${settings.userName || 'Sahil Yadav'} (Settings)`}
          >
            <span>
              {(settings.userName || 'Sahil Yadav')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() || 'SY'}
            </span>
          </button>
        </div>
      </aside>

      {/* ── Collapsible Conversation History Drawer ── */}
      {sidebarOpen && (
        <aside
          className="w-[240px] h-full flex flex-col shrink-0 overflow-hidden transition-all duration-200 border-r"
          style={{
            background: 'var(--color-sidebar)',
            borderColor: 'var(--color-border)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3.5 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Chats
            </span>
            <button
              onClick={handleNewChat}
              className="p-1.5 rounded-lg transition-colors cursor-pointer text-zinc-400 hover:text-zinc-100 hover:bg-white/10"
              title="New chat"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Model badge */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="mx-2.5 mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
            style={{
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            {modelLoading ? (
              <Loader2 size={13} className="animate-spin text-blue-500" />
            ) : (
              <Cpu size={13} />
            )}
            <span className="truncate flex-1 text-left text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>
              {deepResearch ? 'Deep Research' : selectedModel || serverInfo?.model || 'Select model'}
            </span>
            <kbd className="text-[9px] px-1 py-0.5 rounded font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-500">
              ⌘K
            </kbd>
          </button>

          {/* Search chats */}
          <div className="px-2.5 mb-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <Search size={13} className="text-zinc-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-xs"
                style={{ color: 'var(--color-text)' }}
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto px-2">
            <ConversationList searchQuery={searchQuery} />
          </div>
        </aside>
      )}
    </div>
  );
}
