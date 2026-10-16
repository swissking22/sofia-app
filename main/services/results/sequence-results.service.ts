/**
 * Sequence-level results (per named CA sequence within a term).
 *
 * Formula:
 *   weighted mark = sequence subject mark (on /scale) × coefficient
 *   student average = Σ weighted marks / Σ coefficients
 */
import {
  rankStudents,
  roundValue,
  type RoundingConfig,
} from '../../domain/results-calculation'
import {
  calculateTermAverage,
  calculateWeightedSubjectMark,
  normalizeScore,
  resolveScoreStatus,
  type SequenceScoreInput,
} from './result-calculation.service'

export type SequenceSheetKind = 'correction' | 'final'
export type SequenceSortMode = 'name' | 'merit'

export interface SequenceSubjectColumn {
  subject_id: string
  subject_name: string
  coefficient: number
}

export interface SequenceSubjectCell {
  subject_id: string
  /** Raw / normalized mark on the school scale (usually /20). */
  mark: number | null
  coefficient: number
  weighted_mark: number | null
  incomplete: boolean
}

export interface SequenceStudentRow {
  student_id: string
  student_name: string
  student_code: string | null
  cells: SequenceSubjectCell[]
  total_weighted_marks: number
  total_coefficients: number
  average: number | null
  average_rounded: number | null
  position: number | null
  incomplete: boolean
}

export interface SequenceClassSheet {
  class_id: string
  class_name: string
  sequence_name: string
  subjects: SequenceSubjectColumn[]
  students: SequenceStudentRow[]
  class_average: number | null
}

export function normalizeSequenceName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Match Sequence 1 / Seq 1 / First Sequence style labels. */
export function sequenceNamesMatch(a: string, b: string): boolean {
  const na = normalizeSequenceName(a)
  const nb = normalizeSequenceName(b)
  if (na === nb) return true
  const num = (s: string) => {
    const m = s.match(/(?:sequence|seq|evaluation)\s*(\d+)/i) || s.match(/^(\d+)$/)
    return m?.[1] ?? null
  }
  const an = num(na)
  const bn = num(nb)
  return an != null && bn != null && an === bn
}

/**
 * Build one student's sequence row from per-subject marks on this sequence.
 */
export function calculateSequenceStudentRow(input: {
  studentId: string
  studentName?: string
  studentCode?: string | null
  subjects: Array<{
    subject_id: string
    subject_name: string
    coefficient: number
    score: SequenceScoreInput | null
  }>
  targetScale?: number
  rounding?: RoundingConfig
}): SequenceStudentRow {
  const targetScale = input.targetScale ?? 20
  const rounding = input.rounding ?? { places: 2, half: 'standard' }
  const cells: SequenceSubjectCell[] = []

  for (const sub of input.subjects) {
    const coeff = sub.coefficient > 0 ? sub.coefficient : 1
    let mark: number | null = null
    let incomplete = false

    if (!sub.score) {
      incomplete = true
    } else {
      const status = resolveScoreStatus(sub.score.raw ?? null, sub.score.status)
      if (status === 'recorded' && sub.score.raw != null) {
        const max =
          sub.score.max && sub.score.max > 0 ? sub.score.max : targetScale
        mark = normalizeScore(sub.score.raw, max, targetScale)
      } else if (status === 'absent' || status === 'missing') {
        incomplete = true
      } else if (status === 'na' || status === 'excused') {
        // Not offered / excused — omit from average (coeff 0 effectively)
        cells.push({
          subject_id: sub.subject_id,
          mark: null,
          coefficient: 0,
          weighted_mark: null,
          incomplete: false,
        })
        continue
      } else {
        incomplete = true
      }
    }

    const weighted = calculateWeightedSubjectMark(mark, coeff)
    cells.push({
      subject_id: sub.subject_id,
      mark: mark != null ? roundValue(mark, rounding) : null,
      coefficient: coeff,
      weighted_mark: weighted != null ? roundValue(weighted, rounding) : null,
      incomplete,
    })
  }

  const avgData = calculateTermAverage(
    cells.map((c) => ({
      weightedMark: c.weighted_mark,
      coefficient: c.coefficient,
      incomplete: c.incomplete,
    }))
  )

  const averageRounded =
    avgData.termAverage != null
      ? roundValue(avgData.termAverage, rounding)
      : null

  return {
    student_id: input.studentId,
    student_name: input.studentName ?? '',
    student_code: input.studentCode ?? null,
    cells,
    total_weighted_marks: roundValue(avgData.totalWeightedMarks, rounding),
    total_coefficients: avgData.totalCoefficients,
    average: avgData.termAverage,
    average_rounded: averageRounded,
    position: null,
    incomplete: cells.some((c) => c.incomplete && c.coefficient > 0),
  }
}

export function calculateSequenceClassSheet(input: {
  classId: string
  className: string
  sequenceName: string
  students: Array<{ id: string; name?: string; student_code?: string | null }>
  subjects: Array<{ id: string; name: string; coefficient: number }>
  /** key = `${studentId}:${subjectId}` → score for this sequence only */
  scoresLookup: Map<string, SequenceScoreInput | null>
  sort?: SequenceSortMode
  targetScale?: number
  rounding?: RoundingConfig
}): SequenceClassSheet {
  const rounding = input.rounding ?? { places: 2, half: 'standard' }
  const subjects: SequenceSubjectColumn[] = input.subjects.map((s) => ({
    subject_id: s.id,
    subject_name: s.name,
    coefficient: s.coefficient > 0 ? s.coefficient : 1,
  }))

  const students = input.students.map((st) =>
    calculateSequenceStudentRow({
      studentId: st.id,
      studentName: st.name,
      studentCode: st.student_code,
      subjects: subjects.map((sub) => ({
        subject_id: sub.subject_id,
        subject_name: sub.subject_name,
        coefficient: sub.coefficient,
        score:
          input.scoresLookup.get(`${st.id}:${sub.subject_id}`) ?? null,
      })),
      targetScale: input.targetScale,
      rounding,
    })
  )

  const rankRows = students
    .filter((s) => s.average_rounded != null)
    .map((s) => ({
      id: s.student_id,
      value: s.average_rounded as number,
    }))
  const ranked = rankStudents(rankRows, 'competition')
  const rankMap = new Map(ranked.map((r) => [r.id, r.rank]))
  for (const row of students) {
    row.position = rankMap.get(row.student_id) ?? null
  }

  const sortMode = input.sort ?? 'name'
  if (sortMode === 'merit') {
    students.sort((a, b) => {
      const pa = a.position ?? Number.MAX_SAFE_INTEGER
      const pb = b.position ?? Number.MAX_SAFE_INTEGER
      if (pa !== pb) return pa - pb
      return (a.student_name || '').localeCompare(b.student_name || '')
    })
  } else {
    students.sort((a, b) =>
      (a.student_name || '').localeCompare(b.student_name || '')
    )
  }

  const avgs = students
    .map((s) => s.average_rounded)
    .filter((v): v is number => v != null)
  const classAverage =
    avgs.length > 0
      ? roundValue(avgs.reduce((a, b) => a + b, 0) / avgs.length, rounding)
      : null

  return {
    class_id: input.classId,
    class_name: input.className,
    sequence_name: input.sequenceName,
    subjects,
    students,
    class_average: classAverage,
  }
}
