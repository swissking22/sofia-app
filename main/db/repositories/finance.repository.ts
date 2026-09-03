import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import type { FeeAmount, FeeCategory, FinanceSettings } from '../types'
import { BaseRepository } from './base'

export const DEFAULT_FEE_CATEGORIES: Array<{
  key: string
  name: string
  sort_order: number
}> = [
  { key: 'tuition', name: 'Tuition', sort_order: 1 },
  { key: 'registration', name: 'Registration', sort_order: 2 },
  { key: 'pta', name: 'PTA', sort_order: 3 },
  { key: 'development_levy', name: 'Development Levy', sort_order: 4 },
  { key: 'uniform', name: 'Uniform', sort_order: 5 },
  { key: 'books', name: 'Books', sort_order: 6 },
  { key: 'transport', name: 'Transport', sort_order: 7 },
  { key: 'boarding', name: 'Boarding', sort_order: 8 },
  { key: 'dormitory', name: 'Dormitory', sort_order: 9 },
  { key: 'other', name: 'Other Fees', sort_order: 10 },
]

export const PAYMENT_METHOD_OPTIONS = [
  { key: 'cash', label: 'Cash' },
  { key: 'mobile_money', label: 'Mobile Money' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'cheque', label: 'Cheque' },
] as const

export const CURRENCY_OPTIONS = ['XAF', 'USD', 'EUR', 'NGN', 'GHS'] as const

export type PaymentMethodKey = (typeof PAYMENT_METHOD_OPTIONS)[number]['key']

export interface FeeCategoryDto {
  id: string
  name: string
  category_key: string
  is_system: boolean
  is_active: boolean
  sort_order: number
}

export interface FeeStructureRow {
  academic_level_id: string
  level_name: string
  amounts: Record<string, number>
}

export interface FinanceSetupDto {
  schoolId: string
  categories: FeeCategoryDto[]
  levels: Array<{ id: string; name: string }>
  structure: FeeStructureRow[]
  currency: string
  payment_methods: PaymentMethodKey[]
  receipt_prefix: string
  receipt_next_number: number
  receipt_example: string
}

export interface FinanceSaveInput {
  categories: Array<{
    id?: string | null
    name: string
    category_key?: string | null
    is_active: boolean
  }>
  amounts: Array<{
    academic_level_id: string
    fee_category_id: string
    amount: number
  }>
  currency: string
  payment_methods: string[]
  receipt_prefix: string
  receipt_next_number: number
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'fee'
  )
}

function parseMethods(raw: string): PaymentMethodKey[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return ['cash']
    const allowed = new Set(PAYMENT_METHOD_OPTIONS.map((m) => m.key))
    return parsed.filter(
      (k): k is PaymentMethodKey =>
        typeof k === 'string' && allowed.has(k as PaymentMethodKey)
    )
  } catch {
    return ['cash']
  }
}

function padReceipt(n: number): string {
  return String(Math.max(1, Math.floor(n))).padStart(5, '0')
}

export class FinanceRepository extends BaseRepository<FinanceSettings> {
  constructor(db: Database.Database) {
    super(db, 'finance_settings')
  }

  ensureDefaults(schoolId: string): void {
    const tx = this.db.transaction(() => {
      this.ensureSettings(schoolId)
      this.ensureCategories(schoolId)
    })
    tx()
  }

