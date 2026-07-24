"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Users, ShieldAlert, AlertTriangle, UserX, FolderOpen, UploadCloud, Crown, Layers, Loader2, Archive, Trash2, Gavel, Database, RotateCcw } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

interface PlexLibrary { id: string; name: string; type: string; }
interface PlexGroup { id: string; name: string; libraries: PlexLibrary[]; }
interface PlexRole { id: string; name: string; groups: PlexGroup[]; }
interface PlexUser { id: string; username: string; warnings: number; banUntil: string | null; roleId: string | null; previousRoleId: string | null; role?: PlexRole; isImmune: boolean; }
interface PlexViolation { id: string; userId: string; ip1: string; title1: string; ip2: string; title2: string; actionTaken: string; createdAt: string; user: PlexUser; }

export default function PlexPage() {
  const [users, setUsers] = useState<PlexUser[]>([])
  const [groups, setGroups] = useState<PlexGroup[]>([])
  const [roles, setRoles] = useState<PlexRole[]>([])
  const [libraries, setLibraries] = useState<PlexLibrary[]>([])
  const [violations, setViolations] = useState<PlexViolation[]>([])
  const [loading, setLoading] = useState(true)
  
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [selectedLibraries, setSelectedLibraries] = useState<Set<string>>(new Set())

  const [isCreatingRole, setIsCreatingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())

  const [pushing, setPushing] = useState(false)
  const [pushResults, setPushResults] = useState<any[]>([])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [uRes, gRes, rRes, lRes, vRes] = await Promise.all([
        fetch('/api/plex/users'),
        fetch('/api/plex/groups'),
        fetch('/api/plex/roles'),
        fetch('/api/plex/libraries'),
        fetch('/api/plex/violations')
      ])
      
      const uData = await uRes.json()
      const gData = await gRes.json()
      const rData = await rRes.json()
      const lData = await lRes.json()
      const vData = await vRes.json()
      
      if (Array.isArray(uData)) setUsers(uData)
      if (Array.isArray(gData)) setGroups(gData)
      if (Array.isArray(rData)) setRoles(rData)
      if (Array.isArray(lData)) setLibraries(lData)
      if (Array.isArray(vData)) setViolations(vData)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return toast.error("Group name required")
    try {
      const res = await fetch('/api/plex/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName, libraryIds: Array.from(selectedLibraries) })
      })
      if (res.ok) {
        toast.success("Group created!")
        setNewGroupName("")
        setSelectedLibraries(new Set())
        setIsCreatingGroup(false)
        fetchData()
      } else toast.error("Failed to create group")
    } catch (e) { toast.error("Network error") }
  }

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return toast.error("Role name required")
    try {
      const res = await fetch('/api/plex/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, groupIds: Array.from(selectedGroups) })
      })
      if (res.ok) {
        toast.success("Role created!")
        setNewRoleName("")
        setSelectedGroups(new Set())
        setIsCreatingRole(false)
        fetchData()
      } else toast.error("Failed to create role")
    } catch (e) { toast.error("Network error") }
  }

  const handleAssignRole = async (userId: string, roleId: string) => {
    try {
      const res = await fetch(`/api/plex/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId })
      })
      if (res.ok) {
        toast.success("User role updated")
        fetchData()
      } else toast.error("Failed to assign role")
    } catch (e) { toast.error("Network error") }
  }

  const handlePushToPlex = async () => {
    setPushing(true)
    setPushResults([])
    toast.info("Pushing to Plex...")
    try {
      const res = await fetch('/api/plex/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Live run only
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Successfully updated Plex shares!")
        setPushResults(data.results)
        fetchData() // Refresh in case users were assigned to Revoked
      } else toast.error("Failed to push configuration")
    } catch (e) { toast.error("Network error") }
    setPushing(false)
  }

  const handleClearViolations = async (userId: string) => {
    try {
      const res = await fetch(`/api/plex/unban/${userId}`, { method: 'POST' })
      if (res.ok) {
        toast.success("User violations cleared")
        fetchData()
      } else toast.error("Failed to clear violations")
    } catch (e) { toast.error("Network error") }
  }

  const handleDeleteViolation = async (violationId: string) => {
    try {
      const res = await fetch(`/api/plex/violations/${violationId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success("Violation deleted from archive")
        fetchData()
      } else toast.error("Failed to delete violation")
    } catch (e) { toast.error("Network error") }
  }

  const handleManualBan = async (username: string) => {
    const daysStr = prompt(`How many days do you want to ban ${username}?`, "1")
    if (daysStr === null) return; // User cancelled
    const days = parseInt(daysStr, 10);
    if (isNaN(days) || days < 0) {
      toast.error("Invalid number of days");
      return;
    }
    try {
      const res = await fetch(`/api/plex/revoke/${username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationDays: days })
      })
      if (res.ok) {
        toast.success(`Manually banned ${username} for ${days} days`)
        fetchData()
      } else toast.error("Failed to manual ban")
    } catch (e) { toast.error("Network error") }
  }

  const handleManualUnban = async (username: string) => {
    if (!confirm(`Are you sure you want to unban ${username} and restore their access?`)) return;
    try {
      const res = await fetch(`/api/plex/unban/${username}`, { method: 'POST' })
      if (res.ok) {
        toast.success(`Successfully unbanned ${username}`)
        fetchData()
      } else toast.error("Failed to unban user")
    } catch (e) { toast.error("Network error") }
  }

  const handleToggleImmunity = async (userId: string, current: boolean) => {
    try {
      const res = await fetch(`/api/plex/users/${userId}/immune`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isImmune: !current })
      })
      if (res.ok) {
        toast.success(current ? "Immunity removed" : "Immunity granted")
        fetchData()
      } else toast.error("Failed to update immunity")
    } catch (e) { toast.error("Network error") }
  }

  const handleSyncPlex = async () => {
    toast.info("Syncing with Plex...")
    try {
      const res = await fetch('/api/settings/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'plex' })
      })
      if (res.ok) {
        toast.success("Plex synced successfully!")
        fetchData()
      } else toast.error("Failed to sync Plex")
    } catch (e) { toast.error("Network error") }
  }

  const toggleSet = (set: Set<string>, id: string, setter: any) => {
    const newSet = new Set(set)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setter(newSet)
  }



  const activeBans: any[] = [];
  const archivedBans: any[] = [];
  const seenActiveBannedUsers = new Set<string>();

  violations.forEach(v => {
    const isCurrentlyBanned = v.user?.banUntil && new Date(v.user.banUntil).getTime() > Date.now();
    const isBanAction = v.actionTaken.toLowerCase().includes('ban') || v.actionTaken.toLowerCase().includes('revoked');
    
    if (isCurrentlyBanned && isBanAction && !seenActiveBannedUsers.has(v.userId)) {
      activeBans.push(v);
      seenActiveBannedUsers.add(v.userId);
    } else {
      archivedBans.push(v);
    }
  });

  const renderViolationCard = (v: any, isActive: boolean) => {
    const cardClass = isActive 
      ? "flex flex-col p-6 border border-slate-300/50 dark:border-slate-700/50 rounded-2xl bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/80 dark:to-slate-900 gap-4 relative overflow-hidden shadow-sm"
      : "flex flex-col p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 gap-4 relative overflow-hidden opacity-75 hover:opacity-100 grayscale-[0.6] hover:grayscale-0 transition-all duration-300";

    return (
      <div key={v.id} className={cardClass}>
        {/* Decorative Background for Immunity bypass */}
        {v.actionTaken === 'Immunity Triggered' && (
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        )}
        
        {v.actionTaken === 'Immunity Triggered' && (
          <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-amber-400 text-white px-4 py-1.5 rounded-bl-xl text-[10px] uppercase font-extrabold tracking-widest shadow-md">
            Immunity Bypass
          </div>
        )}
        
        <div className="flex flex-col md:flex-row justify-between items-start w-full relative z-10 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${v.actionTaken === 'Immunity Triggered' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'}`}>
                <UserX className="w-5 h-5" />
              </div>
              <p className={`font-extrabold text-xl ${v.actionTaken === 'Immunity Triggered' ? 'text-amber-600 dark:text-amber-500' : 'text-red-600 dark:text-red-500'}`}>
                {v.user?.username || 'Unknown User'}
              </p>
              <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800">
                {new Date(v.createdAt).toLocaleString()}
              </span>
            </div>
            
            <div className="mt-4 text-sm flex items-center gap-2">
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Action Taken</span>
              <span className={`px-2 py-0.5 rounded font-bold text-xs ${v.actionTaken === 'Immunity Triggered' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500' : 'bg-red-500/10 text-red-600 dark:text-red-500'}`}>
                {v.actionTaken}
              </span>
            </div>

            {v.user && v.user.warnings > 0 && v.actionTaken !== 'Immunity Triggered' && (
               <div className="mt-2 text-sm flex items-center gap-2">
                 <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Ban Status</span>
                 {v.user.banUntil && new Date(v.user.banUntil).getTime() > Date.now() ? (
                  <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded animate-pulse">Active until {new Date(v.user.banUntil).toLocaleString()}</span>
                ) : v.user.banUntil ? (
                  <span className="text-xs font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded">Expired</span>
                ) : null}
               </div>
            )}
          </div>
          
          <div className="flex flex-col items-end gap-2">
            {!isActive && (
              <Button variant="outline" size="icon" className="border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl w-8 h-8" onClick={() => handleDeleteViolation(v.id)} title="Delete from archive">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            {isActive && v.user && v.actionTaken !== 'Immunity Triggered' && (
              <Button variant="outline" className="border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl" onClick={() => handleClearViolations(v.user.id)}>
                Clear Ban
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 relative z-10">
          <div className="p-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 text-[10px] font-bold">1</span>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Stream</p>
            </div>
            <p className="font-semibold text-slate-700 dark:text-slate-200 truncate" title={v.title1}>{v.title1}</p>
            <p className="text-xs text-slate-400 font-mono mt-1.5 bg-white dark:bg-slate-900 inline-block px-1.5 py-0.5 rounded">{v.ip1}</p>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 text-[10px] font-bold">2</span>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Stream</p>
            </div>
            <p className="font-semibold text-slate-700 dark:text-slate-200 truncate" title={v.title2}>{v.title2}</p>
            <p className="text-xs text-slate-400 font-mono mt-1.5 bg-white dark:bg-slate-900 inline-block px-1.5 py-0.5 rounded">{v.ip2}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">Plex RBAC Management</h1>
          <p className="text-muted-foreground text-lg mt-2">
            Role-Based Access Control: Assign Libraries to Groups, Groups to Roles, and Roles to Users.
          </p>
        </div>
        <div className="glass-panel p-2 rounded-2xl flex items-center gap-2 border border-blue-900/30">
          <Button onClick={handleSyncPlex} className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl shadow-lg hover:shadow-indigo-500/25 transition-all">
            <Database className="mr-2 h-4 w-4" /> Pull all from Plex
          </Button>
          <Button onClick={handlePushToPlex} disabled={pushing} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all">
            <UploadCloud className="mr-2 h-4 w-4" /> {pushing ? 'Pushing...' : 'Push all to Plex'}
          </Button>
        </div>
      </div>

      {pushResults.length > 0 && (
        <Card className="glass border-green-500/50">
          <CardHeader><CardTitle className="text-green-500">Push Results</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {pushResults.map((r, i) => (
                <div key={i} className={`flex justify-between items-center p-2 rounded border ${r.warning ? 'bg-red-950/20 border-red-900/50 text-red-400' : 'bg-slate-800/30 border-slate-700/50'}`}>
                  <span className="font-medium">{r.username}</span>
                  <span className="text-sm">{r.action} {r.libraries.length > 0 ? `(${r.libraries.length} libs)` : ''}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="libraries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="libraries">1. Libraries</TabsTrigger>
          <TabsTrigger value="groups">2. Groups</TabsTrigger>
          <TabsTrigger value="roles">3. Roles</TabsTrigger>
          <TabsTrigger value="users">4. Users</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="libraries" className="animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-xl">Imported Libraries</CardTitle>
              <CardDescription>Master list from your local Plex Server.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div> : libraries.length === 0 ? (
                <div className="text-center p-12 border border-dashed border-slate-700 rounded-xl bg-slate-900/30">
                  <FolderOpen className="w-12 h-12 text-slate-500 mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground text-sm">No libraries. Run Sync Plex.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {libraries.map(lib => (
                    <div key={lib.id} className="p-4 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800/80 dark:to-slate-900 border border-slate-300/50 dark:border-slate-700/50 flex flex-col items-center justify-center text-center gap-3 hover-lift shadow-sm hover:shadow-md transition-all group">
                      <div className="p-3 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                        <FolderOpen className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm line-clamp-1" title={lib.name}>{lib.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-1">{lib.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups">
          {!isCreatingGroup ? (
            <Card className="glass">
              <CardHeader><CardTitle>Groups</CardTitle><CardDescription>Bundles of libraries.</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {groups.map(group => (
                    <div key={group.id} className="p-4 border border-slate-700/50 rounded-lg bg-slate-800/30 flex justify-between items-center">
                      <div className="flex items-center space-x-4">
                        <Layers className="h-6 w-6 text-primary" />
                        <div>
                          <p className="font-medium text-lg">{group.name}</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {group.libraries.map(l => <span key={l.id} className="text-xs px-2 py-1 bg-slate-900 rounded border border-slate-700">{l.name}</span>)}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => fetch(`/api/plex/groups/${group.id}`, { method:'DELETE'}).then(fetchData)}>Delete</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="border-t border-slate-800/50 pt-4"><Button onClick={() => setIsCreatingGroup(true)}>Create Group</Button></CardFooter>
            </Card>
          ) : (
            <Card className="glass border-primary/50">
              <CardHeader><CardTitle>Create Group</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2"><Label>Group Name</Label><Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} /></div>
                <div className="space-y-3">
                  <Label>Select Libraries</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {libraries.map(lib => (
                      <div key={lib.id} className="flex items-center space-x-2 p-2 hover:bg-slate-800 rounded cursor-pointer" onClick={() => toggleSet(selectedLibraries, lib.id, setSelectedLibraries)}>
                        <input type="checkbox" checked={selectedLibraries.has(lib.id)} readOnly className="w-4 h-4" />
                        <span>{lib.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-slate-800/50 pt-4">
                <Button variant="outline" onClick={() => setIsCreatingGroup(false)}>Cancel</Button>
                <Button onClick={handleCreateGroup}>Save Group</Button>
              </CardFooter>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="roles">
          {!isCreatingRole ? (
            <Card className="glass">
              <CardHeader><CardTitle>Roles</CardTitle><CardDescription>Bundles of Groups to assign to Users.</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {roles.map(role => (
                    <div key={role.id} className="p-4 border border-slate-700/50 rounded-lg bg-slate-800/30 flex justify-between items-center">
                      <div className="flex items-center space-x-4">
                        <Crown className="h-6 w-6 text-amber-500" />
                        <div>
                          <p className="font-medium text-lg">{role.name}</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {role.groups.map(g => <span key={g.id} className="text-xs px-2 py-1 bg-slate-900 rounded border border-slate-700">{g.name}</span>)}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => fetch(`/api/plex/roles/${role.id}`, { method:'DELETE'}).then(fetchData)}>Delete</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="border-t border-slate-800/50 pt-4"><Button onClick={() => setIsCreatingRole(true)}>Create Role</Button></CardFooter>
            </Card>
          ) : (
            <Card className="glass border-amber-500/50">
              <CardHeader><CardTitle>Create Role</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2"><Label>Role Name</Label><Input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} /></div>
                <div className="space-y-3">
                  <Label>Select Groups</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {groups.map(g => (
                      <div key={g.id} className="flex items-center space-x-2 p-2 hover:bg-slate-800 rounded cursor-pointer" onClick={() => toggleSet(selectedGroups, g.id, setSelectedGroups)}>
                        <input type="checkbox" checked={selectedGroups.has(g.id)} readOnly className="w-4 h-4" />
                        <span>{g.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-slate-800/50 pt-4">
                <Button variant="outline" onClick={() => setIsCreatingRole(false)}>Cancel</Button>
                <Button onClick={handleCreateRole}>Save Role</Button>
              </CardFooter>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="users" className="animate-in fade-in zoom-in-95 duration-300">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-xl">User Assignment</CardTitle>
              <CardDescription>Assign Plex users to your defined Roles.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map(user => {
                  const isBanned = user.banUntil && new Date(user.banUntil).getTime() > Date.now();
                  const displayedRoleId = isBanned ? user.previousRoleId || "" : user.roleId || "";

                  return (
                  <div key={user.id} className={`flex flex-col p-5 border rounded-2xl bg-gradient-to-b from-white to-slate-50 dark:from-slate-800/80 dark:to-slate-900 hover-lift shadow-sm hover:shadow-md transition-all group relative overflow-hidden ${isBanned ? 'border-red-400 dark:border-red-900/50 shadow-red-500/10 ring-1 ring-red-400/50' : 'border-slate-300/50 dark:border-slate-700/50'}`}>
                    {/* Background glow if immune */}
                    {user.isImmune && <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />}
                    
                    <div className="flex justify-between items-start mb-6 z-10">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2.5 rounded-xl ${isBanned ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'}`}>
                            <Users className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-lg text-slate-800 dark:text-slate-100">{user.username}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]" title={user.id}>{user.id}</p>
                          </div>
                        </div>
                        {isBanned && (
                          <div className="text-xs font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded w-fit animate-pulse border border-red-500/20">
                            BANNED UNTIL {new Date(user.banUntil as string).toLocaleString()}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950/50 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-inner">
                          <Label htmlFor={`immune-${user.id}`} className="text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer">Immune</Label>
                          <Switch 
                            id={`immune-${user.id}`}
                            checked={user.isImmune}
                            onCheckedChange={() => handleToggleImmunity(user.id, user.isImmune)}
                            className="data-[state=checked]:bg-amber-500 scale-75 origin-right"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          {!isBanned ? (
                            <Button variant="ghost" size="sm" onClick={() => handleManualBan(user.id)} className="h-7 text-xs text-red-500 hover:bg-red-500/10 hover:text-red-600 px-2 rounded-md">
                              <Gavel className="w-3.5 h-3.5 mr-1" /> Ban
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => handleManualUnban(user.id)} className="h-7 text-xs text-green-500 hover:bg-green-500/10 hover:text-green-600 px-2 rounded-md">
                              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Unban
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-auto z-10 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">Assigned Role</Label>
                      <select 
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all"
                        value={displayedRoleId}
                        onChange={(e) => handleAssignRole(user.id, e.target.value)}
                      >
                        {!displayedRoleId && <option value="" disabled>-- Select a Role --</option>}
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="animate-in fade-in zoom-in-95 duration-300">
           <Card className="glass-panel border-t-red-500 shadow-[0_-4px_24px_-8px_rgba(239,68,68,0.2)]">
            <CardHeader>
              <CardTitle className="text-red-600 dark:text-red-500 flex items-center text-xl"><ShieldAlert className="mr-3 w-6 h-6"/> Security History</CardTitle>
              <CardDescription>Users with current or past violations.</CardDescription>
            </CardHeader>
            <CardContent>
              {violations.length === 0 ? (
                <div className="text-center p-12 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-100/50 dark:bg-slate-900/30">
                  <div className="p-4 bg-green-500/10 rounded-full inline-block mb-4">
                    <ShieldAlert className="w-12 h-12 text-green-500 opacity-80" />
                  </div>
                  <p className="text-muted-foreground text-base font-medium">Monitor is healthy.</p>
                  <p className="text-sm text-slate-400 mt-1">No violations logged.</p>
                </div>
              ) : (
                <div className="space-y-12">
                  {/* Currently Active Bans */}
                  {activeBans.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-500" /> Currently Active Bans
                      </h3>
                      <div className="grid gap-6">
                        {activeBans.map(v => renderViolationCard(v, true))}
                      </div>
                    </div>
                  )}

                  {/* Archived Violations */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                      <Archive className="w-5 h-5 text-slate-400" /> Archived Violations
                    </h3>
                    {archivedBans.length === 0 ? (
                      <div className="text-center p-8 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-100/50 dark:bg-slate-900/30 text-slate-400">
                        No archived violations.
                      </div>
                    ) : (
                      <div className="grid gap-6">
                        {archivedBans.map(v => renderViolationCard(v, false))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
