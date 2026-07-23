'use server'
import { cookies } from 'next/headers'

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set('token', token, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_HTTPS === 'true', 
    maxAge: 7 * 24 * 60 * 60, 
    path: '/' 
  })
}

export async function clearAuthCookie() {
  const cookieStore = await cookies()
  cookieStore.delete('token')
}
