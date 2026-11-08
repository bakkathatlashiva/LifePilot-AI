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
        'fixed left-0 top-0 h-screen bg-dark-900/95 backdrop-blur-md',
        'border-r border-white/8 flex flex-col z-50',
        'transition-all duration-300',
        collapsed ? 'md:w-16' : 'md:w-64',
        'w-64 -translate-x-full md:translate-x-0',
        mobileOpen && 'translate-x-0 shadow-2xl'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center justify-between p-4 border-b border-white/8',
        collapsed && 'md:justify-center'
      )}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {(!collapsed || mobileOpen) && (
            <div>
              <p className="text-sm font-bold text-white">LifePilot AI</p>
              <p className="text-xs text-slate-500">Personal Assistant</p>
            </div>
          )}
        </div>
        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          className="md:hidden p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => onCloseMobile?.()}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative group',
                collapsed ? 'md:justify-center' : '',
                isActive
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/8'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
            {(!collapsed || mobileOpen) && <span className="text-sm font-medium">{item.label}</span>}
            {item.to === '/notifications' && unreadCount > 0 && (
              <span className={cn(
                'bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center',
                collapsed ? 'md:absolute md:top-1 md:right-1 md:text-[10px] ml-auto' : 'ml-auto'
              )}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {/* Tooltip when collapsed on desktop */}
            {collapsed && (
              <div className="hidden md:block absolute left-full ml-2 px-2 py-1 bg-dark-800 text-slate-200 text-xs rounded-lg
                             opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-white/10">
                {item.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Collapse */}
      <div className="p-2 border-t border-white/8 space-y-1">
        {/* User profile */}
        <NavLink
          to="/settings/profile"
          onClick={() => onCloseMobile?.()}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 transition-colors',
            collapsed && 'md:justify-center'
          )}
        >
          {user?.profilePicture ? (
            <img
              src={user.profilePicture}
              alt={user.name}
              className="w-8 h-8 rounded-full flex-shrink-0 ring-2 ring-purple-500/30"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center flex-shrink-0">
              <User2 className="w-4 h-4 text-purple-400" />
            </div>
          )}
          {(!collapsed || mobileOpen) && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{user?.name ?? 'User'}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email ?? ''}</p>
            </div>
          )}
        </NavLink>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm',
            collapsed && 'md:justify-center'
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(!collapsed || mobileOpen) && 'Logout'}
        </button>

        {/* Collapse toggle (desktop only) */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              'hidden md:flex w-full items-center gap-3 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors text-sm',
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
