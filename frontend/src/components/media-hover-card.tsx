"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

interface MediaHoverCardProps {
  tmdbId?: number | null;
  tvdbId?: number | null;
  source: string;
  name: string;
  year: number;
  metadataStr: string;
  children: React.ReactNode;
}

export function MediaHoverCard({ tmdbId, tvdbId, source, name, year, metadataStr, children }: MediaHoverCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [castData, setCastData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  const metadata = metadataStr ? JSON.parse(metadataStr) : {};
  const posterUrl = metadata.posterUrl;
  const overview = metadata.overview;

  useEffect(() => {
    if (isHovered && !hasFetched && !loading && !error) {
      // Small delay before fetching to avoid spamming API when quickly dragging mouse
      fetchTimeoutRef.current = setTimeout(() => {
        fetchMetadata();
      }, 500);
    }

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [isHovered, hasFetched, loading, error]);

  useEffect(() => {
    const updateRect = () => {
      if (isHovered && triggerRef.current) {
        setRect(triggerRef.current.getBoundingClientRect());
      }
    };
    
    if (isHovered) {
      updateRect();
      window.addEventListener('scroll', updateRect, true);
      window.addEventListener('resize', updateRect);
      return () => {
        window.removeEventListener('scroll', updateRect, true);
        window.removeEventListener('resize', updateRect);
      };
    } else {
      setRect(null);
    }
  }, [isHovered]);

  const fetchMetadata = async () => {
    const id = source === 'Radarr' ? tmdbId : tvdbId;
    const endpoint = source === 'Radarr' ? '/api/media/tmdb' : '/api/media/tvdb';
    
    if (!id) {
      setError("No external ID available");
      setHasFetched(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${endpoint}?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setCastData(data.cast || []);
      } else {
        setError(`Failed to load ${source === 'Radarr' ? 'TMDB' : 'TVDB'} info`);
      }
    } catch (e) {
      setError("Network error");
    }
    setLoading(false);
    setHasFetched(true);
  };

  const isTooCloseToTop = rect && rect.top < 450;
  const isTooCloseToRight = rect && rect.left + 600 > (typeof window !== 'undefined' ? window.innerWidth : 1000);
  const adjustedLeft = isTooCloseToRight ? Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 600 - 8) : rect?.left;

  const style: React.CSSProperties | undefined = rect ? {
    position: 'fixed',
    left: adjustedLeft,
    top: isTooCloseToTop ? rect.bottom + 8 : rect.top - 8,
    transform: isTooCloseToTop ? 'none' : 'translate(0, -100%)',
    zIndex: 9999,
  } : undefined;

  return (
    <>
      <div 
        ref={triggerRef}
        className="relative group inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      
      {isHovered && rect && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed z-50 pointer-events-none animate-in fade-in duration-200"
          style={style}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className={`w-[600px] bg-slate-900 border border-slate-700 shadow-2xl rounded-xl flex flex-col pointer-events-auto relative ${isTooCloseToTop ? 'slide-in-from-top-2' : 'slide-in-from-bottom-2'}`}>
            {/* Header */}
            <div className="bg-slate-800/80 p-4 border-b border-slate-700 rounded-t-xl">
              <h3 className="font-bold text-white text-lg truncate">{name} {year ? `(${year})` : ''}</h3>
            </div>
            
            <div className="flex p-4 gap-4">
              {/* Left: Poster */}
              <div className="w-40 shrink-0">
                {posterUrl ? (
                  <img src={posterUrl} alt={name} className="w-full h-60 object-cover rounded-md shadow-sm" />
                ) : (
                  <div className="w-full h-60 bg-slate-800 rounded-md flex items-center justify-center text-sm text-slate-500">No Poster</div>
                )}
              </div>
              
              {/* Right: Synopsis */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-amber-500 uppercase tracking-wider mb-2">Synopsis</h4>
                <p className="text-sm text-slate-300 leading-relaxed">{overview || "No synopsis available."}</p>
              </div>
            </div>

            {/* Bottom: Cast */}
            <div className="p-4 pt-0 mt-2 border-t border-slate-800/50 rounded-b-xl">
              <h4 className="text-sm font-semibold text-amber-500 uppercase tracking-wider mb-3 mt-3">Cast</h4>
              {loading ? (
                <div className="flex items-center text-sm text-slate-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading cast...</div>
              ) : error ? (
                <div className="text-sm text-slate-500">{error}</div>
              ) : castData.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {castData.slice(0, 10).map((actor: any) => (
                    <div key={actor.id} className="relative group/cast inline-block">
                      <div className="text-xs bg-slate-800 px-2 py-1.5 rounded border border-slate-700 text-slate-300 cursor-default hover:bg-slate-700 transition-colors">
                        <span className="font-medium text-white">{actor.name}</span>
                        {actor.character && <span className="text-slate-400 ml-1">as {actor.character}</span>}
                      </div>
                      
                      {/* Cast Image Tooltip */}
                      {actor.profile_path && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/cast:block z-[9999] animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                          <img src={actor.profile_path} alt={actor.name} className="w-24 h-36 object-cover rounded shadow-xl border border-slate-600" />
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-600 rotate-45 border-r border-b border-slate-600"></div>
                        </div>
                      )}
                    </div>
                  ))}
                  {castData.length > 10 && (
                    <div className="text-xs px-2 py-1.5 text-slate-500">+{castData.length - 10} more</div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-500">No cast info.</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
