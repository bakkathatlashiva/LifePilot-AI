import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import { Outlet, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Menu, Zap, User2, Bell } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { PageLoader } from '../ui/LoadingSpinner';
import { cn } from '../../lib/utils';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class PageErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[PageErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-slate-900 border border-red-500/30 rounded-2xl text-center space-y-4 max-w-xl mx-auto my-12 shadow-2xl">
          <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white">Something went wrong loading this view</h2>
          <p className="text-sm text-slate-400">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition cursor-pointer"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppLayout() {
  const { isAuthenticated, isLoading, loadProfile, user } = useAuthStore();
  const { fetchNotifications, unreadCount } = useNotificationStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileOpen]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      // Poll every 60 seconds
      const interval = setInterval(fetchNotifications, 60_000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchNotifications]);

  if (isLoading) return <PageLoader label="Loading LifePilot AI..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 flex flex-col md:flex-row antialiased selection:bg-purple-600 selection:text-white">
      {/* Mobile Top Header (with notch safe-area) */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-dark-900/95 backdrop-blur-md border-b border-white/10 px-3 sm:px-4 pt-[env(safe-area-inset-top,0px)]">
        <div className="h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2 text-slate-300 hover:text-white active:bg-white/10 rounded-xl transition"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-md shadow-purple-900/30">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-sm tracking-tight text-white">LifePilot AI</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Quick notifications access */}
            <button
              onClick={() => navigate('/notifications')}
              className="relative min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white active:bg-white/10 rounded-xl transition"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Profile Avatar button */}
            <button
              onClick={() => navigate('/settings')}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 rounded-xl active:scale-95 transition"
              aria-label="User Profile & Settings"
            >
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt={user.name} className="w-7 h-7 rounded-full ring-2 ring-purple-500/40 object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
                  <User2 className="w-3.5 h-3.5 text-purple-400" />
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Backdrop overlay for mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Responsive Sidebar */}
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      {/* Main Content Area */}
      <main
        className={cn(
          'flex-1 min-h-screen transition-all duration-300 overflow-x-hidden',
          'pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-0',
          'pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]',
          collapsed ? 'md:ml-16' : 'md:ml-64'
        )}
      >
        <div className="max-w-7xl mx-auto p-3.5 sm:p-5 md:p-6 lg:p-8">
          <PageErrorBoundary>
            <Outlet />
          </PageErrorBoundary>
        </div>
      </main>
    </div>
  );
}
