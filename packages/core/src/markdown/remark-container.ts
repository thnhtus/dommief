import { visit } from 'unist-util-visit';

// Đặc tả: docs/spec/MARKDOWN.md §3.4, §5.1, backlog DM-703.
// `:::info … :::` → <div class="dommief-container dommief-container--info"> (+ title, role).
// Không render qua component `Container` riêng: HTML thuần đủ cho 4 loại cố định, SSR/JS-off
// đều đúng, và theme override bằng CSS (`.dommief-container--*`) như mọi phần khác.

export const CONTAINER_TYPES = ['info', 'warning', 'success', 'error'] as const;
type ContainerType = (typeof CONTAINER_TYPES)[number];

/**
 * `remark-directive` bật cả 3 cú pháp (`:text`, `::leaf`, `:::container`). Hai cú pháp đầu
 * nuốt chữ thật trong tài liệu (`10:30`, `ghi chú: xem`). Gỡ `text` và chỉ giữ construct
 * container trong `flow`, CÓ KIỂM TRA cấu trúc (§3.4) thay vì xoá theo chỉ số mảng như dumi.
 */
function restrictToContainerSyntax(extensions: any[]): void {
  // Chữ ký: `{ text: {58: …}, flow: {58: [container, leaf]} }` — khóa 58 = ':'. remark-gfm cũng có
  // extension `{text, flow}` nên phải lọc theo tokenizer `…Directive…`, không chỉ theo shape.
  const isDirective = (e: any) => {
    const f = e?.flow?.[58];
    return !!e?.text?.[58] && (Array.isArray(f) ? f : [f]).some((c: any) => /Directive/.test(c?.tokenize?.name ?? ''));
  };
  const hit = extensions.filter(isDirective);
  if (hit.length !== 1) throw new Error('remark-directive đổi cấu trúc nội bộ (không thấy đúng 1 extension directive {text, flow}); cập nhật remarkContainer');
  const ext = hit[0];
  const flow = ext.flow[58];
  const constructs = Array.isArray(flow) ? flow : [flow];
  const containers = constructs.filter((c: any) => /Container/.test(c?.tokenize?.name ?? ''));
  if (containers.length !== 1) throw new Error('remark-directive đổi cấu trúc nội bộ (không thấy đúng 1 container construct); cập nhật remarkContainer');
  delete ext.text;
  ext.flow = { 58: containers };
}

export function remarkContainer(this: any) {
  const data = this.data();
  restrictToContainerSyntax(data.micromarkExtensions ?? []);
  return (tree: any, file: any) => {
    visit(tree, 'containerDirective', (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== 'number') return;
      const name = String(node.name);
      if (!(CONTAINER_TYPES as readonly string[]).includes(name)) {
        const warnings: string[] = ((file.data ??= {}).warnings ??= []);
        const pos = node.position?.start;
        warnings.push(`${file.path ?? ''}${pos ? `:${pos.line}:${pos.column}` : ''} container ":::${name}" không được hỗ trợ (chỉ ${CONTAINER_TYPES.join('/')}); render thành <div> thường`);
        node.data = { hName: 'div', hProperties: {} };
        return;
      }
      const type = name as ContainerType;
      // `:::info[Tiêu đề]` (label) hoặc `:::info{title="…"}` (attribute) đều thành title.
      const labelIdx = node.children.findIndex((c: any) => c.data?.directiveLabel);
      const labelNode = labelIdx >= 0 ? node.children.splice(labelIdx, 1)[0] : null;
      const title = node.attributes?.title ?? (labelNode ? textOf(labelNode) : undefined);
      const children = [...node.children];
      if (title) {
        children.unshift({ type: 'paragraph', data: { hName: 'p', hProperties: { className: ['dommief-container__title'] } }, children: [{ type: 'text', value: title }] });
      }
      node.children = children;
      node.data = {
        hName: 'div',
        hProperties: {
          className: ['dommief-container', `dommief-container--${type}`],
          // warning/error là thông tin cần chú ý ngay → role="alert" không đúng (nó ngắt screen reader);
          // dùng role="note" cho mọi loại, kiểu nằm ở class.
          role: 'note',
          ...(title ? {} : { 'aria-label': type }),
        },
      };
    });
  };
}

function textOf(node: any): string {
  let out = '';
  visit(node, 'text', (t: any) => { out += t.value; });
  return out.trim();
}
