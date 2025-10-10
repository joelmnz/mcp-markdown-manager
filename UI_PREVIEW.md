# Semantic Search UI Changes

## Home Page - Search Interface

### Before (Title Search Only)
```
┌─────────────────────────────────────────────┐
│ Articles                    [+ New Article] │
├─────────────────────────────────────────────┤
│                                             │
│ [Search articles...        ] [Search] [Clear] │
│                                             │
│ • My Article 1                              │
│   Created: 2025-01-15                       │
│                                             │
│ • My Article 2                              │
│   Created: 2025-01-16                       │
└─────────────────────────────────────────────┘
```

### After (With Semantic Search Toggle)
```
┌─────────────────────────────────────────────┐
│ Articles                    [+ New Article] │
├─────────────────────────────────────────────┤
│                                             │
│ ◉ Title Search  ○ Semantic Search           │
│                                             │
│ [Search by meaning...     ] [Search] [Clear]│
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Deep Learning Neural Networks    89.5%  │ │
│ │ # Deep Learning > ## Architecture       │ │
│ │ CNNs are particularly effective for...  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Machine Learning Intro           85.2%  │ │
│ │ # ML Basics > ## Supervised Learning    │ │
│ │ In supervised learning, the algorithm...│ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Search Result Card Details

```
┌─────────────────────────────────────────────────┐
│  Title of Article                    [Score%]   │  ← Article title + similarity %
├─────────────────────────────────────────────────┤
│  # Heading > ## Subheading > ### Section       │  ← Heading path (context)
├─────────────────────────────────────────────────┤
│  This is the matched content snippet from      │  ← Text preview
│  the article that was found to be relevant...  │
└─────────────────────────────────────────────────┘
   ↑ Clickable - navigates to full article
```

## Info Panel - Updated Endpoints

### Before
```
🌐 REST API Endpoints
  GET  /api/articles              List all articles
  GET  /api/articles?q=search     Search articles
  GET  /api/articles/:filename    Read article
  ...
```

### After
```
🌐 REST API Endpoints
  GET  /api/articles              List all articles
  GET  /api/articles?q=search     Search articles by title
  GET  /api/search?query=...&k=5  Semantic search (RAG)    ← NEW
  GET  /api/articles/:filename    Read article
  ...

🔧 Available MCP Tools
  • listArticles - List all articles
  • searchArticles - Search by title (query param)
  • semanticSearch - Semantic search with embeddings      ← NEW
  • readArticle - Read article (filename param)
  ...
```

## Color Scheme

### Search Result Cards
- Background: `var(--bg-secondary)` (themed)
- Border: `var(--border-color)` → `var(--accent-color)` on hover
- Score badge: Accent color background with white text
- Heading path: Tertiary text color, italic
- Snippet: Secondary text color

### Search Toggle
- Active option: Accent color, bold
- Inactive option: Secondary text color
- Radio buttons: Standard styling with accent on selection

## Responsive Design

All new components follow the existing mobile-first design:

```css
/* Mobile (default) */
.search-mode-toggle {
  flex-direction: column;
  gap: 0.5rem;
}

/* Desktop */
@media (min-width: 768px) {
  .search-mode-toggle {
    flex-direction: row;
    gap: 1rem;
  }
}
```

## Interactive States

### Search Result Cards
1. **Default**: Subtle background, bordered
2. **Hover**: Highlighted border, elevated shadow, darker background
3. **Click**: Navigate to full article view

### Search Mode Toggle
1. **Default**: Radio buttons with labels
2. **Hover**: Cursor pointer on labels
3. **Selected**: Accent color, bold text

## Accessibility

- Radio buttons for search mode (keyboard navigable)
- Semantic HTML structure
- Color contrast meets WCAG AA standards
- Clickable cards with hover feedback
- Screen reader friendly labels
