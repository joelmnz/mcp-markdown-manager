## 2024-05-22 - React Markdown Component Wrapping
**Learning:** `react-markdown` v9 passes component functions as `type` when using custom components. To conditionally wrap custom components (like `CodeBlock`) inside another (like `PreBlock`), you must check against the component function itself (`child.type === CodeBlock`).
**Action:** Extract custom markdown components to top-level constants to enable identity checks in wrapper components.
