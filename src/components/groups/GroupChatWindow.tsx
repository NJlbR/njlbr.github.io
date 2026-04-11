import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, Paperclip, X, Image as ImageIcon, Music, Video, FileText, Info, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { GroupMessageBubble } from './GroupMessageBubble';
import type { Database } from '../../lib/database.types';

type GroupMessage = Database['public']['Tables']['group_messages']['Row'] & {
  user_profiles?: {
    username: string;
    is_admin: boolean;
  };
};

interface GroupChatWindowProps {
  groupId: string;
  onBack: () => void;
  onShowInfo: () => void;
}

interface MediaFile {
  file: File;
  type: 'photo' | 'audio' | 'video' | 'file';
  preview?: string;
}

export function GroupChatWindow({ groupId, onBack, onShowInfo }: GroupChatWindowProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [groupData, setGroupData] = useState<any>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const viewedMessageIdsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (groupId && user) {
      fetchGroup();
      fetchMessages();
      const cleanup = subscribeToMessages();
      return cleanup;
    }
  }, [groupId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function fetchGroup() {
    const { data } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle();

    if (data) {
      setGroupData(data);
    }

    if (user) {
      const isCreator = data?.created_by === user.id;

      if (isCreator) {
        await supabase.rpc('ensure_group_creator_membership_for_group' as any, {
          target_group_id: groupId,
          creator_id: user.id,
        });
      }

      const { data: memberData } = await supabase
        .from('group_members')
        .select('is_admin, is_moderator')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberData) {
        setCanModerate(isCreator || memberData.is_admin || memberData.is_moderator);
      }
    }
  }

  async function fetchMessages() {
    setLoading(true);

    const { data } = await supabase
      .from('group_messages')
      .select(`
        *,
        user_profiles (
          username,
          is_admin
        )
      `)
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages((prev) => {
        const prevViews = new Map(prev.map((message) => [message.id, message.view_count]));
        return (data as any).map((message: any) => {
          const existingView = prevViews.get(message.id);
          return {
            ...message,
            view_count: typeof message.view_count === 'number'
              ? message.view_count
              : typeof existingView === 'number'
                ? existingView
                : message.view_count,
          };
        });
      });
      await incrementViews(data as any);
    }

    setLoading(false);
  }

  async function incrementViews(data: GroupMessage[]) {
    const updates = new Map<string, number>();

    for (const message of data) {
      if (viewedMessageIdsRef.current.has(message.id)) continue;
      viewedMessageIdsRef.current.add(message.id);

      const { data: viewData, error: viewError } = await supabase.rpc('increment_group_message_views', {
        message_id_param: message.id,
      } as any);

      if (!viewError) {
        const rawViewCount = (viewData as any)?.view_count;
        const viewCount = typeof rawViewCount === 'number'
          ? rawViewCount
          : typeof rawViewCount === 'string'
            ? Number(rawViewCount)
            : null;

        if (typeof viewCount === 'number' && !Number.isNaN(viewCount)) {
          updates.set(message.id, viewCount);
          continue;
        }
      }

      const { count } = await supabase
        .from('group_message_views')
        .select('id', { count: 'exact', head: true })
        .eq('message_id', message.id);

      if (typeof count === 'number') {
        updates.set(message.id, count);
      }
    }

    if (updates.size > 0) {
      setMessages((prev) =>
        prev.map((message) =>
          updates.has(message.id)
            ? { ...message, view_count: updates.get(message.id) as number }
            : message
        )
      );
    }
  }

  function subscribeToMessages() {
    const channel = supabase
      .channel(`group-messages-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const newMsg = payload.new as GroupMessage;

          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('username, is_admin')
            .eq('id', newMsg.sender_id)
            .maybeSingle();

          const { data: viewData, error: viewError } = await supabase.rpc('increment_group_message_views', {
            message_id_param: newMsg.id,
          } as any);

          if (!viewedMessageIdsRef.current.has(newMsg.id)) {
            viewedMessageIdsRef.current.add(newMsg.id);
          }

          let viewCount: number | null = null;

          if (!viewError) {
            const rawViewCount = (viewData as any)?.view_count;
            viewCount = typeof rawViewCount === 'number'
              ? rawViewCount
              : typeof rawViewCount === 'string'
                ? Number(rawViewCount)
                : null;
          }

          if (viewCount === null || Number.isNaN(viewCount)) {
            const { count } = await supabase
              .from('group_message_views')
              .select('id', { count: 'exact', head: true })
              .eq('message_id', newMsg.id);

            if (typeof count === 'number') {
              viewCount = count;
            }
          }

          setMessages((prev) => [
            ...prev,
            {
              ...newMsg,
              view_count: typeof viewCount === 'number' ? viewCount : newMsg.view_count,
              user_profiles: profileData || undefined,
            },
          ]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter(m => m.id !== (payload.old as any).id));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const updatedMsg = payload.new as GroupMessage;

          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('username, is_admin')
            .eq('id', updatedMsg.sender_id)
            .maybeSingle();

          setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? { ...updatedMsg, user_profiles: profileData || undefined } : m));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      let type: 'photo' | 'audio' | 'video' | 'file' = 'file';

      if (file.type.startsWith('image/')) {
        type = 'photo';
        const reader = new FileReader();
        reader.onload = (e) => {
          setMediaFiles((prev) => [...prev, { file, type, preview: e.target?.result as string }]);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('audio/')) {
        type = 'audio';
        setMediaFiles((prev) => [...prev, { file, type }]);
      } else if (file.type.startsWith('video/')) {
        type = 'video';
        setMediaFiles((prev) => [...prev, { file, type }]);
      } else {
        setMediaFiles((prev) => [...prev, { file, type }]);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeMediaFile = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
  };

  async function uploadFile(file: File, type: string): Promise<string> {
    const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${type}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('media-files')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();

    const trimmedMessage = newMessage.trim();

    if (!user || (!trimmedMessage && mediaFiles.length === 0)) return;

    setSending(true);

    try {
      const mediaUrls: any[] = [];

      for (const mediaFile of mediaFiles) {
        const url = await uploadFile(mediaFile.file, mediaFile.type);
        mediaUrls.push({
          type: mediaFile.type,
          url,
          filename: mediaFile.file.name,
        });
      }

      const { error } = await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: user.id,
          content: trimmedMessage || null,
          media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        });

      if (error) throw error;

      await supabase
        .from('groups')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', groupId);

      setNewMessage('');
      setMediaFiles([]);
    } catch (err: any) {
      alert('Ошибка отправки: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'photo':
        return <ImageIcon size={20} />;
      case 'audio':
        return <Music size={20} />;
      case 'video':
        return <Video size={20} />;
      default:
        return <FileText size={20} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={onBack}
          className="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <ArrowLeft size={20} />
        </button>

        {groupData && (
          <>
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white">
              <Users size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                {groupData.name}
              </h3>
            </div>
            <button
              onClick={onShowInfo}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Информация о группе"
            >
              <Info size={20} />
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-center">
            Начните разговор!
          </div>
        ) : (
          messages.map((message) => (
            <GroupMessageBubble
              key={message.id}
              message={message}
              isOwn={message.sender_id === user?.id}
              groupId={groupId}
              canModerate={canModerate}
              onLikeChange={(messageId, liked, likeCount) => {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === messageId ? { ...msg, like_count: likeCount } : msg
                  )
                );
              }}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {mediaFiles.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex gap-2 overflow-x-auto">
            {mediaFiles.map((media, index) => (
              <div key={index} className="relative flex-shrink-0">
                {media.preview ? (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600">
                    <img src={media.preview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                    {getMediaIcon(media.type)}
                  </div>
                )}
                <button
                  onClick={() => removeMediaFile(index)}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept="image/*,audio/*,video/*,*/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Прикрепить файл"
          >
            <Paperclip size={22} />
          </button>

          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder="Написать сообщение..."
            disabled={sending}
            rows={1}
            maxLength={10000}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none disabled:opacity-50"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />

          <button
            type="submit"
            disabled={(!newMessage.trim() && mediaFiles.length === 0) || sending}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            title="Отправить"
          >
            <Send size={22} />
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {newMessage.length}/10000 символов
        </p>
      </form>
    </div>
  );
}


