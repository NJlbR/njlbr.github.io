import { useState, useRef } from 'react';
import { X, Upload, Trash2, Send, Image as ImageIcon, Music, Video, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';

interface MediaFile {
  file: File;
  type: 'photo' | 'audio' | 'video' | 'file';
  preview?: string;
}

interface ChannelPostModalProps {
  channelId: string;
  channelName: string;
  onClose: () => void;
  onPostCreated: (post?: ChannelPostPayload) => void;
}

type ChannelPostPayload = Database['public']['Tables']['channel_posts']['Row'] & {
  user_profiles?: {
    username: string;
    avatar_url?: string;
  };
  channel_post_likes?: { user_id: string }[];
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  photo: 'Фото',
  audio: 'Аудио',
  video: 'Видео',
  file: 'Файл',
};

const MEDIA_TYPES = ['photo', 'audio', 'video', 'file'] as const;

export function ChannelPostModal({ channelId, channelName, onClose, onPostCreated }: ChannelPostModalProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'photo' | 'audio' | 'video' | 'file'>('photo');

  const handleFileSelect = (type: 'photo' | 'audio' | 'video' | 'file', file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      setError('Файл слишком большой (максимум 100 МБ)');
      return;
    }
    setError('');

    if (type === 'photo') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setMediaFiles((prev) => [...prev, { file, type, preview: e.target?.result as string }]);
      };
      reader.readAsDataURL(file);
    } else {
      setMediaFiles((prev) => [...prev, { file, type }]);
    }
  };

  const removeMediaFile = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getAccept = (type: 'photo' | 'audio' | 'video' | 'file') => {
    switch (type) {
      case 'photo': return 'image/*';
      case 'audio': return 'audio/*';
      case 'video': return 'video/*';
      default: return '*/*';
    }
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'photo': return <ImageIcon size={24} className="text-gray-400" />;
      case 'audio': return <Music size={24} className="text-gray-400" />;
      case 'video': return <Video size={24} className="text-gray-400" />;
      default: return <FileText size={24} className="text-gray-400" />;
    }
  };

  async function uploadFile(file: File, type: string): Promise<string> {
    const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `channel-posts/${channelId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!content.trim() && mediaFiles.length === 0) {
      setError('Добавьте текст или медиафайл');
      return;
    }

    if (!user) return;

    setSending(true);

    try {
      const uploadedUrls: { type: string; url: string; filename: string }[] = [];

      for (const mf of mediaFiles) {
        const url = await uploadFile(mf.file, mf.type);
        uploadedUrls.push({ type: mf.type, url, filename: mf.file.name });
      }

      const { data: insertedPost, error: insertError } = await supabase
        .from('channel_posts')
        .insert({
          channel_id: channelId,
          author_id: user.id,
          content: content.trim() || null,
          media_urls: uploadedUrls.length > 0 ? uploadedUrls : null,
        })
        .select(
          `
          *,
          user_profiles!channel_posts_author_id_fkey (
            username,
            avatar_url
          ),
          channel_post_likes (
            user_id
          )
        `
        )
        .maybeSingle();

      if (insertError) throw insertError;

      if (insertedPost) {
        onPostCreated(insertedPost as ChannelPostPayload);
      } else {
        onPostCreated();
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка при публикации поста');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Новый пост
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {channelName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Текст поста
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              maxLength={10000}
              placeholder="Напишите текст поста..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
              {content.length}/10000
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Добавить медиафайлы
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {MEDIA_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedMediaType(type);
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = getAccept(type);
                      fileInputRef.current.click();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm font-medium"
                >
                  {getMediaIcon(type)}
                  {CONTENT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(selectedMediaType, file);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />

            {mediaFiles.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Прикреплённые файлы:
                </p>
                {mediaFiles.map((mf, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/60 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    {mf.preview ? (
                      <img
                        src={mf.preview}
                        alt="preview"
                        className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                        {getMediaIcon(mf.type)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {CONTENT_TYPE_LABELS[mf.type]}: {mf.file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(mf.file.size / 1024 / 1024).toFixed(2)} МБ
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMediaFile(idx)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={sending || (!content.trim() && mediaFiles.length === 0)}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors font-medium disabled:cursor-not-allowed"
            >
              <Send size={18} />
              {sending ? 'Публикация...' : 'Опубликовать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

