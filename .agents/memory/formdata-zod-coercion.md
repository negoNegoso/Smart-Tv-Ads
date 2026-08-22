---
name: FormData Zod coercion for multipart routes
description: multipart/form-data sends all values as strings; numeric Zod schemas reject them
---

When using multer for multipart/form-data uploads, ALL fields arrive as strings — including numbers like `duration`. Zod's `z.number()` rejects string input by default, causing 400s.

**Rule:** In Express routes that parse multipart bodies, manually coerce numeric fields before passing to `.safeParse()`:
```ts
const body = { ...req.body, duration: Number(req.body.duration) };
const parsed = CreateAnnouncementBody.safeParse(body);
```

**Why:** Was causing all POST /announcements (upload) to return 400 with a Zod parse error on `duration`.

**How to apply:** Any route that uses multer + Zod validation with numeric fields needs this coercion pattern.
