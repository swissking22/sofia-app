export type TopicCoverageStatus = 'not_started' | 'in_progress' | 'completed'
export type TeachingLogStatus =
  | 'planned'
  | 'taught'
  | 'partially_covered'
  | 'completed'

export function coverageFromLog(
  status: TeachingLogStatus
): TopicCoverageStatus | null {
  if (status === 'completed') return 'completed'
  if (status === 'taught' || status === 'partially_covered') return 'in_progress'
  return null
}

export function advanceCoverage(
  current: TopicCoverageStatus,
  next: TopicCoverageStatus
): TopicCoverageStatus {
  const rank: Record<TopicCoverageStatus, number> = {
    not_started: 0,
    in_progress: 1,
    completed: 2,
  }
  return rank[next] > rank[current] ? next : current
}

export function progressFromTopics(
  topics: Array<{ parent_id: string | null; coverage_status: TopicCoverageStatus }>
): {
  total: number
  completed: number
  in_progress: number
  not_started: number
  percent: number
} {
  const childIds = new Set(
    topics.filter((t) => t.parent_id).map((t) => t.parent_id as string)
  )
  const leaves = topics.filter((t) => !childIds.has((t as { id?: string }).id ?? ''))
  const units = topics.filter((t) => {
    const hasChildren = topics.some((c) => c.parent_id && (c as { parent_id: string | null }).parent_id)
    void hasChildren
    return true
  })

  const counted = units.length ? units : leaves
  const total = counted.length
  const completed = counted.filter((t) => t.coverage_status === 'completed').length
  const in_progress = counted.filter((t) => t.coverage_status === 'in_progress').length
  const not_started = total - completed - in_progress
  const percent = total === 0 ? 0 : Math.round((completed / total) * 1000) / 10
  return { total, completed, in_progress, not_started, percent }
}

/** Count leaf topics (those without children). */
export function progressFromLeafTopics(
  topics: Array<{
    id: string
    parent_id: string | null
    coverage_status: TopicCoverageStatus
  }>
): {
  total: number
  completed: number
  in_progress: number
  not_started: number
  percent: number
} {
  const parentIds = new Set(
    topics.map((t) => t.parent_id).filter((id): id is string => Boolean(id))
  )
  const leaves = topics.filter((t) => !parentIds.has(t.id))
  const total = leaves.length
  const completed = leaves.filter((t) => t.coverage_status === 'completed').length
  const in_progress = leaves.filter((t) => t.coverage_status === 'in_progress').length
  const not_started = Math.max(0, total - completed - in_progress)
  const percent = total === 0 ? 0 : Math.round((completed / total) * 1000) / 10
  return { total, completed, in_progress, not_started, percent }
}

export function expectedPercent(input: {
  yearStart: string
  yearEnd: string
  today: string
}): number {
  const start = Date.parse(input.yearStart)
  const end = Date.parse(input.yearEnd)
  const today = Date.parse(input.today)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  const elapsed = Math.min(Math.max(today - start, 0), end - start)
  return Math.round((elapsed / (end - start)) * 1000) / 10
}

export function scheduleStatus(
  expected: number,
  actual: number
): 'on_track' | 'ahead' | 'behind' {
  if (actual >= expected + 5) return 'ahead'
  if (actual + 5 < expected) return 'behind'
  return 'on_track'
}

export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}
