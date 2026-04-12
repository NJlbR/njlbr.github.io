import { useState, useMemo, memo, useEffect, useRef } from 'react';
import { Calendar, Hash, User, ChevronDown, ChevronUp, FileText, Image as ImageIcon, Eye, Heart } from 'lucide-react';
import { AnnotationPopup } from './AnnotationPopup';
import { MediaContent } from './MediaContent';
import { CommentsSection } from './CommentsSection';
import { detectAnnotations, AnnotationMatch } from '../utils/annotationDetection';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Post = Database['public']['Tables']['posts']['Row'];

interface PostWithRelations extends Post {
  hashtags?: { name: string }[];
  persons?: { name: string }[];
  post_annotations?: any[];
}

interface PostCardProps {
  post: PostWithRelations;
  allAnnotations?: { id: string; term: string }[];
}

function PostCardContent({ post, allAnnotations = [] }: PostCardProps) {
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const hasCountedViewRef = useRef(false);

  useEffect(() => {
    incrementAndFetchStats();
    fetchCurrentUser();
  }, [post.id]);

  async function incrementAndFetchStats() {
    try {
      if (!hasCountedViewRef.current) {
        hasCountedViewRef.current = true;
        const { error } = await supabase.rpc('increment_post_views', { post_id_param: post.id } as any);
        if (error) console.error('Error incrementing views:', error);
      }

      const { data: stats } = await supabase.rpc('get_post_stats', { post_id_param: post.id } as any);
      if (stats) {
        setViewCount(stats.view_count || 0);
        setLikeCount(stats.like_count || 0);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: like } = await supabase
          .from('post_likes')
          .select('id')
          .eq('post_id', post.id)
          .eq('user_id', user.id)
          .maybeSingle();

        setIsLiked(!!like);
      }
    } catch (err) {
      console.error('Error fetching post stats:', err);
    }
  }

  async function fetchPostStats() {
    try {
      const { data: stats } = await supabase.rpc('get_post_stats', { post_id_param: post.id } as any);
      if (stats) {
        setViewCount(stats.view_count || 0);
        setLikeCount(stats.like_count || 0);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: like } = await supabase
          .from('post_likes')
          .select('id')
          .eq('post_id', post.id)
          .eq('user_id', user.id)
          .maybeSingle();

        setIsLiked(!!like);
      }
    } catch (err) {
      console.error('Error fetching post stats:', err);
    }
  }

  async function fetchCurrentUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('approval_status')
          .eq('id', user.id)
          .maybeSingle();

        setIsApproved(profile?.approval_status === 'approved');
      }
    } catch (err) {
      console.error('Error fetching user:', err);
    }
  }

  async function handleLike() {
    if (!currentUser) return;
    if (!isApproved) {
      alert('Только одобренные пользователи могут ставить лайки');
      return;
    }

    setIsLiking(true);
    try {
      const { data } = await supabase.rpc('toggle_post_like', {
        post_id_param: post.id,
        user_id_param: currentUser.id,
      } as any);

      if (data) {
        setIsLiked(data.liked);
        setLikeCount(data.like_count || 0);
      }
    } catch (err: any) {
      console.error('Error toggling like:', err);
      alert('Ошибка при обновлении лайка');
    } finally {
      setIsLiking(false);
    }
  }

  const contentTypes = post.content_types || [post.content_type];
  const mediaUrls = post.media_urls ? (typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : post.media_urls) : [];

  const annotatedTitle = useMemo(() => {
    if (!post.title) return [];
    const matches = detectAnnotations(post.title, allAnnotations);
    return renderAnnotatedText(post.title, matches, setSelectedAnnotationId, 'annotation-highlight bg-yellow-200 dark:bg-yellow-600 hover:bg-yellow-300 dark:hover:bg-yellow-500 cursor-pointer rounded px-1 transition-colors');
  }, [post.title, allAnnotations]);

  const annotatedContent = useMemo(() => {
    if (!contentTypes.includes('text') || !post.content) return [];
    const matches = detectAnnotations(post.content, allAnnotations);
    return renderAnnotatedText(post.content, matches, setSelectedAnnotationId, 'annotation-highlight bg-yellow-200 dark:bg-yellow-600 hover:bg-yellow-300 dark:hover:bg-yellow-500 cursor-pointer rounded px-1 transition-colors');
  }, [post.content, allAnnotations, contentTypes]);

  const annotatedDescription = useMemo(() => {
    if (!post.description) return [];
    const matches = detectAnnotations(post.description, allAnnotations);
    return renderAnnotatedText(post.description, matches, setSelectedAnnotationId, 'annotation-highlight bg-yellow-200 dark:bg-yellow-600 hover:bg-yellow-300 dark:hover:bg-yellow-500 cursor-pointer rounded px-1 transition-colors');
  }, [post.description, allAnnotations]);

  function renderAnnotatedText(
    text: string,
    matches: AnnotationMatch[],
    onSelectAnnotation: (id: string) => void,
    highlightClassName: string
  ): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      if (lastIndex < match.start) {
        parts.push(text.slice(lastIndex, match.start));
      }

      const annotatedText = text.slice(match.start, match.end);
      parts.push(
        <button
          key={`annotation-${idx}`}
          onClick={() => onSelectAnnotation(match.annotationId)}
          className={highlightClassName}
        >
          {annotatedText}
        </button>
      );

      lastIndex = match.end;
    });

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 mb-4 sm:mb-6 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mr-3">
          {annotatedTitle.length > 0 ? annotatedTitle : post.title}
        </h2>
        <div className="flex gap-2 flex-shrink-0">
          {contentTypes.map(type => {
            switch (type) {
              case 'text': return <FileText key="text" className="text-blue-500" size={20} />;
              case 'photo': return <ImageIcon key="photo" className="text-green-500" size={20} />;
              default: return null;
            }
          }).filter(Boolean)}
        </div>
      </div>

      {contentTypes.includes('text') && post.content && (
        <div className="prose dark:prose-invert max-w-none mb-4">
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {annotatedContent}
          </p>
        </div>
      )}

      {mediaUrls.length > 0 && (
        <div className="mb-4">
          <MediaContent mediaUrls={mediaUrls} />
        </div>
      )}

      {post.has_description && post.description && (
        <div className="mt-4">
          <button
            onClick={() => setShowDescription(!showDescription)}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-2"
          >
            {showDescription ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            <span className="font-medium">Описание</span>
          </button>

          {showDescription && (
            <div className="prose dark:prose-invert max-w-none mt-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {annotatedDescription}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-4">
        <div className="flex items-center gap-1">
          <Calendar size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
          <span>{new Date(post.created_at).toLocaleDateString('ru-RU')}</span>
        </div>

        <div className="flex items-center gap-1">
          <Eye size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
          <span>{viewCount}</span>
        </div>

        <button
          onClick={handleLike}
          disabled={!currentUser || !isApproved || isLiking}
          className={`flex items-center gap-1 transition-colors ${
            isLiked
              ? 'text-red-500 dark:text-red-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400'
          } ${(!currentUser || !isApproved) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title={currentUser ? (isApproved ? 'Нажмите, чтобы поставить лайк' : 'Только одобренные пользователи могут ставить лайки') : 'Войдите, чтобы ставить лайки'}
        >
          <Heart size={14} className={`sm:w-4 sm:h-4 flex-shrink-0 ${isLiked ? 'fill-current' : ''}`} />
          <span>{likeCount}</span>
        </button>

        {post.hashtags && post.hashtags.length > 0 && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Hash size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
            {post.hashtags.map((tag, idx) => (
              <span
                key={idx}
                className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 sm:py-1 rounded-full text-xs"
              >
                #
                {(() => {
                  const matches = detectAnnotations(tag.name, allAnnotations);
                  if (matches.length === 0) return tag.name;
                  return renderAnnotatedText(
                    tag.name,
                    matches,
                    setSelectedAnnotationId,
                    'annotation-highlight bg-yellow-200 dark:bg-yellow-600 hover:bg-yellow-300 dark:hover:bg-yellow-500 cursor-pointer rounded px-0.5 transition-colors'
                  );
                })()}
              </span>
            ))}
          </div>
        )}

        {post.persons && post.persons.length > 0 && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <User size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
            {post.persons.map((person, idx) => (
              <span
                key={idx}
                className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 sm:py-1 rounded-full text-xs"
              >
                {(() => {
                  const matches = detectAnnotations(person.name, allAnnotations);
                  if (matches.length === 0) return person.name;
                  return renderAnnotatedText(
                    person.name,
                    matches,
                    setSelectedAnnotationId,
                    'annotation-highlight bg-yellow-200 dark:bg-yellow-600 hover:bg-yellow-300 dark:hover:bg-yellow-500 cursor-pointer rounded px-0.5 transition-colors'
                  );
                })()}
              </span>
            ))}
          </div>
        )}
      </div>

      {post.allow_comments && (
        <CommentsSection postId={post.id} />
      )}

      {selectedAnnotationId && (
        <AnnotationPopup
          annotationId={selectedAnnotationId}
          onClose={() => setSelectedAnnotationId(null)}
        />
      )}
    </div>
  );
}

export const PostCard = memo(PostCardContent);
