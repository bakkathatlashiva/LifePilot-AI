import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Shield, Bell, BookOpen, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api, { API_BASE_URL } from '../lib/api';

export function LoginPage() {
  const { setTokens, loadProfile, isAuthenticated } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const errorParam = searchParams.get('error') || searchParams.get('message');

  useEffect(() => {
    // Handle OAuth callback tokens if redirected to login page directly
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken);
      loadProfile().then(() => navigate('/dashboard'));
    }
  }, [searchParams, setTokens, loadProfile, navigate]);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = () => {
    const returnTo = encodeURIComponent(window.location.origin);
    window.location.href = `${API_BASE_URL}/auth/google?returnTo=${returnTo}`;
  };

  const features = [
    { icon: <Bell className="w-5 h-5" />, text: 'Auto-detect ERP assignments & notify you instantly' },
    { icon: <Zap className="w-5 h-5" />, text: 'AI analysis of your academic emails for important notices' },
    { icon: <BookOpen className="w-5 h-5" />, text: 'Smart study planner with exam countdown' },
    { icon: <Shield className="w-5 h-5" />, text: 'Secure Google OAuth — we never store your Google password' },
  ];

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Left: branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-dark-900 via-purple-950/30 to-dark-950 p-12 border-r border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-white">LifePilot AI</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Never miss a deadline
            <span className="block gradient-text">again.</span>
          </h1>
          <p className="text-slate-400 text-lg mb-8">
            Your intelligent assistant that monitors ERP assignments, analyzes emails,
            and keeps you on top of every academic responsibility.
          </p>
          <div className="space-y-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-slate-300">
                <div className="w-9 h-9 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400 flex-shrink-0">
                  {f.icon}
                </div>
                <span className="text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-sm">
          Designed for Aurora University students · Built with care
        </p>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-6 sm:mb-10">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-900/40">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">LifePilot AI</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Welcome to LifePilot AI</h2>
          <p className="text-slate-400 text-sm mb-6 sm:mb-8">Sign in with your Google account to access your dashboard, ERP assignments, and academic tools.</p>

          {errorParam && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/25 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 text-sm font-medium">Authentication Error</p>
                <p className="text-red-300/80 text-xs mt-0.5">
                  {errorParam === 'access_denied'
                    ? 'Google sign-in was cancelled or access was denied.'
                    : errorParam === 'auth_failed'
                    ? 'Failed to verify Google account. Please try signing in again.'
                    : errorParam}
                </p>
              </div>
            </div>
          )}

          {/* Primary Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3.5 bg-white hover:bg-slate-100 text-slate-900
                       font-semibold px-6 py-4 rounded-2xl transition-all duration-200 active:scale-[0.98]
                       shadow-xl shadow-purple-950/40 hover:shadow-purple-900/40 group cursor-pointer"
          >
            <svg className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-[15px]">Continue with Google</span>
          </button>

          <p className="text-center text-xs text-slate-500 mt-3">
            Fast, secure single sign-on using Google OAuth 2.0
          </p>

          <div className="mt-8 p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
            <p className="text-purple-300 text-xs font-semibold mb-1">🎓 Aurora University ERP Live Sync:</p>
            <p className="text-purple-200/70 text-xs leading-relaxed">
              Once signed in, connect your Student Portal to automatically track assignments, deadlines, and evaluations across all enrolled subjects.
            </p>
          </div>

          <p className="text-slate-600 text-xs text-center mt-6">
            By signing in, you agree to our Terms of Service & Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
