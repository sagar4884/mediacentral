"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Filter } from "lucide-react"
import { Check, Trash2, LayoutGrid, List, Film, Tv, CheckSquare, Square, ArrowUpDown, Loader2, ChevronLeft, ChevronRight, RotateCcw, Eye, Sparkles, Clock, RefreshCw, X, Plus, Minus } from "lucide-react"
import { toast } from "sonner"
import { MediaHoverCard } from "@/components/media-hover-card"

interface MediaItem {
  id: string;
  name: string;
  year: number;
  sizeOnDisk: number;
  path: string;
  aiScore: number | null;
  keepStatus: string;
  keepReason?: string | null;
  source: string;
  sourceId: string;
  metadata: string;
  dateAdded: string | null;
  tags: string;
  tmdbId?: number | null;
  tvdbId?: number | null;
  markedForDeletionAt?: string | Date | null;
}

interface ColumnFilters {
  yearMin?: number;
  yearMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  sizeUnit?: 'B' | 'MB' | 'GB';
  daysMin?: number;
  daysMax?: number;
  aiScoreMin?: number;
  aiScoreMax?: number;
  pathSearch?: string;
  tags: Set<string>;
}

interface RuleChange {
  type: 'keep' | 'add' | 'edit' | 'remove';
  original?: string;
  updated?: string;
  reason?: string;
  decision?: 'accepted' | 'rejected';
}

type ActionType = 'keep' | 'delete' | 'wait' | 'archive' | 'clear_score' | 'instant_delete' | 'mark_rolling' | 'mark_not_rolling'

function ResizableHeader({ 
  label, 
  sortKey, 
  width, 
  setWidth,
  sortConfig,
  requestSort,
  children
}: {
  label: string, 
  sortKey: string,
  width: number | undefined,
  setWidth: (w: number) => void,
  sortConfig: any,
  requestSort: any,
  children: React.ReactNode
}) {
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const headerRef = useRef<HTMLTableCellElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = headerRef.current?.getBoundingClientRect().width || 0;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      // Left edge drag: moving left (negative delta in X) increases width
      const delta = startX.current - moveEvent.clientX;
      setWidth(Math.max(40, startWidth.current + delta));
    };
    
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!headerRef.current) return;
    
    const th = headerRef.current;
    const tr = th.parentElement;
    if (!tr) return;
    const index = Array.from(tr.children).indexOf(th);
    
    const table = th.closest('table');
    if (!table) return;
    
    let max = 0;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const td = row.children[index] as HTMLElement;
      if (td) {
        max = Math.max(max, td.scrollWidth);
      }
    });
    
    if (max === 0) {
      max = (th.querySelector('.flex')?.scrollWidth || 50) + 32;
    }
    
    setWidth(Math.min(max + 10, 1200));
  };

  return (
    <th 
      ref={headerRef}
      className={`px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider relative group/header ${isResizing ? 'select-none' : ''}`}
      style={{ 
        width: width, 
        minWidth: width, 
        maxWidth: width 
      }}
    >
      <div className="flex items-center gap-1 overflow-hidden">
        <div 
          className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors flex-1 truncate"
          onClick={() => requestSort(sortKey as any)}
        >
          {label}
          {sortConfig.key === sortKey && <ArrowUpDown className="h-3 w-3 text-amber-500 flex-shrink-0" />}
        </div>
        {children}
      </div>
      
      {/* Drag Handle on LEFT side */}
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        className={`absolute left-0 top-0 h-full w-2 cursor-col-resize z-10 
          ${isResizing ? 'bg-amber-500 opacity-100' : 'opacity-0 group-hover/header:opacity-100 hover:bg-amber-500/50'} 
          transition-colors`}
        style={{ transform: 'translateX(-50%)' }}
      />
    </th>
  );
}

