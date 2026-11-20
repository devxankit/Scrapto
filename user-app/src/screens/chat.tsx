import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Linking, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MessageCircle, Phone, SendHorizontal } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, Avatar, Card, EmptyState, ErrorBox, IconButton, KeyboardSafe, Loading, Screen } from '../components/ui';
import { colors, radius } from '../theme';
import { api } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { images } from '../data/catalog';
import { ago, timeLabel } from '../utils/format';
import { Alert } from '../i18n/Alert';
import { txInfo } from '../i18n/auto';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

export function ChatsScreen({ navigation }: P<'Chats'>) {
  const q = useQuery<{ chats: any[] }>('/chats');
  const list = q.data?.chats ?? [];
  return (
    <Screen>
      <AppBar title="Chats" />
      <FlatList
        data={list}
        keyExtractor={(c) => c._id}
        contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={q.loading ? <Loading /> : <EmptyState icon={<MessageCircle size={30} color={colors.primary} />} title="No chats yet" text="Once a collector accepts your pickup, you can message them here." />}
        renderItem={({ item }) => {
          const last = item.messages?.length ? item.messages[item.messages.length - 1] : (item.lastMessage ? { text: item.lastMessage } : null);
          return (
            <Card onPress={() => navigation.navigate('ChatThread', { chatId: item._id, orderId: item.order, name: item.participant?.name })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar source={images.avatarPartner} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T size={15} w="bold">{item.participant?.name}</T>
                  <T size={12} color={colors.faint}>{ago(item.updatedAt)}</T>
                </View>
                <T size={12} color={colors.muted} raw>{`Pickup #${item.orderNo}`}</T>
                <T size={13} color={item.unread ? colors.ink : colors.ink2} w={item.unread ? 'bold' : 'regular'} numberOfLines={1}>{last?.text}</T>
              </View>
              {item.unread ? <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><T size={11} w="extrabold" color={colors.white} raw>{String(item.unread)}</T></View> : null}
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const QUICK = ['Where are you?', 'Please call me when you reach', 'Items are ready', 'I will be home in 10 min'];

export function ChatThreadScreen({ route }: P<'ChatThread'>) {
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const open = async () => {
    try {
      if (route.params.orderId) {
        const r = await api(`/chats/order/${route.params.orderId}`);
        setChat(r.data.chat);
      }
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  };
  useEffect(() => {
    open();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const msgs = useQuery<{ messages: any[] }>(chat ? `/chats/${chat._id}/messages` : null, undefined, { poll: 2500 });
  const list = msgs.data?.messages ?? chat?.messages ?? [];
  useEffect(() => {
    if (chat) api(`/chats/${chat._id}/read`, { method: 'PUT' }).catch(() => {});
  }, [chat, list.length]);

  const send = async (body: string) => {
    const m = body.trim();
    if (!m || !chat) return;
    setSending(true);
    setText('');
    try {
      await api(`/chats/${chat._id}/messages`, { method: 'POST', body: { message: m } });
      msgs.reload();
    } catch (e: any) {
      setText(m);
      Alert.alert('Message not sent', e.message);
    } finally {
      setSending(false);
    }
  };

  const name = route.params.name ?? chat?.participant?.name ?? 'Collector';
  return (
    <Screen>
      <AppBar
        title={name}
        subtitle={chat ? `Pickup #${chat.orderNo}` : 'Chat'}
        right={chat?.participant?.phone ? (
          <IconButton label="Call" tone="primary" onPress={() => Linking.openURL(`tel:${chat.participant.phone}`)}>
            <Phone size={19} color={colors.white} />
          </IconButton>
        ) : undefined}
      />
      {err ? <ErrorBox text={err} onRetry={open} /> : null}
      <KeyboardSafe>
        <FlatList
          ref={listRef}
          data={[...list].reverse()}
          inverted
          keyExtractor={(m) => m._id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item }) => {
            const mine = item.from === 'me';
            const tr = mine ? { text: item.text, translated: false } : txInfo(item.text);
            return (
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 4 }}>
                <View style={{ backgroundColor: mine ? colors.primary : colors.white, borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingHorizontal: 14, paddingVertical: 10, borderWidth: mine ? 0 : 1, borderColor: colors.line }}>
                  <T size={14} color={mine ? colors.white : colors.ink} lh={20} raw>{tr.text}</T>
                </View>
                <T size={11} color={colors.faint} style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }} raw>{`${timeLabel(item.createdAt)}${tr.translated ? ' · translated' : ''}`}</T>
              </View>
            );
          }}
        />
        <View style={{ backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 4, gap: 10 }}>
          <FlatList horizontal data={QUICK} keyExtractor={(q) => q} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }} renderItem={({ item }) => (
            <Pressable onPress={() => send(item)} style={{ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.green200, backgroundColor: colors.green50, justifyContent: 'center' }}>
              <T size={12} w="semibold" color={colors.deep}>{item}</T>
            </Pressable>
          )} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16 }}>
            <TextInput value={text} onChangeText={setText} placeholder="Type a message" placeholderTextColor={colors.faint} multiline style={{ flex: 1, maxHeight: 110, minHeight: 46, backgroundColor: colors.bg, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: 'PlusJakartaSans-Medium', fontSize: 15, color: colors.ink }} />
            <IconButton label="Send" tone="primary" size={46} onPress={() => send(text)}>
              <SendHorizontal size={20} color={colors.white} />
            </IconButton>
          </View>
        </View>
      </KeyboardSafe>
    </Screen>
  );
}
