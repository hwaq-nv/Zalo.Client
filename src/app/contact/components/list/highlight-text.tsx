import { removeDiacritics } from "@/app/contact/utils/contact.utils"

export const HighlightText = ({ text, query }: { text: string; query: string }) => {
  const normalized = removeDiacritics(text)
  const index = query ? normalized.indexOf(query) : -1
  if (index < 0 || normalized.length !== text.length) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[3px] bg-foreground/10 text-foreground">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  )
}
