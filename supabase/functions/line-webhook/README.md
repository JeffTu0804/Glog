# Cross-department LINE workflow (optional Edge Function)

Deploy when you prefer Supabase Edge over Express webhook:

```bash
supabase functions deploy line-webhook
supabase secrets set \
  LINE_CHANNEL_SECRET=... \
  LINE_CHANNEL_ACCESS_TOKEN=... \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  LIFF_BIND_URL=https://liff.line.me/<LIFF_ID>
```

Point the LINE Official Account webhook to:
`https://<project-ref>.supabase.co/functions/v1/line-webhook`

Production Express path (default for this repo):
`POST /api/v1/line/webhook` → `crossDept/lineRoutingHandler.ts`

## replyToken cost rule

- Always reply to the actor with `replyToken` (free, 1 use, ≤5 messages).
- Only `multicast` / `push` to other department peers (billable).
