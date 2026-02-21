import * as React from 'react';
import { randomUUID } from 'expo-crypto';
import { MMKV } from 'react-native-mmkv';
import { useLocalSetting } from '@/sync/storage';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    isStreaming?: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const mmkv = new MMKV({ id: 'hatchling-chat' });
const MESSAGES_KEY = 'messages-v1';
const MAX_PERSISTED = 200;

function loadPersistedMessages(): ChatMessage[] {
    try {
        const raw = mmkv.getString(MESSAGES_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as ChatMessage[];
    } catch {
        return [];
    }
}

function persistMessages(msgs: ChatMessage[]) {
    try {
        // Keep newest MAX_PERSISTED (list is newest-first)
        const toSave = msgs.filter((m) => !m.isStreaming).slice(0, MAX_PERSISTED);
        mmkv.set(MESSAGES_KEY, JSON.stringify(toSave));
    } catch {
        // ignore storage errors
    }
}

/** Merge two newest-first message arrays, deduplicating by timestamp+role+content. */
function mergeMessages(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
    const seen = new Set<string>();
    const result: ChatMessage[] = [];
    for (const m of [...a, ...b]) {
        const key = `${m.role}|${m.timestamp}|${m.content.slice(0, 40)}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(m);
        }
    }
    // Sort newest-first
    result.sort((x, y) => y.timestamp - x.timestamp);
    return result;
}

export function useOpenClawChat() {
    const openclawToken = useLocalSetting('openclawToken');
    const openclawUrl = useLocalSetting('openclawUrl');

    const [messages, setMessages] = React.useState<ChatMessage[]>(() => loadPersistedMessages());
    const [status, setStatus] = React.useState<ConnectionStatus>('disconnected');
    const [isStreaming, setIsStreaming] = React.useState(false);

    const wsRef = React.useRef<WebSocket | null>(null);
    const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentStreamRef = React.useRef<{ id: string; text: string } | null>(null);
    const connectedRef = React.useRef(false);
    const persistTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounced persist so rapid streaming updates don't hammer storage
    const schedulePerist = React.useCallback((msgs: ChatMessage[]) => {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => persistMessages(msgs), 500);
    }, []);

    const setAndPersist = React.useCallback(
        (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
            setMessages((prev) => {
                const next = typeof updater === 'function' ? updater(prev) : updater;
                schedulePerist(next);
                return next;
            });
        },
        [schedulePerist],
    );

    const loadHistory = React.useCallback(() => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
            type: 'req',
            id: randomUUID(),
            method: 'chat.history',
            params: { sessionKey: 'main', limit: 200 },
        }));
    }, []);

    const handleMessage = React.useCallback((data: unknown) => {
        if (typeof data !== 'object' || data === null) return;
        const msg = data as Record<string, unknown>;

        // Successful connect → load history
        if (msg.type === 'res' && msg.ok === true) {
            const payload = msg.payload as Record<string, unknown> | null;
            if (payload && payload.type === 'hello-ok') {
                connectedRef.current = true;
                setStatus('connected');
                loadHistory();
                return;
            }

            // chat.history response — merge with local instead of replacing
            if (payload && Array.isArray(payload.messages)) {
                const raw = payload.messages as Array<Record<string, unknown>>;
                const apiMessages: ChatMessage[] = raw
                    .filter((m) => m.role === 'user' || m.role === 'assistant')
                    .map((m) => {
                        const contentRaw = m.content;
                        let text = '';
                        if (typeof contentRaw === 'string') {
                            text = contentRaw;
                        } else if (Array.isArray(contentRaw)) {
                            text = (contentRaw as Array<Record<string, unknown>>)
                                .filter((c) => c.type === 'text')
                                .map((c) => String(c.text ?? ''))
                                .join('');
                        }
                        return {
                            id: randomUUID(),
                            role: m.role as 'user' | 'assistant',
                            content: text,
                            timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
                        };
                    })
                    .filter((m) => m.content.trim() !== ''); // skip empty messages (e.g. failed runs)

                setAndPersist((local) => mergeMessages(local, apiMessages));
                return;
            }
        }

        // Connect challenge — token-only auth, just ignore the nonce
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
            return;
        }

        // Streaming chat events
        if (msg.type === 'event' && msg.event === 'chat') {
            const payload = msg.payload as Record<string, unknown>;
            const state = payload.state as string;

            if (state === 'delta') {
                const message = payload.message as Record<string, unknown> | undefined;
                const contentArr = message?.content as Array<Record<string, unknown>> | undefined;
                const chunk = contentArr?.find((c) => c.type === 'text')?.text as string ?? '';

                if (!currentStreamRef.current) {
                    const id = randomUUID();
                    currentStreamRef.current = { id, text: chunk };
                    setAndPersist((prev) => [
                        { id, role: 'assistant', content: chunk, timestamp: Date.now(), isStreaming: true },
                        ...prev,
                    ]); // prepend: newest-first for inverted FlatList
                } else {
                    currentStreamRef.current.text = chunk; // each delta contains full text so far (not incremental)
                    const { id, text } = currentStreamRef.current;
                    setAndPersist((prev) =>
                        prev.map((m) => (m.id === id ? { ...m, content: text } : m))
                    );
                }
            } else if (state === 'final') {
                const message = payload.message as Record<string, unknown> | undefined;
                const contentArr = message?.content as Array<Record<string, unknown>> | undefined;
                const finalText = contentArr?.find((c) => c.type === 'text')?.text as string
                    ?? currentStreamRef.current?.text
                    ?? '';

                if (currentStreamRef.current) {
                    const { id } = currentStreamRef.current;
                    setAndPersist((prev) =>
                        prev.map((m) => (m.id === id ? { ...m, content: finalText, isStreaming: false } : m))
                    );
                    currentStreamRef.current = null;
                }
                setIsStreaming(false);
            } else if (state === 'error' || state === 'aborted') {
                if (currentStreamRef.current) {
                    const { id } = currentStreamRef.current;
                    setAndPersist((prev) =>
                        prev.map((m) => (m.id === id ? { ...m, isStreaming: false } : m))
                    );
                    currentStreamRef.current = null;
                }
                setIsStreaming(false);
            }
        }
    }, [loadHistory, setAndPersist]);

    const connect = React.useCallback(() => {
        if (!openclawToken || !openclawUrl) return;
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.close();
            wsRef.current = null;
        }
        connectedRef.current = false;
        setStatus('connecting');

        const ws = new WebSocket(openclawUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({
                type: 'req',
                id: randomUUID(),
                method: 'connect',
                params: {
                    minProtocol: 3,
                    maxProtocol: 3,
                    client: {
                        id: 'cli',
                        version: '0.1.0',
                        platform: 'mobile',
                        mode: 'cli',
                    },
                    role: 'operator',
                    scopes: ['operator.read', 'operator.write'],
                    caps: [],
                    commands: [],
                    permissions: {},
                    auth: { token: openclawToken },
                    locale: 'en-US',
                    userAgent: 'happy-fork/0.1.0',
                },
            }));
        };

        ws.onmessage = (event) => {
            try {
                handleMessage(JSON.parse(event.data as string));
            } catch {
                // ignore malformed frames
            }
        };

        ws.onclose = () => {
            connectedRef.current = false;
            setStatus('disconnected');
            scheduleReconnect();
        };

        ws.onerror = () => {
            setStatus('error');
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openclawToken, openclawUrl]);

    const scheduleReconnect = React.useCallback(() => {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => connect(), 5000);
    }, [connect]);

    const sendMessage = React.useCallback((text: string) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !connectedRef.current) return;

        const userMessage: ChatMessage = {
            id: randomUUID(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
        };
        setAndPersist((prev) => [userMessage, ...prev]); // prepend: newest-first for inverted FlatList
        setIsStreaming(true);

        ws.send(JSON.stringify({
            type: 'req',
            id: randomUUID(),
            method: 'chat.send',
            params: {
                sessionKey: 'main',
                message: text,
                idempotencyKey: randomUUID(),
            },
        }));
    }, [setAndPersist]);

    const abort = React.useCallback(() => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
            type: 'req',
            id: randomUUID(),
            method: 'chat.abort',
            params: { sessionKey: 'main' },
        }));
    }, []);

    // Connect/disconnect lifecycle
    React.useEffect(() => {
        if (openclawToken && openclawUrl) {
            connect();
        } else {
            setStatus('disconnected');
        }
        return () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    // connect changes only when token/url change, which is what we want
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openclawToken, openclawUrl]);

    return { messages, status, isStreaming, sendMessage, abort };
}
