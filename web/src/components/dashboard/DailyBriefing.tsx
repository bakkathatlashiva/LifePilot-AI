import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, Sun, Moon } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import api from '../../lib/api';

export function DailyBriefing() {
  const [briefing, setBriefing] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'morning' | 'evening'>('morning');

  useEffect(() => {
    const hour = new Date().getHours();
    setType(hour >= 17 ? 'evening' : 'morning');
    fetchBriefing(hour >= 17 ? 'evening' : 'morning');
  }, []);

  const fetchBriefing = async (t?: 'morning' | 'evening', force = false) => {
    const briefingType = t ?? type;
    setLoading(true);
    try {
      const { data } = await api.get(`/ai/briefing/${briefingType}${force ? '?refresh=true' : ''}`);
      setBriefing(data.data.briefing);
    } catch {
      setBriefing('Unable to load briefing. Please ensure your AI service is configured.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-purple-500/20 bg-gradient-to-br from-purple-900/20 to-dark-900">
      <CardHeader
        title="AI Daily Briefing"
        subtitle={`${type === 'morning' ? 'Morning' : 'Evening'} summary`}
        icon={<Sparkles className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            <div className="flex bg-dark-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => { setType('morning'); fetchBriefing('morning'); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  type === 'morning' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Sun className="w-3.5 h-3.5" /> Morning
              </button>
              <button
                onClick={() => { setType('evening'); fetchBriefing('evening'); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  type === 'evening' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Moon className="w-3.5 h-3.5" /> Evening
              </button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => fetchBriefing(type, true)} loading={loading} aria-label="Refresh briefing">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />
      <div className="min-h-[80px]">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 bg-white/5 rounded animate-pulse" />
            <div className="h-4 bg-white/5 rounded animate-pulse w-5/6" />
            <div className="h-4 bg-white/5 rounded animate-pulse w-4/6" />
          </div>
        ) : briefing ? (
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{briefing}</p>
        ) : (
          <p className="text-slate-500 text-sm">Click refresh to generate your personalized briefing.</p>
        )}
      </div>
    </Card>
  );
}
