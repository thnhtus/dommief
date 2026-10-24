export function rehypeText() {
  return (tree: any, file: any) => {
    file.data = file.data || {};
    const toc: any[] = file.data.toc || [];
    const texts: any[] = [];
    const paraIdOf = new WeakMap<any, number>();
    let nextParaId = 0;
    let tocCursor = -1;
    let currentTocIndex: number | undefined;

    const isContainer = (node: any) => {
      if (!node || node.type !== 'element') return false;
      const tag = node.tagName;
      if (tag === 'p' || tag === 'ul' || tag === 'ol' || tag === 'root') return true;
      return typeof tag === 'string' && /^[A-Z]/.test(tag);
    };

    const containerOf = (ancestors: any[]) => {
      for (let i = ancestors.length - 1; i >= 0; i--) {
        if (isContainer(ancestors[i])) return ancestors[i];
      }
      return tree;
    };

    const walk = (node: any, ancestors: any[]) => {
      if (node && node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
        tocCursor += 1;
        if (tocCursor < toc.length) currentTocIndex = tocCursor;
        for (const c of node.children || []) walk(c, [...ancestors, node]);
        return;
      }
      if (node && node.type === 'text') {
        const parent = ancestors[ancestors.length - 1];
        if (parent && /^h[1-6]$/.test(parent.tagName)) return;
        const v = node.value || '';
        if (!v.trim()) return;
        const container = containerOf(ancestors);
        if (!paraIdOf.has(container)) paraIdOf.set(container, nextParaId++);
        const paraId = paraIdOf.get(container)!;
        const frag: any = { type: 'content', value: v, paraId };
        if (currentTocIndex !== undefined) frag.tocIndex = currentTocIndex;
        texts.push(frag);
        return;
      }
      if (node && Array.isArray(node.children)) {
        for (const c of node.children) walk(c, [...ancestors, node]);
      }
    };

    walk(tree, []);
    file.data.texts = texts;
  };
}
