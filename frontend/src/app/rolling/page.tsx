"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Loader2, Play, Search, Trash2, ShieldAlert, CheckCircle2, XCircle } from "lucide-react"

interface RollingShow {
  id: string;
  sonarrId: number;
  name: string;
  status: string;
  keepEpisodes: number;
  aiRecommended: boolean;
}

export default function RollingPage() {
  const [shows, setShows] = useState<RollingShow[]>([])
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  
  // Dry run modal state
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [showDryRunModal, setShowDryRunModal] = useState(false)
  const [pendingDeletions, setPendingDeletions] = useState<any[]>([])
  const [selectedDeletions, setSelectedDeletions] = useState<Set<string>>(new Set())
  const [executeLoading, setExecuteLoading] = useState(false)

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

  const handleUpdateStatus = async (id: string, status: string, keepEpisodes: number) => {
    try {
      const res = await fetch('/api/rolling/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, keepEpisodes })
      })
      if (res.ok) {
        toast.success("Show updated")
        fetchShows()
      } else {
        toast.error("Failed to update")
      }
    } catch (e) {
      toast.error("Network error")
    }
  }

  const handleDryRun = async () => {
    setDryRunLoading(true)
    try {
      const res = await fetch('/api/rolling/dry-run', { method: 'POST' })
      const data = await res.json()
      if (Array.isArray(data)) {
        setPendingDeletions(data)
        setSelectedDeletions(new Set(data.map(d => `${d.sonarrId}-${d.seasonNumber}`)))
        setShowDryRunModal(true)
      } else {
        toast.error("Failed to run dry-run")
      }
    } catch (e) {
      toast.error("Network error")
    }
    setDryRunLoading(false)
  }

  const handleExecute = async () => {
    if (selectedDeletions.size === 0) return toast.info("No items selected")
    setExecuteLoading(true)
    
    // filter pendingDeletions by selectedDeletions
    const toDelete = pendingDeletions
      .filter(d => selectedDeletions.has(`${d.sonarrId}-${d.seasonNumber}`))
      .map(d => ({ sonarrId: d.sonarrId, seasonNumber: d.seasonNumber }))

    try {
      const res = await fetch('/api/rolling/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: toDelete })
      })
      if (res.ok) {
        toast.success("Manual deletions executed and seasons unmonitored!")
        setShowDryRunModal(false)
      } else {
        toast.error("Execution failed")
      }
    } catch (e) {
      toast.error("Network error")
    }
    setExecuteLoading(false)
  }

  const toggleSelection = (key: string) => {
    const next = new Set(selectedDeletions)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedDeletions(next)
  }

  const pendingShows = shows.filter(s => s.status === 'pending')
  const activeShows = shows.filter(s => s.status === 'active')
  const ignoredShows = shows.filter(s => s.status === 'ignored' || s.status === 'never_ask_ai')

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
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
          <Button variant="outline" onClick={handleScanAi} disabled={aiLoading} className="rounded-xl border-teal-500/30 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950">
            {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Scan with AI
          </Button>
          <Button onClick={handleDryRun} disabled={dryRunLoading} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-md">
            {dryRunLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Manual Dry Run
          </Button>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-xl">
          <TabsTrigger value="active" className="rounded-lg">Active ({activeShows.length})</TabsTrigger>
          <TabsTrigger value="suggestions" className="rounded-lg">Suggestions ({pendingShows.length})</TabsTrigger>
          <TabsTrigger value="ignored" className="rounded-lg">Ignored ({ignoredShows.length})</TabsTrigger>
        </TabsList>
        
        {/* Active Tab */}
        <TabsContent value="active" className="mt-6">
          <Card className="glass-panel border-t-4 border-t-teal-500 shadow-lg">
            <CardHeader>
              <CardTitle>Active Rolling Shows</CardTitle>
              <CardDescription>These shows will have old seasons deleted automatically when new episodes download.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-teal-500" /></div> : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Show Name</th>
                        <th className="px-6 py-4 font-semibold text-center">Keep Episodes</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {activeShows.length === 0 && (
                        <tr><td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">No active shows found.</td></tr>
                      )}
                      {activeShows.map(show => (
                        <tr key={show.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                          <td className="px-6 py-4 font-medium flex items-center gap-2">
                            {show.name}
                            {show.aiRecommended && <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">AI Suggested</Badge>}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <Input 
                                type="number" 
                                min={1}
                                className="w-20 text-center h-8"
                                defaultValue={show.keepEpisodes}
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value);
                                  if (val && val !== show.keepEpisodes) {
                                    handleUpdateStatus(show.id, show.status, val);
                                  }
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button size="sm" variant="outline" className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950" onClick={() => handleUpdateStatus(show.id, 'ignored', show.keepEpisodes)}>
                              Disable
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="mt-6">
          <Card className="glass-panel border-t-4 border-t-blue-500 shadow-lg">
            <CardHeader>
              <CardTitle>AI Suggestions</CardTitle>
              <CardDescription>Shows the AI thinks you don't need to keep forever.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingShows.length === 0 && <p className="text-muted-foreground col-span-full">No pending suggestions. Try running an AI Scan.</p>}
                  {pendingShows.map(show => (
                    <Card key={show.id} className="bg-slate-50 dark:bg-slate-900 border-none shadow-sm flex flex-col justify-between">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{show.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4 pt-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Threshold</span>
                          <Input 
                            type="number" 
                            className="w-20 h-7 text-xs" 
                            defaultValue={show.keepEpisodes}
                            onBlur={(e) => {
                               const val = parseInt(e.target.value);
                               if (val) handleUpdateStatus(show.id, show.status, val);
                            }}
                          />
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-3 gap-2">
                        <Button size="sm" variant="ghost" className="text-rose-500 w-full hover:bg-rose-100 dark:hover:bg-rose-900/30" onClick={() => handleUpdateStatus(show.id, 'never_ask_ai', show.keepEpisodes)}>
                          <XCircle className="w-4 h-4 mr-1" /> Hide
                        </Button>
                        <Button size="sm" variant="default" className="bg-blue-600 hover:bg-blue-700 text-white w-full" onClick={() => handleUpdateStatus(show.id, 'active', show.keepEpisodes)}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Enable
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ignored Tab */}
        <TabsContent value="ignored" className="mt-6">
          <Card className="glass-panel border-t-4 border-t-slate-500 shadow-lg">
            <CardHeader>
              <CardTitle>Ignored Shows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {ignoredShows.length === 0 && <p className="text-muted-foreground text-sm">No ignored shows.</p>}
                {ignoredShows.map(show => (
                  <Badge key={show.id} variant="secondary" className="px-3 py-1 text-sm flex items-center gap-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => handleUpdateStatus(show.id, 'pending', show.keepEpisodes)}>
                    {show.name} <span className="text-xs opacity-50">(Click to restore)</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dry Run Modal */}
      {showDryRunModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl glass-panel shadow-2xl animate-in zoom-in-95 duration-200">
            <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
              <CardTitle className="flex items-center gap-2 text-rose-500">
                <ShieldAlert className="w-5 h-5" /> Pending Deletions
              </CardTitle>
              <CardDescription>
                These seasons have met the episode threshold and are ready to be deleted and unmonitored.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-6 max-h-[60vh] overflow-y-auto">
              {pendingDeletions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                  <p>No old seasons found for deletion!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingDeletions.map(d => {
                    const key = `${d.sonarrId}-${d.seasonNumber}`;
                    return (
                      <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500" 
                            checked={selectedDeletions.has(key)}
                            onChange={() => toggleSelection(key)}
                          />
                          <div>
                            <p className="font-semibold">{d.name}</p>
                            <p className="text-xs text-muted-foreground">Season {d.seasonNumber} • {Math.round(d.sizeOnDisk / (1024*1024*1024))} GB</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 pt-4 rounded-b-xl">
              <Button variant="ghost" onClick={() => setShowDryRunModal(false)}>Cancel</Button>
              <Button 
                variant="destructive" 
                onClick={handleExecute} 
                disabled={executeLoading || selectedDeletions.size === 0}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {executeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Execute Deletion & Unmonitor
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  )
}
