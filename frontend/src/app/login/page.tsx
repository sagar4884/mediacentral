"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Lock, User, Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { setAuthCookie } from '@/app/actions'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      
      const data = await res.json()
      
      if (data.success) {
        toast.success("Welcome back!")
        await setAuthCookie(data.token)
        router.push('/')
        router.refresh()
      } else {
        toast.error(data.error || "Login failed")
      }
    } catch (error) {
      toast.error("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      {/* Background gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/10 blur-[120px]" />
      </div>

      <Card className="w-full max-w-md glass-panel border-t-4 border-t-indigo-500 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
        
        <CardHeader className="space-y-3 pb-8 text-center pt-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-2 shadow-inner border border-indigo-500/20">
            <Play className="w-8 h-8 text-indigo-500 ml-1" />
          </div>
          <CardTitle className="text-3xl font-extrabold tracking-tight text-gradient bg-clip-text text-transparent bg-gradient-to-br from-slate-800 to-indigo-600 dark:from-slate-100 dark:to-indigo-400">
            MediaCentral
          </CardTitle>
          <CardDescription className="text-base">
            Please sign in to continue
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="pl-10 h-12 bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-indigo-500/50 transition-all shadow-sm" 
                  placeholder="Enter your username" 
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 h-12 bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-indigo-500/50 transition-all shadow-sm" 
                  placeholder="Enter your password" 
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            
            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full h-12 mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg hover:shadow-indigo-500/25 transition-all text-base font-semibold"
            >
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
