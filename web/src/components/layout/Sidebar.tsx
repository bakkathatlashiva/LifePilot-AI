import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, BookOpen, Mail, GraduationCap,
  Calendar, Bell, MessageSquare, Settings, LogOut, ChevronLeft,
  ChevronRight, Zap, Trophy, ClipboardList, User2, Smartphone, X
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: CheckSquare, label: 'My Tasks' },
  { to: '/erp', icon: ClipboardList, label: 'ERP Assignments' },
  { to: '/gmail', icon: Mail, label: 'Gmail Intel' },
  { to: '/sms-gateway', icon: Smartphone, label: 'SIM Gateway' },
  { to: '/study', icon: BookOpen, label: 'Study Planner' },
  { to: '/exams', icon: GraduationCap, label: 'Exams' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/events', icon: Trophy, label: 'Events' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/ai', icon: MessageSquare, label: 'AI Assistant' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { user, logout } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-dark-900/98 backdrop-blur-xl',
        'border-r border-white/8 flex flex-col z-50',
        'transition-transform duration-300 ease-in-out',
        collapsed ? 'md:w-16' : 'md:w-64',
        'w-72 max-w-[85vw] -translate-x-full md:translate-x-0',
        mobileOpen && 'translate-x-0 shadow-2xl shadow-black/80'
      )}
    >
      {/* Logo & Header */}
      <div className={cn(
        'flex items-center justify-between p-4 border-b border-white/8',
        'pt-[max(1rem,env(safe-area-inset-top,0px))]',
        collapsed && 'md:justify-center'
      )}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-900/40">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {(!collapsed || mobileOpen) && (
            <div>
              <p className="text-sm font-bold text-white tracking-tight">LifePilot AI</p>
              <p className="text-[11px] text-slate-400">Personal Assistant</p>
            </div>
          )}
        </div>
        {/* Mobile close button (44px target) */}
        <button
          onClick={onCloseMobile}
          className="md:hidden min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-slate-400 hover:text-white rounded-xl active:bg-white/10 transition"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav list */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1 overscroll-contain">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => onCloseMobile?.()}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative group min-h-[44px] active:scale-[0.98]',
                collapsed ? 'md:justify-center' : '',
                isActive
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 font-medium'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/8'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" size={19} />
            {(!collapsed || mobileOpen) && <span className="text-sm font-medium">{item.label}</span>}
            {(item.to === '/erp' || item.to === '/gmail') && (
              <span className={cn(
                'flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full ml-auto',
                collapsed && 'md:absolute md:top-1.5 md:right-1.5 md:w-2 md:h-2 md:p-0 md:rounded-full md:bg-emerald-400 md:border-0'
              )}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {(!collapsed || mobileOpen) && '24/7'}
              </span>
            )}
            {item.to === '/notifications' && unreadCount > 0 && (
              <span className={cn(
                'bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none',
                collapsed ? 'md:absolute md:top-1 md:right-1 md:text-[10px] ml-auto' : 'ml-auto'
              )}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {/* Tooltip when collapsed on desktop */}
            {collapsed && (
              <div className="hidden md:block absolute left-full ml-2 px-2 py-1 bg-dark-800 text-slate-200 text-xs rounded-lg
                             opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-white/10 shadow-xl">
                {item.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Collapse Footer (safe area) */}
      <div className="p-2 border-t border-white/8 space-y-1 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        {/* User profile */}
        <NavLink
          to="/settings"
          onClick={() => onCloseMobile?.()}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 active:bg-white/12 transition-colors min-h-[44px]',
            collapsed && 'md:justify-center'
          )}
        >
          {user?.profilePicture ? (
            <img
              src={user.profilePicture}
              alt={user.name}
              className="w-8 h-8 rounded-full flex-shrink-0 ring-2 ring-purple-500/40 object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
              <User2 className="w-4 h-4 text-purple-400" />
            </div>
          )}
          {(!collapsed || mobileOpen) && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name ?? 'User'}</p>
              <p className="text-[11px] text-slate-500 truncate">{user?.email ?? ''}</p>
            </div>
          )}
        </NavLink>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-colors text-sm min-h-[44px]',
            collapsed && 'md:justify-center'
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(!collapsed || mobileOpen) && <span>Logout</span>}
        </button>

        {/* Collapse toggle (desktop only) */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              'hidden md:flex w-full items-center gap-3 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors text-sm min-h-[40px]',
              collapsed && 'justify-center'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
          </button>
        )}
      </div>
    </aside>
  );
}
