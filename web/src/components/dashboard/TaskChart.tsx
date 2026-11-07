import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Card, CardHeader } from '../ui/Card';
import { DashboardStats } from '../../types';
import { CATEGORY_CONFIG } from '../../lib/utils';

interface TaskChartProps {
  stats: DashboardStats | null;
}

const COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export function TaskChart({ stats }: TaskChartProps) {
  const pieData = stats?.byCategory
    .filter((c) => c._count._all > 0)
    .map((c, i) => ({
      name: CATEGORY_CONFIG[c.category as keyof typeof CATEGORY_CONFIG]?.label ?? c.category,
      value: c._count._all,
      color: COLORS[i % COLORS.length],
    })) ?? [];

  const barData = [
    { name: 'Total', value: stats?.total ?? 0, fill: '#6366f1' },
    { name: 'Done', value: stats?.completed ?? 0, fill: '#10b981' },
    { name: 'Overdue', value: stats?.overdue ?? 0, fill: '#ef4444' },
    { name: 'Today', value: stats?.dueToday ?? 0, fill: '#f59e0b' },
    { name: 'Week', value: stats?.dueThisWeek ?? 0, fill: '#8b5cf6' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Bar chart */}
      <Card>
        <CardHeader title="Task Overview" subtitle="Current status" />
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {barData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Pie chart */}
      <Card>
        <CardHeader title="By Category" subtitle="Task distribution" />
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: 12 }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', color: '#64748b' }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
            No task data yet
          </div>
        )}
      </Card>
    </div>
  );
}
