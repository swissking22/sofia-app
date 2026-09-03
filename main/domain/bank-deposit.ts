import { round2 } from './finance'

export type BankDepositStatus =
  | 'pending_verification'
  | 'verified'
  | 'posted'

export function validateDepositAmount(amount: number): void {
  if (!(amount > 0)) throw new Error('Deposit amount must be greater than 0.')
}

export function validateDepositDates(
  collectionDate: string | null,
  depositDate: string
): void {
  if (!depositDate) throw new Error('Deposit date is required.')
  if (collectionDate && depositDate < collectionDate) {
    throw new Error('Deposit date cannot precede the collection date.')
  }
}

export function reconciledTotals(
  depositAmount: number,
  allocationAmounts: number[]
): { reconciled: number; unreconciled: number } {
  const reconciled = round2(allocationAmounts.reduce((s, a) => s + a, 0))
  return {
    reconciled,
    unreconciled: round2(depositAmount - reconciled),
  }
}

export function assertAllocationsValid(
  depositAmount: number,
  allocationAmounts: number[]
): void {
  if (allocationAmounts.some((a) => !(a > 0))) {
    throw new Error('Each reconciliation amount must be greater than 0.')
  }
  const { reconciled, unreconciled } = reconciledTotals(
    depositAmount,
    allocationAmounts
  )
  if (unreconciled < -0.0001) {
    throw new Error(
      `Reconciled amount (${reconciled}) cannot exceed the deposit (${depositAmount}).`
    )
  }
}

export function canVerify(input: {
  status: BankDepositStatus
  requireFullReconciliation: boolean
  unreconciled: number
}): void {
  if (input.status !== 'pending_verification') {
    throw new Error('Only pending deposits can be verified.')
  }
  if (input.requireFullReconciliation && input.unreconciled > 0.0001) {
    throw new Error(
      'School rules require the deposit to be fully reconciled before verification.'
    )
  }
}

export function assertMutable(status: BankDepositStatus, action: string): void {
  if (status !== 'pending_verification') {
    throw new Error(`Cannot ${action} a ${status.replace('_', ' ')} deposit.`)
  }
}
