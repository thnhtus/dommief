# Library preset

`preset: 'library'` biến Dommief thành site cho một component library: mỗi component là một thư mục, mỗi trang là một route, demo đọc từ file thật, API table tự sinh từ entry.

Đây là preset **tuỳ chọn** — core vẫn nhẹ; toàn bộ tính năng nằm trong config + plugin có sẵn, `preset: 'docs'` không đổi hành vi.

## Cấu trúc thư mục

```text
src/
  button/
    Button.tsx            # entry (index.tsx | index.ts | <folder>.tsx | <folder>.ts)
    index.md              # trang chính → route /button
    demo/
      basic.tsx           # demo, import bằng <code src="./demo/basic.tsx" />
      size.tsx
  card/
    Card.tsx
    index.md
  index.ts                # public entry, export Button/Card cho package
docs/
  index.md                # trang chủ thường (nếu muốn)
  guide/index.md          # trang doc thường, không bị auto API
```

`preset: 'library'` tự thêm `src/` vào danh sách thư mục docs. Muốn thêm `docs/` thì khai `docDirs: ['src', 'docs']`.

## Config

```ts
import { defineConfig } from 'dommief';

export default defineConfig({
  title: 'Acme UI',
  preset: 'library',
  docDirs: ['src', 'docs'],
  library: {
    // thư mục demo trong mỗi component (mặc định 'demo')
    demoDir: 'demo',
    // 'auto': tự inject API table cho trang nằm trực tiếp trong thư mục component
    api: 'auto',
    // alias tên package → src/index.ts để demo import như người dùng thật
    importName: 'acme-ui',
  },
});
```

| Option | Default | Áp dụng | Mô tả |
| --- | --- | --- | --- |
| `library.demoDir` | `'demo'` | preset `library` | Tên thư mục demo bên trong component |
| `library.api` | `'off'` | preset `library` | `'auto'` = tự sinh API table từ entry |
| `library.importName` | — | preset `library` | Alias `<importName>` → `src/index.ts` |

Khai `library.*` khi `preset: 'docs'` sẽ bị bỏ qua kèm cảnh báo (không fail build).

## Demo

```md
<code src="./demo/basic.tsx" title="Basic" />
```

- `src` tương đối theo file `.md`; nội dung demo đọc từ file thật → nút **View code** hiện đúng source.
- `title` (tuỳ chọn) render thành heading phía trên demo.
- File demo thiếu → cảnh báo `demo_src_missing`, build vẫn chạy (trang render demo rỗng).

Nhãn nút toolbar (`View code`, `Copy`) đang hardcode trong client runtime — chưa dịch theo locale.

## Auto API

Với `library.api: 'auto'`:

- Trang `.md` nằm **trực tiếp** trong thư mục component và không có `<API>`/`<DomApi>` thủ công → tự chèn bảng props từ entry (`Button.tsx`).
- Trang ngoài thư mục component (ví dụ `guide/index.md`) được bỏ qua **im lặng** — không cảnh báo.
- Docgen lỗi/không đọc được entry → cảnh báo một lần cho mỗi entry, build không fail.
- Entry file được thêm vào watch list khi dev để sửa props là HMR.

## Alias package name

`library.importName: 'acme-ui'` cho phép demo viết:

```tsx
import { Button } from 'acme-ui';
```

Alias chỉ áp dụng cho preset `library` và trỏ về `src/index.ts` của chính site — **không** resolve các package khác trong monorepo.

## Route & sidebar

- `src/button/index.md` → `/button`; `src/card/index.md` → `/card`.
- Thư mục lồng nhau (`src/button/demo/x.md`) không thành component, chỉ là file phụ.
- Sidebar nhóm theo segment đầu tiên của route.

## Giới hạn (đã biết)

- Không tự sinh route khi chỉ có component mà không có `.md` (phải có trang markdown).
- Không hỗ trợ iframe/playground tương tác kiểu dumi.
- Không gom nhiều package `packages/*/src` trong monorepo thành một site.
- Chưa có `DemoCard` và chưa dịch nhãn nút demo.
- i18n runtime cho nội dung demo chưa hỗ trợ (chỉ trang `.md` dịch được).

## Ví dụ đầy đủ

Xem `examples/library/` — site dogfood dùng `preset: 'library'`, `api: 'auto'`, `importName: 'acme-ui'`, 2 locale (suffix mode). E2E: `e2e/library.spec.ts`.
