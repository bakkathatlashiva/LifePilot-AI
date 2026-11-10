import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';
import { colors } from '../theme/colors';
import { AppHeader } from '../components/ui/AppHeader';
import { AppDrawer } from '../components/navigation/AppDrawer';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'task_created';
  task?: Record<string, any>;
}

const SUGGESTED_PROMPTS = [
  'Show assignments closing tomorrow',
  'What exams do I have this week?',
  'Which tasks are overdue?',
  'Remind me to study physics on Friday',
  'How many assignments are pending?',
  'Create a study plan for tomorrow',
];

export function AIAssistantScreen() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'assistant',
      content:
        "Hi! I'm your LifePilot AI assistant. I have access to your real tasks, deadlines, and Aurora ERP assessments. Ask me anything about your academic schedule or tell me to create a task!",
      timestamp: new Date(),
      type: 'text',
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt || input).trim();
    if (!textToSend || loading) return;

    setInput('');
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data } = await api.post('/ai/chat', { message: textToSend });
      const res = data.data;

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.message,
        timestamp: new Date(),
        type: res.type,
        task: res.task,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            err?.response?.data?.message ||
            'Sorry, I encountered an issue processing your request. Please try again.',
          timestamp: new Date(),
          type: 'text',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 200);
  }, [messages]);

  const renderMessage = ({ item: m }: { item: ChatMessage }) => {
    const isUser = m.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.userRow : styles.botRow]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Text style={{ fontSize: 14 }}>✨</Text>
          </View>
        )}

        <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
          <Text style={[styles.msgText, isUser ? styles.userText : styles.botText]}>
            {m.content}
          </Text>

          {/* Actionable created task card */}
          {m.type === 'task_created' && m.task ? (
            <Card style={styles.taskCreatedCard}>
              <View style={styles.taskCreatedHeader}>
                <Badge variant="success" size="sm">✓ Task Created</Badge>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Tasks')}
                  style={styles.viewTaskLink}
                >
                  <Text style={styles.viewTaskLinkText}>View in Tasks →</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.taskCreatedTitle}>{m.task.title}</Text>
              {m.task.deadline ? (
                <Text style={styles.taskCreatedDate}>
                  Due: {m.task.deadline}
                </Text>
              ) : null}
            </Card>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppHeader
        title="AI Assistant"
        subtitle="Powered by Google Gemini"
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {/* Suggested prompt chips */}
      <View style={styles.chipsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {SUGGESTED_PROMPTS.map((p, i) => (
            <TouchableOpacity
              key={i}
              style={styles.chip}
              onPress={() => handleSend(p)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Chat Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {loading && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color={colors.primaryLight} />
            <Text style={styles.typingText}>Gemini is thinking...</Text>
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            placeholder="Ask anything or create a task..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            style={styles.inputField}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
            onPress={() => handleSend()}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Global Navigation Drawer */}
      <AppDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentRoute="AIAssistant"
        onNavigate={(route) => navigation.navigate(route)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  chipsContainer: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    borderWidth: 1,
    borderColor: colors.borderPurple,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 11,
    color: colors.primaryLight,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 20,
  },
  msgRow: {
    flexDirection: 'row',
    gap: 10,
    maxWidth: '88%',
  },
  userRow: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  botRow: {
    alignSelf: 'flex-start',
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.borderPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  bubble: {
    padding: 14,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#ffffff',
  },
  botText: {
    color: colors.text,
  },
  taskCreatedCard: {
    marginTop: 10,
    padding: 10,
    gap: 4,
    backgroundColor: colors.cardAlt,
  },
  taskCreatedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewTaskLink: {
    padding: 2,
  },
  viewTaskLinkText: {
    fontSize: 11,
    color: colors.emeraldLight,
    fontWeight: '700',
  },
  taskCreatedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  taskCreatedDate: {
    fontSize: 11,
    color: colors.textMuted,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  typingText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  inputField: {
    flex: 1,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 14,
    minHeight: 42,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
});
