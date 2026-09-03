import {
  assertAllocationsValid,
  assertMutable,
  canVerify,
  reconciledTotals,
  validateDepositAmount,
  validateDepositDates,
  type BankDepositStatus,
} from '../domain/bank-deposit'

export type DepositRecord = {
  id: string
  school_id: string
  amount: number
  collection_date: string | null
  deposit_date: string
  status: BankDepositStatus
  allocations: Array<{ payment_id: string; amount: number }>
  audit: Array<{ action: string; entity_id: string }>
}

export class BankDepositService {
  constructor(private rows: DepositRecord[]) {}

  create(input: Omit<DepositRecord, 'id' | 'status' | 'allocations' | 'audit'>): DepositRecord {
    validateDepositAmount(input.amount)
    validateDepositDates(input.collection_date, input.deposit_date)
    const row: DepositRecord = {
      ...input,
      id: `dep_${this.rows.length + 1}`,
      status: 'pending_verification',
      allocations: [],
      audit: [{ action: 'deposit.create', entity_id: `dep_${this.rows.length + 1}` }],
    }
    this.rows.push(row)
    return row
  }

  reconcile(
    id: string,
    allocations: Array<{ payment_id: string; amount: number }>
  ): DepositRecord {
    const row = this.must(id)
    assertMutable(row.status, 'reconcile')
    assertAllocationsValid(
      row.amount,
      allocations.map((a) => a.amount)
    )
    row.allocations = allocations
    row.audit.push({ action: 'deposit.reconcile', entity_id: id })
    return row
  }

  verify(id: string, requireFull: boolean): DepositRecord {
    const row = this.must(id)
    const { unreconciled } = this.totals(row)
    canVerify({
      status: row.status,
      requireFullReconciliation: requireFull,
      unreconciled,
    })
    row.status = 'verified'
    row.audit.push({ action: 'deposit.verify', entity_id: id })
    return row
  }

  totals(row: DepositRecord) {
    return reconciledTotals(
      row.amount,
      row.allocations.map((a) => a.amount)
    )
  }

  private must(id: string): DepositRecord {
    const row = this.rows.find((r) => r.id === id)
    if (!row) throw new Error('Deposit not found.')
    return row
  }
}
