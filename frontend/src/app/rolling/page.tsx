"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Loader2, Search, ArrowUpDown, X, LayoutGrid, List, CheckSquare, Sparkles } from "lucide-react"
import { MediaHoverCard } from "@/components/media-hover-card"

interface RollingMediaItem {
  id: string | number;
  sonarrId: number;
  name: string;
  year: number;
  sizeOnDisk: number;
  path: string;
  metadata: string;
  tags: string;
  tmdbId?: number | null;
  tvdbId?: number | null;
  status: 'active' | 'ignored' | 'pending';
  keepEpisodes?: number | null;
  aiRecommended?: boolean;
}

export default function RollingPage() {
  const [shows, setShows] = useState<RollingMediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'poster' | 'table'>('table')
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("active")

  const fetchShows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rolling')
      const data = await res.json()
      if (Array.isArray(data)) setShows(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchShows() }, [])

  const handleScanAi = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/rolling/scan-ai', { method: 'POST' })
      if (res.ok) {
        toast.success("AI Scan complete! Check suggestions tab.")
        fetchShows()
      } else {
        toast.error("Failed to scan with AI")
      }
    } catch (e) {
      toast.error("Network error during AI scan")
    }
    setAiLoading(false)
  }

  const handleSync = async () => {
    setSyncLoading(true)
    try {
      const res = await fetch('/api/rolling/sync', { method: 'POST' })
      if (res.ok) {
        toast.success("Sonarr sync complete!")
        fetchShows()
      } else {
        toast.error("Failed to sync with Sonarr")
      }
    } catch (e) {
      toast.error("Network error during sync")
    }
    setSyncLoading(false)
  }

  const handleUpdateStatus = async (sonarrId: number, status: string, keepEpisodes?: number, silent = false): Promise<boolean> => {
    // Optimistic UI Update
    setShows(prev => prev.map(s => s.sonarrId === sonarrId ? { ...s, status: status as any, keepEpisodes: keepEpisodes || s.keepEpisodes } : s));
    
    try {
      const res = await fetch('/api/rolling/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sonarrId, status, keepEpisodes })
      })
      if (res.ok) {
        if (!silent) toast.success("Show updated")
        return true
      } else {
        if (!silent) toast.error("Failed to update")
        fetchShows() // revert on fail
        return false
      }
    } catch (e) {
      if (!silent) toast.error("Network error")
      fetchShows() // revert on fail
      return false
    }
  }

  const handleBulkAction = async (action: 'active' | 'ignored') => {
    if (selectedItems.size === 0) return;
    setActionLoading(true)
    let successCount = 0;
    
    for (const id of Array.from(selectedItems)) {
      try {
        const item = shows.find(s => s.sonarrId === id);
        const success = await handleUpdateStatus(id, action, item?.keepEpisodes || 3, true);
        if (success) successCount++;
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {}
    }
    
    toast.success(`Successfully marked ${successCount} items`)
    setSelectedItems(new Set())
    setIsBulkMode(false)
    setActionLoading(false)
    fetchShows()
  }

  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedItems)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedItems(newSet)
  }

  const pendingShows = shows.filter(s => s.status === 'pending')
  const activeShows = shows.filter(s => s.status === 'active')
  const ignoredShows = shows.filter(s => s.status === 'ignored')

  const currentItems = activeTab === 'active' ? activeShows : activeTab === 'suggestions' ? pendingShows : ignoredShows;

  const renderTableView = () => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-sm">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
          <tr>
            {isBulkMode && <th className="px-4 py-3 w-12 text-center"></th>}
            <th className="px-6 py-4 font-semibold">Show Name</th>
            <th className="px-6 py-4 font-semibold text-center">Keep Episodes</th>
            <th className="px-6 py-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {currentItems.length === 0 && (
            <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No shows found.</td></tr>
          )}
          {currentItems.map(show => {
            let metadataObj: any = {}
            try { metadataObj = JSON.parse(show.metadata || '{}') } catch (e) {}
            
            return (
              <tr key={show.sonarrId} className={`hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors ${selectedItems.has(show.sonarrId) ? 'bg-amber-500/10 dark:bg-amber-500/10' : ''}`} onClick={() => isBulkMode && toggleSelection(show.sonarrId)}>
                {isBulkMode && (
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedItems.has(show.sonarrId)} onChange={() => toggleSelection(show.sonarrId)} className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500" />
                  </td>
                )}
                <td className="px-6 py-4 font-medium flex items-center gap-3">
                  <MediaHoverCard 
                    tmdbId={show.tmdbId}
                    tvdbId={show.tvdbId}
                    source="Sonarr"
                    name={show.name}
                    year={show.year || 0}
                    metadataStr={show.metadata || "{}"}
                  >
                    <span className="cursor-pointer hover:text-amber-500 transition-colors">{show.name}</span>
                  </MediaHoverCard>
                  {show.aiRecommended && <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">AI Suggested</Badge>}
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                    <Input 
                      type="number" 
                      min={1}
                      className="w-20 text-center h-8"
                      defaultValue={show.keepEpisodes || 3}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value);
                        if (val && val !== show.keepEpisodes) {
                          handleUpdateStatus(show.sonarrId, show.status, val);
                        }
                      }}
                    />
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                    {activeTab !== 'active' && (
                      <Button size="sm" variant="outline" className="text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950" onClick={() => handleUpdateStatus(show.sonarrId, 'active', show.keepEpisodes || 3)}>
                        Rolling
                      </Button>
                    )}
                    {activeTab !== 'ignored' && (
                      <Button size="sm" variant="outline" className="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleUpdateStatus(show.sonarrId, 'ignored', show.keepEpisodes || 3)}>
                        Ignore
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  );

  const getImageUrl = (metadataStr: string, source: string) => {
    try {
      const meta = JSON.parse(metadataStr);
      if (meta.posterUrl) {
        if (meta.posterUrl.startsWith('http')) return meta.posterUrl;
        const safeUrl = meta.posterUrl.startsWith('/') ? meta.posterUrl : `/${meta.posterUrl}`;
        return `/api/media/image?url=${encodeURIComponent(safeUrl)}&source=${source}`;
      }
    } catch (e) {}
    return null;
  }

  const renderPosterView = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
      {currentItems.length === 0 && <p className="text-muted-foreground col-span-full py-8 text-center">No shows found.</p>}
      {currentItems.map(show => {
        const isSelected = selectedItems.has(show.sonarrId);
        const imgUrl = getImageUrl(show.metadata, 'Sonarr');
        
        return (
          <Card 
            key={show.sonarrId}
            className={`overflow-hidden glass relative group cursor-pointer transition-all duration-200 border-2 ${isSelected ? 'border-amber-500 scale-[0.98]' : 'border-transparent hover:border-slate-600'}`}
            onClick={() => isBulkMode ? toggleSelection(show.sonarrId) : null}
          >
            {isBulkMode && (
              <div className="absolute top-2 left-2 z-20 bg-black/50 p-1 rounded backdrop-blur-sm">
                {isSelected ? <CheckSquare className="h-5 w-5 text-amber-500" /> : <div className="h-5 w-5 border-2 border-white/70 rounded-sm"></div>}
              </div>
            )}
            
            <div className="aspect-[2/3] w-full bg-slate-900 relative">
              {imgUrl ? (
                <img src={imgUrl} alt={show.name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-700 bg-slate-800">
                  <span className="text-xs uppercase font-medium text-center px-2">No Poster</span>
                </div>
              )}
              
              {!isBulkMode && (
                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center p-3 z-10 gap-3 backdrop-blur-sm">
                  {activeTab !== 'active' && (
                    <Button size="sm" className="w-[80%] bg-teal-600 hover:bg-teal-700 text-white border-0" onClick={(e) => { e.stopPropagation(); handleUpdateStatus(show.sonarrId, 'active', show.keepEpisodes || 3); }}>
                      <ArrowUpDown className="h-4 w-4 mr-2" /> Mark Rolling
                    </Button>
                  )}
                  {activeTab !== 'ignored' && (
                    <Button size="sm" variant="secondary" className="w-[80%] bg-slate-600 hover:bg-slate-700 text-white border-0" onClick={(e) => { e.stopPropagation(); handleUpdateStatus(show.sonarrId, 'ignored', show.keepEpisodes || 3); }}>
                      <X className="h-4 w-4 mr-2" /> Ignore
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            <CardContent className="p-3 bg-slate-900/90 backdrop-blur-md relative z-0">
              <h3 className="font-semibold text-sm line-clamp-1 text-slate-200">{show.name}</h3>
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-slate-400">Keep: {show.keepEpisodes || 3} ep</p>
                {show.aiRecommended && <Sparkles className="w-3 h-3 text-blue-400" />}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-emerald-600">
            Rolling TV Shows
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Automatically delete old seasons of daily or reality shows to reclaim space.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant={isBulkMode ? "default" : "outline"}
            className={`rounded-xl transition-all ${isBulkMode ? "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20" : "border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            onClick={() => { setIsBulkMode(!isBulkMode); setSelectedItems(new Set()); }}
          >
            <CheckSquare className="h-4 w-4 mr-2" />
            Bulk
          </Button>
          <div className="flex bg-slate-200/50 dark:bg-slate-900/50 p-1 rounded-xl shadow-inner border border-slate-300 dark:border-slate-800">
            <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="icon" className={`rounded-lg ${viewMode === 'table' ? 'bg-white dark:bg-slate-800 shadow-sm' : ''}`} onClick={() => setViewMode('table')}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'poster' ? 'secondary' : 'ghost'} size="icon" className={`rounded-lg ${viewMode === 'poster' ? 'bg-white dark:bg-slate-800 shadow-sm' : ''}`} onClick={() => setViewMode('poster')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={handleScanAi} disabled={aiLoading || syncLoading} className="rounded-xl border-amber-500/30 text-amber-500 hover:bg-amber-950">
            {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Scan with AI
          </Button>
          <Button onClick={handleSync} disabled={syncLoading || aiLoading} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-md">
            {syncLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Loader2 className="mr-2 h-4 w-4" />}
            Manual Sync
          </Button>
        </div>
      </div>

      <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-xl">
          <TabsTrigger value="active" className="rounded-lg">Active ({activeShows.length})</TabsTrigger>
          <TabsTrigger value="suggestions" className="rounded-lg">Suggestions ({pendingShows.length})</TabsTrigger>
          <TabsTrigger value="ignored" className="rounded-lg">Ignored ({ignoredShows.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value={activeTab} className="mt-6">
          <Card className={`glass-panel border-t-4 shadow-lg ${activeTab === 'active' ? 'border-t-teal-500' : activeTab === 'suggestions' ? 'border-t-amber-500' : 'border-t-slate-500'}`}>
            <CardHeader>
              <CardTitle>{activeTab === 'active' ? 'Active Rolling Shows' : activeTab === 'suggestions' ? 'AI Suggestions' : 'Ignored Shows'}</CardTitle>
              <CardDescription>
                {activeTab === 'active' ? 'These shows will have old seasons deleted automatically when new episodes download.' :
                 activeTab === 'suggestions' ? 'Shows the AI thinks you don\'t need to keep forever.' :
                 'These shows will be ignored by the AI in the future.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-teal-500" /></div> : (
                viewMode === 'table' ? renderTableView() : renderPosterView()
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Sticky Bulk Action Bar */}
      {isBulkMode && selectedItems.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 p-3 px-6 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <span className="font-medium text-slate-200 bg-slate-800 px-3 py-1 rounded-full text-sm whitespace-nowrap">
            {selectedItems.size} Selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('active')} disabled={actionLoading} className="border-teal-500/30 text-teal-400 hover:bg-teal-950">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              Rolling
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('ignored')} disabled={actionLoading} className="border-slate-500 text-slate-300 hover:bg-slate-800">
              <X className="h-4 w-4 mr-2" />
              Not Rolling
            </Button>
            <div className="w-px h-6 bg-slate-700 mx-1"></div>
            <Button variant="ghost" size="sm" onClick={() => setIsBulkMode(false)} className="text-slate-400 hover:text-white ml-2">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
