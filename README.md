# Rạp T1

Rạp xem chung các trận đấu của T1 (bản MVP): khán phòng 3D 100 ghế, video YouTube phát đồng bộ cho cả rạp, nhân vật ngồi ghế và làm hành động, trò chuyện, bảng LED.

Công nghệ: React + Vite, three.js cho khán phòng, Cloudflare Workers, một Durable Object cho phòng chiếu.

## Chạy trên máy

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Mở http://localhost:5173. Mở mục "Đăng nhập bằng tài khoản" dưới ô nhập tên để vào quyền quản trị, bấm "Mở phòng ngay" cho một phòng, rồi vào rạp và dán link YouTube vào bảng "Điều khiển".

## Tài khoản và phân quyền (Supabase)

Chép `.env.example` thành `.env` rồi điền URL và publishable key của project. Lần đầu cần làm trong Supabase:

1. **SQL Editor:** chạy `supabase/migrations/001_users_and_roles.sql`.
2. **Authentication > Sign In / Providers:** bật **Allow anonymous sign-ins** để khách nhập tên là vào.
3. **Authentication > Users > Add user:** tạo tài khoản email của quản trị viên (chọn Auto Confirm).
4. **Table Editor > profiles:** đổi `role` của tài khoản đó thành `admin`.

- **Người xem:** nhập tên là vào, Supabase tạo tài khoản ẩn danh. Đăng xuất là mất tài khoản ẩn danh đó và nhân vật của nó.
- **Quản trị viên:** có `role = admin` trong bảng `profiles`. Được mở, đóng, hẹn giờ phòng, vào phòng đang đóng, đổi video và chữ bảng LED.
- **Chặn người dùng:** thêm một dòng vào bảng `bans`. `expires_at` để trống là chặn vĩnh viễn.
- Vai trò và lệnh chặn có hiệu lực trong tối đa 2 giờ, là thời hạn cookie của trang.
- **Phòng:** có 3 phòng, sửa `ROOM_IDS` trong `shared/protocol.ts` để đổi số phòng. Trạng thái trong phòng lưu ở Durable Object. Phòng hẹn giờ tự mở khi có người xem trang chủ sau thời điểm đó.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run smoke
```

`npm run test:supabase` kiểm tra phân quyền trên project Supabase thật và tạo 2 tài khoản ẩn danh mỗi lần chạy. `npm run smoke` cần `npm run dev` đang chạy, và sẽ đổi video, ghi chat và đóng Phòng 03 trên máy. `npm run stale` mất khoảng 3 phút, kiểm tra ghế được trả lại khi kết nối chết.

Để xem rạp khi đông người, chạy `npm run crowd` trong lúc `npm run dev` đang chạy. Lệnh này cho 26 người xem thử vào ghế, thỉnh thoảng trò chuyện và làm hành động. Lệnh này tự mở Phòng 01. Đổi số người bằng biến `COUNT`, đổi phòng bằng biến `ROOM`, bấm Ctrl+C để họ rời rạp.

## Đưa lên mạng

1. Nếu dùng đăng nhập Google, tạo OAuth Client ID loại Web trong Google Cloud rồi bật nhà cung cấp Google trong Supabase.
2. Kiểm tra `SUPABASE_URL` và `SUPABASE_PUBLISHABLE_KEY` trong `wrangler.jsonc`, và thêm tên miền của bạn vào Authentication > URL Configuration của Supabase.
3. Chạy `npx wrangler secret put SESSION_SECRET` và nhập một chuỗi ngẫu nhiên dài.
4. Chạy `npm run deploy`.

Không đặt `DEV_LOGIN` trên bản chạy thật: biến này cho phép bất kỳ ai tự nhận quyền quản trị.

## Hình ảnh

`public/brand/` chứa logo và ảnh lấy từ shop-t1.gg và t1.gg, ảnh đội hình ở mục giới thiệu (`t1-banner.webp`), ảnh hồ sơ tuyển thủ trên cờ (`players/`, từ t1.gg/teams/leagueoflegends), và lá cờ cùng nền phong cảnh ở đầu trang (`t1-flag.webp`, `t1-hero-bg.webp`, tách từ một mẫu cờ có dấu LEARS). T1 giữ quyền với các hình này. Hãy xin phép hoặc thay bằng hình của bạn trước khi mở trang cho công chúng.
