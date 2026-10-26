# Đóng góp

Cảm ơn bạn đã muốn đóng góp. Đây là client Zalo không chính thức, gồm:

- `src/`, `src-tauri/` — client (React + Tauri), ở gốc repo
- `server/` — server (Bun + Hono, dùng [zca-js](https://github.com/RFS-ADRENO/zca-js))

## Cần cài

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs) và Tauri CLI: `cargo install tauri-cli`
- Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev libxdo-dev libssl-dev libasound2-dev libclang-dev`
- CMake và trình biên dịch C/C++ (Windows: MSVC) để build libopus, OpenH264. NASM nên có: OpenH264 nhanh hơn khoảng 3 lần
- Cuộc gọi, `ZCALL_MEDIA=app` (mặc định trên Windows): mic, loa, camera do app lo, không cần cài thêm. Windows phải bật "Cho phép ứng dụng desktop dùng micro/camera"
- Cuộc gọi, `ZCALL_MEDIA=python` (mặc định trên Linux, chỉ Linux): `python3`, PipeWire hoặc PulseAudio (`pactl`, `parec`, `pacat`), `libopus`, `ffmpeg`

## Chạy dev

```sh
# server — cổng 3000, token "dev"
cd server
bun install
bun run dev

# client — terminal khác, ở gốc repo
bun install
cargo tauri dev
```

Client đọc `VITE_API_URL` và `VITE_API_TOKEN` từ `.env.development`, đã khớp với server dev.

## Trước khi mở PR

```sh
bun run build                     # typecheck + build client
cd server && bun x tsc --noEmit   # typecheck server
cd server && bun test             # test server
```

- Tạo nhánh từ `main`, mỗi PR một thay đổi.
- Commit theo [Conventional Commits](https://www.conventionalcommits.org/vi/): `feat:`, `fix:`, `refactor:`, `docs:`...
- Viết code giống code xung quanh. Chỉ comment khi thật sự cần.
- Không thêm dependency nếu vài dòng code làm được.
- PR thay đổi UI thì kèm ảnh chụp.

## Bảo mật

- Không commit `server/data/` (đã có trong `.gitignore`) — chứa phiên đăng nhập Zalo.
- Không dán cookie, IMEI, token vào issue/PR.
- Lỗ hổng bảo mật: báo riêng cho maintainer, đừng mở issue công khai.

## Giấy phép

Khi gửi đóng góp, bạn đồng ý để đóng góp đó được cấp phép theo [LICENSE.md](LICENSE.md).
