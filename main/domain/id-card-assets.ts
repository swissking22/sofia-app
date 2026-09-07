/**
 * Premium generic institutional vector assets for ID cards.
 * Self-contained SVG data URIs — 100% offline, zero external requests, resolution-independent.
 */

/**
 * Generic academic heraldic crest:
 * - Traditional heraldic shield with dual-tone navy (#0A1E3F) and regal gold (#C5A059)
 * - Academic Star of Excellence / Torch at crest
 * - Open Book of Knowledge in center
 * - Framing laurel branches
 * - Bottom institutional scroll / ribbon
 * Completely generic and free of copyrighted branding.
 */
export const DEFAULT_ACADEMIC_CREST =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E2A5A"/>
      <stop offset="100%" stop-color="#071731"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E5C77A"/>
      <stop offset="50%" stop-color="#C5A059"/>
      <stop offset="100%" stop-color="#9C7A32"/>
    </linearGradient>
  </defs>
  <!-- Shield Outer Shadow / Contour -->
  <path d="M60 8 C88 8 100 20 100 48 C100 84 60 106 60 106 C60 106 20 84 20 48 C20 20 32 8 60 8 Z" fill="url(#shieldGrad)" stroke="url(#goldGrad)" stroke-width="2.5" />
  <!-- Shield Inner Fillet -->
  <path d="M60 14 C84 14 93 24 93 48 C93 79 60 99 60 99 C60 99 27 79 27 48 C27 24 36 14 60 14 Z" fill="none" stroke="#E5C77A" stroke-width="0.8" opacity="0.85" />
  <!-- Crest Star of Excellence -->
  <polygon points="60,20 62.6,26.5 69.5,26.5 64,30.5 66.2,37 60,33 53.8,37 56,30.5 50.5,26.5 57.4,26.5" fill="url(#goldGrad)" />
  <!-- Open Book of Knowledge -->
  <path d="M60 52 C52 48 40 48 34 51 L34 72 C40 69 52 69 60 73 C68 69 80 69 86 72 L86 51 C80 48 68 48 60 52 Z" fill="#FFFFFF" stroke="url(#goldGrad)" stroke-width="1.2" />
  <line x1="60" y1="52" x2="60" y2="73" stroke="url(#goldGrad)" stroke-width="1.5" />
  <!-- Book text representation lines -->
  <line x1="38" y1="56" x2="55" y2="54" stroke="#0E2A5A" stroke-width="0.8" opacity="0.65" />
  <line x1="38" y1="60" x2="55" y2="58" stroke="#0E2A5A" stroke-width="0.8" opacity="0.65" />
  <line x1="38" y1="64" x2="53" y2="62" stroke="#0E2A5A" stroke-width="0.8" opacity="0.65" />
  <line x1="65" y1="54" x2="82" y2="56" stroke="#0E2A5A" stroke-width="0.8" opacity="0.65" />
  <line x1="65" y1="58" x2="82" y2="60" stroke="#0E2A5A" stroke-width="0.8" opacity="0.65" />
  <line x1="67" y1="62" x2="82" y2="64" stroke="#0E2A5A" stroke-width="0.8" opacity="0.65" />
  <!-- Heraldic Laurel Leaves Left -->
  <path d="M21 48 C16 41 15 31 19 24 C22 30 25 36 23 43 Z" fill="url(#goldGrad)" />
  <path d="M18 60 C14 54 13 46 17 40 C20 46 22 52 19 56 Z" fill="url(#goldGrad)" />
  <path d="M23 72 C19 66 19 58 24 53 C26 59 27 65 23 69 Z" fill="url(#goldGrad)" />
  <!-- Heraldic Laurel Leaves Right -->
  <path d="M99 48 C104 41 105 31 101 24 C98 30 95 36 97 43 Z" fill="url(#goldGrad)" />
  <path d="M102 60 C106 54 107 46 103 40 C100 46 98 52 101 56 Z" fill="url(#goldGrad)" />
  <path d="M97 72 C101 66 101 58 96 53 C94 59 93 65 97 69 Z" fill="url(#goldGrad)" />
  <!-- Bottom Ribbon / Banner -->
  <path d="M28 84 Q60 93 92 84 L95 91 Q60 100 25 91 Z" fill="url(#goldGrad)" />
