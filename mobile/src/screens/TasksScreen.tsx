import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../lib/api';
import { format, isPast } from 'date-fns';
import { Task } from '../types';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskForm } from '../components/tasks/TaskForm';
import { useNavigation } from '@react-navigation/native';

const STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'COMPLETED', label: 'Completed' },
];

const CATEGORY_FILTERS = [
  { value: '', label: 'All Categories' },
  { value: 'COLLEGE_ASSIGNMENT', label: 'Assignment' },
  { value: 'EXAM', label: 'Exam' },
  { value: 'STUDY_SESSION', label: 'Study' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'HACKATHON', label: 'Hackathon' },
  { value: 'EVENT', label: 'Event' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'REMINDER', label: 'Reminder' },
];

export function TasksScreen() {
  const navigation = useNavigation<any>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      params.append('pageSize', '100');

      const { data } = await api.get(`/tasks?${params.toString()}`);
      setTasks(data.data || []);
    } catch {
      // Keep previous list on transient network error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
  }, [fetchTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks();
  }, [fetchTasks]);

  const handleToggleComplete = async (task: Task) => {
    const isCompleted = task.status === 'COMPLETED';
    const nextStatus = isCompleted ? 'IN_PROGRESS' : 'COMPLETED';

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus as any } : t))
    );

    try {
      await api.put(`/tasks/${task.id}`, { status: nextStatus });
    } catch {
      // Rollback
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      Alert.alert('Error', 'Failed to update task status');
    }
  };

  const handleDeleteTask = (task: Task) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
            try {
              await api.delete(`/tasks/${task.id}`);
            } catch {
              fetchTasks();
              Alert.alert('Error', 'Failed to delete task');
            }
          },
        },
      ]
    );
  };

  // Client-side search filter
  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [tasks, search]);

  const renderTask = ({ item: task }: { item: Task }) => {
    const isOverdue =
      task.status === 'OVERDUE' ||
      (task.status !== 'COMPLETED' && task.deadline && isPast(new Date(task.deadline)));
    const isCompleted = task.status === 'COMPLETED';

    const priorityColor =
      colors.priority[task.priority as keyof typeof colors.priority] || colors.primary;

    const statusBadgeVariant = isCompleted
      ? 'success'
      : isOverdue
      ? 'danger'
      : task.status === 'IN_PROGRESS'
      ? 'warning'
      : 'info';

    return (
      <Card style={[styles.taskCard, isOverdue ? styles.overdueBorder : undefined]}>
        <View style={styles.cardHeader}>
          {/* Complete Toggle Checkbox */}
          <TouchableOpacity
            style={[styles.checkbox, isCompleted && styles.checkedCheckbox]}
            onPress={() => handleToggleComplete(task)}
            activeOpacity={0.7}
          >
            {isCompleted && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>

          <View style={styles.cardContent}>
            {/* Title & Badges */}
            <View style={styles.badgeRow}>
              <View
                style={[styles.priorityPill, { backgroundColor: priorityColor + '20', borderColor: priorityColor + '40' }]}
              >
                <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
                <Text style={[styles.priorityText, { color: priorityColor }]}>
                  {task.priority}
                </Text>
              </View>

              <Badge variant={statusBadgeVariant as any} size="sm">
                {isCompleted ? 'Completed' : isOverdue ? 'Overdue' : task.status.replace('_', ' ')}
              </Badge>

              <Text style={styles.categoryText}>
                {task.category.replace('_', ' ')}
              </Text>
            </View>

            <Text
              style={[styles.title, isCompleted && styles.completedTitle]}
              numberOfLines={2}
            >
              {task.title}
            </Text>

            {task.description ? (
              <Text style={styles.description} numberOfLines={2}>
                {task.description}
              </Text>
            ) : null}

            {/* Footer with deadline & actions */}
            <View style={styles.cardFooter}>
              {task.deadline ? (
                <Text
                  style={[
                    styles.deadlineText,
                    isOverdue && { color: colors.redLight, fontWeight: '700' },
                  ]}
                >
                  {isOverdue ? '⚠️ ' : '📅 '}
                  {format(new Date(task.deadline), 'MMM d, yyyy h:mm a')}
                </Text>
              ) : (
                <Text style={styles.noDeadlineText}>No deadline set</Text>
              )}

              {/* Edit & Delete Actions */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setEditingTask(task)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.actionBtnText}>✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDeleteTask(task)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.actionBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <AppHeader
        title="My Tasks"
        subtitle={`${filteredTasks.length} task${filteredTasks.length === 1 ? '' : 's'}`}
        onOpenDrawer={() => setDrawerOpen(true)}
        rightAction={
          <Button
            size="sm"
            onPress={() => setShowCreateModal(true)}
            style={{ minHeight: 38, paddingHorizontal: 12 }}
          >
            + New
          </Button>
        }
      />

      {/* Filter & Search Bar */}
      <View style={styles.filterBar}>
        <Input
          placeholder="Search tasks..."
          value={search}
          onChangeText={setSearch}
          containerStyle={{ marginBottom: 8 }}
        />

        <View style={styles.selectRow}>
          <Select
            value={statusFilter}
            options={STATUS_FILTERS}
            onChange={setStatusFilter}
            containerStyle={{ flex: 1 }}
            placeholder="Status: All"
          />
          <Select
            value={categoryFilter}
            options={CATEGORY_FILTERS}
            onChange={setCategoryFilter}
            containerStyle={{ flex: 1 }}
            placeholder="Category: All"
          />
        </View>
      </View>

      {/* Task List */}
      {loading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>Loading tasks...</Text>
        </View>
      ) : filteredTasks.length === 0 ? (
        <View style={styles.emptyBox}>
          <EmptyState
            title="No tasks found"
            description={
              search || statusFilter || categoryFilter
                ? 'No tasks match the active filters. Try clearing filters.'
                : 'Stay organized by adding your coursework, projects, and reminders.'
            }
            action={{
              label: '+ Add New Task',
              onClick: () => setShowCreateModal(true),
            }}
          />
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          renderItem={renderTask}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Task"
      >
        <TaskForm
          onSuccess={() => {
            setShowCreateModal(false);
            fetchTasks();
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        isOpen={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        title="Edit Task"
      >
        {editingTask && (
          <TaskForm
            task={editingTask}
            onSuccess={() => {
              setEditingTask(null);
              fetchTasks();
            }}
            onCancel={() => setEditingTask(null)}
          />
        )}
      </Modal>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="Tasks"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 100,
  },
  taskCard: {
    padding: 14,
  },
  overdueBorder: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  checkedCheckbox: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
  },
  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 9999,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  categoryText: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 20,
  },
  completedTitle: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  description: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  deadlineText: {
    fontSize: 11,
    color: colors.amberLight,
    fontWeight: '500',
  },
  noDeadlineText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 4,
  },
  actionBtnText: {
    fontSize: 14,
  },
  loaderBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loaderText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  emptyBox: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
});
