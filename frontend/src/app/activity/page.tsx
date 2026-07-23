"use client"

import { useState, useEffect } from "react"
import { Tv, Cpu, Network, X, Activity, Play, Monitor, MapPin, Info, CheckCircle2, AlertCircle, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function ActivityPage() {
  const [activityData, setActivityData] = useState<any>(null)
  const [terminating, setTerminating] = useState<string | null>(null)
  
  const fetchActivity = async () => {
    try {
      const res = await fetch('/api/plex/activity');
      if (res.ok) {
        setActivityData(await res.json());
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 10000); // Poll more frequently for progress updates
    return () => clearInterval(interval);
  }, []);

  const handleTerminateStream = async (sessionId: string) => {
    setTerminating(sessionId);
    try {
      const msg = prompt("Reason for termination:", "Your stream has been terminated.");
      if (msg === null) {
        setTerminating(null);
        return;
      }
      const res = await fetch('/api/plex/activity/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: msg })
      });
      if (res.ok) {
        toast.success("Stream terminated.");
        fetchActivity();
      } else {
        toast.error("Failed to terminate stream.");
      }
    } catch (e) { toast.error("Network error"); }
    setTerminating(null);
  }

  const formatTime = (ms: number) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getETA = (remainingMs: number) => {
    if (!remainingMs) return '--:--';
    const d = new Date(Date.now() + remainingMs);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="space-y-6 pb-20 max-w-[1600px] mx-auto px-4 pt-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 text-white">
          <Activity className="h-8 w-8 text-amber-500"/> Activity
        </h1>
        <div className="flex items-center gap-6 glass px-6 py-3 rounded-xl border border-slate-700/50">
          <span className="flex items-center gap-2 text-lg font-medium text-slate-200">
            <Cpu className="h-5 w-5 text-amber-500"/> {activityData?.streamCount || 0} Streams
          </span>
          <div className="w-px h-6 bg-slate-700"></div>
          <span className="flex items-center gap-2 text-lg font-medium text-slate-200">
            <Network className="h-5 w-5 text-amber-500"/> {activityData?.totalBandwidth || 0} Kbps
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">
        {(!activityData?.sessions || activityData.sessions.length === 0) ? (
          <div className="col-span-full flex flex-col items-center justify-center p-12 glass rounded-xl border border-slate-700/50">
            <Activity className="h-12 w-12 text-slate-600 mb-4" />
            <p className="text-xl text-muted-foreground font-medium">No active streams on the server.</p>
          </div>
        ) : (
          activityData.sessions.map((session: any) => {
            const isDirectPlay = session.videoDecision === 'direct play' || session.videoDecision === 'copy';
            const imageUrl = session.thumb ? `/api/plex/image?thumb=${encodeURIComponent(session.thumb)}` : '';
            const remainingMs = session.duration - session.viewOffset;

            return (
              <div key={session.sessionId} className="relative group bg-[#1c1c1c] rounded-lg overflow-hidden border border-[#333] shadow-2xl flex flex-col min-h-[300px]">
                
                {/* Terminate Hover Overlay */}
                <div className="absolute inset-0 bg-black/80 z-40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm">
                  <Button 
                    variant="destructive" 
                    size="lg" 
                    className="gap-2 text-lg font-medium shadow-xl h-14 px-8 rounded-full"
                    disabled={terminating === session.sessionId}
                    onClick={() => handleTerminateStream(session.sessionId)}
                  >
                    <X className="h-6 w-6" /> 
                    {terminating === session.sessionId ? 'Stopping...' : 'Stop playback'}
                  </Button>
                </div>

                {/* Main Card Area */}
                <div className="flex-1 flex relative overflow-hidden">
                  
                  {/* Blurred Background (Right Side) */}
                  <div className="absolute top-0 right-0 bottom-0 left-[180px] z-0 overflow-hidden">
                     {imageUrl && (
                       <>
                         <div 
                           className="absolute inset-0 bg-cover bg-center scale-110 opacity-40 blur-xl" 
                           style={{ backgroundImage: `url('${imageUrl}')` }} 
                         />
                         <div className="absolute inset-0 bg-gradient-to-r from-[#1c1c1c] via-[#1c1c1c]/90 to-black/60" />
                       </>
                     )}
                  </div>

                  {/* Poster Left */}
                  <div className="w-[180px] h-full shrink-0 relative z-10 bg-black shadow-[4px_0_15px_rgba(0,0,0,0.5)]">
                    {imageUrl ? (
                      <img src={imageUrl} alt="Poster" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Tv className="h-10 w-10 text-slate-700"/></div>
                    )}
                    
                    {/* Top Left Badges */}
                    <div className="absolute top-2 left-2 flex gap-1 items-center">
                      {isDirectPlay ? (
                        <div className="bg-emerald-500 rounded-full p-0.5"><CheckCircle2 className="h-4 w-4 text-black" /></div>
                      ) : (
                        <div className="bg-amber-500 rounded-full p-0.5"><AlertCircle className="h-4 w-4 text-black" /></div>
                      )}
                      <div className="bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/20">HD</div>
                    </div>
                  </div>

                  {/* Details Right */}
                  <div className="flex-1 p-4 relative z-10 flex flex-col justify-between">
                    {/* Platform Icon */}
                    <div className="absolute top-4 right-4 bg-white/10 p-1.5 rounded backdrop-blur-sm border border-white/10">
                       {session.platform?.toLowerCase().includes('ios') || session.platform?.toLowerCase().includes('apple') ? (
                         <Smartphone className="h-5 w-5 text-white/80" />
                       ) : session.platform?.toLowerCase().includes('windows') ? (
                         <Monitor className="h-5 w-5 text-blue-400" />
                       ) : (
                         <Tv className="h-5 w-5 text-white/80" />
                       )}
                    </div>

                    <div className="grid grid-cols-[85px_1fr] gap-y-1.5 text-xs w-[90%]">
                      <div className="text-gray-400 uppercase tracking-wider text-[10px]">Product</div>
                      <div className="text-gray-100 truncate">{session.product || 'Unknown'}</div>

                      <div className="text-gray-400 uppercase tracking-wider text-[10px]">Player</div>
                      <div className="text-gray-100 truncate">{session.player || 'Unknown'}</div>

                      <div className="text-gray-400 uppercase tracking-wider text-[10px]">Quality</div>
                      <div className="text-gray-100 flex items-center gap-1">
                        Original ({session.streamBitrate ? (session.streamBitrate/1000).toFixed(1) : (session.bandwidth/1000).toFixed(1)} Mbps)
                        <Info className="h-3 w-3 text-gray-500" />
                      </div>
                      
                      <div className="col-span-2 h-1" /> {/* Spacer */}

                      <div className="text-gray-400 uppercase tracking-wider text-[10px]">Stream</div>
                      <div className="text-gray-100 truncate">{isDirectPlay ? 'Direct Play' : 'Transcoding'}</div>

                      <div className="text-gray-400 uppercase tracking-wider text-[10px]">Container</div>
                      <div className="text-gray-100 truncate">
                        {session.transcodeContainer ? 'Transcode' : 'Direct Play'} ({session.transcodeContainer || session.container || 'Unknown'})
                      </div>

                      <div className="text-gray-400 uppercase tracking-wider text-[10px]">Video</div>
                      <div className="text-gray-100 truncate">
                        {session.videoDecision === 'transcode' ? 'Transcode' : 'Direct Play'} ({session.videoCodec} {session.videoResolution})
                      </div>

                      <div className="text-gray-400 uppercase tracking-wider text-[10px]">Audio</div>
                      <div className="text-gray-100 truncate">
                        {session.audioDecision === 'transcode' ? 'Transcode' : 'Direct Play'} ({session.audioCodec} {session.audioChannels})
                      </div>
                    </div>

                    <div className="mt-3 flex justify-between items-end">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-xs text-gray-300">
                          <span className="text-gray-400 uppercase tracking-wider text-[10px] w-[85px]">Location</span>
                          <MapPin className="h-3 w-3" />
                          <span className="uppercase">{session.location || 'LAN'}</span>: {session.ipAddress}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-300">
                           <span className="text-gray-400 uppercase tracking-wider text-[10px] w-[85px]">Bandwidth</span>
                           {session.bandwidth ? (session.bandwidth/1000).toFixed(1) : 0} Mbps
                           <Info className="h-3 w-3 text-gray-500" />
                        </div>
                      </div>
                      <div className="text-right flex flex-col justify-end">
                         <div className="text-gray-400 text-[10px] uppercase tracking-wider">ETA: {getETA(remainingMs)}</div>
                         <div className="text-gray-200 text-[10px] font-medium tracking-wide">
                           {formatTime(session.viewOffset)} / {formatTime(session.duration)}
                         </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 bg-[#222] w-full relative z-10 border-t border-[#111]">
                  <div 
                    className="h-full bg-amber-500 rounded-r shadow-[0_0_8px_rgba(245,158,11,0.6)]" 
                    style={{ width: `${session.progressPercent || 0}%` }}
                  />
                  {/* Progress Tooltip */}
                  <div 
                    className="absolute top-[-18px] text-[9px] bg-[#333] text-gray-200 px-1 rounded transform -translate-x-1/2 border border-[#444] font-medium"
                    style={{ left: `${session.progressPercent || 0}%` }}
                  >
                    {session.progressPercent}%
                  </div>
                </div>

                {/* Footer */}
                <div className="h-12 bg-[#171717] relative z-10 flex items-center justify-between px-4 border-t border-[#333]">
                  <div className="flex items-center gap-3 overflow-hidden pr-4">
                    <Play className="h-4 w-4 text-white shrink-0 fill-white" />
                    <div className="flex flex-col min-w-0">
                      <div className="text-sm font-semibold text-gray-100 truncate">
                        {session.mediaType === 'episode' ? `${session.grandparentTitle || 'Unknown'} - ${session.title}` : session.title}
                      </div>
                      <div className="text-[10px] text-gray-400 flex items-center gap-1.5 font-medium tracking-wide uppercase">
                        {session.mediaType === 'episode' ? (
                          <>
                            <Tv className="h-3 w-3" />
                            S{session.season} · E{session.episode}
                          </>
                        ) : (
                          <>
                            <FilmIcon className="h-3 w-3" />
                            {session.year}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-xs text-gray-400 text-right mr-1 hidden sm:block">{session.username}</div>
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-rose-400 to-amber-500 flex items-center justify-center text-white font-bold text-xs shadow-inner">
                      {session.username ? session.username.charAt(0).toUpperCase() : '?'}
                    </div>
                  </div>
                </div>

              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function FilmIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" />
      <path d="M17 3v18" />
      <path d="M3 7h4" />
      <path d="M3 12h18" />
      <path d="M3 17h4" />
      <path d="M17 7h4" />
      <path d="M17 17h4" />
    </svg>
  )
}