  private ensureSettings(schoolId: string): FinanceSettings {
    const existing = this.db
      .prepare(
        `SELECT * FROM finance_settings
         WHERE school_id = ? AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(schoolId) as FinanceSettings | undefined
    if (existing) return existing

    const record: FinanceSettings = {
      ...this.buildBaseFields(),
      school_id: schoolId,
      currency: 'XAF',
      payment_methods: JSON.stringify(['cash', 'mobile_money', 'bank_transfer']),
      receipt_prefix: 'RCP',
      receipt_next_number: 1,
      invoice_prefix: 'INV',
      invoice_next_number: 1,
      payment_prefix: 'PAY',
      payment_next_number: 1,
      expense_prefix: 'EXP',
      expense_next_number: 1,
      allow_credit: 1,
    }
    this.db
      .prepare(
        `INSERT INTO finance_settings (
          id, school_id, currency, payment_methods, receipt_prefix, receipt_next_number,
          invoice_prefix, invoice_next_number, payment_prefix, payment_next_number,
          expense_prefix, expense_next_number, allow_credit,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @currency, @payment_methods, @receipt_prefix, @receipt_next_number,
          @invoice_prefix, @invoice_next_number, @payment_prefix, @payment_next_number,
          @expense_prefix, @expense_next_number, @allow_credit,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )`
      )
      .run(record)
    enqueueSync(
      this.db,
      'finance_settings',
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    return record
  }

  private ensureCategories(schoolId: string): void {
    for (const seed of DEFAULT_FEE_CATEGORIES) {
      const existing = this.db
        .prepare(
          `SELECT id FROM fee_categories
           WHERE school_id = ? AND category_key = ? AND deleted_at IS NULL`
        )
        .get(schoolId, seed.key) as { id: string } | undefined
      if (existing) continue

      const record: FeeCategory = {
        ...this.buildBaseFields(),
        school_id: schoolId,
        name: seed.name,
        category_key: seed.key,
        is_system: 1,
        is_active: 1,
        sort_order: seed.sort_order,
      }
      this.db
        .prepare(
          `INSERT INTO fee_categories (
            id, school_id, name, category_key, is_system, is_active, sort_order,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @name, @category_key, @is_system, @is_active, @sort_order,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )`
        )
        .run(record)
      enqueueSync(
        this.db,
        'fee_categories',
        record.id,
        'INSERT',
        record as unknown as Record<string, unknown>
      )
    }
  }

  listCategories(schoolId: string): FeeCategory[] {
    return this.db
      .prepare(
        `SELECT * FROM fee_categories
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ASC, name ASC`
      )
      .all(schoolId) as FeeCategory[]
  }

  getSetupDto(
    schoolId: string,
    levels: Array<{ id: string; name: string }>
  ): FinanceSetupDto {
    this.ensureDefaults(schoolId)
    const settings = this.ensureSettings(schoolId)
    const categories = this.listCategories(schoolId)
    const amounts = this.db
      .prepare(
        `SELECT * FROM fee_amounts
         WHERE school_id = ? AND deleted_at IS NULL`
      )
      .all(schoolId) as FeeAmount[]

    const amountMap = new Map<string, number>()
    for (const a of amounts) {
      amountMap.set(`${a.academic_level_id}:${a.fee_category_id}`, a.amount)
    }

    const structure: FeeStructureRow[] = levels.map((level) => {
      const rowAmounts: Record<string, number> = {}
      for (const cat of categories) {
        rowAmounts[cat.id] = amountMap.get(`${level.id}:${cat.id}`) ?? 0
      }
      return {
        academic_level_id: level.id,
        level_name: level.name,
        amounts: rowAmounts,
      }
    })

    const methods = parseMethods(settings.payment_methods)
    const prefix = settings.receipt_prefix || 'RCP'

    return {
      schoolId,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        category_key: c.category_key,
        is_system: c.is_system === 1,
        is_active: c.is_active === 1,
        sort_order: c.sort_order,
      })),
      levels,
      structure,
      currency: settings.currency,
      payment_methods: methods,
      receipt_prefix: prefix,
      receipt_next_number: settings.receipt_next_number,
      receipt_example: `${prefix}-${padReceipt(settings.receipt_next_number)}`,
    }
  }

  saveSetup(
    schoolId: string,
    input: FinanceSaveInput,
    levels: Array<{ id: string; name: string }>
  ): FinanceSetupDto {
    if (!input.currency?.trim()) throw new Error('Currency is required.')
    if (!input.payment_methods?.length) {
      throw new Error('Select at least one payment method.')
    }
    const prefix = (input.receipt_prefix || 'RCP').trim().toUpperCase()
    if (!prefix) throw new Error('Receipt prefix is required.')

    const tx = this.db.transaction(() => {
      this.ensureDefaults(schoolId)
      this.saveCategories(schoolId, input.categories ?? [])
      const categories = this.listCategories(schoolId)
      const activeIds = new Set(
        categories.filter((c) => c.is_active === 1).map((c) => c.id)
      )
      this.saveAmounts(
        schoolId,
        (input.amounts ?? []).filter((a) => activeIds.has(a.fee_category_id))
      )
      this.saveSettings(schoolId, {
        currency: input.currency.trim().toUpperCase(),
        payment_methods: input.payment_methods,
        receipt_prefix: prefix,
        receipt_next_number: Math.max(
          1,
          Math.floor(input.receipt_next_number || 1)
        ),
      })
    })
    tx()

    return this.getSetupDto(schoolId, levels)
  }

  private saveCategories(
    schoolId: string,
    input: FinanceSaveInput['categories']
  ): void {
    const existing = this.listCategories(schoolId)
    const byId = new Map(existing.map((c) => [c.id, c]))
    let sort = 1

    for (const row of input) {
      const name = row.name.trim()
      if (!name) continue

      if (row.id && byId.has(row.id)) {
        const current = byId.get(row.id)!
        const updated: FeeCategory = {
          ...current,
          name: current.is_system === 1 ? current.name : name,
          is_active: row.is_active ? 1 : 0,
          sort_order: sort,
          ...this.applyUpdateMeta(current),
        }
        this.db
          .prepare(
            `UPDATE fee_categories
             SET name = @name,
                 is_active = @is_active,
                 sort_order = @sort_order,
                 updated_at = @updated_at,
                 version = @version,
                 sync_status = @sync_status
             WHERE id = @id`
          )
          .run(updated)
        enqueueSync(
          this.db,
          'fee_categories',
          updated.id,
          'UPDATE',
          updated as unknown as Record<string, unknown>
        )
      } else {
        let key = slugify(row.category_key?.trim() || name)
        let n = 2
        while (
          this.db
            .prepare(
              `SELECT id FROM fee_categories
               WHERE school_id = ? AND category_key = ? AND deleted_at IS NULL`
            )
            .get(schoolId, key)
        ) {
          key = `${slugify(name)}_${n}`
          n += 1
        }

        const record: FeeCategory = {
          ...this.buildBaseFields(),
          school_id: schoolId,
          name,
          category_key: key,
          is_system: 0,
          is_active: row.is_active ? 1 : 0,
          sort_order: sort,
        }
        this.db
          .prepare(
            `INSERT INTO fee_categories (
              id, school_id, name, category_key, is_system, is_active, sort_order,
              created_at, updated_at, deleted_at, sync_status, version
            ) VALUES (
              @id, @school_id, @name, @category_key, @is_system, @is_active, @sort_order,
              @created_at, @updated_at, @deleted_at, @sync_status, @version
            )`
          )
          .run(record)
        enqueueSync(
          this.db,
          'fee_categories',
          record.id,
          'INSERT',
          record as unknown as Record<string, unknown>
        )
      }
      sort += 1
    }
  }

  private saveAmounts(
    schoolId: string,
    amounts: FinanceSaveInput['amounts']
  ): void {
    const existing = this.db
      .prepare(
        `SELECT * FROM fee_amounts
         WHERE school_id = ? AND deleted_at IS NULL`
      )
      .all(schoolId) as FeeAmount[]
    const byKey = new Map(
      existing.map((a) => [`${a.academic_level_id}:${a.fee_category_id}`, a])
    )
    const seen = new Set<string>()

    for (const row of amounts) {
      const key = `${row.academic_level_id}:${row.fee_category_id}`
      seen.add(key)
      const amount = Math.max(0, Number(row.amount) || 0)
      const current = byKey.get(key)
      if (current) {
        if (current.amount === amount) continue
        const updated: FeeAmount = {
          ...current,
          amount,
          ...this.applyUpdateMeta(current),
        }
        this.db
          .prepare(
            `UPDATE fee_amounts
             SET amount = @amount,
                 updated_at = @updated_at,
                 version = @version,
                 sync_status = @sync_status
             WHERE id = @id`
          )
          .run(updated)
        enqueueSync(
          this.db,
          'fee_amounts',
          updated.id,
          'UPDATE',
          updated as unknown as Record<string, unknown>
        )
      } else if (amount > 0) {
        const record: FeeAmount = {
          ...this.buildBaseFields(),
          school_id: schoolId,
          academic_level_id: row.academic_level_id,
          fee_category_id: row.fee_category_id,
          amount,
        }
        this.db
          .prepare(
            `INSERT INTO fee_amounts (
              id, school_id, academic_level_id, fee_category_id, amount,
              created_at, updated_at, deleted_at, sync_status, version
            ) VALUES (
              @id, @school_id, @academic_level_id, @fee_category_id, @amount,
              @created_at, @updated_at, @deleted_at, @sync_status, @version
            )`
          )
          .run(record)
        enqueueSync(
          this.db,
          'fee_amounts',
          record.id,
          'INSERT',
          record as unknown as Record<string, unknown>
        )
      }
    }

    for (const row of existing) {
      const key = `${row.academic_level_id}:${row.fee_category_id}`
      if (seen.has(key)) continue
      const now = new Date().toISOString()
      const deleted: FeeAmount = {
        ...row,
        deleted_at: now,
        updated_at: now,
        version: row.version + 1,
        sync_status: 'pending',
      }
      this.db
        .prepare(
          `UPDATE fee_amounts
           SET deleted_at = @deleted_at,
               updated_at = @updated_at,
               version = @version,
               sync_status = @sync_status
           WHERE id = @id`
        )
        .run(deleted)
      enqueueSync(
        this.db,
        'fee_amounts',
        deleted.id,
        'DELETE',
        deleted as unknown as Record<string, unknown>
      )
    }
  }

  private saveSettings(
    schoolId: string,
    input: {
      currency: string
      payment_methods: string[]
      receipt_prefix: string
      receipt_next_number: number
    }
  ): void {
    const existing = this.ensureSettings(schoolId)
    const record: FinanceSettings = {
      ...existing,
      currency: input.currency,
      payment_methods: JSON.stringify(input.payment_methods),
      receipt_prefix: input.receipt_prefix,
      receipt_next_number: input.receipt_next_number,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE finance_settings
         SET currency = @currency,
             payment_methods = @payment_methods,
             receipt_prefix = @receipt_prefix,
             receipt_next_number = @receipt_next_number,
             updated_at = @updated_at,
             version = @version,
             sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      'finance_settings',
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
  }
}
