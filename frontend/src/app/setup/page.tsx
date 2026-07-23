"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Lock, User, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { setAuthCookie } from '@/app/actions'

export default function SetupPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast.error("Passwords do not match!")
      return
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long")
      return
    }

    setLoading(true)
    
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      
      const data = await res.json()
      
      if (data.success) {
        toast.success("Setup complete! Welcome.")
        await setAuthCookie(data.token)
        router.push('/')
        router.refresh()
      } else {
        toast.error(data.error || "Setup failed")
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
        <div className="absolute top-[0%] right-[0%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-[0%] left-[0%] w-[50%] h-[50%] rounded-full bg-teal-500/10 blur-[120px]" />
      </div>

      <Card className="w-full max-w-lg glass-panel border-t-4 border-t-emerald-500 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
        
        <CardHeader className="space-y-3 pb-8 text-center pt-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-2 shadow-inner border border-emerald-500/20">
            <ShieldCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <CardTitle className="text-3xl font-extrabold tracking-tight text-gradient bg-clip-text text-transparent bg-gradient-to-br from-slate-800 to-emerald-600 dark:from-slate-100 dark:to-emerald-400">
            Welcome to MediaCentral
          </CardTitle>
          <CardDescription className="text-base max-w-sm mx-auto">
            Let's secure your instance. Create an admin account to get started.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSetup} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Admin Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="pl-10 h-12 bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-emerald-500/50 transition-all shadow-sm" 
                  placeholder="admin" 
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-10 h-12 bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-emerald-500/50 transition-all shadow-sm" 
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confirm Password</Label>
                <div className="relative">
                  <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="pl-10 h-12 bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-emerald-500/50 transition-all shadow-sm" 
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
            </div>
            
            <Button 
              type="submit" 
              disabled={loading || password.length < 8 || password !== confirmPassword} 
              className="w-full h-12 mt-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-emerald-500/25 transition-all text-base font-semibold"
            >
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : 'Complete Setup'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
