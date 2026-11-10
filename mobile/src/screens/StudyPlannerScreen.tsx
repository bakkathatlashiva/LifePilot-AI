import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, isPast } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';
import { StudySession } from '../types';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';

export function StudyPlannerScreen() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab: 'UPCOMING' | 'COMPLETED'
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'COMPLETED'>('UPCOMING');

  // Schedule Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMin, setDurationMin] = useState('60');
  const [subjectId, setSubjectId] = useState('');
  const [examId, setExamId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [sessRes, subRes, examRes] = await Promise.all([
        api.get('/exams/study-sessions'),
        api.get('/exams/subjects'),
        api.get('/exams?upcoming=true'),
      ]);
      setSessions(sessRes.data?.data || []);
      setSubjects(subRes.data?.data || []);
      setExams(examRes.data?.data || []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  const handleCreateSession = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || !scheduledAt.trim()) {
      setCreateError('Title and Date/Time are required');
      return;
    }

    setSaving(true);
    setCreateError('');

    try {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime())) {
        setCreateError('Invalid date format. Use YYYY-MM-DD HH:mm');
        setSaving(false);
        return;
      }

      await api.post('/exams/study-sessions', {
        title: cleanTitle,
        scheduledAt: d.toISOString(),
        durationMin: parseInt(durationMin, 10) || 60,
        subjectId: subjectId || undefined,
        examId: examId || undefined,
        notes: notes.trim() || undefined,
      });

      setShowScheduleModal(false);
      setTitle('');
      setScheduledAt('');
      setNotes('');
      fetchAll();
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || err?.message || 'Failed to schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteSession = async (id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isCompleted: true } : s))
    );
    try {
      await api.put(`/exams/study-sessions/${id}/complete`, {});
    } catch {
      fetchAll();
    }
  };

  // Metrics
  const { upcomingSessions, completedSessions, totalHours } = useMemo(() => {
    const up: StudySession[] = [];
    const comp: StudySession[] = [];
    let mins = 0;
    for (const s of sessions) {
      if (s.isCompleted) {
        comp.push(s);
        mins += s.durationMin || 0;
      } else if (!isPast(new Date(s.scheduledAt))) {
        up.push(s);
      } else {
        comp.push(s);
        mins += s.durationMin || 0;
      }
    }
    return {
      upcomingSessions: up,
      completedSessions: comp,
      totalHours: (mins / 60).toFixed(1),
    };
  }, [sessions]);

  const subjectOptions = [
    { value: '', label: 'Select Subject (Optional)' },
    ...subjects.map((s) => ({ value: s.id, label: `${s.code ? s.code + ' - ' : ''}${s.name}` })),
  ];

  const examOptions = [
    { value: '', label: 'Link to Exam (Optional)' },
    ...exams.map((e) => ({ value: e.id, label: e.title })),
  ];

  const currentList = activeTab === 'UPCOMING' ? upcomingSessions : completedSessions;

  const renderSessionCard = (session: StudySession) => {
    const sd = new Date(session.scheduledAt);
    return (
      <Card key={session.id} style={styles.sessionCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.badgeRow}>
              <Badge variant={session.isCompleted ? 'success' : 'purple'} size="sm">
                {session.isCompleted ? 'Completed' : 'Scheduled'}
              </Badge>
              {session.durationMin ? (
                <Text style={styles.durationText}>⏱️ {session.durationMin}m</Text>
              ) : null}
            </View>
            <Text style={styles.sessionTitle}>{session.title}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            📅 {format(sd, 'EEE, MMM d, yyyy · h:mm a')}
          </Text>
          {session.subject?.name ? (
            <Text style={styles.subjectText}>📚 {session.subject.name}</Text>
          ) : null}
          {session.exam?.title ? (
            <Text style={styles.examLinkText}>🎓 Linked: {session.exam.title}</Text>
          ) : null}
        </View>

        {session.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>{session.notes}</Text>
          </View>
        ) : null}

        {!session.isCompleted && (
          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.completeBtn}
              onPress={() => handleCompleteSession(session.id)}
            >
              <Text style={styles.completeBtnText}>✓ Mark Completed</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppHeader
        title="Study Planner"
        subtitle={`${upcomingSessions.length} upcoming focus sessions`}
        onOpenDrawer={() => setDrawerOpen(true)}
        rightAction={
          <Button
            size="sm"
            onPress={() => setShowScheduleModal(true)}
            style={{ minHeight: 38, paddingHorizontal: 12 }}
          >
            + Session
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
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={[styles.statVal, { color: colors.primaryLight }]}>
              {upcomingSessions.length}
            </Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statVal, { color: colors.emeraldLight }]}>
              {totalHours}h
            </Text>
            <Text style={styles.statLabel}>Hours Studied</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statVal, { color: colors.blueLight }]}>
              {exams.length}
            </Text>
            <Text style={styles.statLabel}>Target Exams</Text>
          </Card>
        </View>

        {/* Tab switch */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'UPCOMING' && styles.activeTabBtn]}
            onPress={() => setActiveTab('UPCOMING')}
          >
            <Text style={[styles.tabText, activeTab === 'UPCOMING' && styles.activeTabText]}>
              Upcoming ({upcomingSessions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'COMPLETED' && styles.activeTabBtn]}
            onPress={() => setActiveTab('COMPLETED')}
          >
            <Text style={[styles.tabText, activeTab === 'COMPLETED' && styles.activeTabText]}>
              Completed ({completedSessions.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Loading study planner...</Text>
          </View>
        ) : currentList.length === 0 ? (
          <EmptyState
            title={activeTab === 'UPCOMING' ? 'No study sessions scheduled' : 'No completed sessions'}
            description={
              activeTab === 'UPCOMING'
                ? 'Plan your study sessions with duration targets to stay ahead.'
                : 'Completed sessions will accumulate your study hours.'
            }
            action={
              activeTab === 'UPCOMING'
                ? { label: '+ Schedule Session', onClick: () => setShowScheduleModal(true) }
                : undefined
            }
          />
        ) : (
          <View style={{ gap: 12 }}>
            {currentList.map(renderSessionCard)}
          </View>
        )}
      </ScrollView>

      {/* Schedule Modal */}
      <Modal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title="Schedule Study Session"
      >
        <View style={{ gap: 14 }}>
          <Input
            label="Session Title *"
            placeholder="e.g. Chapter 3 Calculus Practice"
            value={title}
            onChangeText={setTitle}
          />

          <Input
            label="Date & Time (YYYY-MM-DD HH:mm) *"
            placeholder="2026-11-12 18:00"
            value={scheduledAt}
            onChangeText={setScheduledAt}
          />

          <Input
            label="Duration (minutes)"
            placeholder="60"
            value={durationMin}
            onChangeText={setDurationMin}
            keyboardType="numeric"
          />

          <Select
            label="Subject"
            options={subjectOptions}
            value={subjectId}
            onChange={setSubjectId}
          />

          <Select
            label="Link to Upcoming Exam"
            options={examOptions}
            value={examId}
            onChange={setExamId}
          />

          <Input
            label="Focus Notes & Goals"
            placeholder="Practice 10 numericals, review lecture notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />

          {createError ? <Text style={styles.errorText}>{createError}</Text> : null}

          <Button onPress={handleCreateSession} loading={saving}>
            Save Study Session
          </Button>
        </View>
      </Modal>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="Study"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 100 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, padding: 12, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
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
  sessionCard: { padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  durationText: { fontSize: 11, color: colors.amberLight, fontWeight: '600' },
  sessionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  metaRow: { gap: 4, marginTop: 2 },
  metaText: { fontSize: 11, color: colors.textSecondary },
  subjectText: { fontSize: 11, color: colors.primaryLight, fontWeight: '600' },
  examLinkText: { fontSize: 11, color: colors.blueLight, fontWeight: '500' },
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
  completeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.emeraldMuted,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  completeBtnText: { fontSize: 11, color: colors.emeraldLight, fontWeight: '700' },
  loaderBox: { padding: 40, alignItems: 'center', gap: 10 },
  loaderText: { fontSize: 13, color: colors.textMuted },
  errorText: { fontSize: 12, color: colors.redLight, fontWeight: '500' },
});
