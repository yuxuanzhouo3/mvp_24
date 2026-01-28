/**
 * Translations Index
 * 翻译文件索引
 */

import { zh } from './zh'
import { en } from './en'

export const translations = {
  zh,
  en,
} as const

export type Language = keyof typeof translations
export type Translations = typeof translations[Language]

export { zh, en }
