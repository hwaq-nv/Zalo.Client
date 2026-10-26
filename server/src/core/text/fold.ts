// FTS5 bỏ được dấu nhưng không đổi "đ" thành "d", nên gõ "don" phải tự fold mới ra "đơn"
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()

// Mỗi từ thành tiền tố "từ"*, nối bằng khoảng trắng (AND). Chỉ giữ chữ và số nên người gõ không chèn được cú pháp FTS
export const ftsQuery = (q: string) => (fold(q).match(/[\p{L}\p{N}]+/gu) ?? []).map((t) => `"${t}"*`).join(' ')

// 0912 345 678, +84 912…, 84912… → 84912345678; null nếu không phải số điện thoại
export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '')
  const phone = digits.startsWith('0') ? `84${digits.slice(1)}` : digits
  return phone.length >= 10 && phone.length <= 15 ? phone : null
}

// Tin chữ tìm theo text; ảnh, file, link tìm theo tiêu đề và mô tả
export function searchBody(text: string | null, content: unknown) {
  if (text) return fold(text)
  if (!content || typeof content !== 'object') return ''
  const { title, description } = content as Record<string, unknown>
  return fold([title, description].filter((s) => typeof s === 'string' && s).join(' '))
}
