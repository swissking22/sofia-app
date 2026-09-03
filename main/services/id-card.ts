import { requireStudentCode, validityWindow } from '../domain/id-card'

export type CardRec = {
  id: string
  student_id: string
  student_code: string
  academic_year_id: string
  status: 'active' | 'replaced' | 'revoked'
  replaced_card_id?: string | null
}

export class IdCardService {
  constructor(private cards: CardRec[]) {}

  generate(input: {
    student_id: string
    student_code: string | null
    academic_year_id: string
    generated_on?: string
    validity_months?: number
    kind?: 'new' | 'replacement' | 'renewal'
  }): CardRec {
    const student_code = requireStudentCode(input.student_code)
    const kind = input.kind || 'new'
    const active = this.cards.find(
      (c) =>
        c.student_id === input.student_id &&
        c.academic_year_id === input.academic_year_id &&
        c.status === 'active'
    )
    if (active && kind === 'new') {
      throw new Error('An ID card already exists for this student and year.')
    }
    if (active && kind !== 'new') {
      active.status = 'replaced'
    }
    void validityWindow(input.generated_on || '2026-09-01', input.validity_months || 12)
    const card: CardRec = {
      id: `card_${this.cards.length + 1}`,
      student_id: input.student_id,
      student_code,
      academic_year_id: input.academic_year_id,
      status: 'active',
      replaced_card_id: active?.id ?? null,
    }
    this.cards.push(card)
    return card
  }

  replace(input: {
    student_id: string
    student_code: string | null
    academic_year_id: string
  }): CardRec {
    return this.generate({ ...input, kind: 'replacement' })
  }

  revoke(id: string): void {
    const card = this.cards.find((c) => c.id === id)
    if (!card) throw new Error('Card not found.')
    card.status = 'revoked'
  }

  bulkGenerate(
    students: Array<{ id: string; student_code: string | null }>,
    academic_year_id: string
  ): { created: number; skipped: number } {
    let created = 0
    let skipped = 0
    for (const s of students) {
      try {
        this.generate({
          student_id: s.id,
          student_code: s.student_code,
          academic_year_id,
        })
        created += 1
      } catch {
        skipped += 1
      }
    }
    return { created, skipped }
  }
}
