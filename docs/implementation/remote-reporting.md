# Remote owner reporting

Happy Cone continues selling from the shop computer when the internet is unavailable. Remote reporting is a separate, read-only copy: completed local changes wait in an outbox and upload in sequence when internet access returns. The owner page shows when it last received shop data so an old figure cannot be mistaken for a live one.

The free setup uses Supabase for authentication and reporting data, and Cloudflare Pages for the owner website. It does not expose the shop computer or database to the internet.

## What you need

- A Supabase account and one new project.
- A Cloudflare account.
- Access to this repository and the GitHub repository used for deployment.
- The Happy Cone Windows shop computer after it has been upgraded to the release containing remote reporting.

Never put a Supabase secret key in the owner dashboard, GitHub, a screenshot, or a message. The browser receives only the publishable key. The shop computer holds the secret key in its protected API configuration.

## 1. Prepare Supabase

1. Create a Supabase project in a region close to Zambia and save the database password in the business password manager.
2. In **SQL Editor**, open and run `supabase/migrations/202610170001_reporting.sql` from this repository.
3. Run `supabase/tests/reporting_verification.sql`. Every returned value must be `true`.
4. In **Authentication → Users**, create the owner's email/password account. Copy the user's UUID.
5. In **Project Settings → API Keys**, copy the project URL, the browser-safe publishable key, and one server secret key. Keep the secret key private.
6. Deploy the Edge Function named `ingest-reporting-events`. With the Supabase CLI installed and linked to the project, run:

   ```bash
   supabase functions deploy ingest-reporting-events --no-verify-jwt
   ```

   `supabase/config.toml` also records `verify_jwt = false`. The function still rejects callers unless the `apikey` header contains a valid project secret key.

## 2. Connect the shop computer

On Windows, sign in as an administrator, open **Windows PowerShell as Administrator**, and run:

```powershell
Stop-Service HappyConeApi
notepad C:\ProgramData\HappyCone\api.env
```

Add these two lines using the actual values copied from Supabase:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
```

Save the file, close Notepad, then run:

```powershell
Start-Service HappyConeApi
```

Use an owner or manager login to read the protected sync status. In the same administrator PowerShell window, run this and enter the local Happy Cone username and password when asked:

```powershell
$Shop = 'http://localhost:8080'
$Username = Read-Host 'Happy Cone username'
$SecurePassword = Read-Host 'Happy Cone password' -AsSecureString
$Password = [Net.NetworkCredential]::new('', $SecurePassword).Password
$Login = Invoke-RestMethod "$Shop/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{username=$Username;password=$Password} | ConvertTo-Json)
$Status = Invoke-RestMethod "$Shop/api/sync/status" -Headers @{Authorization="Bearer $($Login.token)"}
$Password = $null
$Status | Format-List
```

Record its `store_id`. Complete one harmless operational action, such as editing a stand detail, then run the last two status lines again. `backlog` should return to `0`, `last_success_at` should have a time, and `last_error` should be empty.

If the internet is unavailable, the backlog can rise while checkout keeps working. Do not reset the store ID or delete the local database. Upload resumes automatically.

## 3. Give the owner access

After the first successful shop sync has created its store row, run this in the Supabase SQL Editor. Replace both UUIDs:

```sql
insert into public.reporting_store_owners (store_id, user_id)
values ('STORE_UUID', 'AUTH_USER_UUID');
```

The owner account can read only assigned stores through Row Level Security. Browser users cannot insert, update, or delete reporting data.

## 4. Deploy the owner website on Cloudflare Pages

1. Push the completed repository to its private GitHub repository.
2. In Cloudflare, choose **Workers & Pages → Create → Pages → Connect to Git** and select the repository.
3. Set the root directory to `apps/owner-dashboard`.
4. Set the build command to `npm ci && npm run build` and output directory to `dist`.
5. Select Node.js 22 for builds.
6. Add these environment variables:

   ```text
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
   ```

7. Deploy, open the generated HTTPS address, and sign in with the owner Auth account.

Confirm that the page shows the correct stand, net sales, payment split, item quantities and values, expected cash, stock, and waste. Turn off the shop computer's internet for at least 15 minutes and confirm the owner page displays its old-data warning. Restore internet, make a local action, and confirm the time catches up.

## Free-plan limits and maintenance

As checked on 17 October 2026, Supabase Free projects can be paused after low activity over a seven-day period, and can enter read-only mode above 500 MB of database data. Cloudflare Pages Free allows 500 builds per month and 20,000 files per site. Review the current provider pages before commissioning because limits can change:

- <https://supabase.com/docs/guides/platform/free-project-pausing>
- <https://supabase.com/docs/guides/platform/database-size>
- <https://developers.cloudflare.com/pages/platform/limits/>

Open the owner dashboard regularly and watch Supabase usage. A paused cloud project does not stop the shop; it delays remote updates until the project is resumed.

Rotate a Supabase secret immediately if it appears in a screenshot, message, repository, or support bundle. Create a replacement secret, update `C:\ProgramData\HappyCone\api.env`, restart `HappyConeApi`, confirm sync succeeds, and then revoke the old secret. A publishable key may appear in the browser bundle; Row Level Security is what limits it.

## Troubleshooting

- **Owner sees “No store assigned”:** add the correct Auth user UUID and local `store_id` to `reporting_store_owners`.
- **Local backlog keeps growing:** confirm the computer has internet, the Supabase URL is exact, the secret is active, and the Edge Function is deployed with JWT verification disabled.
- **Owner figures are old:** check `/api/sync/status` locally. The local database remains the authoritative record.
- **A 401 response from the Edge Function:** use the secret key in the `apikey` header. API keys are not user JWTs and must not be sent as bearer tokens.
- **Supabase is paused or read-only:** resume the project or resolve its usage limit. Local checkout continues normally.
