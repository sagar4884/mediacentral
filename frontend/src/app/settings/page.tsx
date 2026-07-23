"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { RefreshCw, Circle, Loader2, Database, ShieldAlert } from "lucide-react"

type ServiceStatus = 'green' | 'yellow' | 'red' | 'loading';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})
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
  const [troubleshooting, setTroubleshooting] = useState<string | null>(null)
  
  const [backupOptions, setBackupOptions] = useState({
    settings: true,
    media: true,
    plex: true
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const [settings, setSettings] = useState<Record<string, string>>({
    UnraidURL: '', UnraidKey: '',
    RadarrURL: '', RadarrKey: '', RadarrExternalURL: '',
    SonarrURL: '', SonarrKey: '', SonarrExternalURL: '',
    JellyseerrURL: '', JellyseerrKey: '', JellyseerrExternalURL: '',
    TautulliURL: '', TautulliKey: '', TautulliExternalURL: '',
    PlexURL: '', PlexToken: '', PlexExternalURL: '',
    BanDuration1: '0', BanDuration2: '86400000', BanDuration3: '604800000',
    GeminiKey: '', GeminiScoreModel: 'gemini-3.5-flash', GeminiLearnModel: 'gemini-3.1-pro-preview',
    PushoverUserKey: '', PushoverAppToken: '',
    PushoverNotifyAutoDelete: 'true', PushoverNotifyManualDelete: 'false', PushoverNotifyPlexBan: 'true', PushoverNotifyAccountSharing: 'true', PushoverNotifySyncCompletion: 'false',
    StorageProvider: 'Unraid', AutoKeepWatchedMedia: 'true', AutoKeepRequestedMedia: 'true', DeletionGracePeriod: '30',
    EnableConcurrentIPProtection: 'false', StreamTerminationMessage: 'You are not allowed to share your account.', TautulliShowWatchThreshold: 'any',
    BanRoleName: 'Temporarily Banned', RevokedRoleName: 'Revoked', AICurationGuidelines: ''
  })

  useEffect(() => {
    // Initial fetch of settings
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data === 'object' && !data.error) {
          setSettings(prev => ({ ...prev, ...data }))
        }
      })
      .catch(err => console.error(err))

    // Polling status background check
    const fetchStatus = () => {
      fetch('/api/settings/status')
        .then(res => res.json())
        .then(data => {
          if (!data.error) setStatus(data);
        })
        .catch(() => {})
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [])

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleTestConnection = async (service: string, urlKey: string, keyKey: string) => {
    setTesting(prev => ({ ...prev, [service]: true }))
    setTroubleshooting(null) // clear previous troubleshooting
    try {
      const payload: any = { service, url: settings[urlKey] || '', key: settings[keyKey] || '' };
      if (service === 'Gemini') {
        payload.scoreModel = settings.GeminiScoreModel;
        payload.learnModel = settings.GeminiLearnModel;
      }
      
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.error(data.message)
        if (data.troubleshooting) {
          setTroubleshooting(data.troubleshooting)
        }
      }
    } catch (e) {
      toast.error(`Failed to test ${service}`)
    }
    setTesting(prev => ({ ...prev, [service]: false }))
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        toast.success("Settings saved successfully")
        // Trigger a status refresh immediately
        fetch('/api/settings/status')
          .then(res => res.json())
          .then(data => { if (!data.error) setStatus(data); })
      } else {
        toast.error("Failed to save settings")
      }
    } catch (error) {
      toast.error("Error saving settings")
    }
    setLoading(false)
  }

  const handleManualSync = async (service?: string) => {
    const target = service || 'Global';
    setSyncing(prev => ({ ...prev, [target]: true }));
    toast.info(`Triggering ${target} sync...`);
    
    try {
      const response = await fetch('/api/settings/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(service ? { service } : {})
      });
      
      if (response.ok) {
        toast.success(`${target} sync started in background`)
      } else {
        toast.error(`Failed to trigger ${target} sync`)
      }
    } catch (error) {
      toast.error(`Error triggering ${target} sync`)
    }
    setTimeout(() => {
      setSyncing(prev => ({ ...prev, [target]: false }));
    }, 1000); // UI reset
  }

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const query = new URLSearchParams({
        settings: backupOptions.settings.toString(),
        media: backupOptions.media.toString(),
        plex: backupOptions.plex.toString(),
      });
      const response = await fetch(`/api/backup/export?${query}`);
      if (!response.ok) throw new Error('Failed to fetch backup');
      
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `mediacentral-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Backup downloaded successfully!');
    } catch (e) {
      toast.error('Failed to export backup.');
    }
    setIsExporting(false);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("WARNING: This will overwrite your existing configuration and data with the contents of the backup file. Are you sure you want to proceed?")) {
      e.target.value = '';
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string);
        const res = await fetch('/api/backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (data.success) {
          toast.success(data.message);
          setTimeout(() => window.location.reload(), 1500);
        } else {
          toast.error(data.error || 'Import failed.');
        }
      } catch (err) {
        toast.error('Failed to read or parse backup file. Ensure it is a valid JSON.');
      }
      setIsImporting(false);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-indigo-600 dark:from-slate-200 dark:to-indigo-400">Settings</h1>
          <p className="text-muted-foreground text-lg mt-2">Manage all integrations and application preferences.</p>
        </div>
        <Button onClick={() => handleManualSync()} variant="outline" className="gap-2 shrink-0 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <RefreshCw className={`h-4 w-4 ${syncing['Global'] ? 'animate-spin text-indigo-500' : ''}`} />
          Sync All Data
        </Button>
      </div>

      <Tabs defaultValue="unraid" orientation="vertical" className="flex flex-col md:flex-row gap-8 mt-8">
        <div className="md:w-64 shrink-0">
          <TabsList className="flex flex-col h-auto bg-transparent space-y-1 w-full items-stretch justify-start">
            <TabsTrigger value="unraid" className="justify-start px-4 py-3 text-left data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 rounded-xl transition-all">Unraid</TabsTrigger>
            <TabsTrigger value="services" className="justify-start px-4 py-3 text-left data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 rounded-xl transition-all">Media Services</TabsTrigger>
            <TabsTrigger value="metadata" className="justify-start px-4 py-3 text-left data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 rounded-xl transition-all">Metadata APIs</TabsTrigger>
            <TabsTrigger value="plex" className="justify-start px-4 py-3 text-left data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400 rounded-xl transition-all">Plex & Tautulli</TabsTrigger>
            <TabsTrigger value="ai" className="justify-start px-4 py-3 text-left data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 rounded-xl transition-all">Google AI</TabsTrigger>
            <TabsTrigger value="notifications" className="justify-start px-4 py-3 text-left data-[state=active]:bg-rose-500/10 data-[state=active]:text-rose-600 dark:data-[state=active]:text-rose-400 rounded-xl transition-all">Notifications</TabsTrigger>
            <TabsTrigger value="security" className="justify-start px-4 py-3 text-left data-[state=active]:bg-slate-500/10 data-[state=active]:text-slate-600 dark:data-[state=active]:text-slate-400 rounded-xl transition-all">Security</TabsTrigger>
            <TabsTrigger value="backup" className="justify-start px-4 py-3 text-left data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-600 dark:data-[state=active]:text-sky-400 rounded-xl transition-all">Backup & Restore</TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1">
          <TabsContent value="unraid" className="m-0 animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel border-t-4 border-t-indigo-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl font-bold">Unraid Storage Integration</CardTitle>
              <CardDescription className="text-sm mt-1">Configure connection to Unraid GraphQL API to accurately fetch server disk space & hardware metrics (Use an API key with Viewer role).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="unraid-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Unraid URL</Label>
                  <Input id="unraid-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-indigo-500/50 transition-all" value={settings.UnraidURL || ''} onChange={e => handleChange('UnraidURL', e.target.value)} placeholder="http://192.168.1.100" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unraid-key" className="text-xs font-semibold uppercase tracking-wider text-slate-500">API Key (Viewer Role)</Label>
                  <Input id="unraid-key" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-indigo-500/50 transition-all" value={settings.UnraidKey || ''} onChange={e => handleChange('UnraidKey', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Storage Provider</Label>
                <select 
                  className="flex h-11 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 transition-all"
                  value={settings.StorageProvider}
                  onChange={e => handleChange('StorageProvider', e.target.value)}
                >
                  <option value="Unraid">Unraid API (Default)</option>
                  <option value="Radarr">Radarr / Sonarr Fallback</option>
                  <option value="Local OS">Local OS (Windows / Linux Disk)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-2">Determines how the dashboard calculates total free space.</p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <Button variant="secondary" onClick={() => handleTestConnection("Unraid", "UnraidURL", "UnraidKey")} disabled={testing['Unraid']} className="rounded-xl">
                {testing['Unraid'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel border-t-4 border-t-purple-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Radarr Integration</CardTitle>
              <CardDescription>Configure connection to Radarr for movie management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="radarr-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal URL (For Backend)</Label>
                  <Input id="radarr-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.RadarrURL} onChange={e => handleChange('RadarrURL', e.target.value)} placeholder="http://192.168.1.100:7878" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radarr-key" className="text-xs font-semibold uppercase tracking-wider text-slate-500">API Key</Label>
                  <Input id="radarr-key" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.RadarrKey} onChange={e => handleChange('RadarrKey', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="radarr-ext-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">External URL (For Top Navbar Links) [Optional]</Label>
                <Input id="radarr-ext-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.RadarrExternalURL || ''} onChange={e => handleChange('RadarrExternalURL', e.target.value)} placeholder="https://radarr.yourdomain.com" />
                <p className="text-xs text-slate-500 mt-1">If left blank, the navbar will use the Internal URL.</p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap sm:flex-nowrap justify-between gap-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handleTestConnection("Radarr", "RadarrURL", "RadarrKey")} disabled={testing['Radarr']} className="rounded-xl">
                  {testing['Radarr'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
                <Button variant="outline" onClick={() => handleManualSync('Radarr')} disabled={syncing['Radarr']} className="rounded-xl">
                  <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                  Sync Radarr
                </Button>
              </div>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>
          
          <Card className="glass-panel border-t-4 border-t-purple-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Sonarr Integration</CardTitle>
              <CardDescription>Configure connection to Sonarr for TV show management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="sonarr-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal URL (For Backend)</Label>
                  <Input id="sonarr-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.SonarrURL} onChange={e => handleChange('SonarrURL', e.target.value)} placeholder="http://192.168.1.100:8989" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sonarr-key" className="text-xs font-semibold uppercase tracking-wider text-slate-500">API Key</Label>
                  <Input id="sonarr-key" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.SonarrKey} onChange={e => handleChange('SonarrKey', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="sonarr-ext-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">External URL (For Top Navbar Links) [Optional]</Label>
                <Input id="sonarr-ext-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.SonarrExternalURL || ''} onChange={e => handleChange('SonarrExternalURL', e.target.value)} placeholder="https://sonarr.yourdomain.com" />
                <p className="text-xs text-slate-500 mt-1">If left blank, the navbar will use the Internal URL.</p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap sm:flex-nowrap justify-between gap-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handleTestConnection("Sonarr", "SonarrURL", "SonarrKey")} disabled={testing['Sonarr']} className="rounded-xl">
                  {testing['Sonarr'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
                <Button variant="outline" onClick={() => handleManualSync('Sonarr')} disabled={syncing['Sonarr']} className="rounded-xl">
                  <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                  Sync Sonarr
                </Button>
              </div>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>

          <Card className="glass-panel border-t-4 border-t-purple-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Jellyseerr Integration</CardTitle>
              <CardDescription>Configure connection to Jellyseerr for request management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="jellyseerr-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal URL (For Backend)</Label>
                  <Input id="jellyseerr-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.JellyseerrURL} onChange={e => handleChange('JellyseerrURL', e.target.value)} placeholder="http://192.168.1.100:5055" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jellyseerr-key" className="text-xs font-semibold uppercase tracking-wider text-slate-500">API Key</Label>
                  <Input id="jellyseerr-key" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.JellyseerrKey} onChange={e => handleChange('JellyseerrKey', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="jellyseerr-ext-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">External URL (For Top Navbar Links) [Optional]</Label>
                <Input id="jellyseerr-ext-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-purple-500/50 transition-all" value={settings.JellyseerrExternalURL || ''} onChange={e => handleChange('JellyseerrExternalURL', e.target.value)} placeholder="https://requests.yourdomain.com" />
                <p className="text-xs text-slate-500 mt-1">If left blank, the navbar will use the Internal URL.</p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap sm:flex-nowrap justify-between gap-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handleTestConnection("Jellyseerr", "JellyseerrURL", "JellyseerrKey")} disabled={testing['Jellyseerr']} className="rounded-xl">
                  {testing['Jellyseerr'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
                <Button variant="outline" onClick={() => handleManualSync('Jellyseerr')} disabled={syncing['Jellyseerr']} className="rounded-xl">
                  <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                  Sync Jellyseerr
                </Button>
              </div>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>

          <Card className="glass-panel border-t-4 border-t-purple-500 shadow-lg mt-6">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Curation Rules</CardTitle>
              <CardDescription>Configure how MediaCentral decides to keep or delete media automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 flex flex-col justify-center">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Auto-Keep Watched Media</Label>
                  <select 
                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
                    value={settings.AutoKeepWatchedMedia}
                    onChange={e => handleChange('AutoKeepWatchedMedia', e.target.value)}
                  >
                    <option value="true">Enabled (If Tautulli playcount &gt; 0)</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
                <div className="space-y-2 flex flex-col justify-center">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Auto-Keep Requested Media</Label>
                  <select 
                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
                    value={settings.AutoKeepRequestedMedia}
                    onChange={e => handleChange('AutoKeepRequestedMedia', e.target.value)}
                  >
                    <option value="true">Enabled (If Jellyseerr tag exists)</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Deletion Grace Period (Days)</Label>
                  <Input type="number" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-10 focus-visible:ring-purple-500/50" value={settings.DeletionGracePeriod} onChange={e => handleChange('DeletionGracePeriod', e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Days an item sits in "Waiting" before it's deleted.</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel border-t-4 border-t-blue-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="flex justify-between items-center text-xl font-bold">
                TMDB Integration
                {settings.TMDBKey && (
                  <Badge variant={status['TMDB'] === 'green' ? "default" : status['TMDB'] === 'red' ? "destructive" : "secondary"} className="shadow-sm">
                    {status['TMDB'] === 'green' ? 'Connected' : status['TMDB'] === 'red' ? 'Error' : 'Unknown Status'}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Provide your TMDB API Key or Read Access Token to fetch rich media metadata (posters, cast, synopsis) for Radarr movies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="tmdb-key" className="text-xs font-semibold uppercase tracking-wider text-slate-500">TMDB API Key / Read Access Token</Label>
                <Input id="tmdb-key" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-blue-500/50 transition-all max-w-xl" value={settings.TMDBKey} onChange={e => handleChange('TMDBKey', e.target.value)} placeholder="Enter TMDB API Key..." />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <Button variant="secondary" onClick={() => handleTestConnection("TMDB", "", "TMDBKey")} disabled={testing['TMDB']} className="rounded-xl">
                {testing['TMDB'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>

          <Card className="glass-panel border-t-4 border-t-blue-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="flex justify-between items-center text-xl font-bold">
                TVDB Integration
                {settings.TVDBKey && (
                  <Badge variant={status['TVDB'] === 'green' ? "default" : status['TVDB'] === 'red' ? "destructive" : "secondary"} className="shadow-sm">
                    {status['TVDB'] === 'green' ? 'Connected' : status['TVDB'] === 'red' ? 'Error' : 'Unknown Status'}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Provide your TVDB API Key (v4) to fetch rich media metadata (cast, synopsis) for Sonarr shows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="tvdb-key" className="text-xs font-semibold uppercase tracking-wider text-slate-500">TVDB API Key</Label>
                <Input id="tvdb-key" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-blue-500/50 transition-all max-w-xl" value={settings.TVDBKey} onChange={e => handleChange('TVDBKey', e.target.value)} placeholder="Enter TVDB API Key..." />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <Button variant="secondary" onClick={() => handleTestConnection("TVDB", "", "TVDBKey")} disabled={testing['TVDB']} className="rounded-xl">
                {testing['TVDB'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="plex" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel border-t-4 border-t-amber-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Plex Integration</CardTitle>
              <CardDescription>Manage user access and streams.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="plex-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal URL (For Backend)</Label>
                  <Input id="plex-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-amber-500/50 transition-all" value={settings.PlexURL} onChange={e => handleChange('PlexURL', e.target.value)} placeholder="http://192.168.1.100:32400" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plex-token" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Plex Token</Label>
                  <Input id="plex-token" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-amber-500/50 transition-all" value={settings.PlexToken} onChange={e => handleChange('PlexToken', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="plex-ext-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">External URL (For Top Navbar Links) [Optional]</Label>
                <Input id="plex-ext-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-amber-500/50 transition-all" value={settings.PlexExternalURL || ''} onChange={e => handleChange('PlexExternalURL', e.target.value)} placeholder="https://app.plex.tv" />
                <p className="text-xs text-slate-500 mt-1">If left blank, the navbar will use the Internal URL.</p>
              </div>
              
              <div className="p-5 bg-slate-100 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" /> 
                  Automated Ban Durations
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">1st Offense</Label>
                    <select 
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500/50 outline-none transition-all"
                      value={settings.BanDuration1}
                      onChange={e => handleChange('BanDuration1', e.target.value)}
                    >
                      <option value="0">End 2nd stream</option>
                      <option value="86400000">1 day ban</option>
                      <option value="259200000">3 day ban</option>
                      <option value="604800000">7 day ban</option>
                      <option value="2592000000">30 day ban</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">2nd Offense</Label>
                    <select 
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500/50 outline-none transition-all"
                      value={settings.BanDuration2}
                      onChange={e => handleChange('BanDuration2', e.target.value)}
                    >
                      <option value="0">End 2nd stream</option>
                      <option value="86400000">1 day ban</option>
                      <option value="259200000">3 day ban</option>
                      <option value="604800000">7 day ban</option>
                      <option value="2592000000">30 day ban</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">3rd+ Offense</Label>
                    <select 
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500/50 outline-none transition-all"
                      value={settings.BanDuration3}
                      onChange={e => handleChange('BanDuration3', e.target.value)}
                    >
                      <option value="0">End 2nd stream</option>
                      <option value="86400000">1 day ban</option>
                      <option value="259200000">3 day ban</option>
                      <option value="604800000">7 day ban</option>
                      <option value="2592000000">30 day ban</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ban Role Name</Label>
                    <Input className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 rounded-xl h-11" value={settings.BanRoleName} onChange={e => handleChange('BanRoleName', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Revoked Role Name</Label>
                    <Input className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 rounded-xl h-11" value={settings.RevokedRoleName} onChange={e => handleChange('RevokedRoleName', e.target.value)} />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap sm:flex-nowrap justify-between gap-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handleTestConnection("Plex", "PlexURL", "PlexToken")} disabled={testing['Plex']} className="rounded-xl">
                  {testing['Plex'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
                <Button variant="outline" onClick={() => handleManualSync('Plex')} disabled={syncing['Plex']} className="rounded-xl">
                  <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                  Pull all from Plex
                </Button>
              </div>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>

          <Card className="glass-panel border-t-4 border-t-amber-500 shadow-lg mt-6">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Tautulli Integration</CardTitle>
              <CardDescription>Tracking and active stream protection.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="tautulli-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal URL (For Backend)</Label>
                  <Input id="tautulli-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-amber-500/50 transition-all" value={settings.TautulliURL} onChange={e => handleChange('TautulliURL', e.target.value)} placeholder="http://192.168.1.100:8181" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tautulli-key" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tautulli API Key</Label>
                  <Input id="tautulli-key" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-amber-500/50 transition-all" value={settings.TautulliKey} onChange={e => handleChange('TautulliKey', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="tautulli-ext-url" className="text-xs font-semibold uppercase tracking-wider text-slate-500">External URL (For Top Navbar Links) [Optional]</Label>
                <Input id="tautulli-ext-url" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-amber-500/50 transition-all" value={settings.TautulliExternalURL || ''} onChange={e => handleChange('TautulliExternalURL', e.target.value)} placeholder="https://tautulli.yourdomain.com" />
                <p className="text-xs text-slate-500 mt-1">If left blank, the navbar will use the Internal URL.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
                <div className="space-y-2 flex flex-col justify-center">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Concurrent IP Protection</Label>
                  <select 
                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                    value={settings.EnableConcurrentIPProtection}
                    onChange={e => handleChange('EnableConcurrentIPProtection', e.target.value)}
                  >
                    <option value="true">Enabled (Ban account sharers)</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Stream Termination Message</Label>
                  <Input className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-10 focus-visible:ring-amber-500/50" value={settings.StreamTerminationMessage} onChange={e => handleChange('StreamTerminationMessage', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
                <div className="space-y-2 flex flex-col justify-center">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">TV Show Watch Threshold</Label>
                  <p className="text-xs text-slate-500">Determine when a TV show is considered "watched".</p>
                  <select 
                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                    value={settings.TautulliShowWatchThreshold}
                    onChange={e => handleChange('TautulliShowWatchThreshold', e.target.value)}
                  >
                    <option value="any">At least 1 episode watched</option>
                    <option value="half">At least 50% of episodes watched</option>
                    <option value="full">100% fully watched</option>
                  </select>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap sm:flex-nowrap justify-between gap-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handleTestConnection("Tautulli", "TautulliURL", "TautulliKey")} disabled={testing['Tautulli']} className="rounded-xl">
                  {testing['Tautulli'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
                <Button variant="outline" onClick={() => handleManualSync('Tautulli')} disabled={syncing['Tautulli']} className="rounded-xl">
                  <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                  Sync Tautulli
                </Button>
              </div>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="ai" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel border-t-4 border-t-emerald-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Google AI Configuration</CardTitle>
              <CardDescription>Configure Gemini Pro and Flash models for curation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="gemini-key" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gemini API Key</Label>
                <Input id="gemini-key" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-emerald-500/50 transition-all max-w-xl" value={settings.GeminiKey} onChange={e => handleChange('GeminiKey', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="gemini-score-model" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Model for AI Scoring</Label>
                  <select 
                    id="gemini-score-model" 
                    className="flex h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 transition-all"
                    value={settings.GeminiScoreModel}
                    onChange={e => handleChange('GeminiScoreModel', e.target.value)}
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended)</option>
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-lite</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gemini-learn-model" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Model for AI Learning</Label>
                  <select 
                    id="gemini-learn-model" 
                    className="flex h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 transition-all"
                    value={settings.GeminiLearnModel}
                    onChange={e => handleChange('GeminiLearnModel', e.target.value)}
                  >
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (Recommended)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-lite</option>
                  </select>
                </div>
              </div>
              
              <div className="space-y-2 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Custom AI Curation Guidelines</Label>
                  <textarea 
                    className="flex min-h-[120px] w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 resize-y"
                    placeholder="E.g., I don't like horror movies. Rate anything below 2010 heavily downwards."
                    value={settings.AICurationGuidelines}
                    onChange={e => handleChange('AICurationGuidelines', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">These guidelines will be appended to the AI's internal scoring prompt to tailor curation to your tastes.</p>
                </div>
                
                {troubleshooting && (
                <div className="bg-amber-500/10 border-l-4 border-amber-500 p-4 rounded-xl mt-4">
                  <h4 className="font-bold text-amber-600 dark:text-amber-500 mb-2">Troubleshooting Steps</h4>
                  <p className="text-sm text-amber-800 dark:text-amber-200/80 whitespace-pre-wrap">{troubleshooting}</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <Button variant="secondary" onClick={() => handleTestConnection("Gemini", "", "GeminiKey")} disabled={testing['Gemini']} className="rounded-xl">
                {testing['Gemini'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test API Key
              </Button>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel border-t-4 border-t-rose-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Pushover Notifications</CardTitle>
              <CardDescription>Receive alerts for deletions, bans, and system events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="pushover-user" className="text-xs font-semibold uppercase tracking-wider text-slate-500">User Key</Label>
                  <Input id="pushover-user" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-rose-500/50 transition-all" value={settings.PushoverUserKey} onChange={e => handleChange('PushoverUserKey', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pushover-app" className="text-xs font-semibold uppercase tracking-wider text-slate-500">App Token</Label>
                  <Input id="pushover-app" type="password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-rose-500/50 transition-all" value={settings.PushoverAppToken} onChange={e => handleChange('PushoverAppToken', e.target.value)} />
                </div>
              </div>
              <div className="pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-4">Notification Events</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" className="form-checkbox h-5 w-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 bg-white dark:bg-slate-900"
                      checked={settings.PushoverNotifyAutoDelete === 'true'}
                      onChange={e => handleChange('PushoverNotifyAutoDelete', e.target.checked ? 'true' : 'false')} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Automated Media Deletions (AI or Rolling)</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" className="form-checkbox h-5 w-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 bg-white dark:bg-slate-900"
                      checked={settings.PushoverNotifyManualDelete === 'true'}
                      onChange={e => handleChange('PushoverNotifyManualDelete', e.target.checked ? 'true' : 'false')} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Manual Media Deletions (Dashboard)</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" className="form-checkbox h-5 w-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 bg-white dark:bg-slate-900"
                      checked={settings.PushoverNotifyPlexBan === 'true'}
                      onChange={e => handleChange('PushoverNotifyPlexBan', e.target.checked ? 'true' : 'false')} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Plex User Bans & Unbans</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" className="form-checkbox h-5 w-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 bg-white dark:bg-slate-900"
                      checked={settings.PushoverNotifyAccountSharing === 'true'}
                      onChange={e => handleChange('PushoverNotifyAccountSharing', e.target.checked ? 'true' : 'false')} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Account Sharing Warnings</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="checkbox" className="form-checkbox h-5 w-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 bg-white dark:bg-slate-900"
                      checked={settings.PushoverNotifySyncCompletion === 'true'}
                      onChange={e => handleChange('PushoverNotifySyncCompletion', e.target.checked ? 'true' : 'false')} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Global Sync Completions</span>
                  </label>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <Button variant="secondary" onClick={() => handleTestConnection("Pushover", "PushoverUserKey", "PushoverAppToken")} disabled={testing['Pushover']} className="rounded-xl">
                {testing['Pushover'] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Notification
              </Button>
              <Button onClick={handleSave} disabled={loading} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md">Save Settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel border-t-4 border-t-slate-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Admin Credentials</CardTitle>
              <CardDescription>Set up or update your admin username and password. If you leave these blank in a fresh install, the dashboard remains open to everyone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Username</Label>
                  <Input 
                    type="text" 
                    placeholder="admin"
                    id="newUsername"
                    className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-slate-500/50 transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Password</Label>
                  <Input 
                    type="password" 
                    id="newPassword"
                    placeholder="Enter new password"
                    className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-slate-500/50 transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Password (Required for changes if already set)</Label>
                  <Input 
                    type="password" 
                    id="currentPassword"
                    placeholder="Leave blank if never set"
                    className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl h-11 focus-visible:ring-slate-500/50 transition-all" 
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t border-slate-200/50 dark:border-slate-800/50 pt-6">
              <Button 
                onClick={async () => {
                  const currentPassword = (document.getElementById('currentPassword') as HTMLInputElement).value;
                  const newUsername = (document.getElementById('newUsername') as HTMLInputElement).value;
                  const newPassword = (document.getElementById('newPassword') as HTMLInputElement).value;

                  if (!newUsername && !newPassword) {
                    toast.error("Please enter a username or password to update.");
                    return;
                  }

                  const res = await fetch('/api/auth/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword, newUsername, newPassword })
                  });
                  const data = await res.json();
                  if (data.success) {
                    toast.success("Credentials updated successfully!");
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    toast.error(data.error || "Failed to update credentials");
                  }
                }}
                disabled={loading} 
                className="rounded-xl bg-slate-700 hover:bg-slate-800 text-white shadow-md"
              >
                Update Credentials
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-6 m-0 animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel border-t-4 border-t-sky-500 shadow-lg">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-bold">Backup System</CardTitle>
              <CardDescription>Export your settings, curation data, and plex data to a single JSON file. You can import this file on a new machine to migrate your setup perfectly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* EXPORT SECTION */}
                <div className="space-y-4 p-5 bg-sky-500/5 rounded-2xl border border-sky-200/20 dark:border-sky-500/20">
                  <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Export Backup</h3>
                  
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="form-checkbox h-5 w-5 text-sky-600 rounded border-slate-300 focus:ring-sky-500 bg-white dark:bg-slate-900"
                        checked={backupOptions.settings} 
                        onChange={e => setBackupOptions(prev => ({...prev, settings: e.target.checked}))}
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Settings & API Keys</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="form-checkbox h-5 w-5 text-sky-600 rounded border-slate-300 focus:ring-sky-500 bg-white dark:bg-slate-900"
                        checked={backupOptions.media} 
                        onChange={e => setBackupOptions(prev => ({...prev, media: e.target.checked}))}
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Media Curation & AI Knowledge</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="form-checkbox h-5 w-5 text-sky-600 rounded border-slate-300 focus:ring-sky-500 bg-white dark:bg-slate-900"
                        checked={backupOptions.plex} 
                        onChange={e => setBackupOptions(prev => ({...prev, plex: e.target.checked}))}
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Plex Users, Roles, & Ban History</span>
                    </label>
                  </div>
                  
                  <Button 
                    onClick={handleExportBackup} 
                    disabled={isExporting || (!backupOptions.settings && !backupOptions.media && !backupOptions.plex)} 
                    className="w-full mt-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-md"
                  >
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Download Backup JSON
                  </Button>
                </div>

                {/* IMPORT SECTION */}
                <div className="space-y-4 p-5 bg-rose-500/5 rounded-2xl border border-rose-200/20 dark:border-rose-500/20 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Import / Restore Backup</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload a previously exported JSON backup file. This will safely upsert data. <strong className="text-rose-500">Warning:</strong> Importing will overwrite existing conflicting keys.
                    </p>
                  </div>
                  
                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".json" 
                      onChange={handleImportBackup} 
                      disabled={isImporting}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <Button 
                      disabled={isImporting} 
                      variant="outline"
                      className="w-full rounded-xl border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950"
                    >
                      {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Select Backup File to Restore"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </div>

      </Tabs>
    </div>
  )
}
