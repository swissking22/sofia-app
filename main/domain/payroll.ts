/** Payroll helpers: periods, salary coverage, payslip totals. */

export function periodLabel(year: number, month: number): string {
  const m = String(month).padStart(2, '0')
  return `${year}-${m}`
}

/** First and last ISO date (YYYY-MM-DD) of a calendar month. */
export function monthBounds(
  year: number,
  month: number
): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export function salaryCoversPeriod(
  term: { effective_from: string; effective_to: string | null },
  periodStart: string,
  periodEnd: string
): boolean {
  if (term.effective_from > periodEnd) return false
  if (term.effective_to && term.effective_to < periodStart) return false
  return true
}

export function computePayslipTotals(
  lines: Array<{ line_type: string; amount: number }>
): { gross: number; deductions: number; net: number } {
  let gross = 0
  let deductions = 0
  for (const line of lines) {
    const amount = Number(line.amount) || 0
    if (line.line_type === 'deduction') deductions += amount
    else gross += amount
  }
  const net = Math.round((gross - deductions) * 100) / 100
  return {
    gross: Math.round(gross * 100) / 100,
    deductions: Math.round(deductions * 100) / 100,
    net,
  }
}
