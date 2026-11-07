import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { DashboardPage } from './pages/DashboardPage';
import { TasksPage } from './pages/TasksPage';
import { ERPPage } from './pages/ERPPage';
import { GmailPage } from './pages/GmailPage';
import { ExamsPage } from './pages/ExamsPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CalendarPage } from './pages/CalendarPage';
import { StudyPlannerPage } from './pages/StudyPlannerPage';
import { SmsGatewayPage } from './pages/SmsGatewayPage';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/error" element={<LoginPage />} />

      {/* Protected */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/erp" element={<ERPPage />} />
        <Route path="/gmail" element={<GmailPage />} />
        <Route path="/sms-gateway" element={<SmsGatewayPage />} />
        <Route path="/exams" element={<ExamsPage />} />
        <Route path="/study" element={<StudyPlannerPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/events" element={<CalendarPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/ai" element={<AIAssistantPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/profile" element={<SettingsPage />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
