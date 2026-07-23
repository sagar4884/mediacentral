"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { Moon, Sun, Activity, Database, Settings, Users, Film, ExternalLink } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useDryRun } from "./dry-run-provider"
import { Circle, Loader2 } from "lucide-react"

type ServiceStatus = 'green' | 'yellow' | 'red' | 'loading'

export function Navbar() {
  const pathname = usePathname()
  const { setTheme, theme } = useTheme()
  const { isDryRun, setIsDryRun } = useDryRun()

  const [streamCount, setStreamCount] = useState(0)
  const [pendingRequests, setPendingRequests] = useState(0)

  const [urls, setUrls] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Record<string, ServiceStatus>>({
    unraid: 'loading',
    radarr: 'loading',
    sonarr: 'loading',
    jellyseerr: 'loading',
    plex: 'loading',
    tautulli: 'loading',
    tmdb: 'loading',
    tvdb: 'loading',
    gemini: 'loading',
    pushover: 'loading'
  })

  useEffect(() => {
    // Initial fetch for static settings/status (only needed once or infrequently)
    const fetchStatic = async () => {
      try {
        const [settingsRes, statusRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/settings/status')
        ]);
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          setUrls({
            radarr: settings.RadarrExternalURL || settings.RadarrURL || '',
            sonarr: settings.SonarrExternalURL || settings.SonarrURL || '',
            jellyseerr: settings.JellyseerrExternalURL || settings.JellyseerrURL || '',
            plex: settings.PlexExternalURL || settings.PlexURL || '',
            tautulli: settings.TautulliExternalURL || settings.TautulliURL || ''
          });
        }
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setStatus(statusData);
        }
      } catch (e) {}
    };

    // Fast polling for realtime data (streams, pending requests)
    const fetchRealtime = async () => {
      try {
        const realtimeRes = await fetch('/api/realtime');
        if (realtimeRes.ok) {
          const data = await realtimeRes.json();
          if (data.tautulli?.activeStreams !== undefined) {
            setStreamCount(data.tautulli.activeStreams);
          }
          if (data.jellyseerr?.pendingRequests !== undefined) {
            setPendingRequests(data.jellyseerr.pendingRequests);
          }
        }
      } catch (e) {}
    };

    fetchStatic();
    fetchRealtime();
    
    // Poll settings every 2 minutes
    const staticInterval = setInterval(fetchStatic, 120000);
    // Poll realtime data every 5 seconds
    const realtimeInterval = setInterval(fetchRealtime, 5000);
    
    return () => {
      clearInterval(staticInterval);
      clearInterval(realtimeInterval);
    };
  }, [])

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: Activity },
    { name: "Curation", href: "/curation", icon: Film },
    { name: "Plex", href: "/plex", icon: Users },
    { name: "Settings", href: "/settings", icon: Settings },
  ]

  const StatusLight = ({ state }: { state: ServiceStatus }) => {
    if (state === 'green') return <Circle className="h-3 w-3 fill-green-500 text-green-500" />
    if (state === 'yellow') return <Circle className="h-3 w-3 fill-yellow-500 text-yellow-500" />
    if (state === 'red') return <Circle className="h-3 w-3 fill-red-500 text-red-500" />
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  }

  return (
    <div className="pt-4 px-4 sticky top-0 z-50">
      <nav className="w-full glass-panel rounded-2xl flex flex-col mx-auto max-w-screen-2xl shadow-xl transition-all duration-300">
        <div className="flex h-16 items-center px-6 w-full">
          <div className="mr-4 flex">
            <Link href="/dashboard" className="mr-8 flex items-center space-x-2 group">
              <div className="bg-indigo-500/10 p-2 rounded-xl group-hover:bg-indigo-500/20 transition-colors">
                <Database className="h-6 w-6 text-indigo-500 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <span className="hidden font-bold sm:inline-block text-lg tracking-tight text-gradient">
                MediaCentral
              </span>
            </Link>
            <div className="flex gap-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center px-4 py-2 text-sm font-medium transition-all duration-300 rounded-lg overflow-hidden group ${
                      isActive ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10" : "text-foreground/70 hover:text-foreground hover:bg-slate-500/10"
                    }`}
                  >
                    <item.icon className={`mr-2 h-4 w-4 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                    {item.name}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        <div className="flex items-center space-x-4 border-l border-slate-300/20 dark:border-white/10 pl-4 ml-2 opacity-80 hover:opacity-100 transition-opacity">
          {urls.radarr && <a href={urls.radarr} target="_blank" rel="noreferrer" className="text-xs font-medium text-foreground/60 hover:text-foreground flex items-center gap-1 hover-lift"><ExternalLink className="h-3 w-3" /> Radarr</a>}
          {urls.sonarr && <a href={urls.sonarr} target="_blank" rel="noreferrer" className="text-xs font-medium text-foreground/60 hover:text-foreground flex items-center gap-1 hover-lift"><ExternalLink className="h-3 w-3" /> Sonarr</a>}
          {urls.jellyseerr && (
            <a href={urls.jellyseerr} target="_blank" rel="noreferrer" className="text-xs font-medium text-foreground/60 hover:text-foreground flex items-center gap-1 relative hover-lift">
              <ExternalLink className="h-3 w-3" /> 
              Jellyseerr
              {pendingRequests > 0 && (
                <span className="ml-1 inline-flex items-center justify-center bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] shadow-lg animate-pulse">
                  {pendingRequests}
                </span>
              )}
            </a>
          )}
          {urls.plex && <a href={urls.plex} target="_blank" rel="noreferrer" className="text-xs font-medium text-foreground/60 hover:text-foreground flex items-center gap-1 hover-lift"><ExternalLink className="h-3 w-3" /> Plex</a>}
          {urls.tautulli && <a href={urls.tautulli} target="_blank" rel="noreferrer" className="text-xs font-medium text-foreground/60 hover:text-foreground flex items-center gap-1 hover-lift"><ExternalLink className="h-3 w-3" /> Tautulli</a>}
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <Link href="/activity" className="flex items-center gap-2 hover:bg-amber-500/10 p-1.5 rounded-xl transition-all duration-300 ml-4 mr-2 group hover-lift" title="Active Streams">
            <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">{streamCount}</span>
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 text-white p-1.5 rounded-full shadow-lg group-hover:shadow-amber-500/20">
              <Activity className="h-4 w-4" />
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            className="ml-4 rounded-xl hover:bg-slate-500/10"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
      <div className="flex h-9 items-center px-6 border-t border-slate-300/20 dark:border-white/5 bg-slate-100/50 dark:bg-slate-900/30 overflow-x-auto text-xs whitespace-nowrap rounded-b-2xl">
        <span className="font-semibold text-muted-foreground mr-3 uppercase tracking-wider text-[10px]">Live Status:</span>
        <div className="flex items-center gap-5 text-xs font-medium text-slate-600 dark:text-slate-300 overflow-x-auto whitespace-nowrap pb-1 pt-1 no-scrollbar flex-nowrap">
          <div className="flex items-center gap-1.5"><StatusLight state={status.unraid} /> Unraid</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.radarr} /> Radarr</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.sonarr} /> Sonarr</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.jellyseerr} /> Jellyseerr</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.plex} /> Plex</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.tautulli} /> Tautulli</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.tmdb} /> TMDB</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.tvdb} /> TVDB</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.gemini} /> Google AI</div>
          <div className="flex items-center gap-1.5"><StatusLight state={status.pushover} /> Pushover</div>
        </div>
      </div>
      </nav>
    </div>
  )
}
