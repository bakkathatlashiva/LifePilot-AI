import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useTaskStore } from '../store/taskStore';
import { CATEGORY_CONFIG, PRIORITY_CONFIG } from '../lib/utils';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';

export function CalendarPage() {
  const { tasks, fetchTasks } = useTaskStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const getTasksForDay = (date: Date) =>
    tasks.filter((t) => t.deadline && isSameDay(new Date(t.deadline), date));

  const selectedDayTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Calendar</h1>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="xl:col-span-2">
          <Card>
            {/* Navigation */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-100">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 hover:bg-white/8 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-3 py-1.5 hover:bg-white/8 rounded-xl text-slate-400 hover:text-slate-200 transition-colors text-sm"
                >
                  Today
                </button>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 hover:bg-white/8 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1 sm:mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="text-center text-[11px] sm:text-xs font-semibold text-slate-400 py-1.5 sm:py-2">
                  <span className="sm:hidden">{d[0]}</span>
                  <span className="hidden sm:inline">{d}</span>
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {days.map((d) => {
                const dayTasks = getTasksForDay(d);
                const isToday = isSameDay(d, new Date());
                const isSelected = selectedDay && isSameDay(d, selectedDay);
                const isCurrentMonth = isSameMonth(d, currentMonth);

                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => setSelectedDay(d)}
                    className={`relative min-h-[46px] sm:min-h-[75px] p-1 sm:p-2 rounded-xl text-left transition-all duration-200 flex flex-col justify-between ${
                      isSelected
                        ? 'bg-purple-600/30 border border-purple-500/60 shadow-md'
                        : isToday
                        ? 'bg-blue-600/15 border border-blue-500/30'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                    aria-label={`${format(d, 'MMMM d')}${dayTasks.length > 0 ? `, ${dayTasks.length} tasks` : ''}`}
                  >
                    <span className={`text-[11px] sm:text-xs font-bold block ${
                      !isCurrentMonth ? 'text-slate-600' :
                      isToday ? 'text-blue-400' :
                      isSelected ? 'text-purple-300' :
                      'text-slate-300'
                    }`}>
                      {format(d, 'd')}
                    </span>

                    {/* Mobile: Compact task dots indicator */}
                    <div className="flex sm:hidden flex-wrap gap-1 mt-auto justify-center">
                      {dayTasks.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className={`w-1.5 h-1.5 rounded-full ${
                            t.priority === 'CRITICAL' ? 'bg-red-400' :
                            t.priority === 'HIGH' ? 'bg-orange-400' :
                            'bg-purple-400'
                          }`}
                        />
                      ))}
                      {dayTasks.length > 3 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      )}
                    </div>

                    {/* Desktop / Tablet: Full task labels */}
                    <div className="hidden sm:block space-y-1 w-full mt-1">
                      {dayTasks.slice(0, 2).map((t) => (
                        <div
                          key={t.id}
                          className={`text-[10px] truncate px-1.5 py-0.5 rounded font-medium ${
                            t.priority === 'CRITICAL' ? 'bg-red-500/20 text-red-300' :
                            t.priority === 'HIGH' ? 'bg-orange-500/20 text-orange-300' :
                            'bg-purple-500/20 text-purple-300'
                          }`}
                        >
                          {t.title}
                        </div>
                      ))}
                      {dayTasks.length > 2 && (
                        <p className="text-[10px] text-slate-500 font-medium">+{dayTasks.length - 2} more</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Selected day */}
        <Card>
          <h3 className="text-slate-100 font-semibold mb-4">
            {selectedDay ? format(selectedDay, 'EEEE, MMM d') : 'Select a day'}
          </h3>
          {selectedDayTasks.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">No tasks due this day</p>
          ) : (
            <div className="space-y-3">
              {selectedDayTasks.map((t) => {
                const cat = CATEGORY_CONFIG[t.category];
                const prio = PRIORITY_CONFIG[t.priority];
                return (
                  <div key={t.id} className="p-3 bg-dark-800 rounded-xl border-l-2"
                    style={{ borderLeftColor: prio.dot.replace('bg-', '#').replace('-400', '') }}>
                    <p className="text-sm font-medium text-slate-200">{t.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500">{cat.icon} {cat.label}</span>
                      <Badge variant={t.status === 'OVERDUE' ? 'danger' : 'ghost'} size="sm">
                        {t.status}
                      </Badge>
                    </div>
                    {t.deadline && (
                      <p className="text-xs text-slate-600 mt-1">
                        {format(new Date(t.deadline), 'h:mm a')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
