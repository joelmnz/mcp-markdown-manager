## 2025-01-26 - Form Accessibility Pattern
**Learning:** Inputs in `ArticleEdit.tsx` were wrapped in divs with labels but lacked `id` and `htmlFor` association, relying only on visual proximity.
**Action:** Always check form inputs for explicit label association (`htmlFor` + `id`) or implicit nesting. Use `getByLabelText` in tests to enforce this.
