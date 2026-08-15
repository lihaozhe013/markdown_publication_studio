# Markdown Publication Studio

This is the first regression fixture for the publication pipeline. It contains a
local image, a table, and highlighted code.

![A small local publication mark](./mark.svg)

## A practical example

The source remains plain Markdown while the publication renderer owns layout,
print CSS, and page configuration.

```typescript
export function publish(title: string): string {
  return `Publishing: ${title}`;
}
```

| Stage        | Backend           |
| ------------ | ----------------- |
| Markdown     | markdown-it       |
| Highlighting | Shiki             |
| PDF          | Electron Chromium |
