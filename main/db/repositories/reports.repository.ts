import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  allocatePaymentToLines,
  aggregateNamedAmounts,
  round2,
} from '../../domain/finance'
import {
  EXPENSE_TO_BUDGET_KEY,
  remainingAmount as budgetRemaining,
  utilizationPercent as budgetUtil,
} from '../../domain/budget'
import { passMarkFromBands } from '../../domain/reports'
import {
  buildInsights,
  expenseBreakdowns,
  getAcademicPerformance,
  getAttendanceAnalytics,
  getFinancialSummary,
  getStudentAcademicSlice,
  revenueBreakdowns,
  type AttendanceMarkFact,
  type ExpenseFact,
  type InvoiceFact,
  type PaymentFact,
  type ReportFilters,
  type StudentSummaryFact,
  type SubjectScoreFact,
} from '../../services/reports'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export class ReportsRepository {
  constructor(private db: Database.Database) {}

  meta(schoolId: string) {
    this.ensureSettings(schoolId)
    const settings = this.settings(schoolId)
    const years = this.db
      .prepare(
        `SELECT id, name, is_current, start_date, end_date FROM academic_years
         WHERE school_id = ? AND deleted_at IS NULL ORDER BY start_date DESC`
      )
      .all(schoolId) as Array<{
      id: string
      name: string
      is_current: number
      start_date: string
      end_date: string
    }>
    const terms = this.db
      .prepare(
        `SELECT t.id, t.name, t.term_number, t.academic_year_id, t.start_date, t.end_date
         FROM academic_terms t
         JOIN academic_years y ON y.id = t.academic_year_id
         WHERE y.school_id = ? AND t.deleted_at IS NULL
         ORDER BY t.term_number`
      )
      .all(schoolId) as Array<{
      id: string
      name: string
      term_number: number
      academic_year_id: string
      start_date: string
      end_date: string
    }>
    const classes = this.db
      .prepare(
        `SELECT c.id, c.name, c.section_id, c.academic_level_id FROM classes c
         LEFT JOIN academic_levels al ON al.id = c.academic_level_id
         LEFT JOIN sections sec ON sec.id = c.section_id
         WHERE c.school_id = ? AND c.deleted_at IS NULL
         ORDER BY IFNULL(al.sort_order, 9999) ASC,
           CASE LOWER(IFNULL(sec.name, ''))
             WHEN 'general' THEN 0
             WHEN 'commercial' THEN 1
             WHEN 'technical' THEN 2
             ELSE 50
           END ASC,
           IFNULL(sec.name, '') COLLATE NOCASE ASC,
           c.name COLLATE NOCASE ASC`
      )
      .all(schoolId) as Array<{
      id: string
      name: string
      section_id: string | null
      academic_level_id: string | null
    }>
    const departments = this.db
      .prepare(
        `SELECT id, name FROM sections
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY
           CASE LOWER(name)
             WHEN 'general' THEN 0
             WHEN 'commercial' THEN 1
             WHEN 'technical' THEN 2
             ELSE 50
           END ASC,
           name COLLATE NOCASE ASC`
      )
      .all(schoolId) as Array<{ id: string; name: string }>
    const subjects = this.db
      .prepare(
        `SELECT id, name, department_id FROM subjects
         WHERE school_id = ? AND deleted_at IS NULL ORDER BY name`
      )
      .all(schoolId) as Array<{
      id: string
      name: string
      department_id: string | null
    }>
    const feeTypes = this.db
      .prepare(
        `SELECT id, name, category_key FROM fee_categories
         WHERE school_id = ? AND deleted_at IS NULL AND is_active = 1
         ORDER BY sort_order`
      )
      .all(schoolId) as Array<{ id: string; name: string; category_key: string }>
    const currencyRow = this.db
      .prepare(
        `SELECT currency FROM finance_settings
         WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId) as { currency?: string } | undefined
    return {
      currency: currencyRow?.currency || 'XAF',
      attendance_threshold: settings.attendance_risk_pct,
      pass_mark: this.resolvePassMark(schoolId),
      years,
      terms,
      classes,
      departments,
      subjects,
      fee_types: feeTypes,
    }
  }

  academic(schoolId: string, filters: ReportFilters) {
    const passMark = this.resolvePassMark(schoolId)
    const source = filters.assessment || 'results'
    const { summaries, subjects } =
      source === 'ca'
        ? this.loadCaFacts(schoolId, filters)
        : source === 'exam'
          ? this.loadExamFacts(schoolId, filters)
          : this.loadResultFacts(schoolId, filters)
    return getAcademicPerformance(
      schoolId,
      summaries,
      subjects,
      passMark,
      filters
    )
  }

  student(schoolId: string, studentId: string, filters: ReportFilters) {
    const student = this.db
      .prepare(
        `SELECT s.*, c.name AS class_name, sec.name AS department_name,
                y.name AS year_name
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN sections sec ON sec.id = c.section_id
         LEFT JOIN academic_years y ON y.school_id = s.school_id AND y.is_current = 1
           AND y.deleted_at IS NULL
         WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL`
      )
      .get(studentId, schoolId) as
      | {
          id: string
          name: string
          student_code: string | null
          class_id: string
          class_name: string | null
          department_name: string | null
          year_name: string | null
          status: string
          gender: string | null
        }
      | undefined
    if (!student) throw new Error('Student not found.')

    const { summaries, subjects } = this.loadResultFacts(schoolId, {
      ...filters,
      student_id: studentId,
    })
    const slice = getStudentAcademicSlice(
      schoolId,
      studentId,
      summaries,
      subjects
    )
    const latest = slice.summaries[0] ?? null
    const attendance = this.attendance(schoolId, {
      ...filters,
      student_id: studentId,
    })
    const mine = attendance.at_risk.find((r) => r.student_id === studentId)
    const marksForStudent = attendance
    const finance = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status != 'cancelled' THEN net_payable ELSE 0 END), 0) AS billed,
           COALESCE(SUM(CASE WHEN status != 'cancelled' THEN amount_paid ELSE 0 END), 0) AS paid,
           COALESCE(SUM(CASE WHEN status != 'cancelled' THEN balance ELSE 0 END), 0) AS outstanding
         FROM invoices
         WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId, studentId) as {
      billed: number
      paid: number
      outstanding: number
    }

    const history = this.db
      .prepare(
        `SELECT rs.average, rs.grade, rs.position, t.name AS term_name, t.term_number,
                y.name AS year_name, c.name AS class_name
         FROM result_student_summaries rs
         JOIN result_runs r ON r.id = rs.result_run_id
         LEFT JOIN academic_terms t ON t.id = r.term_id
         LEFT JOIN academic_years y ON y.id = r.academic_year_id
         LEFT JOIN classes c ON c.id = r.class_id
         WHERE r.school_id = ? AND rs.student_id = ?
           AND rs.deleted_at IS NULL AND r.deleted_at IS NULL
           AND r.status IN ('computed','published','locked')
         ORDER BY y.start_date DESC, t.term_number DESC`
      )
      .all(schoolId, studentId)

    const promotions = this.db
      .prepare(
        `SELECT pr.from_year, pr.to_year, pr.status, pr.created_at
         FROM promotion_runs pr
         WHERE pr.school_id = ? AND pr.deleted_at IS NULL AND pr.status = 'completed'
         ORDER BY pr.to_year DESC LIMIT 8`
      )
      .all(schoolId)

    return {
      profile: {
        id: student.id,
        student_code: student.student_code,
        name: student.name,
        class_id: student.class_id,
        class_name: student.class_name,
        department: student.department_name,
        academic_year: student.year_name,
        status: student.status,
        gender: student.gender,
      },
      academic: {
        latest,
        subjects: slice.subjects,
        history,
      },
      attendance: {
        present: mine?.days_present ?? marksForStudent.present,
        absent: mine?.days_absent ?? marksForStudent.absent,
        late: mine?.days_late ?? marksForStudent.late,
        percentage: mine?.attendance_pct ?? marksForStudent.overall_rate,
      },
      finance: {
        billed: round2(finance.billed),
        paid: round2(finance.paid),
        outstanding: round2(finance.outstanding),
      },
      promotions,
    }
  }

  searchStudents(schoolId: string, query: string, classId?: string | null) {
    const q = `%${query.trim()}%`
    const params: string[] = [schoolId, q, q]
    let sql = `
      SELECT s.id, s.name, s.student_code, s.status, c.name AS class_name
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
        AND (s.name LIKE ? OR IFNULL(s.student_code,'') LIKE ?)
    `
    if (classId) {
      sql += ` AND s.class_id = ?`
      params.push(classId)
    }
    sql += ` ORDER BY s.name LIMIT 30`
    return this.db.prepare(sql).all(...params)
  }

  financial(schoolId: string, filters: ReportFilters) {
    const invoices = this.loadInvoices(schoolId, filters)
    const payments = this.loadPayments(schoolId, filters)
    const expenses = this.loadExpenses(schoolId, filters)
    const summary = getFinancialSummary(
      schoolId,
      invoices,
      payments,
      expenses,
      todayIso()
    )
    const revenue = revenueBreakdowns(schoolId, payments)
    return {
      summary,
      revenue: {
        ...revenue,
        by_fee_line: this.feeLineCollections(schoolId, filters),
      },
      expenses: expenseBreakdowns(schoolId, expenses),
      outstanding_by_class: this.outstandingByClass(invoices),
      outstanding_by_student: this.outstandingByStudent(invoices),
      deposits: this.depositReport(schoolId, filters),
      budget: this.budgetReport(schoolId, filters.academic_year_id),
    }
  }

  attendance(schoolId: string, filters: ReportFilters) {
    const threshold =
      filters.attendance_threshold ?? this.settings(schoolId).attendance_risk_pct
    const marks = this.loadAttendanceMarks(schoolId, filters)
    const result = getAttendanceAnalytics(schoolId, marks, threshold)
    return { ...result, staff: this.staffAttendanceSummary(schoolId, filters) }
  }

  insights(schoolId: string, filters: ReportFilters) {
    const generatedAt = new Date().toISOString()
    const academic = this.academic(schoolId, filters)
    const previousFilters = this.previousTermFilters(filters)
    const previousAcademic = previousFilters
      ? this.academic(schoolId, previousFilters)
      : null
    const finance = this.financial(schoolId, filters)
    const prevFinance = previousFilters
      ? this.financial(schoolId, previousFilters)
      : null
    const attendance = this.attendance(schoolId, filters)

    const classAverages = academic.by_class.map((c) => {
      const prev = previousAcademic?.by_class.find(
        (p) => p.class_id === c.class_id
      )
      return {
        class_id: c.class_id,
        class_name: c.class_name,
        current: c.average,
        previous: prev?.average ?? 0,
      }
    })

    const generated = buildInsights({
      generatedAt,
      classAverages,
      outstandingCurrent: finance.summary.outstanding,
      outstandingPrevious: prevFinance?.summary.outstanding ?? 0,
      atRiskCount: attendance.at_risk_count,
      attendanceThreshold: attendance.threshold,
      budgets: finance.budget.categories.map((b) => ({
        name: b.name,
        key: b.key,
        utilization: b.utilization,
      })),
    })

    return {
      generated_at: generatedAt,
      insights: generated,
      students: this.enrolmentInsights(schoolId, filters),
      academic: {
        overall_average: academic.overall_average,
        pass_rate: academic.pass_rate,
        best_class: academic.best_class,
        lowest_class: academic.lowest_class,
        weak_subject: academic.weak_subject,
        trend: academic.trend,
      },
      financial: {
        collection_rate: finance.summary.collection_rate,
        outstanding: finance.summary.outstanding,
        revenue: finance.summary.collected,
        expenses: finance.summary.expenses,
        net: finance.summary.net,
        budget_utilization: finance.budget.utilization,
      },
      attendance: {
        overall: attendance.overall_rate,
        absence_rate: round2(100 - attendance.overall_rate),
        lowest_classes: attendance.by_class.slice(0, 3),
        below_threshold: attendance.at_risk_count,
        threshold: attendance.threshold,
      },
      staff: this.staffInsights(schoolId),
    }
  }

  private loadResultFacts(schoolId: string, filters: ReportFilters) {
    const common: string[] = [schoolId]
    const clauses: string[] = [
      `r.school_id = ?`,
      `r.deleted_at IS NULL`,
      `r.status IN ('computed','published','locked')`,
    ]
    if (filters.academic_year_id) {
      clauses.push(`r.academic_year_id = ?`)
      common.push(filters.academic_year_id)
    }
    if (filters.term_id) {
      clauses.push(`r.term_id = ?`)
      common.push(filters.term_id)
    }
    if (filters.class_id) {
      clauses.push(`r.class_id = ?`)
      common.push(filters.class_id)
    }
    if (filters.department_id) {
      clauses.push(`c.section_id = ?`)
      common.push(filters.department_id)
    }
    if (filters.gender) {
      clauses.push(`LOWER(IFNULL(st.gender,'')) = LOWER(?)`)
      common.push(filters.gender)
    }

    const summaryParams = [...common]
    let summaryWhere = clauses.join(' AND ') + ` AND rs.deleted_at IS NULL`
    if (filters.student_id) {
      summaryWhere += ` AND rs.student_id = ?`
      summaryParams.push(filters.student_id)
    }

    const summaries = this.db
      .prepare(
        `SELECT r.school_id, rs.student_id, st.name AS student_name, r.class_id,
                c.name AS class_name, st.gender, rs.average, rs.grade, rs.position,
                r.term_id, t.name AS term_name, t.term_number
         FROM result_student_summaries rs
         JOIN result_runs r ON r.id = rs.result_run_id
         JOIN students st ON st.id = rs.student_id
         LEFT JOIN classes c ON c.id = r.class_id
         LEFT JOIN academic_terms t ON t.id = r.term_id
         WHERE ${summaryWhere}`
      )
      .all(...summaryParams) as StudentSummaryFact[]

    const subjectParams = [...common]
    let subjectWhere = clauses.join(' AND ') + ` AND rr.deleted_at IS NULL`
    if (filters.student_id) {
      subjectWhere += ` AND rr.student_id = ?`
      subjectParams.push(filters.student_id)
    }
    if (filters.subject_id) {
      subjectWhere += ` AND rr.subject_id = ?`
      subjectParams.push(filters.subject_id)
    }

    const subjects = this.db
      .prepare(
        `SELECT r.school_id, rr.student_id, r.class_id, c.name AS class_name,
                rr.subject_id, sub.name AS subject_name,
                rr.ca_score, rr.exam_score, rr.total, rr.grade
         FROM result_subject_rows rr
         JOIN result_runs r ON r.id = rr.result_run_id
         JOIN students st ON st.id = rr.student_id
         LEFT JOIN classes c ON c.id = r.class_id
         LEFT JOIN subjects sub ON sub.id = rr.subject_id
         WHERE ${subjectWhere}`
      )
      .all(...subjectParams) as SubjectScoreFact[]

    return { summaries, subjects }
  }

  private loadCaFacts(schoolId: string, filters: ReportFilters) {
    const { sql, params } = this.assessmentWhere('a', schoolId, filters)
    const rows = this.db
      .prepare(
        `SELECT a.school_id, sc.student_id, st.name AS student_name, a.class_id,
                c.name AS class_name, st.gender,
                CASE WHEN a.max_score > 0 THEN (sc.score * 100.0 / a.max_score) ELSE 0 END AS pct,
                a.subject_id, sub.name AS subject_name, a.term_id, t.name AS term_name,
                t.term_number
         FROM ca_scores sc
         JOIN ca_assessments a ON a.id = sc.assessment_id
         JOIN students st ON st.id = sc.student_id
         LEFT JOIN classes c ON c.id = a.class_id
         LEFT JOIN subjects sub ON sub.id = a.subject_id
         LEFT JOIN academic_terms t ON t.id = a.term_id
         WHERE ${sql} AND sc.deleted_at IS NULL AND sc.score IS NOT NULL`
      )
      .all(...params) as Array<
      SubjectScoreFact & StudentSummaryFact & { pct: number }
    >
    return this.collapseAssessmentRows(rows)
  }

  private loadExamFacts(schoolId: string, filters: ReportFilters) {
    const { sql, params } = this.assessmentWhere('es', schoolId, filters)
    if (filters.class_id) params.push(filters.class_id)
    if (filters.subject_id) params.push(filters.subject_id)
    const rows = this.db
      .prepare(
        `SELECT es.school_id, sc.student_id, st.name AS student_name, p.class_id,
                c.name AS class_name, st.gender,
                CASE WHEN p.max_score > 0 THEN (sc.score * 100.0 / p.max_score) ELSE 0 END AS pct,
                p.subject_id, sub.name AS subject_name, es.term_id, t.name AS term_name,
                t.term_number
         FROM exam_scores sc
         JOIN exam_papers p ON p.id = sc.paper_id
         JOIN exam_sessions es ON es.id = p.exam_session_id
         JOIN students st ON st.id = sc.student_id
         LEFT JOIN classes c ON c.id = p.class_id
         LEFT JOIN subjects sub ON sub.id = p.subject_id
         LEFT JOIN academic_terms t ON t.id = es.term_id
         WHERE ${sql} AND sc.deleted_at IS NULL AND p.deleted_at IS NULL
           AND sc.score IS NOT NULL
           ${filters.class_id ? 'AND p.class_id = ?' : ''}
           ${filters.subject_id ? 'AND p.subject_id = ?' : ''}`
      )
      .all(...params) as Array<SubjectScoreFact & StudentSummaryFact & { pct: number }>
    return this.collapseAssessmentRows(rows)
  }

  private assessmentWhere(
    alias: string,
    schoolId: string,
    filters: ReportFilters
  ) {
    const params: string[] = [schoolId]
    let sql = `${alias}.school_id = ? AND ${alias}.deleted_at IS NULL`
    if (filters.academic_year_id) {
      sql += ` AND ${alias}.academic_year_id = ?`
      params.push(filters.academic_year_id)
    }
    if (filters.term_id) {
      sql += ` AND ${alias}.term_id = ?`
      params.push(filters.term_id)
    }
    if (alias === 'a' && filters.class_id) {
      sql += ` AND a.class_id = ?`
      params.push(filters.class_id)
    }
    if (alias === 'a' && filters.subject_id) {
      sql += ` AND a.subject_id = ?`
      params.push(filters.subject_id)
    }
    if (filters.gender) {
      sql += ` AND LOWER(IFNULL(st.gender,'')) = LOWER(?)`
      params.push(filters.gender)
    }
    if (filters.department_id) {
      sql += ` AND c.section_id = ?`
      params.push(filters.department_id)
    }
    return { sql, params }
  }

  private collapseAssessmentRows(
    rows: Array<SubjectScoreFact & StudentSummaryFact & { pct: number }>
  ) {
    const subjects: SubjectScoreFact[] = rows.map((r) => ({
      school_id: r.school_id,
      student_id: r.student_id,
      class_id: r.class_id,
      class_name: r.class_name,
      subject_id: r.subject_id,
      subject_name: r.subject_name,
      ca_score: r.pct,
      exam_score: 0,
      total: round2(r.pct),
      grade: null,
    }))
    const byStudent = new Map<string, typeof rows>()
    for (const r of rows) {
      const key = `${r.student_id}:${r.class_id}:${r.term_id || ''}`
      const list = byStudent.get(key) ?? []
      list.push(r)
      byStudent.set(key, list)
    }
    const summaries: StudentSummaryFact[] = [...byStudent.values()].map(
      (list) => {
        const first = list[0]
        const avg = meanSafe(list.map((x) => x.pct))
        return {
          school_id: first.school_id,
          student_id: first.student_id,
          student_name: first.student_name,
          class_id: first.class_id,
          class_name: first.class_name,
          gender: first.gender,
          average: avg,
          grade: null,
          position: null,
          term_id: first.term_id,
          term_name: first.term_name,
          term_number: first.term_number,
        }
      }
    )
    return { summaries, subjects }
  }

  private filterParams(
    schoolId: string,
    filters: ReportFilters,
    keys: Array<keyof ReportFilters>
  ) {
    const params: string[] = [schoolId]
    for (const key of keys) {
      const v = filters[key]
      if (v) params.push(String(v))
    }
    return params
  }

  private loadInvoices(schoolId: string, filters: ReportFilters): InvoiceFact[] {
    return this.db
      .prepare(
        `SELECT i.school_id, i.id, i.student_id, st.name AS student_name, st.class_id,
                c.name AS class_name, i.academic_term_id, t.name AS term_name,
                i.net_payable, i.amount_paid, i.balance, i.status, i.issue_date, i.due_date
         FROM invoices i
         JOIN students st ON st.id = i.student_id
         LEFT JOIN classes c ON c.id = st.class_id
         LEFT JOIN academic_terms t ON t.id = i.academic_term_id
         WHERE i.school_id = ? AND i.deleted_at IS NULL
           ${filters.academic_year_id ? 'AND i.academic_year_id = ?' : ''}
           ${filters.term_id ? 'AND i.academic_term_id = ?' : ''}
           ${filters.class_id ? 'AND st.class_id = ?' : ''}
           ${filters.from ? 'AND i.issue_date >= ?' : ''}
           ${filters.to ? 'AND i.issue_date <= ?' : ''}`
      )
      .all(
        ...this.filterParams(schoolId, filters, [
          'academic_year_id',
          'term_id',
          'class_id',
          'from',
          'to',
        ])
      ) as InvoiceFact[]
  }

  /**
   * Collections by invoice fee-line description (Tuition, PTA, …).
   * Uses payment_allocations when present; otherwise FIFO across invoice lines.
   */
  private feeLineCollections(
    schoolId: string,
    filters: ReportFilters
  ): Array<{ name: string; amount: number }> {
    const params = this.filterParams(schoolId, filters, [
      'academic_year_id',
      'term_id',
      'class_id',
      'from',
      'to',
      'payment_method',
    ])
    if (filters.fee_type) params.push(filters.fee_type, filters.fee_type)

    const filterSql = `
           ${filters.academic_year_id ? 'AND i.academic_year_id = ?' : ''}
           ${filters.term_id ? 'AND i.academic_term_id = ?' : ''}
           ${filters.class_id ? 'AND st.class_id = ?' : ''}
           ${filters.from ? 'AND p.paid_at >= ?' : ''}
           ${filters.to ? 'AND p.paid_at <= ?' : ''}
           ${filters.payment_method ? 'AND p.method = ?' : ''}
           ${filters.fee_type ? 'AND (fc.category_key = ? OR fc.id = ?)' : ''}`

    const fromStored = this.db
      .prepare(
        `SELECT pa.description AS name, SUM(pa.amount) AS amount
         FROM payment_allocations pa
         JOIN payments p ON p.id = pa.payment_id AND p.deleted_at IS NULL
         JOIN invoices i ON i.id = p.invoice_id
         JOIN students st ON st.id = p.student_id
         LEFT JOIN invoice_lines il ON il.id = pa.invoice_line_id
         LEFT JOIN fee_categories fc ON fc.id = il.fee_category_id
         WHERE pa.school_id = ? AND pa.deleted_at IS NULL
           ${filterSql}
         GROUP BY pa.description`
      )
      .all(...params) as Array<{ name: string; amount: number }>

    const unallocatedPayments = this.db
      .prepare(
        `SELECT p.id, p.amount, p.invoice_id
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN students st ON st.id = p.student_id
         LEFT JOIN invoice_lines il0 ON il0.invoice_id = i.id AND il0.deleted_at IS NULL AND il0.is_adjustment = 0
         LEFT JOIN fee_categories fc ON fc.id = il0.fee_category_id
         WHERE p.school_id = ? AND p.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM payment_allocations pa
             WHERE pa.payment_id = p.id AND pa.deleted_at IS NULL
           )
           ${filterSql}
         GROUP BY p.id`
      )
      .all(...params) as Array<{ id: string; amount: number; invoice_id: string }>

    const fifoRows: Array<{ name: string; amount: number }> = []
    for (const payment of unallocatedPayments) {
      const lines = this.db
        .prepare(
          `SELECT description, amount FROM invoice_lines
           WHERE invoice_id = ? AND deleted_at IS NULL
           ORDER BY sort_order ASC`
        )
        .all(payment.invoice_id) as Array<{ description: string; amount: number }>
      const priorPaid = Number(
        (
          this.db
            .prepare(
              `SELECT IFNULL(SUM(amount), 0) AS total FROM payments
               WHERE invoice_id = ? AND deleted_at IS NULL AND id != ?
                 AND (
                   paid_at < (SELECT paid_at FROM payments WHERE id = ?)
                   OR (
                     paid_at = (SELECT paid_at FROM payments WHERE id = ?)
                     AND created_at < (SELECT created_at FROM payments WHERE id = ?)
                   )
                 )`
            )
            .get(
              payment.invoice_id,
              payment.id,
              payment.id,
              payment.id,
              payment.id
            ) as { total: number }
        )?.total || 0
      )
      for (const line of allocatePaymentToLines(
        lines,
        Number(payment.amount) || 0,
        priorPaid
      )) {
        if (line.paid <= 0) continue
        fifoRows.push({ name: line.description, amount: line.paid })
      }
    }

    return aggregateNamedAmounts([
      ...fromStored.map((r) => ({
        name: r.name || 'Other',
        amount: Number(r.amount) || 0,
      })),
      ...fifoRows,
    ])
  }

  private loadPayments(schoolId: string, filters: ReportFilters): PaymentFact[] {
    const params = this.filterParams(schoolId, filters, [
      'academic_year_id',
      'term_id',
      'class_id',
      'from',
      'to',
      'payment_method',
    ])
    if (filters.fee_type) params.push(filters.fee_type, filters.fee_type)
    return this.db
      .prepare(
        `SELECT p.school_id, p.amount, p.method, p.paid_at, p.student_id, st.class_id,
                c.name AS class_name, i.academic_term_id, t.name AS term_name,
                COALESCE(MAX(fc.name), 'Other') AS fee_type
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN students st ON st.id = p.student_id
         LEFT JOIN classes c ON c.id = st.class_id
         LEFT JOIN academic_terms t ON t.id = i.academic_term_id
         LEFT JOIN invoice_lines il ON il.invoice_id = i.id AND il.deleted_at IS NULL AND il.is_adjustment = 0
         LEFT JOIN fee_categories fc ON fc.id = il.fee_category_id
         WHERE p.school_id = ? AND p.deleted_at IS NULL
           ${filters.academic_year_id ? 'AND i.academic_year_id = ?' : ''}
           ${filters.term_id ? 'AND i.academic_term_id = ?' : ''}
           ${filters.class_id ? 'AND st.class_id = ?' : ''}
           ${filters.from ? 'AND p.paid_at >= ?' : ''}
           ${filters.to ? 'AND p.paid_at <= ?' : ''}
           ${filters.payment_method ? 'AND p.method = ?' : ''}
           ${filters.fee_type ? 'AND (fc.category_key = ? OR fc.id = ?)' : ''}
         GROUP BY p.id`
      )
      .all(...params) as PaymentFact[]
  }

  private loadExpenses(schoolId: string, filters: ReportFilters): ExpenseFact[] {
    return this.db
      .prepare(
        `SELECT school_id, amount, category, expense_date FROM expenses
         WHERE school_id = ? AND deleted_at IS NULL
           ${filters.from ? 'AND expense_date >= ?' : ''}
           ${filters.to ? 'AND expense_date <= ?' : ''}
           ${filters.expense_category ? 'AND category = ?' : ''}`
      )
      .all(
        ...this.filterParams(schoolId, filters, [
          'from',
          'to',
          'expense_category',
        ])
      ) as ExpenseFact[]
  }

  private outstandingByClass(invoices: InvoiceFact[]) {
    const grouped = new Map<
      string,
      {
        class_id: string
        class_name: string
        outstanding: number
        students: Set<string>
      }
    >()
    for (const inv of invoices) {
      if (inv.status === 'cancelled' || inv.balance <= 0) continue
      const key = inv.class_id || 'none'
      const row = grouped.get(key) ?? {
        class_id: key,
        class_name: inv.class_name || '—',
        outstanding: 0,
        students: new Set<string>(),
      }
      row.outstanding = round2(row.outstanding + inv.balance)
      row.students.add(inv.student_id)
      grouped.set(key, row)
    }
    return [...grouped.values()]
      .map((r) => ({
        class_id: r.class_id,
        class_name: r.class_name,
        outstanding: r.outstanding,
        students_owing: r.students.size,
      }))
      .sort((a, b) => b.outstanding - a.outstanding)
  }

  private outstandingByStudent(invoices: InvoiceFact[]) {
    const grouped = new Map<
      string,
      {
        student_id: string
        student_name: string
        class_name: string
        outstanding: number
      }
    >()
    for (const inv of invoices) {
      if (inv.status === 'cancelled' || inv.balance <= 0) continue
      const row = grouped.get(inv.student_id) ?? {
        student_id: inv.student_id,
        student_name: inv.student_name || '—',
        class_name: inv.class_name || '—',
        outstanding: 0,
      }
      row.outstanding = round2(row.outstanding + inv.balance)
      grouped.set(inv.student_id, row)
    }
    return [...grouped.values()]
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 50)
  }

  private depositReport(schoolId: string, filters: ReportFilters) {
    const from = filters.from || '1970-01-01'
    const to = filters.to || '2999-12-31'
    const cash = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS total FROM payments
         WHERE school_id = ? AND deleted_at IS NULL AND method = 'cash'
           AND paid_at >= ? AND paid_at <= ?`
      )
      .get(schoolId, from, to) as { total: number }
    const deposits = this.db
      .prepare(
        `SELECT d.id, d.amount, d.bank_name, d.deposit_date, d.status,
                COALESCE((SELECT SUM(a.amount) FROM bank_deposit_allocations a
                          WHERE a.bank_deposit_id = d.id AND a.deleted_at IS NULL), 0) AS reconciled
         FROM bank_deposits d
         WHERE d.school_id = ? AND d.deleted_at IS NULL
           AND d.deposit_date >= ? AND d.deposit_date <= ?`
      )
      .all(schoolId, from, to) as Array<{
      id: string
      amount: number
      bank_name: string
      deposit_date: string
      status: string
      reconciled: number
    }>
    const byBank = new Map<string, number>()
    const byPeriod = new Map<string, number>()
    let deposited = 0
    let reconciled = 0
    let unreconciled = 0
    for (const d of deposits) {
      deposited += d.amount
      reconciled += d.reconciled
      unreconciled += Math.max(0, d.amount - d.reconciled)
      byBank.set(d.bank_name, round2((byBank.get(d.bank_name) || 0) + d.amount))
      const month = d.deposit_date.slice(0, 7)
      byPeriod.set(month, round2((byPeriod.get(month) || 0) + d.amount))
    }
    return {
      cash_collected: round2(cash.total),
      cash_deposited: round2(deposited),
      undeposited: round2(Math.max(0, cash.total - deposited)),
      reconciled: round2(reconciled),
      unreconciled: round2(unreconciled),
      by_bank: [...byBank.entries()].map(([name, amount]) => ({
        name,
        amount,
      })),
      by_period: [...byPeriod.entries()]
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    }
  }

  private budgetReport(schoolId: string, yearId?: string | null) {
    const params: string[] = [schoolId]
    let sql = `SELECT b.school_id, b.allocated_amount, b.period_start, b.period_end,
                c.category_key, c.name AS category_name
       FROM budgets b JOIN budget_categories c ON c.id = b.budget_category_id
       WHERE b.school_id = ? AND b.deleted_at IS NULL AND b.status = 'active'`
    if (yearId) {
      sql += ` AND b.academic_year_id = ?`
      params.push(yearId)
    }
    const rows = this.db.prepare(sql).all(...params) as Array<{
      allocated_amount: number
      period_start: string
      period_end: string
      category_key: string
      category_name: string
      school_id: string
    }>
    const categories = rows.map((b) => {
      const expenseKeys = Object.entries(EXPENSE_TO_BUDGET_KEY)
        .filter(([, mapped]) => mapped === b.category_key)
        .map(([k]) => k)
      const keys = expenseKeys.length ? expenseKeys : [b.category_key]
      const placeholders = keys.map(() => '?').join(',')
      const spentRow = this.db
        .prepare(
          `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
           WHERE school_id = ? AND deleted_at IS NULL
             AND category IN (${placeholders})
             AND expense_date >= ? AND expense_date <= ?`
        )
        .get(b.school_id, ...keys, b.period_start, b.period_end) as {
        total: number
      }
      const spent = round2(spentRow.total)
      const allocated = b.allocated_amount
      return {
        name: b.category_name,
        key: b.category_key,
        allocated,
        spent,
        remaining: budgetRemaining(allocated, spent),
        utilization: budgetUtil(allocated, spent),
      }
    })
    const allocated = round2(categories.reduce((s, c) => s + c.allocated, 0))
    const spent = round2(categories.reduce((s, c) => s + c.spent, 0))
    return {
      allocated,
      spent,
      remaining: budgetRemaining(allocated, spent),
      utilization: budgetUtil(allocated, spent),
      categories,
    }
  }

  private loadAttendanceMarks(
    schoolId: string,
    filters: ReportFilters
  ): AttendanceMarkFact[] {
    const params: string[] = [schoolId]
    let sql = `SELECT s.school_id, r.student_id, st.name AS student_name, s.class_id,
                c.name AS class_name, r.status, s.session_date
         FROM attendance_records r
         JOIN attendance_sessions s ON s.id = r.session_id
         JOIN students st ON st.id = r.student_id
         LEFT JOIN classes c ON c.id = s.class_id
         WHERE s.school_id = ? AND s.deleted_at IS NULL AND r.deleted_at IS NULL`
    if (filters.class_id) {
      sql += ` AND s.class_id = ?`
      params.push(filters.class_id)
    }
    if (filters.student_id) {
      sql += ` AND r.student_id = ?`
      params.push(filters.student_id)
    }
    if (filters.department_id) {
      sql += ` AND c.section_id = ?`
      params.push(filters.department_id)
    }
    if (filters.from) {
      sql += ` AND s.session_date >= ?`
      params.push(filters.from)
    }
    if (filters.to) {
      sql += ` AND s.session_date <= ?`
      params.push(filters.to)
    }
    if (filters.academic_year_id) {
      sql += ` AND s.session_date BETWEEN (SELECT start_date FROM academic_years WHERE id = ?)
               AND (SELECT end_date FROM academic_years WHERE id = ?)`
      params.push(filters.academic_year_id, filters.academic_year_id)
    }
    if (filters.term_id) {
      sql += ` AND s.session_date BETWEEN (SELECT start_date FROM academic_terms WHERE id = ?)
               AND (SELECT end_date FROM academic_terms WHERE id = ?)`
      params.push(filters.term_id, filters.term_id)
    }
    return this.db.prepare(sql).all(...params) as AttendanceMarkFact[]
  }

  private staffAttendanceSummary(schoolId: string, filters: ReportFilters) {
    const from = filters.from || '1970-01-01'
    const to = filters.to || '2999-12-31'
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) AS n FROM staff_attendance
         WHERE school_id = ? AND deleted_at IS NULL AND date >= ? AND date <= ?
         GROUP BY status`
      )
      .all(schoolId, from, to) as Array<{ status: string; n: number }>
    const present = rows.find((r) => r.status === 'present')?.n ?? 0
    const absent = rows.find((r) => r.status === 'absent')?.n ?? 0
    const late = rows.find((r) => r.status === 'late')?.n ?? 0
    const total = rows.reduce((s, r) => s + r.n, 0)
    return {
      present,
      absent,
      late,
      rate: total ? round2(((present + late) / total) * 100) : 0,
    }
  }

  private enrolmentInsights(schoolId: string, filters: ReportFilters) {
    const year = filters.academic_year_id
      ? (this.db
          .prepare(
            `SELECT start_date, end_date FROM academic_years WHERE id = ?`
          )
          .get(filters.academic_year_id) as
          | { start_date: string; end_date: string }
          | undefined)
      : undefined
    const students = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM students
         WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`
      )
      .get(schoolId) as { n: number }
    const from = year?.start_date || '1970-01-01'
    const to = (year?.end_date || '2999-12-31') + 'T23:59:59'
    const admissions = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM admissions
         WHERE school_id = ? AND deleted_at IS NULL AND status = 'accepted'
           AND created_at >= ? AND created_at <= ?`
      )
      .get(schoolId, from, to) as { n: number }
    const withdrawals = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM student_transfers
         WHERE school_id = ? AND deleted_at IS NULL
           AND created_at >= ? AND created_at <= ?`
      )
      .get(schoolId, from, to) as { n: number }
    const perClass = this.db
      .prepare(
        `SELECT c.id, c.name, COUNT(s.id) AS n
         FROM classes c
         LEFT JOIN students s ON s.class_id = c.id AND s.deleted_at IS NULL AND s.status = 'active'
         WHERE c.school_id = ? AND c.deleted_at IS NULL
         GROUP BY c.id ORDER BY c.name`
      )
      .all(schoolId) as Array<{ id: string; name: string; n: number }>
    const perDept = this.db
      .prepare(
        `SELECT IFNULL(sec.name,'Unassigned') AS name, COUNT(s.id) AS n
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN sections sec ON sec.id = c.section_id
         WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.status = 'active'
         GROUP BY sec.id ORDER BY n DESC`
      )
      .all(schoolId) as Array<{ name: string; n: number }>
    return {
      total: students.n,
      new_admissions: admissions.n,
      withdrawals: withdrawals.n,
      per_class: perClass,
      per_department: perDept,
    }
  }

  private staffInsights(schoolId: string) {
    const teachers = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM staff
         WHERE school_id = ? AND deleted_at IS NULL AND status = 'active' AND staff_type = 'teaching'`
      )
      .get(schoolId) as { n: number }
    const staff = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM staff
         WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`
      )
      .get(schoolId) as { n: number }
    const workload = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM timetable_slots
         WHERE school_id = ? AND deleted_at IS NULL`
      )
      .get(schoolId) as { n: number }
    const today = todayIso()
    const leave = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM leave_requests
         WHERE school_id = ? AND deleted_at IS NULL AND status = 'approved'
           AND start_date <= ? AND end_date >= ?`
      )
      .get(schoolId, today, today) as { n: number }
    const att = this.staffAttendanceSummary(schoolId, {})
    return {
      teachers: teachers.n,
      staff: staff.n,
      timetable_periods: workload.n,
      active_leave: leave.n,
      attendance_rate: att.rate,
    }
  }

  private previousTermFilters(filters: ReportFilters): ReportFilters | null {
    if (!filters.term_id) return null
    const current = this.db
      .prepare(
        `SELECT id, term_number, academic_year_id FROM academic_terms WHERE id = ?`
      )
      .get(filters.term_id) as
      | { id: string; term_number: number; academic_year_id: string }
      | undefined
    if (!current) return null
    const prev = this.db
      .prepare(
        `SELECT id FROM academic_terms
         WHERE academic_year_id = ? AND term_number = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(current.academic_year_id, current.term_number - 1) as
      | { id: string }
      | undefined
    if (!prev) return null
    return { ...filters, term_id: prev.id }
  }

  private resolvePassMark(schoolId: string): number {
    const settings = this.settings(schoolId)
    const bands = this.db
      .prepare(
        `SELECT gb.grade, gb.min_score FROM grade_bands gb
         JOIN grading_systems gs ON gs.id = gb.grading_system_id
         WHERE gs.school_id = ? AND gs.deleted_at IS NULL AND gb.deleted_at IS NULL`
      )
      .all(schoolId) as Array<{ grade: string; min_score: number }>
    return bands.length ? passMarkFromBands(bands) : settings.pass_mark
  }

  private settings(schoolId: string) {
    this.ensureSettings(schoolId)
    return this.db
      .prepare(
        `SELECT attendance_risk_pct, pass_mark FROM report_settings
         WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId) as { attendance_risk_pct: number; pass_mark: number }
  }

  private ensureSettings(schoolId: string) {
    const existing = this.db
      .prepare(
        `SELECT id FROM report_settings WHERE school_id = ? AND deleted_at IS NULL LIMIT 1`
      )
      .get(schoolId) as { id: string } | undefined
    if (existing) return
    const now = new Date().toISOString()
    const row = {
      id: randomUUID(),
      school_id: schoolId,
      attendance_risk_pct: 75,
      pass_mark: 40,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      sync_status: 'pending',
      version: 1,
    }
    this.db
      .prepare(
        `INSERT INTO report_settings (
           id, school_id, attendance_risk_pct, pass_mark,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @attendance_risk_pct, @pass_mark,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(row)
    enqueueSync(
      this.db,
      'report_settings',
      row.id,
      'INSERT',
      row as unknown as Record<string, unknown>
    )
  }
}

function meanSafe(values: number[]): number {
  if (!values.length) return 0
  return round2(values.reduce((s, n) => s + n, 0) / values.length)
}
