import * as React from 'react';
import {
    View,
    FlatList,
    TextInput,
    Pressable,
    Text,
    KeyboardAvoidingView,
    Platform,
    ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { useLocalSetting } from '@/sync/storage';
import { StatusDot } from './StatusDot';
import { useOpenClawChat, ChatMessage, ConnectionStatus } from '@/hooks/useOpenClawChat';

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    statusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
    },
    statusText: {
        fontSize: 12,
        marginLeft: 4,
        ...Typography.default(),
    },
    messagesList: {
        flex: 1,
    },
    messagesContent: {
        paddingVertical: 8,
    },
    userBubbleWrapper: {
        alignItems: 'flex-end',
        marginHorizontal: 12,
        marginVertical: 3,
    },
    assistantBubbleWrapper: {
        alignItems: 'flex-start',
        marginHorizontal: 12,
        marginVertical: 3,
    },
    userBubble: {
        backgroundColor: theme.colors.textLink,
        padding: 12,
        borderRadius: 18,
        borderBottomRightRadius: 4,
        maxWidth: '82%',
    },
    assistantBubble: {
        backgroundColor: theme.colors.surface,
        padding: 12,
        borderRadius: 18,
        borderBottomLeftRadius: 4,
        maxWidth: '86%',
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 21,
        ...Typography.default(),
    },
    userMessageText: {
        color: theme.colors.header.tint,
    },
    assistantMessageText: {
        color: theme.colors.text,
    },
    cursor: {
        opacity: 0.7,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 8,
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        gap: 8,
    },
    textInput: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 10,
        fontSize: 15,
        maxHeight: 120,
        ...Typography.default(),
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingBottom: 80,
    },
    emptyIcon: {
        width: 56,
        height: 56,
        marginBottom: 16,
        opacity: 0.6,
    },
    emptyTitle: {
        fontSize: 20,
        color: theme.colors.text,
        marginBottom: 8,
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
    emptyDescription: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        ...Typography.default(),
    },
    configContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingBottom: 80,
    },
    configButton: {
        marginTop: 20,
        paddingHorizontal: 20,
        paddingVertical: 11,
        borderRadius: 10,
        backgroundColor: theme.colors.textLink,
    },
    configButtonText: {
        color: theme.colors.header.tint,
        fontSize: 15,
        ...Typography.default('semiBold'),
    },
}));

// --- Sub-components ---

const MessageBubble = React.memo(({ message }: { message: ChatMessage }) => {
    const isUser = message.role === 'user';
    return (
        <View style={isUser ? styles.userBubbleWrapper : styles.assistantBubbleWrapper}>
            <View style={isUser ? styles.userBubble : styles.assistantBubble}>
                <Text
                    style={[styles.messageText, isUser ? styles.userMessageText : styles.assistantMessageText]}
                    selectable
                >
                    {message.content}
                    {message.isStreaming && <Text style={styles.cursor}>▋</Text>}
                </Text>
            </View>
        </View>
    );
});

const EmptyState = React.memo(() => (
    <View style={styles.emptyContainer}>
        <Image
            source={require('@/assets/images/brutalist/Brutalism 21.png')}
            style={styles.emptyIcon}
            contentFit="contain"
        />
        <Text style={styles.emptyTitle}>{t('hatchling.emptyTitle')}</Text>
        <Text style={styles.emptyDescription}>{t('hatchling.emptyDescription')}</Text>
    </View>
));

const ConfigPrompt = React.memo(() => {
    const router = useRouter();
    return (
        <View style={styles.configContainer}>
            <Image
                source={require('@/assets/images/brutalist/Brutalism 21.png')}
                style={styles.emptyIcon}
                contentFit="contain"
            />
            <Text style={styles.emptyTitle}>{t('hatchling.tokenMissing')}</Text>
            <Text style={styles.emptyDescription}>{t('hatchling.tokenMissingDescription')}</Text>
            <Pressable style={styles.configButton} onPress={() => router.push('/settings')}>
                <Text style={styles.configButtonText}>{t('hatchling.goToSettings')}</Text>
            </Pressable>
        </View>
    );
});

// --- Main component ---

const renderMessage = ({ item }: ListRenderItemInfo<ChatMessage>) => <MessageBubble message={item} />;
const keyExtractor = (item: ChatMessage) => item.id;

export const HatchlingChatView = React.memo(() => {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const openclawToken = useLocalSetting('openclawToken');
    const { messages, status, isStreaming, sendMessage, abort } = useOpenClawChat();
    const [inputText, setInputText] = React.useState('');
    const listRef = React.useRef<FlatList<ChatMessage>>(null);

    const canSend = inputText.trim().length > 0 && status === 'connected' && !isStreaming;

    const handleSend = React.useCallback(() => {
        const trimmed = inputText.trim();
        if (!trimmed || !canSend) return;
        sendMessage(trimmed);
        setInputText('');
    }, [inputText, canSend, sendMessage]);

    const statusColor = React.useMemo(() => {
        const map: Record<ConnectionStatus, string> = {
            connected: theme.colors.status.connected,
            connecting: theme.colors.status.connecting,
            disconnected: theme.colors.status.disconnected,
            error: theme.colors.status.error,
        };
        return map[status];
    }, [status, theme]);

    const statusLabel = React.useMemo(() => {
        const map: Record<ConnectionStatus, string> = {
            connected: t('hatchling.connected'),
            connecting: t('hatchling.connecting'),
            disconnected: t('hatchling.disconnected'),
            error: t('hatchling.error'),
        };
        return map[status];
    }, [status]);

    if (!openclawToken) {
        return <View style={styles.container}><ConfigPrompt /></View>;
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
        >
            {/* Connection status strip */}
            <View style={styles.statusBar}>
                <StatusDot
                    color={statusColor}
                    isPulsing={status === 'connecting'}
                    size={6}
                />
                <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>

            {/* Message list */}
            {messages.length === 0 ? (
                <EmptyState />
            ) : (
                <FlatList<ChatMessage>
                    ref={listRef}
                    data={messages}
                    inverted
                    keyExtractor={keyExtractor}
                    renderItem={renderMessage}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContent}
                    maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
                />
            )}

            {/* Input bar */}
            <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
                <TextInput
                    style={[styles.textInput, { color: theme.colors.text }]}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder={t('hatchling.placeholder')}
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline
                    returnKeyType="default"
                    onSubmitEditing={Platform.OS === 'ios' ? undefined : handleSend}
                />
                {isStreaming ? (
                    <Pressable style={styles.sendButton} onPress={abort} hitSlop={8}>
                        <Ionicons name="stop-circle" size={30} color={theme.colors.status.error} />
                    </Pressable>
                ) : (
                    <Pressable
                        style={styles.sendButton}
                        onPress={handleSend}
                        disabled={!canSend}
                        hitSlop={8}
                    >
                        <Ionicons
                            name="send"
                            size={22}
                            color={canSend ? theme.colors.textLink : theme.colors.textSecondary}
                        />
                    </Pressable>
                )}
            </View>
        </KeyboardAvoidingView>
    );
});
