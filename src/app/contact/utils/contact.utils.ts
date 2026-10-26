// Giống fold() bên server: gõ "dung" ra "Dũng", "don" ra "Đơn"
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
