import React, { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Input, Select, Textarea } from '../ui/Input';
import { Button } from '../ui/Button';
import { useTaskStore } from '../../store/taskStore';
import { Task } from '../../types';
import api from '../../lib/api';

interface TaskFormProps {
  task?: Task;
  onSuccess: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'COLLEGE_ASSIGNMENT', label: '📝 Assignment' },
  { value: 'EXAM', label: '📋 Exam' },
  { value: 'STUDY_SESSION', label: '📚 Study Session' },
  { value: 'PROJECT', label: '🚀 Project' },
  { value: 'HACKATHON', label: '💻 Hackathon' },
  { value: 'EVENT', label: '🎯 Event' },
  { value: 'WORKSHOP', label: '🔧 Workshop' },
  { value: 'PERSONAL', label: '👤 Personal' },
  { value: 'MEETING', label: '🤝 Meeting' },
  { value: 'REMINDER', label: '🔔 Reminder' },
];

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

export function TaskForm({ task, onSuccess }: TaskFormProps) {
  const { createTask, updateTask } = useTaskStore();
  const isEdit = !!task;

  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    category: task?.category ?? 'REMINDER',
    priority: task?.priority ?? 'MEDIUM',
    deadline: task?.deadline ? task.deadline.slice(0, 16) : '',
    tags: task?.tags?.join(', ') ?? '',
  });

  const [naturalText, setNaturalText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const parseNatural = async () => {
    if (!naturalText.trim()) return;
    setParsing(true);
    try {
      const { data } = await api.post('/ai/parse-task', { text: naturalText });
      const parsed = data.data;
      setForm((prev) => ({
        ...prev,
        title: parsed.title ?? prev.title,
        description: parsed.description ?? prev.description,
        category: parsed.category ?? prev.category,
        priority: parsed.priority ?? prev.priority,
        deadline: parsed.deadline ? new Date(parsed.deadline).toISOString().slice(0, 16) : prev.deadline,
      }));
      if (parsed.needsClarification && parsed.clarificationQuestion) {
        alert(`AI needs clarification: ${parsed.clarificationQuestion}`);
      }
    } catch {
      setError('Failed to parse task');
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        category: form.category,
        priority: form.priority,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      };

      if (isEdit) {
        await updateTask(task.id, payload);
      } else {
        await createTask(payload);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to save task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Natural language input */}
      {!isEdit && (
        <div className="p-4 bg-purple-600/10 border border-purple-500/20 rounded-2xl">
          <p className="text-sm text-purple-300 font-medium mb-2">✨ Describe your task naturally</p>
          <div className="flex gap-2">
            <Input
              placeholder='"Remind me tomorrow at 8pm to complete my Java project"'
              value={naturalText}
              onChange={(e) => setNaturalText(e.target.value)}
            />
            <Button type="button" onClick={parseNatural} loading={parsing}
              variant="outline" className="flex-shrink-0"
              leftIcon={<Wand2 className="w-4 h-4" />}>
              Parse
            </Button>
          </div>
        </div>
      )}

      <Input
        label="Task Title *"
        placeholder="What needs to be done?"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        required
      />

      <Textarea
        label="Description"
        placeholder="Additional details..."
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={3}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Category"
          options={CATEGORY_OPTIONS}
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as any })}
        />
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
        />
      </div>

      <Input
        label="Deadline"
        type="datetime-local"
        value={form.deadline}
        onChange={(e) => setForm({ ...form, deadline: e.target.value })}
      />

      <Input
        label="Tags (comma-separated)"
        placeholder="java, project, college"
        value={form.tags}
        onChange={(e) => setForm({ ...form, tags: e.target.value })}
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} className="flex-1">
          {isEdit ? 'Save Changes' : 'Create Task'}
        </Button>
      </div>
    </form>
  );
}
