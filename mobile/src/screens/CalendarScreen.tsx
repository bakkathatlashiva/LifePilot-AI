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
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';
import { Task } from '../types';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

export function CalendarScreen() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get('/tasks?pageSize=150');
      setTasks(res.data?.data || []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
  }, [fetchTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks();
  }, [fetchTasks]);

  // Calendar math
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const result: Date[] = [];
    let d = calStart;
    while (d <= calEnd) {
      result.push(d);
      d = addDays(d, 1);
    }
    return result;
  }, [currentMonth]);

  const getTasksForDay = useCallback(
    (date: Date) =>
      tasks.filter((t) => t.deadline && isSameDay(new Date(t.deadline), date)),
    [tasks]
  );

  const selectedDayTasks = useMemo(
    () => getTasksForDay(selectedDay),
    [getTasksForDay, selectedDay]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppHeader
        title="Calendar"
        subtitle="Unified Academic Schedule"
        onOpenDrawer={() => setDrawerOpen(true)}
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
        {/* Month Navigation Card */}
        <Card style={styles.calCard}>
          <View style={styles.navRow}>
            <Text style={styles.monthTitle}>
              {format(currentMonth, 'MMMM yyyy')}
            </Text>

            <View style={styles.navBtns}>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <Text style={styles.navBtnText}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.todayBtn}
                onPress={() => {
                  const now = new Date();
                  setCurrentMonth(now);
                  setSelectedDay(now);
                }}
              >
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <Text style={styles.navBtnText}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekdayRow}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <Text key={d} style={styles.weekdayText}>
                {d}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.grid}>
            {days.map((day) => {
              const dayTasks = getTasksForDay(day);
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDay);
              const isCurrMonth = isSameMonth(day, currentMonth);

              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  style={[
                    styles.dayCell,
                    isSelected && styles.selectedCell,
                    isToday && !isSelected && styles.todayCell,
                    !isCurrMonth && { opacity: 0.35 },
                  ]}
                  onPress={() => setSelectedDay(day)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      isSelected && styles.selectedDayNumber,
                      isToday && !isSelected && styles.todayDayNumber,
                    ]}
                  >
                    {format(day, 'd')}
                  </Text>

                  {/* Task Indicator Dots */}
                  {dayTasks.length > 0 ? (
                    <View style={styles.dotsRow}>
                      {dayTasks.slice(0, 3).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.taskDot,
                            {
                              backgroundColor: isSelected
                                ? '#ffffff'
                                : colors.primaryLight,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Selected Day Agenda */}
        <View style={styles.agendaSection}>
          <Text style={styles.agendaHeader}>
            Schedule for {format(selectedDay, 'EEEE, MMMM d')}
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          ) : selectedDayTasks.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              description="No tasks, exams, or assignment deadlines scheduled for this day."
            />
          ) : (
            <View style={{ gap: 10 }}>
              {selectedDayTasks.map((task) => (
                <Card key={task.id} style={styles.agendaItem}>
                  <View style={styles.agendaItemHeader}>
                    <Badge variant="purple" size="sm">
                      {task.category.replace('_', ' ')}
                    </Badge>
                    <Badge
                      variant={
                        task.status === 'COMPLETED'
                          ? 'success'
                          : task.status === 'OVERDUE'
                          ? 'danger'
                          : 'warning'
                      }
                      size="sm"
                    >
                      {task.status.replace('_', ' ')}
                    </Badge>
                  </View>

                  <Text style={styles.agendaItemTitle}>{task.title}</Text>

                  {task.deadline && (
                    <Text style={styles.agendaTime}>
                      ⏰ Due at {format(new Date(task.deadline), 'h:mm a')}
                    </Text>
                  )}
                </Card>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="Calendar"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 100 },
  calCard: { padding: 14, gap: 12 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  navBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: { fontSize: 18, color: colors.text, fontWeight: '700' },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.primaryMuted,
  },
  todayBtnText: { fontSize: 11, color: colors.primaryLight, fontWeight: '700' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    gap: 3,
  },
  selectedCell: {
    backgroundColor: colors.primary,
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: colors.blue,
  },
  dayNumber: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  selectedDayNumber: {
    color: '#ffffff',
    fontWeight: '700',
  },
  todayDayNumber: {
    color: colors.blueLight,
    fontWeight: '700',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  taskDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  agendaSection: { gap: 10 },
  agendaHeader: { fontSize: 15, fontWeight: '700', color: colors.text },
  agendaItem: { padding: 12, gap: 6 },
  agendaItemHeader: { flexDirection: 'row', gap: 6 },
  agendaItemTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  agendaTime: { fontSize: 11, color: colors.amberLight, fontWeight: '500' },
});
