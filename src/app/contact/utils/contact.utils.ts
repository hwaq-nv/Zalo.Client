// Giống removeDiacritics() bên server: gõ "dung" ra "Dũng", "don" ra "Đơn"
export const removeDiacritics = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
