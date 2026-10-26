---
title: Get started
---

# Get started

Back to [home](../index.md). Unique-marker-xyz.

![logo](./logo.svg)

```tsx
const x = <b>plain code, not a demo</b>;
```

```tsx demo
import { useState } from 'react';
export default function Demo() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount((c) => c + 1)} data-testid="demo-counter">{count}</button>;
}
```

:::info{title="Ghi chú"}
Đây là container `info`, dữ liệu lúc 10:30 vẫn giữ nguyên.
:::

```ts {2}
const a = 1;
const b = 2; // dòng này được highlight
```
