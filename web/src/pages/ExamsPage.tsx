import React, { useState, useEffect } from 'react';
import { Plus, GraduationCap, Calendar, Clock, BookOpen, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Select, Textarea } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Exam } from '../types';
import api from '../lib/api';
import { differenceInDays, format, isPast } from 'date-fns';

export function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ subjectId: '', title: '', examDate: '', duration: '', venue: '', notes: '', totalMarks: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [examRes, subRes] = await Promise.all([
        api.get('/exams?upcoming=false'),
        api.get('/exams/subjects'),
      ]);
      setExams(examRes.data.data);
      setSubjects(subRes.data.data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.examDate) { setError('Title and exam date are required'); return; }
    setSaving(true);
    try {
      await api.post('/exams', {
        ...form,
        examDate: new Date(form.examDate).toISOString(),
        duration: form.duration ? parseInt(form.duration) : undefined,
        totalMarks: form.totalMarks ? parseFloat(form.totalMarks) : undefined,
        subjectId: form.subjectId || undefined,
      });
      setShowCreate(false);
      setForm({ subjectId: '', title: '', examDate: '', duration: '', venue: '', notes: '', totalMarks: '' });
      fetchAll();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to create exam');
    } finally { setSaving(false); }
  };

  const upcoming = exams.filter((e) => !e.isCompleted && !isPast(new Date(e.examDate)));
  const past = exams.filter((e) => e.isCompleted || isPast(new Date(e.examDate)));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Exams & Study Planner</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">{upcoming.length} upcoming exams</p>
        </div>
        <Button onClick={() => setShowCreate(true)} leftIcon={<Plus className="w-4 h-4" />}>
          Add Exam
        </Button>
      </div>

      {/* Upcoming exams */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-dark-900 rounded-2xl animate-pulse border border-white/5" />)}
        </div>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="w-8 h-8" />}
          title="No upcoming exams"
          description="Add your exam schedule to get study reminders and deadline notifications."
          action={{ label: '+ Add Exam', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <>
          <h2 className="text-lg font-semibold text-slate-200">Upcoming</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {upcoming.map((exam) => <ExamCard key={exam.id} exam={exam} onRefresh={fetchAll} />)}
          </div>
        </>
      )}

      {/* Past exams */}
      {past.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-slate-400">Past Exams</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {past.map((exam) => <ExamCard key={exam.id} exam={exam} onRefresh={fetchAll} />)}
          </div>
        </>
      )}

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Exam" size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Add Exam</Button>
          </>
        }>
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Exam Title *" placeholder="e.g., Discrete Mathematics Mid-term"
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Input label="Exam Date & Time *" type="datetime-local"
              value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
            <Input label="Duration (minutes)" type="number" placeholder="180"
              value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Input label="Venue" placeholder="Hall A, Room 201"
              value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            <Input label="Total Marks" type="number" placeholder="100"
              value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: e.target.value })} />
          </div>
          <Select
            label="Subject"
            options={[{ value: '', label: 'Select subject (optional)' }, ...subjects.map(s => ({ value: s.id, label: s.name }))]}
            value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} />
          <Textarea label="Notes" placeholder="Topics, instructions..."
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </form>
      </Modal>
    </div>
  );
}

function ExamCard({ exam, onRefresh }: { exam: Exam; onRefresh: () => void }) {
  const examDate = new Date(exam.examDate);
  const daysLeft = differenceInDays(examDate, new Date());
  const isOver = isPast(examDate);

  const urgency =
    isOver ? 'ghost' :
    daysLeft <= 1 ? 'danger' :
    daysLeft <= 3 ? 'warning' :
    daysLeft <= 7 ? 'info' : 'default';

  const completedTopics = exam.syllabus?.filter((c) => c.completed).length ?? 0;
  const totalTopics = exam.syllabus?.length ?? 0;
  const progress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  return (
    <Card className={`border ${isOver ? 'border-white/5 opacity-60' : 'border-white/8'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/30 to-blue-600/30 flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-purple-400" />
        </div>
        <Badge variant={urgency}>
          {isOver ? 'Done' : daysLeft === 0 ? 'Today!' : `${daysLeft}d left`}
        </Badge>
      </div>

      <h3 className="text-slate-100 font-semibold text-sm mb-1">{exam.title}</h3>
      {exam.subject && <p className="text-purple-400 text-xs mb-2">{exam.subject.name}</p>}

      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          {format(examDate, 'EEE, MMM d, yyyy · h:mm a')}
        </div>
        {exam.venue && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <BookOpen className="w-3.5 h-3.5" />
            {exam.venue}
          </div>
        )}
        {exam.duration && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            {exam.duration} minutes
          </div>
        )}
      </div>

      {totalTopics > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Syllabus completion</span>
            <span className="text-xs text-purple-400 font-medium">{progress}%</span>
          </div>
          <div className="bg-dark-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
