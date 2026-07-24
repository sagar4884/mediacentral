"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Database, Film, Tv, Clock, Activity, Wifi, Cpu, Server, Thermometer } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { PieChart, Pie, Cell } from "recharts"

interface DashboardStats {
  totalMovies: number;
  totalShows: number;
  storageBytes: number;
  moviesBytes: number;
  showsBytes: number;
  totalSpace: number;
  freeSpace: number;
  recent: any[];
  error?: boolean;
}

interface RealtimeStats {
  tautulli: {
    activeStreams: number;
    totalBandwidth: number;
  };
  unraid: {
    cpuLoad: number;
    cpuTemp: number;
    ramTotal: number;
    ramUsed: number;
    gpuLoad: number;
    gpuTemp: number;
    gpuMemUsed: number;
    gpuMemTotal: number;
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);

  useEffect(() => {
    // Initial fetch for static stats
    fetch('/api/media/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error)

    // Initial fetch for realtime stats
    const fetchRealtime = () => {
      fetch('/api/realtime')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setRealtime(data);
          }
        })
        .catch(console.error)
    };
    
    fetchRealtime();
    // Poll every 5 seconds
    const interval = setInterval(fetchRealtime, 15000);
    return () => clearInterval(interval);
  }, [])

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  if (!stats) {
    return <div className="flex justify-center p-12 text-slate-400">Loading dashboard data...</div>
  }

  const usedSpace = stats.totalSpace - stats.freeSpace;
  const otherSpace = Math.max(0, usedSpace - stats.moviesBytes - stats.showsBytes);

  const pieDataMovies = [
    { name: 'Movies', value: stats.moviesBytes, fill: '#3b82f6' },
    { name: 'Other', value: otherSpace + stats.showsBytes, fill: '#475569' },
    { name: 'Free', value: stats.freeSpace, fill: '#0f172a' },
  ];

  const pieDataShows = [
    { name: 'Shows', value: stats.showsBytes, fill: '#a855f7' },
    { name: 'Other', value: otherSpace + stats.moviesBytes, fill: '#475569' },
    { name: 'Free', value: stats.freeSpace, fill: '#0f172a' },
  ];

  const chartConfig = {
    movies: { label: "Movies", color: "#3b82f6" },
    shows: { label: "Shows", color: "#a855f7" },
    other: { label: "Other", color: "#475569" },
    free: { label: "Free Space", color: "#0f172a" },
  }

  // Calculate percentages for the progress bar
  const total = stats.totalSpace || 1; // avoid division by zero
  const pMovies = (stats.moviesBytes / total) * 100;
  const pShows = (stats.showsBytes / total) * 100;
  const pOther = (otherSpace / total) * 100;
  const pFree = (stats.freeSpace / total) * 100;

  // Realtime fallbacks
  const tStats = realtime?.tautulli || { activeStreams: 0, totalBandwidth: 0 };
  const uStats = realtime?.unraid || { cpuLoad: 0, cpuTemp: 0, ramTotal: 1, ramUsed: 0, gpuLoad: 0, gpuTemp: 0, gpuMemUsed: 0, gpuMemTotal: 1 };
  
  // Unraid percentages (ensure valid numbers)
  const cpuPercent = Math.min(100, Math.max(0, uStats.cpuLoad));
  const ramPercent = Math.min(100, Math.max(0, (uStats.ramUsed / (uStats.ramTotal || 1)) * 100));
  const gpuPercent = Math.min(100, Math.max(0, uStats.gpuLoad));

  const getTempColor = (temp: number) => {
    if (temp < 70) return 'text-green-500';
    if (temp < 80) return 'text-yellow-500';
    if (temp <= 90) return 'text-red-500';
    return 'text-rose-900';
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-tight text-gradient bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-400 dark:to-purple-400">Dashboard</h1>
        <p className="text-muted-foreground text-lg">
          Real-time overview of your server hardware, storage, and Plex activity.
        </p>
      </div>
      
      {/* Real-time Hardware & Activity Row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* CPU */}
        <Card className="glass-panel overflow-hidden relative group hover-lift border-b-4 border-b-blue-500/50">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Cpu className="w-24 h-24 text-blue-500" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">CPU Usage</CardTitle>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <Cpu className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-end mb-2">
              <span className="text-2xl font-bold text-white">{cpuPercent.toFixed(1)}%</span>
              {uStats.cpuTemp > 0 && <span className={`text-xs font-medium flex items-center gap-1 ${getTempColor(uStats.cpuTemp)}`}><Thermometer className="w-3 h-3"/> {uStats.cpuTemp}°C</span>}
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div style={{ width: `${cpuPercent}%` }} className={`h-full ${cpuPercent > 80 ? 'bg-red-500' : 'bg-blue-500'} transition-all duration-500`}></div>
            </div>
          </CardContent>
        </Card>

        {/* RAM */}
        <Card className="glass-panel overflow-hidden relative group hover-lift border-b-4 border-b-purple-500/50">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Server className="w-24 h-24 text-purple-500" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">RAM Usage</CardTitle>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <Server className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="flex justify-between items-end mb-3">
              <span className="text-3xl font-extrabold tracking-tighter">{ramPercent.toFixed(1)}%</span>
              {uStats.ramTotal > 1 && <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-md">{formatBytes(uStats.ramUsed)} / {formatBytes(uStats.ramTotal)}</span>}
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div style={{ width: `${ramPercent}%` }} className={`h-full ${ramPercent > 80 ? 'bg-red-500' : 'bg-purple-500'} transition-all duration-500`}></div>
            </div>
          </CardContent>
        </Card>

        {/* GPU - Hide if stats are entirely 0 since Unraid 7 native API might not expose them */}
        {(uStats.gpuLoad > 0 || uStats.gpuTemp > 0 || uStats.gpuMemTotal > 0) && (
          <Card className="glass-panel overflow-hidden relative group hover-lift border-b-4 border-b-emerald-500/50">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity className="w-24 h-24 text-emerald-500" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">GPU Usage</CardTitle>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Activity className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex justify-between items-end mb-3">
                <span className="text-3xl font-extrabold tracking-tighter">{gpuPercent.toFixed(1)}%</span>
                {uStats.gpuTemp > 0 && <span className={`text-xs font-medium flex items-center gap-1 ${getTempColor(uStats.gpuTemp)}`}><Thermometer className="w-3 h-3"/> {uStats.gpuTemp}°C</span>}
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div style={{ width: `${gpuPercent}%` }} className={`h-full ${gpuPercent > 80 ? 'bg-red-500' : 'bg-emerald-500'} transition-all duration-500`}></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plex Streams */}
        <Card className="glass-panel overflow-hidden relative group hover-lift border-b-4 border-b-amber-500/50">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wifi className="w-24 h-24 text-amber-500" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-amber-600 dark:text-amber-500">Plex Activity</CardTitle>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <Wifi className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center gap-3">
                <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">{tStats.activeStreams}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest bg-amber-500/10 px-2 py-1 rounded-md">Streams</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-300">{tStats.totalBandwidth}</span>
                <span className="text-xs text-slate-400">Kbps Out</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Storage Bar */}
      <Card className="glass-panel hover-lift border-l-4 border-l-indigo-500">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Database className="w-6 h-6" />
            </div>
            Total Storage Overview
          </CardTitle>
          <CardDescription className="text-sm">Visual breakdown of your root media drive</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between text-sm font-semibold mb-3 text-slate-600 dark:text-slate-300">
            <span>{formatBytes(usedSpace)} Used</span>
            <span>{formatBytes(stats.totalSpace)} Total</span>
          </div>
          
          {/* Stacked Progress Bar */}
          <div className="w-full h-10 flex rounded-2xl overflow-hidden shadow-inner bg-slate-200 dark:bg-slate-900">
            <div style={{ width: `${pMovies}%` }} className="bg-gradient-to-r from-blue-600 to-blue-400 hover:brightness-110 transition-all cursor-pointer relative group" title={`Movies: ${formatBytes(stats.moviesBytes)}`} />
            <div style={{ width: `${pShows}%` }} className="bg-gradient-to-r from-purple-600 to-purple-400 hover:brightness-110 transition-all cursor-pointer" title={`Shows: ${formatBytes(stats.showsBytes)}`} />
            <div style={{ width: `${pOther}%` }} className="bg-gradient-to-r from-slate-500 to-slate-400 hover:brightness-110 transition-all cursor-pointer" title={`Other: ${formatBytes(otherSpace)}`} />
            <div style={{ width: `${pFree}%` }} className="bg-slate-200 dark:bg-slate-950/50 transition-colors" title={`Free: ${formatBytes(stats.freeSpace)}`} />
          </div>
          
          <div className="flex gap-6 mt-6 text-sm font-medium justify-center flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" /> Movies</div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400"><div className="w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" /> Shows</div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400"><div className="w-3 h-3 rounded-full bg-slate-500" /> Other Files</div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-900 text-slate-500"><div className="w-3 h-3 rounded-full border-2 border-slate-400 dark:border-slate-600" /> Free Space</div>
          </div>
        </CardContent>
      </Card>

      {/* Media Statistics Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-panel hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-bold tracking-tight">Total Movies</CardTitle>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Film className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-4">{stats.totalMovies} <span className="text-sm font-normal text-slate-400">({formatBytes(stats.moviesBytes)})</span></div>
            <div className="h-[200px] w-full mt-4">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie data={pieDataMovies} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} stroke="none">
                    {pieDataMovies.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-panel hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-bold tracking-tight">Total TV Shows</CardTitle>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <Tv className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-4">{stats.totalShows} <span className="text-sm font-normal text-slate-400">({formatBytes(stats.showsBytes)})</span></div>
            <div className="h-[200px] w-full mt-4">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie data={pieDataShows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} stroke="none">
                    {pieDataShows.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="glass-panel">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Clock className="w-5 h-5" />
            </div>
            Recent Curations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recent && stats.recent.length > 0 ? (
            <div className="space-y-4">
              {stats.recent.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-800/50">
                  <div className="flex flex-col">
                    <span className="font-medium">{item.name} <span className="text-slate-400 text-sm">({item.year})</span></span>
                    <span className="text-xs text-slate-500">{item.source} • {formatBytes(item.sizeOnDisk)}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full ${item.keepStatus === 'kept' ? 'bg-green-500/10 text-green-500' : item.keepStatus === 'marked_for_deletion' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      {item.keepStatus.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No recent activity found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