</svg>`
  )

/**
 * Realistic secondary school student portrait (Olivia Wilson):
 * - Clean neutral studio background gradient
 * - Student in official dark institutional blazer with white collar and striped tie
 * - Crisp vector shapes for offline rendering at any scale
 */
export const DEFAULT_SAMPLE_STUDENT_PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" width="160" height="200">
  <defs>
    <linearGradient id="bgStudio" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E9ECEF"/>
      <stop offset="50%" stop-color="#DEE2E6"/>
      <stop offset="100%" stop-color="#CED4DA"/>
    </linearGradient>
    <linearGradient id="skinBase" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ECC6A4"/>
      <stop offset="100%" stop-color="#DDA982"/>
    </linearGradient>
    <linearGradient id="hairBase" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3A261D"/>
      <stop offset="100%" stop-color="#1F140F"/>
    </linearGradient>
    <linearGradient id="blazerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E2342"/>
      <stop offset="100%" stop-color="#071324"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="160" height="200" fill="url(#bgStudio)"/>
  <!-- Hair back -->
  <ellipse cx="80" cy="88" rx="37" ry="46" fill="url(#hairBase)"/>
  <!-- Neck -->
  <path d="M68 116 L68 145 L92 145 L92 116 Z" fill="#CCA079"/>
  <path d="M72 120 Q80 126 88 120 L88 144 L72 144 Z" fill="#D7AE87"/>
  <!-- Face -->
  <path d="M52 80 C52 114 63 128 80 128 C97 128 108 114 108 80 C108 55 96 48 80 48 C64 48 52 55 52 80 Z" fill="url(#skinBase)"/>
  <!-- Hair front style -->
  <path d="M48 76 C50 48 64 39 80 39 C98 39 112 48 112 76 C112 84 107 80 105 70 C101 52 94 46 80 46 C66 46 58 54 55 70 C53 80 48 84 48 76 Z" fill="url(#hairBase)"/>
  <path d="M47 75 C45 94 47 114 51 122 C52 114 53 100 55 86 Z" fill="url(#hairBase)"/>
  <path d="M113 75 C115 94 113 114 109 122 C108 114 107 100 105 86 Z" fill="url(#hairBase)"/>
  <!-- Eyebrows -->
  <path d="M62 78 Q67 75 73 78" stroke="#251610" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M87 78 Q93 75 98 78" stroke="#251610" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <!-- Eyes -->
  <ellipse cx="67" cy="85" rx="3.6" ry="2.2" fill="#251610"/>
  <ellipse cx="93" cy="85" rx="3.6" ry="2.2" fill="#251610"/>
  <circle cx="68" cy="84.2" r="1" fill="#FFFFFF" opacity="0.9"/>
  <circle cx="94" cy="84.2" r="1" fill="#FFFFFF" opacity="0.9"/>
  <!-- Nose -->
  <path d="M80 84 L78 98 L83 98" stroke="#B88A5E" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <!-- Smile -->
  <path d="M72 108 Q80 114 88 108" stroke="#9C523B" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- Shoulders & Blazer -->
  <path d="M16 200 L38 142 L68 148 L80 162 L92 148 L122 142 L144 200 Z" fill="url(#blazerGrad)"/>
  <!-- White Shirt Collar -->
  <polygon points="68,145 80,178 58,148" fill="#FFFFFF"/>
  <polygon points="92,145 80,178 102,148" fill="#FFFFFF"/>
  <!-- Necktie Regal Gold & Navy -->
  <polygon points="76,158 84,158 87,200 73,200" fill="#C5A059"/>
  <polygon points="75,154 85,154 83,165 77,165" fill="#A88235"/>
  <line x1="75" y1="172" x2="85" y2="176" stroke="#0E2342" stroke-width="2.2"/>
  <line x1="74" y1="184" x2="86" y2="188" stroke="#0E2342" stroke-width="2.2"/>
  <!-- Blazer Lapels -->
  <path d="M38 142 L62 188 L54 196 L24 200 Z" fill="#09182E"/>
  <path d="M122 142 L98 188 L106 196 L136 200 Z" fill="#09182E"/>
</svg>`
  )

/**
 * Authentic authorized signature:
 * - Fluid principal script ("Dr. E. Mbarga")
 * - Crisp vector path for print accuracy
 */
export const DEFAULT_SAMPLE_SIGNATURE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 55" width="160" height="55">
  <path d="M16 34 C26 18 38 12 40 25 C42 38 31 43 27 39 C23 35 34 22 52 21 C66 20 60 38 72 29 C82 22 89 17 96 22 C103 27 107 38 120 26 C130 15 137 20 144 19 M34 32 L138 32" fill="none" stroke="#0A1E3F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
  )
