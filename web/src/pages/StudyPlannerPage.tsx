import React, { useState, useEffect } from 'react';
import { Plus, BookOpen, Check, Clock, Target } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import api from '../lib/api';
import { format, isPast } from 'date-fns';

export function StudyPlannerPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ subjectId: '', examId: '', title: '', scheduledAt: '', durationMin: '60', notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sessRes, subRes, examRes] = await Promise.all([
        api.get('/exams/study-sessions'),
        api.get('/exams/subjects'),
        api.get('/exams?upcoming=true'),
      ]);
      setSessions(sessRes.data.data);
      setSubjects(subRes.data.data);
      setExams(examRes.data.data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.scheduledAt) return;
    setSaving(true);
    try {
      await api.post('/exams/study-sessions', {
        ...form,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMin: parseInt(form.durationMin),
        subjectId: form.subjectId || undefined,
        examId: form.examId || undefined,
      });
      setShowCreate(false);
      fetchAll();
    } catch {}
    finally { setSaving(false); }
  };

  const completeSession = async (id: string) => {
    try {
      await api.put(`/exams/study-sessions/${id}/complete`, {});
      fetchAll();
    } catch {}
  };

  const upcoming = sessions.filter((s) => !s.isCompleted && !isPast(new Date(s.scheduledAt)));
  const completed = sessions.filter((s) => s.isCompleted);
  const totalHoursStudied = completed.reduce((acc, s) => acc + s.durationMin / 60, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Study Planner</h1>
          <p className="text-slate-500 text-sm mt-1">Plan and track your study sessions</p>
        </div>
        <Button onClick={() => setShowCreate(true)} leftIcon={<Plus className="w-4 h-4" />}>
          Schedule Session
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-2xl font-bold text-purple-400">{upcoming.length}</p>
          <p className="text-slate-500 text-xs mt-1">Upcoming sessions</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-emerald-400">{totalHoursStudied.toFixed(1)}h</p>
          <p className="text-slate-500 text-xs mt-1">Hours studied</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-blue-400">{exams.length}</p>
          <p className="text-slate-500 text-xs mt-1">Upcoming exams</p>
        </Card>
      </div>

      {/* Upcoming sessions */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-dark-900 rounded-2xl animate-pulse border border-white/5" />)}
        </div>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8" />}
          title="No study sessions planned"
          description="Schedule a study session to stay on track with your exams."
          action={{ label: 'Schedule Session', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div>
          <h2 className="text-base font-semibold text-slate-300 mb-3">Upcoming Sessions</h2>
          <div className="space-y-3">
            {upcoming.map((s) => (
              <Card key={s.id} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{s.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500">
                      {format(new Date(s.scheduledAt), 'EEE, MMM d · h:mm a')}
                    </span>
                    <span className="text-xs text-slate-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{s.durationMin} min
                    </span>
                    {s.subject && <Badge variant="ghost" size="sm">{s.subject.name}</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => completeSession(s.id)}
                  leftIcon={<Check className="w-3.5 h-3.5" />}>
                  Done
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed sessions */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-400 mb-3">Completed Sessions</h2>
          <div className="space-y-2">
            {completed.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-dark-900 border border-white/5 opacity-60">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-slate-400">{s.title}</span>
                <span className="text-xs text-slate-600 ml-auto">{s.durationMin} min</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Schedule Study Session" size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Schedule</Button>
          </>
        }>
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Session Title *" placeholder="e.g., Revise Data Structures Chapter 3"
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date & Time *" type="datetime-local"
              value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            <Input label="Duration (minutes)" type="number" min="15"
              value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Subject" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              options={[{ value: '', label: 'Select subject' }, ...subjects.map(s => ({ value: s.id, label: s.name }))]} />
            <Select label="Related Exam" value={form.examId} onChange={(e) => setForm({ ...form, examId: e.target.value })}
              options={[{ value: '', label: 'Select exam' }, ...exams.map(e => ({ value: e.id, label: e.title }))]} />
          </div>
          <Textarea label="Notes" placeholder="Topics to cover..."
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
        </form>
      </Modal>
    </div>
  );
}
