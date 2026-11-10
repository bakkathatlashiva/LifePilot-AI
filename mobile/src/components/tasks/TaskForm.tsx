import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';
import { Task } from '../../types';
import api from '../../lib/api';
import { addDays, format } from 'date-fns';

interface TaskFormProps {
  task?: Task | null;
  onSuccess: () => void;
  onCancel?: () => void;
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
  { value: 'LOW', label: '🟢 Low Priority' },
  { value: 'MEDIUM', label: '🟡 Medium Priority' },
  { value: 'HIGH', label: '🟠 High Priority' },
  { value: 'CRITICAL', label: '🔴 Critical Priority' },
];

export function TaskForm({ task, onSuccess, onCancel }: TaskFormProps) {
  const isEdit = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [category, setCategory] = useState(task?.category ?? 'REMINDER');
  const [priority, setPriority] = useState(task?.priority ?? 'MEDIUM');
  const [deadline, setDeadline] = useState(
    task?.deadline ? format(new Date(task.deadline), 'yyyy-MM-dd HH:mm') : ''
  );
  const [tags, setTags] = useState(task?.tags?.join(', ') ?? '');

  const [naturalText, setNaturalText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const parseNatural = async () => {
    if (!naturalText.trim()) return;
    setParsing(true);
    setError('');
    try {
      const { data } = await api.post('/ai/parse-task', { text: naturalText });
      const parsed = data.data;
      if (parsed.title) setTitle(parsed.title);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.category) setCategory(parsed.category);
      if (parsed.priority) setPriority(parsed.priority);
      if (parsed.deadline) {
        setDeadline(format(new Date(parsed.deadline), 'yyyy-MM-dd HH:mm'));
      }
      setNaturalText('');
      if (parsed.needsClarification && parsed.clarificationQuestion) {
        Alert.alert('AI Note', parsed.clarificationQuestion);
      }
    } catch {
      setError('Failed to autofill from AI');
    } finally {
      setParsing(false);
    }
  };

  const handleQuickDeadline = (daysToAdd: number) => {
    const target = addDays(new Date(), daysToAdd);
    target.setHours(23, 59, 0, 0);
    setDeadline(format(target, 'yyyy-MM-dd HH:mm'));
  };

  const handleSubmit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Please provide a task title');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let parsedDeadline: string | undefined = undefined;
      if (deadline.trim()) {
        const d = new Date(deadline);
        if (!isNaN(d.getTime())) {
          parsedDeadline = d.toISOString();
        }
      }

      const payload = {
        title: cleanTitle,
        description: description.trim() || undefined,
        category,
        priority,
        deadline: parsedDeadline,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      };

      if (isEdit && task) {
        await api.put(`/tasks/${task.id}`, payload);
      } else {
        await api.post('/tasks', payload);
      }

      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* AI Quick Autofill */}
      {!isEdit && (
        <View style={styles.aiBox}>
          <Text style={styles.aiTitle}>✨ Quick AI Task Autofill</Text>
          <View style={styles.aiInputRow}>
            <Input
              placeholder="e.g. submit CS210 report tomorrow at 5pm"
              value={naturalText}
              onChangeText={setNaturalText}
              containerStyle={{ flex: 1 }}
            />
            <Button
              onPress={parseNatural}
              loading={parsing}
              size="sm"
              variant="outline"
              style={{ minHeight: 44 }}
            >
              Autofill
            </Button>
          </View>
        </View>
      )}

      {/* Title */}
      <Input
        label="Task Title *"
        placeholder="Enter task title"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (error) setError('');
        }}
      />

      {/* Description */}
      <Input
        label="Description (Optional)"
        placeholder="Add details, notes or instructions"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />

      {/* Category */}
      <Select
        label="Category"
        value={category}
        options={CATEGORY_OPTIONS}
        onChange={(val) => setCategory(val as any)}
      />

      {/* Priority */}
      <Select
        label="Priority"
        value={priority}
        options={PRIORITY_OPTIONS}
        onChange={(val) => setPriority(val as any)}
      />

      {/* Deadline */}
      <View style={{ gap: 6 }}>
        <Input
          label="Deadline (YYYY-MM-DD HH:mm)"
          placeholder="2026-11-15 23:59"
          value={deadline}
          onChangeText={setDeadline}
        />
        {/* Quick Deadline Pills */}
        <View style={styles.quickPillsRow}>
          <TouchableOpacity
            style={styles.pill}
            onPress={() => handleQuickDeadline(0)}
          >
            <Text style={styles.pillText}>Today 23:59</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pill}
            onPress={() => handleQuickDeadline(1)}
          >
            <Text style={styles.pillText}>Tomorrow</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pill}
            onPress={() => handleQuickDeadline(7)}
          >
            <Text style={styles.pillText}>In 1 Week</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tags */}
      <Input
        label="Tags (Comma separated)"
        placeholder="cs210, assignment, urgent"
        value={tags}
        onChangeText={setTags}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {onCancel && (
          <Button
            onPress={onCancel}
            variant="ghost"
            style={{ flex: 1 }}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
        <Button
          onPress={handleSubmit}
          loading={submitting}
          style={{ flex: 2 }}
        >
          {isEdit ? 'Update Task' : 'Create Task'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  aiBox: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderWidth: 1,
    borderColor: colors.borderPurple,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  aiTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryLight,
  },
  aiInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  pill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: colors.redLight,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
});
