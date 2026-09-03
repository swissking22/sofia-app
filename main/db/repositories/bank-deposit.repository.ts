import type Database from 'better-sqlite3'
import { enqueueSync } from '../../sync/queue'
import {
  assertAllocationsValid,
  assertMutable,
  canVerify,
  reconciledTotals,
  validateDepositAmount,
  validateDepositDates,
} from '../../domain/bank-deposit'
import { round2 } from '../../domain/finance'
import type {
  BankDeposit,
  BankDepositAllocation,
  BankDepositStatus,
} from '../types'
import { BaseRepository } from './base'
import type { FinanceMgmtRepository } from './finance-mgmt.repository'

export interface BankDepositDto {
  id: string
  deposit_number: string
  amount: number
  collection_source: string | null
  collection_date: string | null
  deposit_date: string
  bank_name: string
  bank_account: string | null
  deposit_reference: string | null
  deposited_by: string | null
  notes: string | null
  document_path: string | null
  status: BankDepositStatus
  verified_at: string | null
  posted_at: string | null
  reconciled: number
  unreconciled: number
  allocations: Array<{
    id: string
    payment_id: string
    amount: number
    payment_number: string | null
    student_name: string | null
  }>
}

export class BankDepositRepository extends BaseRepository<BankDeposit> {
  constructor(
    db: Database.Database,
    private finance: FinanceMgmtRepository
  ) {
    super(db, 'bank_deposits')
  }

