# Rendering diagnostics

This fixture isolates formula fonts, delimiter sizing, and Mermaid SVG layout.

## KaTeX

Inline formula: $E = mc^2$ and
$\left[\begin{smallmatrix}a & b\\c & d\end{smallmatrix}\right]$.

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

$$
\begin{bmatrix}
a & b \\
c & d
\end{bmatrix}
\begin{bmatrix}
e & f \\
g & h
\end{bmatrix}
=
\begin{bmatrix}
ae + bg & af + bh \\
ce + dg & cf + dh
\end{bmatrix}
$$

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

## Flowchart

```mermaid
flowchart TD
  Source[Markdown source] --> Compile[Publication compiler]
  Compile --> Preview[Preview HTML]
  Compile --> Export[PDF export]
```

## Sequence diagram

```mermaid
sequenceDiagram
  participant User
  participant App as Desktop app
  participant Renderer as Mermaid renderer
  User->>App: Open Markdown
  App->>Renderer: Render diagram
  Renderer-->>App: Static SVG
  App-->>User: Preview publication
```

## Gantt chart

```mermaid
gantt
  title Publication delivery
  dateFormat YYYY-MM-DD
  section Rendering
  Compile Markdown :done, compile, 2026-08-01, 2d
  Render Mermaid   :active, diagram, after compile, 3d
  Print PDF        :print, after diagram, 2d
```

## Class diagram

```mermaid
classDiagram
  class PublicationService {
    +buildPreview(path, theme)
    +exportPdf(path, output, theme)
  }
  class MermaidRenderer {
    <<interface>>
    +render(html, theme, sourcePath)
  }
  PublicationService --> MermaidRenderer
```
