import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Info, Users, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ChannelPostBubble } from './ChannelPostBubble';
import { ChannelPostModal } from './ChannelPostModal';
import type { Database } from '../../lib/database.types';

type ChannelPost = Database['public']['Tables']['channel_posts']['Row'] & {
  user_profiles?: {
    username: string;
    avatar_url?: string;
  };
  channel_post_likes?: { user_id: string }[];
};

interface ChannelChatWindowProps {
  channelId: string;
  onBack: () => void;
  onShowInfo: () => void;
}

export function ChannelChatWindow({ channelId, onBack, onShowInfo }: ChannelChatWindowProps) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [channelData, setChannelData] = useState<any>(null);
  const [canPost, setCanPost] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const postsEndRef = useRef<HTMLDivElement>(null);
  const viewedPostIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (channelId && user) {
      fetchChannel();
      fetchPosts();
      const cleanup = subscribeToPosts();
      return cleanup;
    }
  }, [channelId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [posts]);

  async function fetchChannel() {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();

    if (data) {
      setChannelData(data);
    }

    if (user) {
      const isCreator = data?.created_by === user.id;

      if (isCreator) {
        setCanPost(true);
        return;
      }

      const { data: adminData } = await supabase
        .from('channel_admins')
        .select('can_post')
        .eq('channel_id', channelId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (adminData?.can_post) {
        setCanPost(true);
      } else {
        setCanPost(false);
      }
    }
  }

  async function fetchPosts() {
    setLoading(true);

    const { data } = await supabase
      .from('channel_posts')
      .select(`
        *,
        user_profiles!channel_posts_author_id_fkey (
          username,
          avatar_url
        ),
        channel_post_likes (
          user_id
        )
      `)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (data) {
      setPosts((prev) => {
        const prevViews = new Map(prev.map((post) => [post.id, (post as any).view_count]));
        return (data as any).map((post: any) => {
          const existingView = prevViews.get(post.id);
          return {
            ...post,
            view_count: typeof post.view_count === 'number'
              ? post.view_count
              : typeof existingView === 'number'
                ? existingView
                : post.view_count,
          };
        });
      });
      await incrementViews(data as any);
    }

    setLoading(false);
  }

  async function incrementViews(data: ChannelPost[]) {
    const updates = new Map<string, number>();

    for (const post of data) {
      if (viewedPostIdsRef.current.has(post.id)) continue;
      viewedPostIdsRef.current.add(post.id);

      const { data: viewData, error: viewError } = await supabase.rpc('increment_channel_post_views', {
        post_id_param: post.id,
      });

      if (!viewError) {
        const rawViewCount = (viewData as any)?.view_count;
        const viewCount = typeof rawViewCount === 'number'
          ? rawViewCount
          : typeof rawViewCount === 'string'
            ? Number(rawViewCount)
            : null;

        if (typeof viewCount === 'number' && !Number.isNaN(viewCount)) {
          updates.set(post.id, viewCount);
          continue;
        }
      }

      const { count } = await supabase
        .from('channel_post_views')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', post.id);

      if (typeof count === 'number') {
        updates.set(post.id, count);
      } else if (typeof (post as any).view_count === 'number') {
        updates.set(post.id, (post as any).view_count + 1);
      } else {
        updates.set(post.id, 1);
      }
    }

    if (updates.size > 0) {
      setPosts((prev) =>
        prev.map((post) =>
          updates.has(post.id)
            ? { ...post, view_count: updates.get(post.id) as number }
            : post
        )
      );
    }
  }

  function subscribeToPosts() {
    const channel = supabase
      .channel(`channel_posts:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_posts',
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  function scrollToBottom() {
    postsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }


  async function handleLikePost(postId: string) {
    if (!user) {
      alert('Войдите, чтобы ставить лайки');
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        'toggle_channel_post_like',
        {
          post_id_param: postId,
          user_id_param: user?.id,
        }
      );

      if (error) throw error;

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                like_count: data.like_count,
                channel_post_likes: data.liked
                  ? [...(post.channel_post_likes || []), { user_id: user?.id }]
                  : (post.channel_post_likes || []).filter(
                      (like: any) => like.user_id !== user?.id
                    ),
              }
            : post
        )
      );
    } catch (err: any) {
      alert(err.message || 'Не удалось поставить лайк');
    }
  }

  async function handleDeletePost(postId: string) {
    if (!confirm('Удалить пост?')) return;

    try {
      const { data, error } = await supabase.rpc('delete_channel_post', {
        post_id: postId,
        deleter_user_id: user?.id,
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err: any) {
      alert(err.message || 'Ошибка при удалении поста');
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Загрузка...</p>
      </div>
    );
  }

  const isUserChannelCreator = channelData?.created_by === user?.id;
  const userLikedPost = (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    return post?.channel_post_likes?.some((like: any) => like.user_id === user?.id);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              {channelData?.name}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              @{channelData?.username}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canPost && (
            <button
              onClick={() => setShowPostModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Plus size={16} />
              Новый пост
            </button>
          )}
          <button
            onClick={onShowInfo}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Info size={24} />
          </button>
        </div>
      </div>

      {/* Posts */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Users size={48} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">Нет постов</p>
            {canPost && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Напишите первый пост в этом канале
              </p>
            )}
          </div>
        ) : (
          posts.map((post) => (
            <ChannelPostBubble
              key={post.id}
              post={post}
              isAuthor={post.author_id === user?.id}
              canDelete={isUserChannelCreator || post.author_id === user?.id}
              isLiked={userLikedPost(post.id)}
              onLike={() => handleLikePost(post.id)}
              onDelete={() => handleDeletePost(post.id)}
            />
          ))
        )}
        <div ref={postsEndRef} />
      </div>

      {showPostModal && channelData && (
        <ChannelPostModal
          channelId={channelId}
          channelName={channelData.name}
          onClose={() => setShowPostModal(false)}
          onPostCreated={(newPost) => {
            setShowPostModal(false);
            if (newPost) {
              setPosts((prev) => {
                if (prev.some((post) => post.id === newPost.id)) {
                  return prev;
                }
                return [...prev, newPost];
              });
              return;
            }
            fetchPosts();
          }}
        />
      )}
    </div>
  );
}
