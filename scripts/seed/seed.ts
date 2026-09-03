/**
 * Sofia School ERP — fake seed data
 *
 * Usage:
 *   npm run seed              # writes data/sofia.seed.db
 *   npm run seed -- --dev     # seeds Electron development sofia.db
 *   npm run seed -- --dev --reset
 *   npm run seed -- --dev --light-world-only   # add LWM to an existing DB
 *
 * Demo login (per school):
 *   admin@greenfield.demo / Sofia@Demo1
 *   admin@sunrise.demo    / Sofia@Demo1
 *   admin@lightworld.demo / Sofia@Demo1
 */

import { faker } from '@faker-js/faker'
import { createContext } from './context'
import { openSeedDatabase, printCounts, resolveDefaultDbPath } from './db'
import { seedAcademics } from './seedAcademics'
import { seedAttendance } from './seedAttendance'
import { seedFinance } from './seedFinance'
import { seedSchools } from './seedSchools'
import { seedStaff } from './seedStaff'
import { seedStudents } from './seedStudents'
import { seedLightWorld } from './seedLightWorld'

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const has = (flag: string) => args.includes(flag)
  const useDev = has('--dev')
  return {
    reset: has('--reset'),
    lightWorldOnly: has('--light-world-only'),
    dbPath: get('--db') || resolveDefaultDbPath(useDev),
    useDev,
  }
}

function main(): void {
  faker.seed(123)

  const { dbPath, reset, useDev, lightWorldOnly } = parseArgs(process.argv)
  console.log(`[sofia:seed] Database: ${dbPath}`)
  console.log(`[sofia:seed] reset=${reset} faker.seed(123)`)

  const db = openSeedDatabase({ dbPath, reset })
  const ctx = createContext(db)

  const started = Date.now()
  try {
    if (lightWorldOnly) {
      console.log('\nSeeding Light World Mission College only…')
      seedLightWorld(ctx)
      seedAttendance(ctx)
      printCounts(db)
      console.log(`\n[sofia:seed] Done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
      console.log('\nDemo login:')
      console.log('  admin@lightworld.demo  /  Sofia@Demo1')
      if (useDev) {
        console.log('\nTip: restart the Electron app to pick up the new school.')
      }
      return
    }

    console.log('\nSeeding…')
    console.log('1) Schools / admin users')
    seedSchools(ctx)

    console.log('2) Academics (years, terms, departments, classes)')
    seedAcademics(ctx)

    console.log('3) Staff & subjects')
    seedStaff(ctx)

    console.log('4) Students')
    seedStudents(ctx)

    console.log('5) Finance (structures, invoices, payments, receipts, expenses)')
    seedFinance(ctx)

    console.log('5b) Light World Mission College (Simbock)')
    seedLightWorld(ctx)

    console.log('6) Attendance (students + staff, last ~30 school days)')
    seedAttendance(ctx)

    printCounts(db)

    console.log(`\n[sofia:seed] Done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
    console.log('\nDemo logins:')
    for (const email of ctx.adminEmails) {
      console.log(`  ${email}  /  Sofia@Demo1`)
    }
    if (useDev) {
      console.log(
        '\nTip: restart the Electron app to pick up the seeded development database.'
      )
    } else {
      console.log(
        `\nTip: copy this file over your app DB, or run with --dev --reset to seed the development profile.`
      )
    }
  } finally {
    db.close()
  }
}

main()
