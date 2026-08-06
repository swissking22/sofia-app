import { OutstandingService } from '../../main/services/finance'
import { buildInvoice, resetIds } from '../fixtures/builders'
import { createInMemoryFinanceMocks } from '../mocks/repositories'
import {
  agingBucket,
  daysPastDue,
} from '../../main/domain/finance'

describe('OutstandingService', () => {
  beforeEach(() => resetIds())

  it('computes correct outstanding balance per student', () => {
    const mocks = createInMemoryFinanceMocks({
      invoices: [
        buildInvoice({
          id: 'i1',
          student_id: 's1',
          balance: 40_000,
          net_payable: 100_000,
          amount_paid: 60_000,
          due_date: '2026-08-10',
        }),
        buildInvoice({
          id: 'i2',
          student_id: 's1',
          balance: 10_000,
          net_payable: 10_000,
          amount_paid: 0,
          due_date: '2026-08-20',
        }),
        buildInvoice({
          id: 'i3',
          student_id: 's2',
          balance: 5_000,
          net_payable: 5_000,
          amount_paid: 0,
          due_date: '2026-07-01',
        }),
      ],
    })
    const service = new OutstandingService(mocks.invoiceRepo)
    const rows = service.forSchool('school_1', '2026-08-06')

    const s1 = rows.find((r) => r.student_id === 's1')
    const s2 = rows.find((r) => r.student_id === 's2')
    expect(s1?.outstanding).toBe(50_000)
    expect(s2?.outstanding).toBe(5_000)
  })

  it('aggregates outstanding by class', () => {
    const service = new OutstandingService(
      createInMemoryFinanceMocks().invoiceRepo
    )
    const aggregated = service.aggregateByClass([
      {
        class_id: 'c1',
        outstanding: 20_000,
        aging_current: 10_000,
        aging_30: 10_000,
        aging_60: 0,
      },
      {
        class_id: 'c1',
        outstanding: 5_000,
        aging_current: 0,
        aging_30: 0,
        aging_60: 5_000,
      },
      {
        class_id: 'c2',
        outstanding: 8_000,
        aging_current: 8_000,
        aging_30: 0,
        aging_60: 0,
      },
    ])

    const c1 = aggregated.find((r) => r.class_id === 'c1')
    expect(c1?.students).toBe(2)
    expect(c1?.outstanding).toBe(25_000)
    expect(c1?.aging_60).toBe(5_000)
  })

  it('places balances into current / 30+ / 60+ aging buckets', () => {
    expect(daysPastDue('2026-08-06', '2026-08-06')).toBe(0)
    expect(agingBucket('2026-08-10', '2026-08-06')).toBe('current')
    expect(agingBucket('2026-07-20', '2026-08-06')).toBe('aging_30') // 17 days
    expect(agingBucket('2026-07-07', '2026-08-06')).toBe('aging_30') // 30 days
    expect(agingBucket('2026-07-06', '2026-08-06')).toBe('aging_60') // 31 days
    expect(agingBucket('2026-05-01', '2026-08-06')).toBe('aging_60')

    const mocks = createInMemoryFinanceMocks({
      invoices: [
        buildInvoice({
          id: 'cur',
          student_id: 's1',
          balance: 1_000,
          due_date: '2026-08-10',
        }),
        buildInvoice({
          id: 'd30',
          student_id: 's1',
          balance: 2_000,
          due_date: '2026-07-20',
        }),
        buildInvoice({
          id: 'd60',
          student_id: 's1',
          balance: 3_000,
          due_date: '2026-05-01',
        }),
      ],
    })
    const service = new OutstandingService(mocks.invoiceRepo)
    const [row] = service.forSchool('school_1', '2026-08-06')
    expect(row.aging_current).toBe(1_000)
    expect(row.aging_30).toBe(2_000)
    expect(row.aging_60).toBe(3_000)
  })
})
