# Rạp T1

Rạp xem chung các trận đấu của T1 (bản MVP): khán phòng 3D 100 ghế, video YouTube phát đồng bộ cho cả rạp, nhân vật ngồi ghế và làm hành động, trò chuyện, bảng LED.

Công nghệ: React + Vite, three.js cho khán phòng, Cloudflare Workers, một Durable Object cho phòng chiếu.

## Chạy trên máy

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Mở http://localhost:5173. Mở mục "Đăng nhập quản trị" dưới ô nhập tên để vào quyền quản trị, bấm "Mở phòng ngay" cho một phòng, rồi vào rạp và dán link YouTube vào bảng "Điều khiển".

## Phân quyền

- **Người xem:** nhập tên là vào được, không cần mật khẩu. Tên và nhân vật lưu trong cookie đã ký, không có cơ sở dữ liệu người dùng. Chỉ vào được phòng đang mở.
- **Quản trị viên:** đăng nhập Google bằng email có trong `ADMIN_EMAILS`, hoặc nút đăng nhập thử khi `DEV_LOGIN=true`. Được mở, đóng, hẹn giờ phòng, vào phòng đang đóng để chuẩn bị, đổi video và chữ bảng LED. Máy chủ kiểm tra quyền ở mọi yêu cầu.
- **Phòng:** có 3 phòng, sửa `ROOM_IDS` trong `shared/protocol.ts` để đổi số phòng. Phòng hẹn giờ tự mở khi có người xem trang chủ sau thời điểm đó.

Nếu sửa `index.html` hoặc file cấu hình mà trang bị đen, hãy tắt rồi chạy lại `npm run dev`.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run smoke
```

`npm run smoke` cần `npm run dev` đang chạy, và sẽ đổi video, ghi chat và đóng Phòng 03 trên máy. `npm run stale` mất khoảng 3 phút, kiểm tra ghế được trả lại khi kết nối chết.

Để xem rạp khi đông người, chạy `npm run crowd` trong lúc `npm run dev` đang chạy. Lệnh này cho 26 người xem thử vào ghế, thỉnh thoảng trò chuyện và làm hành động. Lệnh này tự mở Phòng 01. Đổi số người bằng biến `COUNT`, đổi phòng bằng biến `ROOM`, bấm Ctrl+C để họ rời rạp.

## Đưa lên mạng

1. Tạo OAuth Client ID loại Web trong Google Cloud, thêm tên miền của bạn vào Authorized JavaScript origins.
2. Điền `GOOGLE_CLIENT_ID` và `ADMIN_EMAILS` (các email quản trị, cách nhau bởi dấu phẩy) trong `wrangler.jsonc`.
3. Chạy `npx wrangler secret put SESSION_SECRET` và nhập một chuỗi ngẫu nhiên dài.
4. Chạy `npm run deploy`.

Không đặt `DEV_LOGIN` trên bản chạy thật: biến này cho phép bất kỳ ai tự nhận quyền quản trị.

## Hình ảnh

`public/brand/` chứa logo và ảnh lấy từ shop-t1.gg và t1.gg, ảnh đội hình ở mục giới thiệu (`t1-banner.webp`), ảnh hồ sơ tuyển thủ trên cờ (`players/`, từ t1.gg/teams/leagueoflegends), và lá cờ cùng nền phong cảnh ở đầu trang (`t1-flag.webp`, `t1-hero-bg.webp`, tách từ một mẫu cờ có dấu LEARS). T1 giữ quyền với các hình này. Hãy xin phép hoặc thay bằng hình của bạn trước khi mở trang cho công chúng.
