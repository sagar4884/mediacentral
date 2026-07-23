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
  const [syncLoading, setSyncLoading] = useState(false)

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

  const handleUpdateStatus = async (sonarrId: number, status: string, keepEpisodes: number) => {
    try {
      const res = await fetch('/api/rolling/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sonarrId, status, keepEpisodes })
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

  const pendingShows = shows.filter(s => s.status === 'pending')
  const activeShows = shows.filter(s => s.status === 'active')
  const ignoredShows = shows.filter(s => s.status === 'ignored')

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
          <Button variant="outline" onClick={handleScanAi} disabled={aiLoading || syncLoading} className="rounded-xl border-teal-500/30 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950">
            {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Scan with AI
          </Button>
          <Button onClick={handleSync} disabled={syncLoading || aiLoading} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-md">
            {syncLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Loader2 className="mr-2 h-4 w-4" />}
            Manual Sync
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
                        <tr key={show.sonarrId} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
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
                                    handleUpdateStatus(show.sonarrId, show.status, val);
                                  }
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button size="sm" variant="outline" className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950" onClick={() => handleUpdateStatus(show.sonarrId, 'ignored', show.keepEpisodes || 3)}>
                              Ignore
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
                    <Card key={show.sonarrId} className="bg-slate-50 dark:bg-slate-900 border-none shadow-sm flex flex-col justify-between">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{show.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4 pt-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Threshold</span>
                          <Input 
                            type="number" 
                            className="w-20 h-7 text-xs" 
                            defaultValue={show.keepEpisodes || 3}
                            onBlur={(e) => {
                               const val = parseInt(e.target.value);
                               if (val) handleUpdateStatus(show.sonarrId, show.status, val);
                            }}
                          />
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-3 gap-2">
                        <Button size="sm" variant="ghost" className="text-rose-500 w-full hover:bg-rose-100 dark:hover:bg-rose-900/30" onClick={() => handleUpdateStatus(show.sonarrId, 'ignored', show.keepEpisodes || 3)}>
                          <XCircle className="w-4 h-4 mr-1" /> Ignore
                        </Button>
                        <Button size="sm" variant="default" className="bg-blue-600 hover:bg-blue-700 text-white w-full" onClick={() => handleUpdateStatus(show.sonarrId, 'active', show.keepEpisodes || 3)}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Rolling
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
                  <Badge key={show.sonarrId} variant="secondary" className="px-3 py-1 text-sm flex items-center gap-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" title="Remove the not-rolling-keep tag in Sonarr to restore this show.">
                    {show.name} <span className="text-xs opacity-50">(Remove tag in Sonarr)</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
