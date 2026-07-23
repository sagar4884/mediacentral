"use client"

import * as React from "react"
import { createContext, useContext, useState, useEffect } from "react"

interface DryRunContextType {
  isDryRun: boolean
  setIsDryRun: (value: boolean) => void
}

const DryRunContext = createContext<DryRunContextType | undefined>(undefined)

export function DryRunProvider({ children }: { children: React.ReactNode }) {
  const isDryRun = false;
  const setIsDryRun = (val: boolean) => {};

  return (
    <DryRunContext.Provider value={{ isDryRun, setIsDryRun }}>
      {children}
    </DryRunContext.Provider>
  )
}

export function useDryRun() {
  const context = useContext(DryRunContext)
  if (context === undefined) {
    throw new Error("useDryRun must be used within a DryRunProvider")
  }
  return context
}
