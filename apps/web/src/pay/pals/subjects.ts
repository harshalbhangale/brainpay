/**
 * Shared StudyPal grade → subjects catalogue + AU curriculum helpers.
 * ───────────────────────────────────────────────────────────────────────────
 * Australia-first: subjects follow the ACARA F-10 learning areas (with senior
 * VCE/HSC-style choices for Years 11-12). The conversational intake generates
 * the real list from grade + state; this is the tap-chip FALLBACK if voice
 * mishears, and the single source of truth so flows don't drift.
 */

export const GRADES = ['Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']

/** Australian states/territories (ACARA nationally, with state variants). */
export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']

const CURRICULUM_BY_STATE: Record<string, string> = {
  NSW: 'NSW (ACARA)',
  VIC: 'VIC F-10 / VCE (ACARA)',
  QLD: 'QLD (ACARA)',
  WA: 'WA (ACARA)',
  SA: 'SA (ACARA)',
  TAS: 'TAS (ACARA)',
  ACT: 'ACT (ACARA)',
  NT: 'NT (ACARA)',
}

/** State → curriculum label, defaulting to the national ACARA framework. */
export function curriculumForState(state?: string | null): string {
  return (state && CURRICULUM_BY_STATE[state.toUpperCase()]) || 'ACARA'
}

export const SUBJECTS: Record<string, string[]> = {
  'Grade 5': ['English', 'Mathematics', 'Science', 'HASS', 'Health & PE', 'The Arts'],
  'Grade 6': ['English', 'Mathematics', 'Science', 'HASS', 'Health & PE', 'The Arts'],
  'Grade 7': ['English', 'Mathematics', 'Science', 'History', 'Geography', 'Health & PE', 'Digital Technologies'],
  'Grade 8': ['English', 'Mathematics', 'Science', 'History', 'Geography', 'Health & PE', 'Digital Technologies'],
  'Grade 9': ['English', 'Mathematics', 'Science', 'History', 'Geography', 'Economics & Business', 'Digital Technologies'],
  'Grade 10': ['English', 'Mathematics', 'Science', 'History', 'Geography', 'Economics & Business', 'Digital Technologies'],
  'Grade 11': ['English', 'Mathematics Methods', 'Physics', 'Chemistry', 'Biology', 'Modern History', 'Economics'],
  'Grade 12': ['English', 'Mathematics Methods', 'Physics', 'Chemistry', 'Biology', 'Modern History', 'Economics'],
}

/** Subjects for a grade, with a sensible AU fallback for unknown/blank grades. */
export function subjectsForGrade(grade?: string | null): string[] {
  return (grade && SUBJECTS[grade]) || ['English', 'Mathematics', 'Science', 'History', 'Geography']
}

export function subjectEmoji(subject: string): string {
  const map: Record<string, string> = {
    English: '📖',
    Mathematics: '📐', 'Mathematics Methods': '📐', Maths: '📐',
    Science: '🔬', Physics: '⚡', Chemistry: '🧪', Biology: '🧬',
    History: '🏛️', 'Modern History': '🏛️',
    Geography: '🗺️', HASS: '🌏', 'Social Studies': '🌏',
    'Economics & Business': '💹', Economics: '💹', Accountancy: '📊',
    'Health & PE': '🏃', 'Physical Education': '🏃',
    'Digital Technologies': '💻', 'Computer Science': '💻',
    'The Arts': '🎨',
  }
  return map[subject] ?? '📚'
}