  private nextNumber(schoolId: string): string {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM bank_deposits WHERE school_id = ?`
      )
      .get(schoolId) as { n: number }
    return `DEP-${String((row.n || 0) + 1).padStart(4, '0')}`
  }

  private allocations(depositId: string) {
    return this.db
      .prepare(
        `SELECT a.*, p.payment_number, s.name AS student_name
         FROM bank_deposit_allocations a
         LEFT JOIN payments p ON p.id = a.payment_id
         LEFT JOIN students s ON s.id = p.student_id
         WHERE a.bank_deposit_id = ? AND a.deleted_at IS NULL`
      )
      .all(depositId) as Array<
      BankDepositAllocation & {
        payment_number: string | null
        student_name: string | null
      }
    >
  }

  private toDto(row: BankDeposit): BankDepositDto {
    const allocs = this.allocations(row.id)
    const totals = reconciledTotals(
      row.amount,
      allocs.map((a) => a.amount)
    )
    return {
      id: row.id,
      deposit_number: row.deposit_number,
      amount: row.amount,
      collection_source: row.collection_source,
      collection_date: row.collection_date,
      deposit_date: row.deposit_date,
      bank_name: row.bank_name,
      bank_account: row.bank_account,
      deposit_reference: row.deposit_reference,
      deposited_by: row.deposited_by,
      notes: row.notes,
      document_path: row.document_path,
      status: row.status,
      verified_at: row.verified_at,
      posted_at: row.posted_at,
      reconciled: totals.reconciled,
      unreconciled: totals.unreconciled,
      allocations: allocs.map((a) => ({
        id: a.id,
        payment_id: a.payment_id,
        amount: a.amount,
        payment_number: a.payment_number,
        student_name: a.student_name,
      })),
    }
  }

  list(schoolId: string): BankDepositDto[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM bank_deposits
         WHERE school_id = ? AND deleted_at IS NULL
         ORDER BY deposit_date DESC, created_at DESC`
      )
      .all(schoolId) as BankDeposit[]
    return rows.map((r) => this.toDto(r))
  }

  getDto(id: string, schoolId: string): BankDepositDto | null {
    const row = this.findById(id)
    if (!row || row.school_id !== schoolId) return null
    return this.toDto(row)
  }

  create(input: {
    school_id: string
    amount: number
    collection_source?: string | null
    collection_date?: string | null
    deposit_date: string
    bank_name: string
    bank_account?: string | null
    deposit_reference?: string | null
    deposited_by?: string | null
    notes?: string | null
    document_path?: string | null
    created_by?: string | null
  }): BankDepositDto {
    validateDepositAmount(input.amount)
    validateDepositDates(input.collection_date ?? null, input.deposit_date)
    if (!input.bank_name.trim()) throw new Error('Bank name is required.')
    const record: BankDeposit = {
      ...this.buildBaseFields(),
      school_id: input.school_id,
      deposit_number: this.nextNumber(input.school_id),
      amount: round2(input.amount),
      collection_source: input.collection_source?.trim() || null,
      collection_date: input.collection_date || null,
      deposit_date: input.deposit_date,
      bank_name: input.bank_name.trim(),
      bank_account: input.bank_account?.trim() || null,
      deposit_reference: input.deposit_reference?.trim() || null,
      deposited_by: input.deposited_by?.trim() || null,
      notes: input.notes?.trim() || null,
      document_path: input.document_path || null,
      status: 'pending_verification',
      verified_by: null,
      verified_at: null,
      posted_at: null,
      created_by: input.created_by ?? null,
    }
    this.db
      .prepare(
        `INSERT INTO bank_deposits (
           id, school_id, deposit_number, amount, collection_source, collection_date,
           deposit_date, bank_name, bank_account, deposit_reference, deposited_by,
           notes, document_path, status, verified_by, verified_at, posted_at, created_by,
           created_at, updated_at, deleted_at, sync_status, version
         ) VALUES (
           @id, @school_id, @deposit_number, @amount, @collection_source, @collection_date,
           @deposit_date, @bank_name, @bank_account, @deposit_reference, @deposited_by,
           @notes, @document_path, @status, @verified_by, @verified_at, @posted_at, @created_by,
           @created_at, @updated_at, @deleted_at, @sync_status, @version
         )`
      )
      .run(record)
    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'INSERT',
      record as unknown as Record<string, unknown>
    )
    this.finance.audit(
      input.school_id,
      'deposit.create',
      'bank_deposit',
      record.id,
      input.created_by ?? null,
      { amount: record.amount }
    )
    return this.toDto(record)
  }

  updatePending(
    id: string,
    schoolId: string,
    patch: Partial<
      Pick<
        BankDeposit,
        | 'amount'
        | 'collection_source'
        | 'collection_date'
        | 'deposit_date'
        | 'bank_name'
        | 'bank_account'
        | 'deposit_reference'
        | 'deposited_by'
        | 'notes'
        | 'document_path'
      >
    >,
    userId: string | null
  ): BankDepositDto {
    const existing = this.findById(id)
    if (!existing || existing.school_id !== schoolId) {
      throw new Error('Deposit not found.')
    }
    assertMutable(existing.status, 'edit')
    if (patch.amount != null) validateDepositAmount(patch.amount)
    const deposit_date = patch.deposit_date ?? existing.deposit_date
    validateDepositDates(
      patch.collection_date ?? existing.collection_date,
      deposit_date
    )
    const record: BankDeposit = {
      ...existing,
      ...patch,
      amount: round2(patch.amount ?? existing.amount),
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE bank_deposits SET
           amount = @amount, collection_source = @collection_source,
           collection_date = @collection_date, deposit_date = @deposit_date,
           bank_name = @bank_name, bank_account = @bank_account,
           deposit_reference = @deposit_reference, deposited_by = @deposited_by,
           notes = @notes, document_path = @document_path,
           updated_at = @updated_at, version = @version, sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    this.finance.audit(
      schoolId,
      'deposit.update',
      'bank_deposit',
      id,
      userId,
      patch
    )
    return this.toDto(record)
  }

  reconcile(
    id: string,
    schoolId: string,
    items: Array<{ payment_id: string; amount: number }>,
    userId: string | null
  ): BankDepositDto {
    const existing = this.findById(id)
    if (!existing || existing.school_id !== schoolId) {
      throw new Error('Deposit not found.')
    }
    assertMutable(existing.status, 'reconcile')
    assertAllocationsValid(
      existing.amount,
      items.map((i) => i.amount)
    )

    const tx = this.db.transaction(() => {
      const prior = this.allocations(id)
      for (const row of prior) {
        this.db
          .prepare(
            `UPDATE bank_deposit_allocations
             SET deleted_at = @deleted_at, updated_at = @updated_at, version = version + 1
             WHERE id = @id`
          )
          .run({
            id: row.id,
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
      }
      for (const item of items) {
        const rec: BankDepositAllocation = {
          ...this.buildBaseFields(),
          school_id: schoolId,
          bank_deposit_id: id,
          payment_id: item.payment_id,
          amount: round2(item.amount),
        }
        this.db
          .prepare(
            `INSERT INTO bank_deposit_allocations (
               id, school_id, bank_deposit_id, payment_id, amount,
               created_at, updated_at, deleted_at, sync_status, version
             ) VALUES (
               @id, @school_id, @bank_deposit_id, @payment_id, @amount,
               @created_at, @updated_at, @deleted_at, @sync_status, @version
             )`
          )
          .run(rec)
        enqueueSync(
          this.db,
          'bank_deposit_allocations',
          rec.id,
          'INSERT',
          rec as unknown as Record<string, unknown>
        )
      }
    })
    tx()
    this.finance.audit(
      schoolId,
      'deposit.reconcile',
      'bank_deposit',
      id,
      userId,
      { items }
    )
    return this.getDto(id, schoolId)!
  }

  verify(id: string, schoolId: string, userId: string | null): BankDepositDto {
    const existing = this.findById(id)
    if (!existing || existing.school_id !== schoolId) {
      throw new Error('Deposit not found.')
    }
    const settings = this.finance.getSettings(schoolId)
    const dto = this.toDto(existing)
    canVerify({
      status: existing.status,
      requireFullReconciliation:
        (settings.require_full_deposit_reconciliation ?? 1) === 1,
      unreconciled: dto.unreconciled,
    })
    const now = new Date().toISOString()
    const record: BankDeposit = {
      ...existing,
      status: 'verified',
      verified_by: userId,
      verified_at: now,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE bank_deposits SET
           status = @status, verified_by = @verified_by, verified_at = @verified_at,
           updated_at = @updated_at, version = @version, sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    this.finance.audit(schoolId, 'deposit.verify', 'bank_deposit', id, userId)
    return this.toDto(record)
  }

  post(id: string, schoolId: string, userId: string | null): BankDepositDto {
    const existing = this.findById(id)
    if (!existing || existing.school_id !== schoolId) {
      throw new Error('Deposit not found.')
    }
    if (existing.status !== 'verified') {
      throw new Error('Only verified deposits can be posted.')
    }
    const now = new Date().toISOString()
    const record: BankDeposit = {
      ...existing,
      status: 'posted',
      posted_at: now,
      ...this.applyUpdateMeta(existing),
    }
    this.db
      .prepare(
        `UPDATE bank_deposits SET
           status = @status, posted_at = @posted_at,
           updated_at = @updated_at, version = @version, sync_status = @sync_status
         WHERE id = @id`
      )
      .run(record)
    enqueueSync(
      this.db,
      this.tableName,
      record.id,
      'UPDATE',
      record as unknown as Record<string, unknown>
    )
    this.finance.postLedger(
      schoolId,
      [
        {
          account: 'bank',
          debit: existing.amount,
          credit: 0,
          description: `Bank deposit ${existing.deposit_number}`,
        },
        {
          account: 'cash',
          debit: 0,
          credit: existing.amount,
          description: `Bank deposit ${existing.deposit_number}`,
        },
      ],
      'bank_deposit',
      existing.id,
      userId,
      existing.deposit_date
    )
    this.finance.audit(schoolId, 'deposit.post', 'bank_deposit', id, userId)
    return this.toDto(record)
  }
}
