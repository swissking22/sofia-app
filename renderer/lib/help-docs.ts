/** In-app product documentation for Help → Documentation. */

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "bullets"; items: string[] }
  | { type: "tip"; text: string }
  | { type: "link"; href: string; label: string }

export type HelpArticle = {
  id: string
  title: string
  category: string
  summary: string
  keywords: string[]
  blocks: HelpBlock[]
}

export const HELP_CATEGORIES = [
  "Getting started",
  "School",
  "Students",
  "Academic",
  "Finance",
  "Staff",
  "Communication",
  "Reports",
  "Documents",
  "System",
  "Backup & Sync",
] as const

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "getting-started",
    title: "Getting started with Sofia",
    category: "Getting started",
    summary: "First launch, setup wizard, and day-to-day navigation.",
    keywords: ["setup", "login", "register", "join", "sidebar"],
    blocks: [
      {
        type: "p",
        text: "Sofia is an offline-first school management desktop app. Your school data lives on this computer and can sync to other desks when online.",
      },
      {
        type: "steps",
        items: [
          "On a new install, create an account (first computer) or join an existing school with the school short code.",
          "Complete the Setup wizard on the primary desk so years, classes, grading, and staff exist.",
          "Use the sidebar for modules you are allowed to open. School owners see everything; other roles follow permissions.",
          "Use header search or Ctrl/Cmd+K to jump to pages and records.",
        ],
      },
      {
        type: "tip",
        text: "Finish Academic Structure, Grading System, and Student ID format before heavy student or results work.",
      },
    ],
  },
  {
    id: "join-school",
    title: "Join an existing school (second desk)",
    category: "Getting started",
    summary: "Add another office computer to the same school tenant.",
    keywords: ["join", "desk", "short code", "secondary"],
    blocks: [
      {
        type: "steps",
        items: [
          "On the primary desk, create the school admin (and run Sync Now so school data is in the cloud).",
          "On the new computer, choose Join existing school and enter the school short code.",
          "Sign in online with your school email and password (same account as the main computer).",
          "After that first sign-in, this computer can use offline login.",
        ],
      },
      {
        type: "tip",
        text: "A new computer needs internet for the first sign-in. Passwords are checked with Supabase Auth and are never copied between desks through sync.",
      },
    ],
  },
  {
    id: "permissions",
    title: "Roles and permissions",
    category: "System",
    summary: "Who can see which modules and perform which actions.",
    keywords: ["rbac", "roles", "permissions", "access"],
    blocks: [
      {
        type: "p",
        text: "Sofia uses named permissions (for example students.read or finance.record_payment). The sidebar only shows modules your assigned role grants; IPC handlers also enforce those permissions — including for custom roles.",
      },
      {
        type: "bullets",
        items: [
          "School owner (founding admin with no assigned role) has full access.",
          "System roles such as Principal, Vice Principal, Secretary, and Bursar are seeded with sensible defaults.",
          "Custom roles are managed under Administration → Roles and Permissions; users only see modules those permissions allow.",
        ],
      },
      {
        type: "link",
        href: "/administration/permissions",
        label: "Open Permissions matrix",
      },
    ],
  },
  {
    id: "school-management",
    title: "School profile and structure",
    category: "School",
    summary: "Profile, academic year, classes, departments, and subjects.",
    keywords: ["classes", "subjects", "year", "terms", "departments"],
    blocks: [
      {
        type: "p",
        text: "School Management holds identity and academic structure used across students, timetable, fees, and results.",
      },
      {
        type: "bullets",
        items: [
          "School Profile — name, codes, contact, logo/stamp/signature.",
          "Academic Year & Terms — current year and term dates.",
          "Classes, Departments, Subjects — structure for enrolments and teaching.",
        ],
      },
      {
        type: "link",
        href: "/school/profile",
        label: "Open School Profile",
      },
    ],
  },
  {
    id: "students",
    title: "Student records",
    category: "Students",
    summary: "Enrol, search, edit, and manage student lists.",
    keywords: ["students", "enrol", "class list", "admissions"],
    blocks: [
      {
        type: "steps",
        items: [
          "Open Student Management → Students to search and filter the register.",
          "Add a student or import via CSV from Setup when bulk-loading.",
          "Use Class Lists for printable A4 rosters.",
          "Admissions, transfers, promotion, alumni, and ID cards are separate screens under the same module.",
        ],
      },
      {
        type: "link",
        href: "/students",
        label: "Open Students",
      },
    ],
  },
  {
    id: "attendance",
    title: "Attendance and Gate Scanner",
    category: "Academic",
    summary: "Class registers and entrance QR check-in.",
    keywords: ["attendance", "gate", "qr", "present", "absent"],
    blocks: [
      {
        type: "bullets",
        items: [
          "Take attendance by class and date (Present / Absent / Late / Excused).",
          "Gate Scanner records school-day entrance check-ins from student ID QR codes.",
          "Attendance Analytics under Reports summarises rates and at-risk students.",
        ],
      },
      {
        type: "link",
        href: "/academic/attendance",
        label: "Open Attendance",
      },
    ],
  },
  {
    id: "results",
    title: "Assessments and results",
    category: "Academic",
    summary:
      "Open sequences, print sequence sheets, process term results (or all classes), and print report cards.",
    keywords: [
      "ca",
      "sequence",
      "results",
      "report cards",
      "grades",
      "bulk",
      "correction",
    ],
    blocks: [
      {
        type: "steps",
        items: [
          "Continuous Assessment → Create sequence, then Record marks for each class/subject.",
          "Sequence Results → Correction sheet (raw /20) or Final sheet (weighted + average + position); Print → PDF.",
          "Process results for one class or Process all classes for the term, then approve/publish.",
          "Generate term report cards when you are ready (layouts coming next).",
        ],
      },
      {
        type: "tip",
        text: "Sequence average = Σ(mark × coeff) / Σ coeff. Term subject average = mean of sequences, then × coeff for the term average.",
      },
      {
        type: "link",
        href: "/academic/results/sequences",
        label: "Open Sequence Results",
      },
      {
        type: "link",
        href: "/academic/results",
        label: "Open Results Processing",
      },
    ],
  },
  {
    id: "assessment-questions",
    title: "Assessment question papers",
    category: "Academic",
    summary: "Review and approve teacher-submitted exam PDFs.",
    keywords: ["question paper", "approve", "reject", "print", "pdf"],
    blocks: [
      {
        type: "p",
        text: "Teachers submit question paper PDFs from the mobile app. Desktop reviewers open the paper, approve it, or reject it with a note. Printing is only available after approval.",
      },
      {
        type: "steps",
        items: [
          "Open Academic → Assessment Questions (default: Pending Review).",
          "Open a submission and read the PDF.",
          "Approve, or reject with a clear reason the teacher can act on.",
          "Authorized staff print approved papers from the print preview.",
        ],
      },
      {
        type: "link",
        href: "/academic/assessment-questions",
        label: "Open Assessment Questions",
      },
    ],
  },
  {
    id: "timetable",
    title: "Timetable",
    category: "Academic",
    summary: "Build and view the weekly class/teacher grid.",
    keywords: ["timetable", "periods", "clash", "schedule"],
    blocks: [
      {
        type: "p",
        text: "Periods follow the school day schedule (start/close times and breaks). Common level subjects stay aligned across classes; teacher clashes are blocked on save.",
      },
      {
        type: "link",
        href: "/academic/timetable",
        label: "Open Timetable",
      },
    ],
  },
  {
    id: "finance",
    title: "Fees, billing, and payments",
    category: "Finance",
    summary: "Fee structures, invoices, receipts, and outstanding balances.",
    keywords: ["fees", "invoice", "payment", "receipt", "bursar"],
    blocks: [
      {
        type: "steps",
        items: [
          "Define fee structures for the year/term and scopes (class, residence, etc.).",
          "Generate student billing (invoices).",
          "Record payments: choose which fee lines the payment covers so receipts show what was paid for.",
          "Monitor Outstanding Fees and Financial Reports for collection health.",
        ],
      },
      {
        type: "tip",
        text: "When recording a payment, select Tuition, PTA, and other fee lines so the printed receipt lists exactly what the student paid for.",
      },
      {
        type: "tip",
        text: "Dashboard and analytics show compact amounts (K/M). Export and print use full figures with commas.",
      },
      {
        type: "link",
        href: "/finance/billing",
        label: "Open Student Billing",
      },
    ],
  },
  {
    id: "staff",
    title: "Staff and teachers",
    category: "Staff",
    summary: "Directory, teaching assignments, leave, and attendance.",
    keywords: ["teachers", "staff", "leave", "workload"],
    blocks: [
      {
        type: "bullets",
        items: [
          "Teachers are mobile staff — create them under Staff → Teachers (not as bare Administration users).",
          "Teaching assignments link a teacher to class × subject pairs for timetable and mobile apps.",
          "Leave and teacher attendance are managed under Staff Management.",
        ],
      },
      {
        type: "link",
        href: "/staff/teachers",
        label: "Open Teachers",
      },
    ],
  },
  {
    id: "communication",
    title: "Announcements and messages",
    category: "Communication",
    summary: "School announcements, SMS outbox, and internal notices.",
    keywords: ["sms", "announcement", "messages", "notices"],
    blocks: [
      {
        type: "p",
        text: "Communication covers announcements, SMS/email outbox, parent message threads, and internal staff notices. Fee reminders can queue messages when channels are enabled.",
      },
      {
        type: "link",
        href: "/communication/announcements",
        label: "Open Announcements",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports and analytics",
    category: "Reports",
    summary: "Read-only analytics over live school data.",
    keywords: ["reports", "analytics", "insights", "charts"],
    blocks: [
      {
        type: "bullets",
        items: [
          "Academic Performance — averages, pass rates, rankings.",
          "Student Reports — 360° view for one student.",
          "Financial Reports — collection, aging, expenses, budgets.",
          "Attendance Analytics — rates and at-risk lists.",
          "School Insights — executive overview and generated alerts.",
        ],
      },
      {
        type: "tip",
        text: "Reports never create a second ledger. Export CSV or use Print / PDF from the browser print dialog.",
      },
      {
        type: "link",
        href: "/reports/school-insights",
        label: "Open School Insights",
      },
    ],
  },
  {
    id: "documents",
    title: "Official documents",
    category: "Documents",
    summary: "Admission letters, certificates, transcripts, and templates.",
    keywords: ["certificate", "transcript", "letter", "template"],
    blocks: [
      {
        type: "p",
        text: "Documents generate official letters and certificates from existing Sofia records. Print uses browser Print → Save as PDF with the bilingual letterhead.",
      },
      {
        type: "link",
        href: "/documents/admission-letters",
        label: "Open Admission Letters",
      },
    ],
  },
  {
    id: "backup-sync",
    title: "Backup and cloud sync",
    category: "Backup & Sync",
    summary: "Local backups and multi-desk synchronization.",
    keywords: ["backup", "sync", "restore", "usb", "offline"],
    blocks: [
      {
        type: "steps",
        items: [
          "Open Administration → Backup & Sync.",
          "Backup Now writes a local SQLite copy (default under the Sofia app data folder).",
          "Sync Now pushes and pulls changes when the device is online.",
          "Restore from file only after typing RESTORE — Sofia safety-backs up the live database first.",
        ],
      },
      {
        type: "tip",
        text: "Approvals and other actions show Pending Sync until the cloud confirms. Never ignore Sync Failed items.",
      },
      {
        type: "link",
        href: "/administration/backup-sync",
        label: "Open Backup & Sync",
      },
    ],
  },
  {
    id: "users",
    title: "Desktop users",
    category: "System",
    summary: "Administrative desktop logins (admin, secretary, bursar, board).",
    keywords: ["users", "password", "secretary", "admin", "bursar", "board", "teacher"],
    blocks: [
      {
        type: "p",
        text: "Administration → Users manages desktop logins for administrative roles (admin, secretary, bursar, board). Modules appear based on each account’s permissions. Teachers belong under Staff → Teachers and sign in only on the Sofia Teacher mobile app — desktop login is blocked for the teacher role.",
      },
      {
        type: "link",
        href: "/administration/users",
        label: "Open Users & Roles",
      },
    ],
  },
  {
    id: "support",
    title: "Getting help from Sofia Support",
    category: "Getting started",
    summary: "How to contact support with useful diagnostics.",
    keywords: ["support", "help", "contact", "email"],
    blocks: [
      {
        type: "p",
        text: "Use Help → Contact Sofia Support to email cherubtech7@gmail.com with your school name, app version, and a clear description of the problem.",
      },
      {
        type: "link",
        href: "/help/support",
        label: "Contact Sofia Support",
      },
    ],
  },
]

export function searchHelpArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase()
  if (!q) return HELP_ARTICLES
  const tokens = q.split(/\s+/).filter(Boolean)
  return HELP_ARTICLES.filter((a) => {
    const hay = [
      a.title,
      a.summary,
      a.category,
      ...a.keywords,
      ...a.blocks.flatMap((b) => {
        if (b.type === "p" || b.type === "tip") return [b.text]
        if (b.type === "link") return [b.label]
        if (b.type === "steps" || b.type === "bullets") return b.items
        return []
      }),
    ]
      .join(" ")
      .toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}

export function getHelpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id)
}
