import { Smile } from "lucide-react"
import { EmojiPicker as Picker } from "frimousse"
import { Button } from "@/shared/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover"
import { Skeleton } from "@/shared/components/ui/skeleton"

// Dữ liệu emoji tải từ CDN emojibase lần đầu rồi frimousse tự cache.
// Bảng giữ mở để chèn liền nhiều cái; đóng thì gọi onClose (ô nhập lấy lại focus)
export const EmojiPicker = ({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="icon" title="Biểu tượng cảm xúc">
        <Smile />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      side="top"
      align="start"
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="w-auto p-0"
    >
      <Picker.Root locale="vi" columns={9} onEmojiSelect={(e) => onPick(e.emoji)} className="isolate flex h-80 flex-col">
        <Picker.Search
          placeholder="Tìm emoji: cười, tim, khóc..."
          className="m-2 h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Picker.Viewport className="relative flex-1 outline-hidden">
          <Picker.Loading className="grid grid-cols-9 gap-1 px-2">
            {Array.from({ length: 36 }, (_, i) => (
              <Skeleton key={i} className="size-7 rounded-md" />
            ))}
          </Picker.Loading>
          <Picker.Empty className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Không tìm thấy emoji nào</Picker.Empty>
          <Picker.List
            className="pb-1 select-none"
            components={{
              CategoryHeader: ({ category, ...props }) => (
                <div {...props} className="bg-popover px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                  {category.label}
                </div>
              ),
              Row: ({ children, ...props }) => (
                <div {...props} className="scroll-my-1 px-1.5">
                  {children}
                </div>
              ),
              Emoji: ({ emoji, ...props }) => (
                <button {...props} className="flex size-8 items-center justify-center rounded-md text-xl transition-transform duration-150 data-active:scale-125 data-active:bg-accent">
                  {emoji.emoji}
                </button>
              ),
            }}
          />
        </Picker.Viewport>
        <footer className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
          <Picker.ActiveEmoji>
            {({ emoji }) => (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="text-lg">{emoji?.emoji}</span>
                <span className="truncate">{emoji?.label ?? "Chọn emoji"}</span>
              </span>
            )}
          </Picker.ActiveEmoji>
          <Picker.SkinToneSelector className="size-7 shrink-0 rounded-md text-base hover:bg-accent" title="Đổi màu da" />
        </footer>
      </Picker.Root>
    </PopoverContent>
  </Popover>
)
