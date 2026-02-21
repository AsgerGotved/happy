import * as React from 'react';
import {
    View,
    FlatList,
    Text,
    Platform,
    ListRenderItemInfo,
    Pressable,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { useLocalSetting } from '@/sync/storage';
import { AgentInput } from './AgentInput';
import { AgentContentView } from './AgentContentView';
import { layout } from './layout';
import { useOpenClawChat, ChatMessage, ConnectionStatus } from '@/hooks/useOpenClawChat';

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    // Message layout — mirrors MessageView
    messageContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    messageContent: {
        flexDirection: 'column',
        flexGrow: 1,
        flexBasis: 0,
        maxWidth: layout.maxWidth,
    },
    // User bubble — mirrors MessageView.userMessageContainer / userMessageBubble
    userMessageContainer: {
        maxWidth: '100%',
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
    },
    userMessageBubble: {
        backgroundColor: theme.colors.userMessageBackground,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 12,
        maxWidth: '100%',
    },
    userMessageText: {
        color: theme.colors.text,
        fontSize: 15,
        lineHeight: 21,
        ...Typography.default(),
    },
    // Assistant message — mirrors MessageView.agentMessageContainer
    agentMessageContainer: {
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 16,
        alignSelf: 'flex-start',
    },
    agentMessageText: {
        color: theme.colors.text,
        fontSize: 15,
        lineHeight: 21,
        ...Typography.default(),
    },
    cursor: {
        opacity: 0.7,
    },
    // Empty / config states
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
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

/** Mirrors MessageView's user + assistant bubble styling */
const MessageBubble = React.memo(({ message }: { message: ChatMessage }) => {
    const isUser = message.role === 'user';
    if (isUser) {
        return (
            <View style={styles.messageContainer} renderToHardwareTextureAndroid={true}>
                <View style={styles.messageContent}>
                    <View style={styles.userMessageContainer}>
                        <View style={styles.userMessageBubble}>
                            <Text style={styles.userMessageText} selectable>
                                {message.content}
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        );
    }
    return (
        <View style={styles.messageContainer} renderToHardwareTextureAndroid={true}>
            <View style={styles.messageContent}>
                <View style={styles.agentMessageContainer}>
                    <Text style={styles.agentMessageText} selectable>
                        {message.content}
                        {message.isStreaming && <Text style={styles.cursor}>▋</Text>}
                    </Text>
                </View>
            </View>
        </View>
    );
});

/** Shown when there are no messages yet */
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

/** Shown when the OpenClaw token is not configured */
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

/** Small spacer at the visual top of the inverted list (equivalent to ChatList's ListFooterComponent) */
const ListTopSpacer = React.memo(() => <View style={{ height: 16 }} />);

const renderMessage = ({ item }: ListRenderItemInfo<ChatMessage>) => <MessageBubble message={item} />;
const keyExtractor = (item: ChatMessage) => item.id;

// --- Main component ---

export const HatchlingChatView = React.memo(() => {
    const { theme } = useUnistyles();
    const openclawToken = useLocalSetting('openclawToken');
    const { messages, status, isStreaming, sendMessage, abort } = useOpenClawChat();
    const [inputText, setInputText] = React.useState('');

    const canSend = inputText.trim().length > 0 && status === 'connected' && !isStreaming;

    const handleSend = React.useCallback(() => {
        const trimmed = inputText.trim();
        if (!trimmed || !canSend) return;
        sendMessage(trimmed);
        setInputText('');
    }, [inputText, canSend, sendMessage]);

    const connectionStatus = React.useMemo(() => {
        const map: Record<ConnectionStatus, { text: string; color: string; dotColor: string; isPulsing: boolean }> = {
            connected: {
                text: t('hatchling.connected'),
                color: theme.colors.status.connected,
                dotColor: theme.colors.status.connected,
                isPulsing: false,
            },
            connecting: {
                text: t('hatchling.connecting'),
                color: theme.colors.status.connecting,
                dotColor: theme.colors.status.connecting,
                isPulsing: true,
            },
            disconnected: {
                text: t('hatchling.disconnected'),
                color: theme.colors.status.disconnected,
                dotColor: theme.colors.status.disconnected,
                isPulsing: false,
            },
            error: {
                text: t('hatchling.error'),
                color: theme.colors.status.error,
                dotColor: theme.colors.status.error,
                isPulsing: false,
            },
        };
        return map[status];
    }, [status, theme]);

    if (!openclawToken) {
        return (
            <View style={styles.container}>
                <AgentContentView content={<ConfigPrompt />} />
            </View>
        );
    }

    const content = messages.length === 0 ? (
        <EmptyState />
    ) : (
        <FlatList<ChatMessage>
            data={messages}
            inverted
            keyExtractor={keyExtractor}
            renderItem={renderMessage}
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            ListFooterComponent={<ListTopSpacer />}
        />
    );

    const input = (
        <AgentInput
            placeholder={t('hatchling.placeholder')}
            value={inputText}
            onChangeText={setInputText}
            onSend={handleSend}
            isSendDisabled={!canSend}
            showAbortButton={isStreaming}
            onAbort={abort}
            connectionStatus={connectionStatus}
            autocompletePrefixes={[]}
            autocompleteSuggestions={() => Promise.resolve([])}
        />
    );

    return (
        <View style={styles.container}>
            <AgentContentView content={content} input={input} />
        </View>
    );
});