export default function CurationPage() {
  const [activeSource, setActiveSource] = useState("Radarr")
  const [activeStatus, setActiveStatus] = useState("waiting")
  const [viewMode, setViewMode] = useState<'poster' | 'table'>('table')
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [tautulliLoading, setTautulliLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiRules, setAiRules] = useState("")
  const [pendingRules, setPendingRules] = useState<RuleChange[] | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({ tags: new Set() })
  
  const [visibleColumns, setVisibleColumns] = useState({
    size: true,
    dateAdded: true,
    tags: true,
    aiScore: true,
    keepReason: true,
    path: true
  })

  const [sortConfig, setSortConfig] = useState<{ key: keyof MediaItem | 'size', direction: 'asc' | 'desc' }>({ key: 'aiScore', direction: 'desc' })

  const [colWidths, setColWidths] = useState<Record<string, number>>({
    name: 250,
    year: 80,
    size: 100,
    dateAdded: 120,
    tags: 150,
    aiScore: 120,
    keepReason: 120,
    path: 250,
  })
  const updateColWidth = (key: string, w: number) => {
    setColWidths(prev => ({ ...prev, [key]: w }))
  }

  // Dialog State
  const [showCurateWarning, setShowCurateWarning] = useState(false)
  const [curateCountWarning, setCurateCountWarning] = useState(0)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 100

  const fetchMedia = async (status: string, source: string) => {
    setLoading(true)
    setSelectedItems(new Set())
    setLastSelectedIndex(null)
    setCurrentPage(1)
    try {
      const res = await fetch(`/api/media?status=${status}&source=${source}`)
      const data = await res.json()
      if (Array.isArray(data)) setItems(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (activeStatus === 'ai_rules') {
      fetchRules(activeSource);
    } else {
      fetchMedia(activeStatus, activeSource)
    }
  }, [activeStatus, activeSource])

  // Background polling for dynamic updates (e.g. AI Curation finishing)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (activeStatus === 'ai_rules') {
        fetchRules(activeSource, true);
        return;
      }
      try {
        const res = await fetch(`/api/media?status=${activeStatus}&source=${activeSource}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setItems(data);
        }
      } catch (e) {}
    }, 5000);

    return () => clearInterval(interval);
  }, [activeStatus, activeSource])

  const fetchRules = async (source: string, background = false) => {
    if (!background) setLoading(true);
    try {
      const res = await fetch(`/api/ai/rules?source=${source}`)
      const data = await res.json()
      if (data.rules) setAiRules(data.rules)
      
      if (data.pendingRules) {
        try {
          const parsed = JSON.parse(data.pendingRules);
          setPendingRules(prev => {
            if (!prev) return parsed;
            // Only overwrite if the actual rule data changed (ignore user 'decision' field)
            const prevStripped = prev.map(({ decision, ...rest }) => rest);
            const newStripped = parsed.map(({ decision, ...rest }: any) => rest);
            if (JSON.stringify(prevStripped) === JSON.stringify(newStripped)) {
              return prev; // keep user decisions
            }
            return parsed;
          });
        } catch (e) {
          setPendingRules(null);
        }
      } else {
        setPendingRules(null);
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (!background) setLoading(false);
    }
  }

  const handleSaveRules = async (rulesToSave = aiRules) => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/ai/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: activeSource, rules: rulesToSave })
      })
      if (res.ok) {
        toast.success("AI rules saved successfully")
        if (rulesToSave !== aiRules) setAiRules(rulesToSave);
        setPendingRules(null);
      }
      else toast.error("Failed to save rules")
    } catch (e) {
      toast.error("Error connecting to server")
    }
    setAiLoading(false);
  }

  const handleSaveReviewedRules = async () => {
    if (!pendingRules) return;
    
    const finalRules = pendingRules.map(r => {
      if (r.type === 'keep') return r.original;
      if (r.type === 'add' && r.decision === 'accepted') return r.updated;
      if (r.type === 'edit') return r.decision === 'accepted' ? r.updated : r.original;
      if (r.type === 'remove') return r.decision === 'rejected' ? r.original : null;
      return null;
    }).filter(Boolean).join('\n');
    
    await handleSaveRules(finalRules);
  }

  const handleAcceptRule = (index: number) => {
    if (!pendingRules) return;
    const next = [...pendingRules];
    next[index].decision = 'accepted';
    setPendingRules(next);
  }

  const handleRejectRule = (index: number) => {
    if (!pendingRules) return;
    const next = [...pendingRules];
    next[index].decision = 'rejected';
    setPendingRules(next);
  }

  const handleDiscardPending = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/ai/rules/discard-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: activeSource })
      });
      if (res.ok) {
        toast.success("Discarded proposed changes")
        setPendingRules(null)
      } else {
        toast.error("Failed to discard pending rules")
      }
    } catch (e) {
      toast.error("Error connecting to server")
    }
    setAiLoading(false);
  }

  const handleAiCurate = async () => {
    const count = (isBulkMode && selectedItems.size > 0) ? selectedItems.size : items.length;
    if (count > 101) {
      setCurateCountWarning(count);
      setShowCurateWarning(true);
      return;
    }
    await executeAiCurate();
  }

  const executeAiCurate = async () => {
    setShowCurateWarning(false);
    setAiLoading(true);
    try {
      const payload: any = { source: activeSource };
      if (isBulkMode && selectedItems.size > 0) {
        payload.selectedIds = Array.from(selectedItems);
      }
      
      const res = await fetch(`/api/ai/curate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) toast.success("AI curation started in background")
      else toast.error("Failed to start AI curation")
    } catch (e) {
      toast.error("Error connecting to server")
    }
    setAiLoading(false);
  }

  const handleLearnRules = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/ai/learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: activeSource })
      })
      if (res.ok) {
        toast.success("AI learning started in background. A banner will appear when it's done.")
      }
      else toast.error("Failed to start AI learning")
    } catch (e) {
      toast.error("Error connecting to server")
    }
    setAiLoading(false);
  }
  const handleAction = async (id: string, action: ActionType, reason?: string, silent = false): Promise<boolean> => {
    if (!silent) setActionLoading(true)
    let success = false;
    try {
      if (action === 'instant_delete') {
        const res = await fetch(`/api/media/${id}/instant-delete`, { method: 'POST' });
        if (res.ok) {
          setItems(prev => prev.filter(i => i.id !== id));
          if (!silent) toast.success(`Item deleted immediately`);
          success = true;
        } else {
          if (!silent) toast.error("Failed to delete item from source");
        }
      } else if (action === 'mark_rolling' || action === 'mark_not_rolling') {
        const item = paginatedItems.find(i => i.id === id);
        if (!item || !item.sourceId) throw new Error("Item sourceId not found");
        
        const status = action === 'mark_rolling' ? 'active' : 'ignored';
        const res = await fetch('/api/rolling/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sonarrId: Number(item.sourceId), status })
        });
        
        if (res.ok) {
          if (!silent) toast.success(`Marked as ${action === 'mark_rolling' ? 'Rolling' : 'Not Rolling'}`);
          return true;
        }
      } else {
        const res = await fetch(`/api/media/${id}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, reason })
        })

        const data = await res.json()
        if (data.success) {
          if (action === 'clear_score') {
            setItems(prev => prev.map(i => i.id === id ? { ...i, aiScore: null } : i))
            if (!silent) toast.success(`Cleared AI Score`)
          } else {
            setItems(prev => prev.filter(i => i.id !== id))
            if (!silent) toast.success(`Action applied successfully`)
          }
          return true
        }
      }
    } catch (e) {
      if (!silent) toast.error("Error applying action")
    }
    if (!silent) setActionLoading(false)
    return success;
  }

  const handleBulkAction = async (action: ActionType) => {
    if (selectedItems.size === 0) return;
    setActionLoading(true)
    let successCount = 0;
    
    for (const id of Array.from(selectedItems)) {
      try {
        const success = await handleAction(id, action, 'Bulk manual action', true);
        if (success) successCount++;
        
        // Only enforce the 1-second delay for true deletion actions to avoid overwhelming Radarr/Sonarr
        if (action === 'instant_delete') {
          await new Promise(r => setTimeout(r, 1000));
        } else {
          // A tiny 50ms delay for non-destructive/DB-only actions to prevent browser freezing
          await new Promise(r => setTimeout(r, 50));
        }
      } catch (e) {}
    }
    
    toast.success(`Successfully updated ${successCount} items`)
    setSelectedItems(new Set())
    setIsBulkMode(false)
    setActionLoading(false)
  }

  const handleBulkTagKept = async () => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/media/bulk-tag-kept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: activeSource })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || `Successfully tagged ${data.count} items in ${activeSource}`)
      } else {
        toast.error(data.error || "Failed to tag items")
      }
    } catch (e) {
      toast.error("Error connecting to server")
    }
    setActionLoading(false)
  }

  const handleManualCurate = async () => {
    setTautulliLoading(true)
    try {
      const res = await fetch('/api/media/manual-curate', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Successfully curated ${data.updatedCount} watched items`)
        fetchMedia(activeStatus, activeSource)
      } else {
        toast.error(data.error || "Failed to run manual curation")
      }
    } catch (e) {
      toast.error("Error connecting to server")
    }
    setTautulliLoading(false)
  }

  const handleSync = async () => {
    setSyncLoading(true)
    try {
      const res = await fetch('/api/settings/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: activeSource })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Sync for ${activeSource} started in background`)
      } else {
        toast.error(data.error || `Failed to start sync for ${activeSource}`)
      }
    } catch (e) {
      toast.error("Error connecting to server")
    }
    setSyncLoading(false)
  }

  const toggleSelection = (id: string, index: number, event: React.MouseEvent) => {
    const next = new Set(selectedItems)
    
    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      for (let i = start; i <= end; i++) {
        next.add(sortedItems[i].id)
      }
    } else {
      if (next.has(id)) {
        next.delete(id)
        setLastSelectedIndex(null) // Reset if unchecking
      } else {
        next.add(id)
        setLastSelectedIndex(index)
      }
    }
    
    setSelectedItems(next)
  }

  const selectAllCurrentPage = () => {
    const next = new Set(selectedItems)
    const allSelectedOnPage = paginatedItems.every(item => next.has(item.id))
    
    if (allSelectedOnPage) {
      paginatedItems.forEach(item => next.delete(item.id))
    } else {
      paginatedItems.forEach(item => next.add(item.id))
    }
    setSelectedItems(next)
  }

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  const requestSort = (key: keyof MediaItem | 'size') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
    setCurrentPage(1); // Reset page on sort
  }

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(i => {
      try {
        const parsed = JSON.parse(i.tags || "[]");
        parsed.forEach((t: string) => tags.add(t));
      } catch (e) {
        if (i.tags) tags.add(i.tags);
      }
    });
    return Array.from(tags).sort();
  }, [items]);

  const sortedItems = useMemo(() => {
    let filteredItems = items;

    filteredItems = items.filter(item => {
      let pass = true;

      // 1. Global Text Search
      if (searchQuery.trim()) {
        const textQuery = searchQuery.toLowerCase().trim();
        const textMatch = Boolean(
          item.name.toLowerCase().includes(textQuery) || 
          (item.path && item.path.toLowerCase().includes(textQuery)) || 
          (item.tags && item.tags.toLowerCase().includes(textQuery))
        );
        pass = pass && textMatch;
      }

      // 2. Column Filters
      if (columnFilters.yearMin !== undefined && item.year < columnFilters.yearMin) pass = false;
      if (columnFilters.yearMax !== undefined && item.year > columnFilters.yearMax) pass = false;
      
      let sizeMultiplier = 1024 * 1024 * 1024; // GB
      if (columnFilters.sizeUnit === 'MB') sizeMultiplier = 1024 * 1024;
      if (columnFilters.sizeUnit === 'B') sizeMultiplier = 1;

      if (columnFilters.sizeMin !== undefined) {
        const minBytes = columnFilters.sizeMin * sizeMultiplier;
        if (item.sizeOnDisk < minBytes) pass = false;
      }
      if (columnFilters.sizeMax !== undefined) {
        const maxBytes = columnFilters.sizeMax * sizeMultiplier;
        if (item.sizeOnDisk > maxBytes) pass = false;
      }

      if (columnFilters.daysMin !== undefined || columnFilters.daysMax !== undefined) {
        if (!item.dateAdded) pass = false;
        else {
          const days = (new Date().getTime() - new Date(item.dateAdded).getTime()) / (1000 * 3600 * 24);
          if (columnFilters.daysMin !== undefined && days < columnFilters.daysMin) pass = false;
          if (columnFilters.daysMax !== undefined && days > columnFilters.daysMax) pass = false;
        }
      }

      if (columnFilters.aiScoreMin !== undefined) {
        if (item.aiScore === null || item.aiScore < columnFilters.aiScoreMin) pass = false;
      }
      if (columnFilters.aiScoreMax !== undefined) {
        if (item.aiScore !== null && item.aiScore > columnFilters.aiScoreMax) pass = false;
      }

      if (columnFilters.pathSearch && columnFilters.pathSearch.trim()) {
        if (!item.path || !item.path.toLowerCase().includes(columnFilters.pathSearch.toLowerCase().trim())) pass = false;
      }

      if (columnFilters.tags.size > 0) {
        let hasTag = false;
        try {
          const parsed = JSON.parse(item.tags || "[]");
          hasTag = parsed.some((t: string) => columnFilters.tags.has(t));
        } catch(e) {
          hasTag = columnFilters.tags.has(item.tags);
        }
        if (!hasTag) pass = false;
      }

      return pass;
    });

    const sortableItems = [...filteredItems];
    sortableItems.sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof MediaItem];
      let bValue: any = b[sortConfig.key as keyof MediaItem];
      
      if (sortConfig.key === 'size') {
        aValue = a.sizeOnDisk;
        bValue = b.sizeOnDisk;
      }

      if (aValue === null) aValue = '';
      if (bValue === null) bValue = '';

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableItems;
  }, [items, sortConfig, searchQuery, columnFilters]);

  const totalPages = Math.ceil(sortedItems.length / pageSize);
  const paginatedItems = sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getImageUrl = (metadataStr: string, source: string) => {
    try {
      const meta = JSON.parse(metadataStr);
      if (meta.posterUrl) {
        if (meta.posterUrl.startsWith('http')) return meta.posterUrl;
        
        // Fix for missing slashes between base and remoteUrl
        const safeUrl = meta.posterUrl.startsWith('/') ? meta.posterUrl : `/${meta.posterUrl}`;
        return `/api/media/image?url=${encodeURIComponent(safeUrl)}&source=${source}`;
      }
    } catch (e) {}
    return null;
  }

  const renderSortableHeader = (label: string, sortKey: string) => {
    // Check if any filter is active for this column
    const hasFilter = 
      (sortKey === 'year' && (columnFilters.yearMin !== undefined || columnFilters.yearMax !== undefined)) ||
      (sortKey === 'size' && (columnFilters.sizeMin !== undefined || columnFilters.sizeMax !== undefined)) ||
      (sortKey === 'dateAdded' && (columnFilters.daysMin !== undefined || columnFilters.daysMax !== undefined)) ||
      (sortKey === 'aiScore' && (columnFilters.aiScoreMin !== undefined || columnFilters.aiScoreMax !== undefined)) ||
      (sortKey === 'path' && columnFilters.pathSearch) ||
      (sortKey === 'tags' && columnFilters.tags.size > 0);

    return (
      <ResizableHeader
        label={label}
        sortKey={sortKey}
        width={colWidths[sortKey]}
        setWidth={(w) => updateColWidth(sortKey, w)}
        sortConfig={sortConfig}
        requestSort={requestSort}
      >
        {/* Filter Popover */}
          {sortKey !== 'name' && sortKey !== 'keepReason' && (
            <Popover>
              <PopoverTrigger className={`h-6 w-6 ml-1 p-1 inline-flex items-center justify-center rounded-md hover:bg-slate-800 transition-colors ${hasFilter ? 'text-amber-500 opacity-100' : 'text-slate-500 opacity-0 group-hover/header:opacity-100'}`}>
                <Filter className="h-3 w-3" />
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3 bg-slate-900 border-slate-700 text-slate-200">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm border-b border-slate-700 pb-2">Filter {label}</h4>
                  
                  {sortKey === 'year' && (
                    <div className="flex gap-2 items-center">
                      <Input type="number" placeholder="Min" className="h-8 text-xs bg-slate-800 border-slate-700" 
                        value={columnFilters.yearMin || ''} 
                        onChange={e => setColumnFilters(p => ({ ...p, yearMin: e.target.value ? parseInt(e.target.value) : undefined }))} 
                      />
                      <span className="text-slate-500">-</span>
                      <Input type="number" placeholder="Max" className="h-8 text-xs bg-slate-800 border-slate-700"
                        value={columnFilters.yearMax || ''} 
                        onChange={e => setColumnFilters(p => ({ ...p, yearMax: e.target.value ? parseInt(e.target.value) : undefined }))} 
                      />
                    </div>
                  )}

                  {sortKey === 'size' && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 mb-1">
                          <label className="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="sizeUnit" checked={columnFilters.sizeUnit === 'B'} onChange={() => setColumnFilters(p => ({...p, sizeUnit: 'B'}))} className="accent-amber-500" /> B</label>
                          <label className="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="sizeUnit" checked={columnFilters.sizeUnit === 'MB'} onChange={() => setColumnFilters(p => ({...p, sizeUnit: 'MB'}))} className="accent-amber-500" /> MB</label>
                          <label className="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="sizeUnit" checked={!columnFilters.sizeUnit || columnFilters.sizeUnit === 'GB'} onChange={() => setColumnFilters(p => ({...p, sizeUnit: 'GB'}))} className="accent-amber-500" /> GB</label>
                        </div>
                        <Input 
                          type="number" 
                          placeholder={`Min Size (${columnFilters.sizeUnit || 'GB'})`} 
                          value={columnFilters.sizeMin || ''} 
                          onChange={e => setColumnFilters(p => ({ ...p, sizeMin: e.target.value ? parseInt(e.target.value) : undefined }))} 
                          className="h-8 text-xs bg-slate-900"
                        />
                        <Input 
                          type="number" 
                          placeholder={`Max Size (${columnFilters.sizeUnit || 'GB'})`} 
                          value={columnFilters.sizeMax || ''} 
                          onChange={e => setColumnFilters(p => ({ ...p, sizeMax: e.target.value ? parseInt(e.target.value) : undefined }))} 
                          className="h-8 text-xs bg-slate-900"
                        />
                      </div>
                    )}

                  {sortKey === 'aiScore' && (
                    <div className="flex gap-2 items-center">
                      <Input type="number" placeholder="Min" className="h-8 text-xs bg-slate-800 border-slate-700" 
                        value={columnFilters.aiScoreMin || ''} 
                        onChange={e => setColumnFilters(p => ({ ...p, aiScoreMin: e.target.value ? parseInt(e.target.value) : undefined }))} 
                      />
                      <span className="text-slate-500">-</span>
                      <Input type="number" placeholder="Max" className="h-8 text-xs bg-slate-800 border-slate-700"
                        value={columnFilters.aiScoreMax || ''} 
                        onChange={e => setColumnFilters(p => ({ ...p, aiScoreMax: e.target.value ? parseInt(e.target.value) : undefined }))} 
                      />
                    </div>
                  )}

                  {sortKey === 'dateAdded' && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1 space-y-1">
                          <label className="text-xs text-slate-400">Min Days</label>
                          <input type="number" min="0" placeholder="Min" className="w-full bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-blue-500" value={columnFilters.daysMin ?? ''} onChange={e => setColumnFilters(p => ({ ...p, daysMin: e.target.value ? parseInt(e.target.value) : undefined }))} />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-xs text-slate-400">Max Days</label>
                          <input type="number" min="0" placeholder="Max" className="w-full bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-blue-500" value={columnFilters.daysMax ?? ''} onChange={e => setColumnFilters(p => ({ ...p, daysMax: e.target.value ? parseInt(e.target.value) : undefined }))} />
                        </div>
                      </div>
                    </div>
                  )}

                  {sortKey === 'path' && (
                    <Input type="text" placeholder="Contains..." className="h-8 text-xs bg-slate-800 border-slate-700" 
                      value={columnFilters.pathSearch || ''} 
                      onChange={e => setColumnFilters(p => ({ ...p, pathSearch: e.target.value }))} 
                    />
                  )}

                  {sortKey === 'tags' && (
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      {allTags.map(tag => (
                        <label key={tag} className="flex items-center gap-2 text-xs p-1 hover:bg-slate-800 rounded cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 accent-amber-500"
                            checked={columnFilters.tags.has(tag)}
                            onChange={(e) => {
                              const newTags = new Set(columnFilters.tags);
                              if (e.target.checked) newTags.add(tag);
                              else newTags.delete(tag);
                              setColumnFilters(p => ({ ...p, tags: newTags }));
                            }}
                          />
                          <span className="truncate">{tag}</span>
                        </label>
                      ))}
                      {allTags.length === 0 && <span className="text-xs text-slate-500">No tags found.</span>}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-700 mt-2 flex justify-end">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        if (sortKey === 'year') setColumnFilters(p => ({ ...p, yearMin: undefined, yearMax: undefined }));
                        if (sortKey === 'size') setColumnFilters(p => ({ ...p, sizeMin: undefined, sizeMax: undefined, sizeUnit: undefined }));
                        if (sortKey === 'dateAdded') setColumnFilters(p => ({ ...p, daysMin: undefined, daysMax: undefined }));
                        if (sortKey === 'aiScore') setColumnFilters(p => ({ ...p, aiScoreMin: undefined, aiScoreMax: undefined }));
                        if (sortKey === 'path') setColumnFilters(p => ({ ...p, pathSearch: undefined }));
                        if (sortKey === 'tags') setColumnFilters(p => ({ ...p, tags: new Set() }));
                    }}>Clear</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
      </ResizableHeader>
    )
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Curation Dashboard</h1>
          <p className="text-muted-foreground mt-1">Review, keep, or delete media based on AI scores and usage history.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            className="border-slate-700 hover:bg-slate-800"
            onClick={handleSync}
            disabled={syncLoading}
          >
            {syncLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Sync {activeSource}
          </Button>
          {activeStatus === 'waiting' && (
                <>
                  <Button variant="outline" className="border-amber-500/50 hover:bg-amber-500/10 text-amber-500" onClick={handleManualCurate} disabled={tautulliLoading}>
                    {tautulliLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                    Manual Curate All
                  </Button>
                  {!isBulkMode && (
                    <Button variant="default" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleAiCurate} disabled={aiLoading}>
                      {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                      AI Curate All
                    </Button>
                  )}
                </>
              )}
        </div>
      </div>

      {/* Main Controls */}
      <div className="glass-panel p-3 rounded-2xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6 relative z-20">
        
        {/* Source Toggle */}
        <div className="flex bg-slate-200/50 dark:bg-slate-900/50 p-1 rounded-xl shadow-inner w-full xl:w-auto border border-slate-300 dark:border-slate-800">
          <Button 
            variant={activeSource === 'Radarr' ? 'default' : 'ghost'} 
            onClick={() => setActiveSource('Radarr')}
            className={`flex-1 xl:flex-none gap-2 rounded-lg transition-all duration-300 ${activeSource === 'Radarr' ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            <Film className="h-4 w-4" /> Movies
          </Button>
          <Button 
            variant={activeSource === 'Sonarr' ? 'default' : 'ghost'} 
            onClick={() => setActiveSource('Sonarr')}
            className={`flex-1 xl:flex-none gap-2 rounded-lg transition-all duration-300 ${activeSource === 'Sonarr' ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            <Tv className="h-4 w-4" /> Shows
          </Button>
        </div>

        {/* Status Tabs */}
        <div className="flex bg-slate-200/50 dark:bg-slate-900/50 p-1 rounded-xl shadow-inner w-full xl:w-auto overflow-x-auto border border-slate-300 dark:border-slate-800">
          <Button variant={activeStatus === 'kept' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveStatus('kept')} className={`whitespace-nowrap rounded-lg transition-all ${activeStatus === 'kept' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground' : 'text-muted-foreground'}`}>Kept</Button>
          <Button variant={activeStatus === 'waiting' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveStatus('waiting')} className={`whitespace-nowrap rounded-lg transition-all ${activeStatus === 'waiting' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground' : 'text-muted-foreground'}`}>Waiting</Button>
          <Button variant={activeStatus === 'marked_for_deletion' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveStatus('marked_for_deletion')} className={`whitespace-nowrap rounded-lg transition-all ${activeStatus === 'marked_for_deletion' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground' : 'text-muted-foreground'}`}>Marked Delete</Button>
          <Button variant={activeStatus === 'archive' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveStatus('archive')} className={`whitespace-nowrap rounded-lg transition-all ${activeStatus === 'archive' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground' : 'text-muted-foreground'}`}>Archive</Button>
          <Button variant={activeStatus === 'ai_rules' ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveStatus('ai_rules')} className={`whitespace-nowrap rounded-lg transition-all ${activeStatus === 'ai_rules' ? 'bg-white dark:bg-slate-800 shadow-sm text-foreground text-indigo-500' : 'text-muted-foreground'}`}>AI Rules</Button>
        </div>

        {/* View Mode & Bulk Actions */}
        <div className="flex gap-2 items-center w-full xl:w-auto justify-end flex-wrap">
          {activeStatus === 'ai_rules' && (activeSource === 'Radarr' || activeSource === 'Sonarr') && (
            <Button 
              variant="outline"
              className="border-indigo-500/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 rounded-xl"
              onClick={handleLearnRules}
              disabled={aiLoading}
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              Learn Rules
            </Button>
          )}
          
          {activeStatus === 'waiting' && (
            <Button 
              variant="default"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-lg hover:shadow-indigo-500/25 transition-all"
              onClick={handleAiCurate}
              disabled={aiLoading}
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              AI Curate
            </Button>
          )}

          {activeStatus === 'kept' && (
            <Button 
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg transition-all"
              onClick={handleBulkTagKept}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Tag Kept in {activeSource}
            </Button>
          )}

          {activeStatus !== 'ai_rules' && (
            <>
              <Button 
                variant={isBulkMode ? "default" : "outline"}
                className={`rounded-xl transition-all ${isBulkMode ? "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20" : "border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                onClick={() => { setIsBulkMode(!isBulkMode); setSelectedItems(new Set()); setLastSelectedIndex(null); }}
              >
                <CheckSquare className="h-4 w-4 mr-2" />
                Bulk
              </Button>
              <div className="flex bg-slate-200/50 dark:bg-slate-900/50 p-1 rounded-xl shadow-inner border border-slate-300 dark:border-slate-800 ml-2">
                <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="icon" className={`rounded-lg ${viewMode === 'table' ? 'bg-white dark:bg-slate-800 shadow-sm' : ''}`} onClick={() => setViewMode('table')}>
                  <List className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === 'poster' ? 'secondary' : 'ghost'} size="icon" className={`rounded-lg ${viewMode === 'poster' ? 'bg-white dark:bg-slate-800 shadow-sm' : ''}`} onClick={() => setViewMode('poster')}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={showCurateWarning} onOpenChange={setShowCurateWarning}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-amber-500">Large Curation Task</DialogTitle>
            <DialogDescription className="text-slate-400">
              You are about to curate {curateCountWarning} items with AI. This may take a significant amount of time and consume API credits. 
              Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCurateWarning(false)} className="border-slate-700 text-slate-300">Cancel</Button>
              <Button onClick={executeAiCurate} className="bg-amber-600 hover:bg-amber-700 text-white">Curate {curateCountWarning} items</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {activeStatus === 'ai_rules' ? (
        <div className="glass rounded-xl border border-slate-800/50 p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">AI Curation Rules for {activeSource}</h2>
            <p className="text-sm text-slate-400">These rules are used by the AI to score media. You can edit them manually, or use the "Learn Rules" button to have the AI generate them based on your past kept/deleted/archived items.</p>
          </div>
          {loading ? (
             <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
          ) : (
            <>
              {pendingRules ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                    <div>
                      <h3 className="font-semibold text-amber-500">Review Proposed AI Rules</h3>
                      <p className="text-sm text-slate-400">Accept or reject each proposed change below.</p>
                    </div>
                    <Button variant="outline" onClick={handleDiscardPending} disabled={aiLoading} className="border-slate-700 hover:bg-slate-800 text-slate-300">
                      Discard All
                    </Button>
                  </div>
                  
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {pendingRules.map((rule, idx) => (
                      <div key={idx} className={`p-4 rounded-lg border flex flex-col gap-2 ${
                        rule.type === 'keep' ? 'bg-green-950/20 border-green-900/50' :
                        rule.type === 'add' ? 'bg-blue-950/20 border-blue-900/50' :
                        rule.type === 'remove' ? 'bg-red-950/20 border-red-900/50' :
                        'bg-amber-950/20 border-amber-900/50'
                      }`}>
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 font-mono text-sm space-y-2">
                            {rule.type === 'keep' && (
                              <div className="text-green-400/90">{rule.original}</div>
                            )}
                            {rule.type === 'add' && (
                              <div className="text-blue-400/90 flex gap-2"><Plus className="w-4 h-4 shrink-0 mt-0.5" />{rule.updated}</div>
                            )}
                            {rule.type === 'remove' && (
                              <div className="text-red-400/90 flex gap-2 line-through opacity-80"><Minus className="w-4 h-4 shrink-0 mt-0.5" />{rule.original}</div>
                            )}
                            {rule.type === 'edit' && (
                              <>
                                <div className="text-red-400/60 line-through flex gap-2"><Minus className="w-4 h-4 shrink-0 mt-0.5" />{rule.original}</div>
                                <div className="text-amber-400 flex gap-2"><Plus className="w-4 h-4 shrink-0 mt-0.5" />{rule.updated}</div>
                              </>
                            )}
                            
                            {rule.reason && (
                              <div className="text-xs text-slate-500 italic mt-2 border-t border-slate-700/50 pt-2">Reason: {rule.reason}</div>
                            )}
                          </div>
                          
                          {rule.type !== 'keep' && (
                            <div className="flex flex-col gap-2 shrink-0">
                              <Button 
                                size="sm" 
                                variant={rule.decision === 'accepted' ? 'default' : 'outline'}
                                className={rule.decision === 'accepted' ? 'bg-green-600 hover:bg-green-700 text-white' : 'border-slate-700 hover:bg-slate-800'}
                                onClick={() => handleAcceptRule(idx)}
                              >
                                <Check className="w-4 h-4 mr-1" /> {rule.type === 'remove' ? 'Confirm Remove' : 'Accept'}
                              </Button>
                              <Button 
                                size="sm" 
                                variant={rule.decision === 'rejected' ? 'default' : 'outline'}
                                className={rule.decision === 'rejected' ? 'bg-red-600 hover:bg-red-700 text-white' : 'border-slate-700 hover:bg-slate-800'}
                                onClick={() => handleRejectRule(idx)}
                              >
                                <X className="w-4 h-4 mr-1" /> {rule.type === 'remove' ? 'Keep Rule' : 'Reject'}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-end pt-4 border-t border-slate-800">
                    <Button onClick={handleSaveReviewedRules} disabled={aiLoading || pendingRules.some(r => r.type !== 'keep' && !r.decision)} className="bg-amber-600 hover:bg-amber-700 text-white">
                      {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                      Save Reviewed Rules
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <textarea 
                    className="w-full h-[400px] bg-slate-900 border border-slate-700 rounded-lg p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y"
                    value={aiRules}
                    onChange={(e) => setAiRules(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="default" onClick={() => handleSaveRules(aiRules)} disabled={aiLoading}>
                      {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                      Save Rules
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
      ) : (
        <>
          <div className="flex justify-between items-center w-full mb-4 gap-4">
            <div className="w-full md:w-1/3">
              <Input 
                type="text" 
                placeholder="Global Search (name, path, tags)..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-900/80 border border-slate-700 rounded-lg pl-3 pr-4 py-2 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
              />
            </div>
            
            <Popover>
              <PopoverTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-slate-700 bg-transparent shadow-sm hover:bg-slate-800 hover:text-accent-foreground h-9 px-4 py-2">
                <LayoutGrid className="h-4 w-4 mr-2" />
                View
              </PopoverTrigger>
              <PopoverContent className="w-48 p-3 bg-slate-900 border-slate-700 text-slate-200" align="end">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm border-b border-slate-700 pb-2">Toggle Columns</h4>
                  {Object.entries(visibleColumns).map(([key, isVisible]) => (
                    <label key={key} className="flex items-center gap-2 text-sm p-1 hover:bg-slate-800 rounded cursor-pointer capitalize">
                      <input 
                        type="checkbox" 
                        checked={isVisible as boolean}
                        onChange={(e) => setVisibleColumns(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 accent-amber-500"
                      />
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center text-sm text-slate-400 px-2 mb-4 gap-4">
            <div className="flex items-center gap-4">
              <span>Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, sortedItems.length)} of {sortedItems.length}</span>
              {isBulkMode && (
                <span className="text-amber-500 flex items-center gap-1"><CheckSquare className="h-3 w-3" /> Shift-click to select ranges</span>
              )}
            </div>
            
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="glass border-slate-700 h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="text-sm font-medium text-slate-300">
                  Page {currentPage} of {totalPages}
                </div>
                
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="glass border-slate-700 h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {viewMode === 'table' ? (
            <div className="glass rounded-xl border border-slate-800/50 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-300 table-fixed">
                <thead className="text-xs text-slate-400 uppercase bg-slate-900/80 border-b border-slate-800/50">
                  <tr>
                    {isBulkMode && (
                      <th className="px-4 py-3 w-12 text-center">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={selectAllCurrentPage} title="Select All on Page">
                          {paginatedItems.every(i => selectedItems.has(i.id)) ? <CheckSquare className="h-4 w-4 text-amber-500" /> : <Square className="h-4 w-4" />}
                        </Button>
                      </th>
                    )}
                    {renderSortableHeader('Name', 'name')}
                    {renderSortableHeader('Year', 'year')}
                    {visibleColumns.size && renderSortableHeader('Size', 'size')}
                    {visibleColumns.dateAdded && renderSortableHeader('Date Added', 'dateAdded')}
                    {visibleColumns.tags && renderSortableHeader('Tags', 'tags')}
                    {visibleColumns.aiScore && renderSortableHeader('AI Score', 'aiScore')}
                    {activeStatus === 'kept' && visibleColumns.keepReason && renderSortableHeader('Reason', 'keepReason')}
                    {visibleColumns.path && renderSortableHeader('Path', 'path')}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center p-12 text-slate-400 text-lg border-b-0">No media found in this category.</td>
                    </tr>
                  ) : paginatedItems.map((item, index) => {
                    const absoluteIndex = (currentPage - 1) * pageSize + index;
                    
                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors duration-200 border-b border-slate-200/50 dark:border-slate-800/50 last:border-0 ${selectedItems.has(item.id) ? 'bg-amber-500/10 dark:bg-amber-900/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}
                        onClick={(e) => isBulkMode && toggleSelection(item.id, absoluteIndex, e)}
                      >
                        {isBulkMode && (
                          <td className="px-4 py-3 text-center cursor-pointer">
                            {selectedItems.has(item.id) ? <CheckSquare className="h-4 w-4 text-amber-500 mx-auto" /> : <Square className="h-4 w-4 text-slate-400 mx-auto" />}
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium text-slate-200 truncate">
                          <MediaHoverCard 
                            name={item.name} 
                            year={item.year} 
                            source={item.source} 
                            tmdbId={item.tmdbId} 
                            tvdbId={item.tvdbId} 
                            metadataStr={item.metadata}
                          >
                            <span className="cursor-help decoration-slate-600 underline underline-offset-4 decoration-dotted">{item.name}</span>
                          </MediaHoverCard>
                          {activeStatus === 'marked_for_deletion' && item.markedForDeletionAt && (
                            <Badge variant="outline" className="ml-2 border-red-500/30 text-red-400 bg-red-500/10 scale-75 origin-left hidden sm:inline-flex">
                              {Math.max(0, 30 - Math.floor((Date.now() - new Date(item.markedForDeletionAt).getTime()) / (1000 * 60 * 60 * 24)))}d left
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">{item.year}</td>
                        {visibleColumns.size && <td className="px-4 py-3 whitespace-nowrap">{formatBytes(item.sizeOnDisk)}</td>}
                        {visibleColumns.dateAdded && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {item.dateAdded ? new Date(item.dateAdded).toLocaleDateString() : 'N/A'}
                          </td>
                        )}
                        {visibleColumns.tags && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 overflow-hidden h-6">
                              {(() => {
                                try {
                                  const parsedTags = JSON.parse(item.tags || "[]");
                                  if (parsedTags.length === 0) return <span className="text-slate-500 text-xs">None</span>;
                                  return parsedTags.slice(0, 3).map((t: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-[10px] py-0 px-1 border-slate-700 bg-slate-800 text-slate-300 truncate max-w-[80px]" title={t}>{t}</Badge>
                                  ));
                                } catch(e) {
                                  return <span className="text-xs">{item.tags}</span>;
                                }
                              })()}
                            </div>
                          </td>
                        )}
                        {visibleColumns.aiScore && (
                          <td className="px-4 py-3">
                            {item.aiScore !== null ? (
                              <Badge variant="outline" className={`
                                ${item.aiScore >= 80 ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : ''}
                                ${item.aiScore < 80 && item.aiScore >= 40 ? 'bg-gradient-to-r from-amber-500/20 to-amber-500/5 text-amber-600 dark:text-amber-500 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]' : ''}
                                ${item.aiScore < 40 ? 'bg-gradient-to-r from-rose-500/20 to-rose-500/5 text-rose-600 dark:text-rose-400 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : ''}
                                px-2.5 py-0.5 font-bold tracking-wide
                              `}>
                                {item.aiScore}/100
                              </Badge>
                            ) : <span className="text-slate-500">N/A</span>}
                          </td>
                        )}
                        {activeStatus === 'kept' && visibleColumns.keepReason && (
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{item.keepReason || "Manual"}</td>
                        )}
                        {visibleColumns.path && (
                          <td 
                            className="px-4 py-3 font-mono text-xs text-slate-500 truncate"
                            title={item.path}
                          >
                            {item.path}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            {activeStatus !== 'kept' && (
                              <Button size="icon" variant="ghost" title="Keep Permanently" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'keep') }} disabled={actionLoading} className="h-8 w-8 hover:text-green-500 hover:bg-green-500/10">
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            {activeStatus !== 'waiting' && (
                              <Button size="icon" variant="ghost" title="Send to Curation" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'wait') }} disabled={actionLoading} className="h-8 w-8 hover:text-blue-500 hover:bg-blue-500/10">
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            {activeStatus !== 'marked_for_deletion' && (
                              <Button size="icon" variant="ghost" title="Mark for Deletion" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'delete') }} disabled={actionLoading} className="h-8 w-8 hover:text-red-500 hover:bg-red-500/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            {activeStatus === 'marked_for_deletion' && (
                              <Button size="icon" variant="ghost" title="Delete Now" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'instant_delete') }} disabled={actionLoading} className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/20">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            {activeSource === 'Sonarr' && (
                              <Popover>
                                <PopoverTrigger className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 w-8 hover:text-teal-500 hover:bg-teal-500/10 ${actionLoading ? 'opacity-50 pointer-events-none' : ''}`} title="Rolling Options">
                                  <ArrowUpDown className="h-4 w-4" />
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-1 glass-panel">
                                  <Button variant="ghost" size="sm" className="w-full justify-start text-teal-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'mark_rolling') }}>
                                    <ArrowUpDown className="h-4 w-4 mr-2" /> Mark as Rolling
                                  </Button>
                                  <Button variant="ghost" size="sm" className="w-full justify-start text-slate-500 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'mark_not_rolling') }}>
                                    <X className="h-4 w-4 mr-2" /> Mark as Not Rolling
                                  </Button>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {paginatedItems.length === 0 ? (
                <div className="col-span-full text-center p-12 text-slate-400 text-lg glass rounded-xl border border-slate-800/50">No media found in this category.</div>
              ) : paginatedItems.map((item, index) => {
                const absoluteIndex = (currentPage - 1) * pageSize + index;
                const imgUrl = getImageUrl(item.metadata, activeSource)
                const isSelected = selectedItems.has(item.id)
                
                return (
                  <Card 
                    key={item.id} 
                    className={`overflow-hidden glass relative group cursor-pointer transition-all duration-200 border-2 ${isSelected ? 'border-amber-500 scale-[0.98]' : 'border-transparent hover:border-slate-600'}`}
                    onClick={(e) => isBulkMode && toggleSelection(item.id, absoluteIndex, e)}
                  >
                    {isBulkMode && (
                      <div className="absolute top-2 left-2 z-20 bg-black/50 p-1 rounded backdrop-blur-sm">
                        {isSelected ? <CheckSquare className="h-5 w-5 text-amber-500" /> : <Square className="h-5 w-5 text-white" />}
                      </div>
                    )}
                    
                    <div className="aspect-[2/3] relative bg-slate-900">
                      {imgUrl ? (
                        <img src={imgUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
                          {activeSource === 'Radarr' ? <Film className="h-12 w-12 mb-2" /> : <Tv className="h-12 w-12 mb-2" />}
                          <span className="text-xs uppercase font-medium text-center px-2">No Poster</span>
                        </div>
                      )}
                      
                      {item.aiScore !== null && (
                        <div className="absolute top-2 right-2 z-10 shadow-lg">
                          <Badge className={`
                            ${item.aiScore >= 80 ? 'bg-green-500 text-black hover:bg-green-600' : ''}
                            ${item.aiScore < 80 && item.aiScore >= 40 ? 'bg-amber-500 text-black hover:bg-amber-600' : ''}
                            ${item.aiScore < 40 ? 'bg-red-500 text-white hover:bg-red-600' : ''}
                          `}>
                            {item.aiScore}
                          </Badge>
                        </div>
                      )}

                      {!isBulkMode && (
                        <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                          {activeStatus !== 'kept' && (
                            <Button size="sm" className="w-[80%] bg-green-600 hover:bg-green-700 text-white" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'keep') }} disabled={actionLoading}>
                              <Check className="h-4 w-4 mr-2" /> Keep
                            </Button>
                          )}
                          {activeStatus !== 'waiting' && (
                            <Button size="sm" className="w-[80%] bg-blue-600 hover:bg-blue-700 text-white" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'wait') }} disabled={actionLoading}>
                              <RotateCcw className="h-4 w-4 mr-2" /> Un-curate
                            </Button>
                          )}
                          {item.aiScore !== null && (
                            <Button size="sm" variant="secondary" className="w-[80%]" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'clear_score') }} disabled={actionLoading}>
                              <RotateCcw className="h-4 w-4 mr-2" /> Clear Score
                            </Button>
                          )}
                          {activeStatus !== 'marked_for_deletion' && (
                            <Button size="sm" variant="destructive" className="w-[80%]" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'delete') }} disabled={actionLoading}>
                              <Trash2 className="h-4 w-4 mr-2" /> Mark Delete
                            </Button>
                          )}
                          {activeStatus === 'marked_for_deletion' && (
                            <Button size="sm" variant="destructive" className="w-[80%] bg-red-700 hover:bg-red-600" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'instant_delete') }} disabled={actionLoading}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete Now
                            </Button>
                          )}
                          {activeSource === 'Sonarr' && (
                            <div className="flex w-[80%] gap-1">
                              <Button size="sm" variant="secondary" className="w-1/2 bg-teal-600 hover:bg-teal-700 text-white border-0" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'mark_rolling') }} disabled={actionLoading} title="Mark as Rolling">
                                <ArrowUpDown className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="secondary" className="w-1/2 bg-slate-600 hover:bg-slate-700 text-white border-0" onClick={(e) => { e.stopPropagation(); handleAction(item.id, 'mark_not_rolling') }} disabled={actionLoading} title="Mark Not Rolling">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <CardContent className="p-3">
                      <div className="font-semibold truncate text-sm text-slate-200" title={item.name}>{item.name}</div>
                      <div className="flex justify-between items-center mt-1 text-xs text-slate-400">
                        <span>{item.year}</span>
                        <span>{formatBytes(item.sizeOnDisk)}</span>
                      </div>
                      {activeStatus === 'marked_for_deletion' && item.markedForDeletionAt && (
                        <div className="mt-2 text-center text-xs text-red-400">
                          Deletes in {Math.max(0, 30 - Math.floor((Date.now() - new Date(item.markedForDeletionAt).getTime()) / (1000 * 60 * 60 * 24)))} days
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="glass border-slate-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="text-sm font-medium text-slate-300">
                Page {currentPage} of {totalPages}
              </div>
              
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="glass border-slate-700"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Floating Bulk Action Bar */}
      {isBulkMode && selectedItems.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-10 w-[90%] md:w-auto overflow-x-auto justify-start md:justify-center">
          <span className="font-medium text-slate-200 bg-slate-800 px-3 py-1 rounded-full text-sm whitespace-nowrap">
            {selectedItems.size} Selected
          </span>
          <div className="flex gap-2">
            {activeStatus !== 'kept' && (
              <Button onClick={() => handleBulkAction('keep')} className="bg-green-600 hover:bg-green-700 text-white rounded-full px-4 md:px-6 whitespace-nowrap" disabled={actionLoading}>
                <Check className="h-4 w-4 mr-2" /> Keep
              </Button>
            )}
            {activeStatus !== 'waiting' && (
              <Button variant="default" size="sm" onClick={() => handleBulkAction('wait')} disabled={actionLoading} className="bg-slate-700 hover:bg-slate-600">
                <Clock className="h-4 w-4 mr-2" />
                Wait
              </Button>
            )}
          <Button variant="outline" size="sm" onClick={() => handleBulkAction('clear_score')} disabled={actionLoading} className="border-slate-500 text-slate-300 hover:bg-slate-800">
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear Score
          </Button>
          <div className="w-px h-6 bg-slate-700 mx-1"></div>
          <Button variant="default" size="sm" onClick={handleAiCurate} disabled={aiLoading} className="bg-amber-600 hover:bg-amber-700 text-white shadow-[0_0_15px_rgba(217,119,6,0.3)] border border-amber-500/30">
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI Curate ({selectedItems.size})
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsBulkMode(false)} className="text-slate-400 hover:text-white ml-2">
            Cancel
          </Button>
            {activeStatus !== 'marked_for_deletion' && (
              <Button variant="destructive" onClick={() => handleBulkAction('delete')} className="rounded-full px-4 md:px-6 whitespace-nowrap" disabled={actionLoading}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            )}
            {activeStatus === 'marked_for_deletion' && (
              <Button variant="destructive" onClick={() => handleBulkAction('instant_delete')} className="rounded-full px-4 md:px-6 whitespace-nowrap bg-red-700 hover:bg-red-600" disabled={actionLoading}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete Now
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
