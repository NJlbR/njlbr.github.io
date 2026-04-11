import { useState, useEffect } from 'react';
import { Heart, Trash2, Eye } from 'lucide-react';
import { MediaContent } from '../MediaContent';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';

type GroupMessage = Database['public']['Tables']['group_messages']['Row'] & {
  user_profiles?: {
    username: string;
    is_admin: boolean;
  };
};

interface GroupMessageBubbleProps {
  message: GroupMessage;
  isOwn: boolean;
  groupId: string;
  canModerate?: boolean;
  onDelete?: () => void;
  onLikeChange?: (messageId: string, liked: boolean, likeCount: number) => void;
}

export function GroupMessageBubble({ message, isOwn, groupId, canModerate, onDelete, onLikeChange }: GroupMessageBubbleProps) {
  const { user } = useAuth();
  const [likeCount, setLikeCount] = useState(message.like_count || 0);
  const [viewCount, setViewCount] = useState(message.view_count || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      checkIfLiked();
    }
  }, [user, message.id]);

  useEffect(() => {
    setViewCount(message.view_count || 0);
  }, [message.view_count]);

  useEffect(() => {
    setLikeCount(message.like_count || 0);
  }, [message.like_count]);

  async function checkIfLiked() {
    if (!user) return;

    const { data } = await supabase
      .from('group_message_likes')
      .select('id')
      .eq('message_id', message.id)
      .eq('user_id', user.id)
      .maybeSingle();

    setIsLiked(!!data);
  }

  async function handleLike() {
    if (!user || isLiking) return;

    setIsLiking(true);

    try {
      const { data, error } = await supabase.rpc('toggle_group_message_like', {
        target_message_id: message.id,
        user_id_param: user.id,
      } as any);

      if (error) throw error;

      if (data) {
        setIsLiked(data.liked);
        setLikeCount(data.like_count || 0);
        onLikeChange?.(message.id, data.liked, data.like_count || 0);
      }
    } catch (err: any) {
      console.error('Error toggling like:', err);
    } finally {
      setIsLiking(false);
    }
  }

  async function handleDelete() {
    if (!user || isDeleting) return;
    if (!isOwn && !canModerate) return;
    if (!confirm('Удалить это сообщение?')) return;

    setIsDeleting(true);

    try {
      const { data, error } = await supabase.rpc('delete_group_message', {
        message_id: message.id,
        deleter_user_id: user.id,
      } as any);

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        alert(result.error || 'Ошибка удаления сообщения');
        setIsDeleting(false);
        return;
      }

      if (onDelete) {
        onDelete();
      }
    } catch (err: any) {
      console.error('Error deleting message:', err);
      alert('Ошибка удаления сообщения');
      setIsDeleting(false);
    }
  }
  let mediaUrls: any[] = [];

  if (message.media_urls) {
    if (typeof message.media_urls === 'string') {
      try {
        mediaUrls = JSON.parse(message.media_urls);
      } catch (e) {
        console.error('Failed to parse media_urls:', e);
        mediaUrls = [];
      }
    } else if (Array.isArray(message.media_urls)) {
      mediaUrls = message.media_urls;
    }
  }

  const hasMedia = mediaUrls.length > 0;

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const showDeleteButton = user && (isOwn || canModerate);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}>
      <div className="max-w-[70%]">
        {!isOwn && message.user_profiles && (
          <div className="flex items-center gap-2 mb-1 ml-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {message.user_profiles.username}
            </span>
            {message.user_profiles.is_admin && (
              <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded">
                admin
              </span>
            )}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-2 relative ${
            isOwn
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm'
          }`}
        >
          {hasMedia && (
            <div className="mb-2">
              <MediaContent mediaUrls={mediaUrls} />
            </div>
          )}

          {message.content && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.content}
            </p>
          )}

          <div className={`flex items-center justify-between gap-2 mt-1 text-xs ${isOwn ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Eye size={12} className="sm:w-[14px] sm:h-[14px]" />
                <span>{viewCount}</span>
              </div>
              {user && (
                <button
                  onClick={handleLike}
                  disabled={isLiking}
                  className={`flex items-center gap-1 transition-colors ${
                    isLiked
                      ? isOwn
                        ? 'text-red-200'
                        : 'text-red-500 dark:text-red-400'
                      : isOwn
                        ? 'text-blue-100 hover:text-red-200'
                        : 'text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400'
                  } disabled:opacity-50`}
                  title={isLiked ? 'Убрать лайк' : 'Поставить лайк'}
                >
                  <Heart size={12} className={`sm:w-[14px] sm:h-[14px] ${isLiked ? 'fill-current' : ''}`} />
                  <span>{likeCount}</span>
                </button>
              )}
            </div>

            <span>{formatTime(message.created_at)}</span>
          </div>

          {showDeleteButton && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className={`absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 ${
                isDeleting ? 'cursor-not-allowed' : ''
              }`}
              title="Удалить сообщение"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

