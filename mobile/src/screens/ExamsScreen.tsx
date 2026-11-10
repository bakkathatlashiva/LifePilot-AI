import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, differenceInDays, isPast } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';
import { Exam } from '../types';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';

export function ExamsScreen() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab: 'UPCOMING' | 'PAST'
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'PAST'>('UPCOMING');

  // Add Exam Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [duration, setDuration] = useState('180');
  const [venue, setVenue] = useState('');
  const [totalMarks, setTotalMarks] = useState('100');
  const [subjectId, setSubjectId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchExams = useCallback(async () => {
    try {
      const [examRes, subRes] = await Promise.all([
        api.get('/exams?upcoming=false'),
        api.get('/exams/subjects'),
      ]);
      setExams(examRes.data?.data || []);
      setSubjects(subRes.data?.data || []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchExams();
  }, [fetchExams]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchExams();
  }, [fetchExams]);

  const handleCreateExam = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || !examDate.trim()) {
      setCreateError('Title and Exam Date are required');
      return;
    }

    setSaving(true);
    setCreateError('');

    try {
      const d = new Date(examDate);
      if (isNaN(d.getTime())) {
        setCreateError('Invalid date format. Use YYYY-MM-DD HH:mm');
        setSaving(false);
        return;
      }

      await api.post('/exams', {
        title: cleanTitle,
        examDate: d.toISOString(),
        duration: duration ? parseInt(duration, 10) : undefined,
        totalMarks: totalMarks ? parseFloat(totalMarks) : undefined,
        venue: venue.trim() || undefined,
        subjectId: subjectId || undefined,
        notes: notes.trim() || undefined,
      });

      setShowCreateModal(false);
      setTitle('');
      setExamDate('');
      setVenue('');
      setNotes('');
      fetchExams();
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || err?.message || 'Failed to create exam');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExam = (exam: Exam) => {
    Alert.alert('Delete Exam', `Delete "${exam.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setExams((prev) => prev.filter((e) => e.id !== exam.id));
          try {
            await api.delete(`/exams/${exam.id}`);
          } catch {
            fetchExams();
          }
        },
      },
    ]);
  };

  const handleToggleComplete = async (exam: Exam) => {
    const nextCompleted = !exam.isCompleted;
    setExams((prev) =>
      prev.map((e) => (e.id === exam.id ? { ...e, isCompleted: nextCompleted } : e))
    );
    try {
      await api.put(`/exams/${exam.id}`, { isCompleted: nextCompleted });
    } catch {
      fetchExams();
    }
  };

  // Split Upcoming vs Past
  const { upcomingExams, pastExams } = useMemo(() => {
    const up: Exam[] = [];
    const past: Exam[] = [];
    for (const e of exams) {
      const ed = new Date(e.examDate);
      if (e.isCompleted || isPast(ed)) {
        past.push(e);
      } else {
        up.push(e);
      }
    }
    return { upcomingExams: up, pastExams: past };
  }, [exams]);

  const currentList = activeTab === 'UPCOMING' ? upcomingExams : pastExams;

  const subjectOptions = [
    { value: '', label: 'Select Subject (Optional)' },
    ...subjects.map((s) => ({ value: s.id, label: `${s.code ? s.code + ' - ' : ''}${s.name}` })),
  ];

  const renderExamCard = (exam: Exam) => {
    const ed = new Date(exam.examDate);
    const daysLeft = differenceInDays(ed, new Date());
    const isOver = exam.isCompleted || isPast(ed);

    const badgeVariant = isOver
      ? 'ghost'
      : daysLeft <= 1
      ? 'danger'
      : daysLeft <= 3
      ? 'warning'
      : 'info';

    const badgeText = isOver
      ? 'Completed'
      : daysLeft === 0
      ? 'Today!'
      : `${daysLeft}d left`;

    return (
      <Card key={exam.id} style={[styles.examCard, isOver && { opacity: 0.7 }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.badgeRow}>
              <Badge variant={badgeVariant as any} size="sm">
                {badgeText}
              </Badge>
              {exam.subject?.name ? (
                <Text style={styles.subjectText} numberOfLines={1}>
                  {exam.subject.code ? `[${exam.subject.code}] ` : ''}
                  {exam.subject.name}
                </Text>
              ) : null}
            </View>
            <Text style={styles.examTitle}>{exam.title}</Text>
          </View>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDeleteExam(exam)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteBtnText}>🗑️</Text>
          </TouchableOpacity>
        </View>

        {/* Details row */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            📅 {format(ed, 'EEE, MMM d, yyyy · h:mm a')}
          </Text>
          {exam.venue ? (
            <Text style={styles.metaText}>📍 {exam.venue}</Text>
          ) : null}
          {exam.duration ? (
            <Text style={styles.metaText}>⏱️ {exam.duration} mins</Text>
          ) : null}
          {exam.totalMarks ? (
            <Text style={styles.marksText}>🎯 Max Marks: {exam.totalMarks}</Text>
          ) : null}
        </View>

        {exam.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>{exam.notes}</Text>
          </View>
        ) : null}

        {/* Footer toggle */}
        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[styles.toggleBtn, exam.isCompleted && styles.completedToggleBtn]}
            onPress={() => handleToggleComplete(exam)}
          >
            <Text style={styles.toggleBtnText}>
              {exam.isCompleted ? '✓ Completed' : 'Mark Completed'}
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppHeader
        title="Exams & Tests"
        subtitle={`${upcomingExams.length} upcoming exam${upcomingExams.length === 1 ? '' : 's'}`}
        onOpenDrawer={() => setDrawerOpen(true)}
        rightAction={
          <Button
            size="sm"
            onPress={() => setShowCreateModal(true)}
            style={{ minHeight: 38, paddingHorizontal: 12 }}
          >
            + Add
          </Button>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Segment Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'UPCOMING' && styles.activeTabBtn]}
            onPress={() => setActiveTab('UPCOMING')}
          >
            <Text style={[styles.tabText, activeTab === 'UPCOMING' && styles.activeTabText]}>
              Upcoming ({upcomingExams.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'PAST' && styles.activeTabBtn]}
            onPress={() => setActiveTab('PAST')}
          >
            <Text style={[styles.tabText, activeTab === 'PAST' && styles.activeTabText]}>
              Past ({pastExams.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content List */}
        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Loading exam schedule...</Text>
          </View>
        ) : currentList.length === 0 ? (
          <EmptyState
            title={activeTab === 'UPCOMING' ? 'No upcoming exams' : 'No past exams'}
            description={
              activeTab === 'UPCOMING'
                ? 'Add your exam schedule to get countdown reminders and study alerts.'
                : 'Completed exams will appear here.'
            }
            action={
              activeTab === 'UPCOMING'
                ? { label: '+ Add Exam', onClick: () => setShowCreateModal(true) }
                : undefined
            }
          />
        ) : (
          <View style={{ gap: 12 }}>
            {currentList.map(renderExamCard)}
          </View>
        )}
      </ScrollView>

      {/* Add Exam Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Exam"
      >
        <View style={{ gap: 14 }}>
          <Input
            label="Exam Title *"
            placeholder="e.g. Operating Systems Mid-Term"
            value={title}
            onChangeText={setTitle}
          />

          <Input
            label="Exam Date & Time (YYYY-MM-DD HH:mm) *"
            placeholder="2026-11-20 09:30"
            value={examDate}
            onChangeText={setExamDate}
          />

          <View style={styles.inputRow}>
            <Input
              label="Duration (mins)"
              placeholder="180"
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
              containerStyle={{ flex: 1 }}
            />
            <Input
              label="Total Marks"
              placeholder="100"
              value={totalMarks}
              onChangeText={setTotalMarks}
              keyboardType="numeric"
              containerStyle={{ flex: 1 }}
            />
          </View>

          <Input
            label="Venue / Hall"
            placeholder="Auditorium, Hall 2B"
            value={venue}
            onChangeText={setVenue}
          />

          <Select
            label="Subject"
            options={subjectOptions}
            value={subjectId}
            onChange={setSubjectId}
          />

          <Input
            label="Notes & Syllabus"
            placeholder="Units 1 to 4, bring scientific calculator"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />

          {createError ? <Text style={styles.errorText}>{createError}</Text> : null}

          <Button onPress={handleCreateExam} loading={saving}>
            Save Exam
          </Button>
        </View>
      </Modal>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="Exams"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 100 },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  activeTabBtn: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  activeTabText: { color: '#ffffff' },
  examCard: { padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  subjectText: { fontSize: 11, color: colors.primaryLight, fontWeight: '600' },
  examTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14 },
  metaRow: { gap: 4, marginTop: 2 },
  metaText: { fontSize: 11, color: colors.textSecondary },
  marksText: { fontSize: 11, color: colors.amberLight, fontWeight: '600' },
  notesBox: {
    backgroundColor: colors.input,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  notesText: { fontSize: 11, color: colors.textMuted },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  completedToggleBtn: { backgroundColor: colors.emeraldMuted },
  toggleBtnText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  loaderBox: { padding: 40, alignItems: 'center', gap: 10 },
  loaderText: { fontSize: 13, color: colors.textMuted },
  inputRow: { flexDirection: 'row', gap: 10 },
  errorText: { fontSize: 12, color: colors.redLight, fontWeight: '500' },
});
