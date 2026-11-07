import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { PageLoader } from '../components/ui/LoadingSpinner';

export function AuthCallbackPage() {
  const { setTokens, loadProfile } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const error = searchParams.get('message') || searchParams.get('error');

    if (error) {
      handledRef.current = true;
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    if (accessToken && refreshToken) {
      handledRef.current = true;
      setTokens(accessToken, refreshToken);
      loadProfile()
        .then(() => navigate('/dashboard', { replace: true }))
        .catch(() => navigate('/login?error=profile_fetch_failed', { replace: true }));
    } else {
      handledRef.current = true;
      navigate('/login', { replace: true });
    }
  }, [searchParams, setTokens, loadProfile, navigate]);

  return <PageLoader label="Completing Google sign-in..." />;
}
