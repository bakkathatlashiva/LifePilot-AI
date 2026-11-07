import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { PageLoader } from '../components/ui/LoadingSpinner';
import api from '../lib/api';

export function AuthCallbackPage() {
  const { setTokens, loadProfile } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    const code = searchParams.get('code');
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
    } else if (code) {
      handledRef.current = true;
      api.post('/auth/exchange-code', { code })
        .then(({ data }) => {
          const { accessToken: at, refreshToken: rt } = data.data;
          setTokens(at, rt);
          return loadProfile();
        })
        .then(() => navigate('/dashboard', { replace: true }))
        .catch(() => navigate('/login?error=auth_failed', { replace: true }));
    } else {
      handledRef.current = true;
      navigate('/login', { replace: true });
    }
  }, [searchParams, setTokens, loadProfile, navigate]);

  return <PageLoader label="Completing Google sign-in..." />;
}
