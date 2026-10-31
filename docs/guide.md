# Offer Pilot user guide

**English** | [中文](guide.zh-CN.md)

> Covers: scheduled fetching and autofill

In one line: **jobs are fetched every morning at 7:00 → pick jobs in the web app → click "Autofill" → review the highlighted fields → submit yourself → mark the job as "Applied".**

Run every command from the repository root:

```bash
cd web_offer_pilot
```

---

## 1. First-time setup

| Step | Command / action | Notes |
|---|---|---|
| 1. Install dependencies | `pnpm install` | Needs Node 22+ and pnpm |
| 2. Install Google Chrome | — | Autofill drives the Chrome installed on your machine |
| 3. Create the database | `pnpm db:push` | Creates `data/jobs.db` with the tables (only once, and again after schema changes) |
| 4. Your profile | `cp data/profile.example.json data/profile.json`, then edit it | Fields set to `TODO(confirm)` are never filled. This file is git-ignored |
| 5. Your sources and companies | `cp data/sources.example.json data/sources.json` and `cp data/companies.example.json data/companies.json`, then edit them | Replace the fictional samples with your own (see the README). Both files are git-ignored |
| 6. Resume PDF | Put it in `data/resume/` | Point `resumePath` in `profile.json` at it. Export a new PDF whenever the resume changes |
| 7. Sources and first board | `pnpm dev`, then **Add source** and **New board** | Pick a template and adjust it. Do this before the first fetch: descriptions are kept only for jobs on a board |
| 8. Scheduled fetching | `pnpm schedule:install` | Fetches every day at 7:00. Remove with `pnpm schedule:uninstall` |

Convert a Word resume to PDF:

```bash
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --convert-to pdf --outdir data/resume your-resume.docx
```

---

## 2. Start the web app

```bash
pnpm dev            # open http://localhost:3000
pnpm dev -p 3100    # use another port if 3000 is taken (EADDRINUSE)
```

| Page | URL | Purpose |
|---|---|---|
| Sources | `/` | Jobs per source and how the last fetch went |
| Your boards | `/boards/<name>` | The jobs that match each board; **Edit** changes its rules |
| New board | `/boards/new` | Pick a template or type keywords and locations, with a live preview |

**Language**: English by default; switch with the **中文 / EN** toggle in the top-right corner. The choice is kept in a browser cookie for a year; URLs stay the same.

Tabs on the job pages: **To review** (new, matching jobs), **Applied**, **Skipped**, **All matches**. You can filter by source and search company, title and location in the top right.

---

## 3. Fetching jobs

### Automatic (recommended)
Once the schedule is installed, the fetch runs every day at 7:00 and takes about 3 minutes. The log is in `data/fetch.log`:

```bash
tail -30 data/fetch.log     # how many jobs came in today, and any errors
```

If the Mac is asleep at 7:00, the run happens after it wakes up.

### Manual
```bash
pnpm fetch-jobs
```

A fetch:

1. Pulls jobs from the sources you added on the Sources page: ATS connectors fetch the companies you track (`data/companies.json`), and job board connectors need no company list.
2. Keeps descriptions for jobs that match a board (`src/lib/filter.ts`). Boards themselves are worked out when a page loads.
3. Dedupes: the same job on several sources becomes one row.
4. Marks jobs that disappeared from their source as closed, so they stop showing up.

---

## 4. Daily application flow (semi-automatic)

```
7:00  scheduled fetch
   ↓
pnpm dev → open a board → "To review"
   ↓
Open the job and read the description (check the location first; skip roles whose location does not work for you)
   ↓
Click "Autofill" → Chrome opens and fills what it can
   ↓
Review the whole form, complete the highlighted fields → click Submit yourself
   ↓
Close the tab → click "Applied" in the web app
```

### 4.1 Pick jobs
- For a good fit, click **Autofill** (or **Open application** to fill everything by hand).
- Otherwise click **Skip**. Made a mistake? Click **Undo** in the matching tab.
- Postings of the same job on several sources change status together.

### 4.2 What Autofill does
The button starts a background process that opens the application in a **dedicated Chrome profile** (stored in `data/chrome-profile/`, separate from your everyday Chrome), then:

| On the page | Meaning |
|---|---|
| Filled in | Fixed fields (name, email, phone, LinkedIn, GitHub, resume) and common questions matched by rules (sponsorship, work authorization, state, how you heard about the job, years of experience, time zone, EEO…) |
| **Yellow outline** | Required, but the tool is not sure: company-specific questions, open questions, legal acknowledgements, date pickers, "are you local or willing to relocate" |
| Left empty | Optional questions with no rule (e.g. Twitter); fill them if you like |

**The tool never clicks Submit.** CAPTCHAs (reCAPTCHA / hCaptcha) are yours to solve when you submit.

### 4.3 Checklist before submitting
- [ ] Every highlighted field is filled
- [ ] The attached resume is the latest version
- [ ] Dropdown choices make sense (especially "How did you hear about us"; the tool picks the closest option)
- [ ] Open questions ("Why us?") are written with care
- [ ] You clicked Submit and saw the confirmation page
- [ ] You marked the job as **Applied** in Offer Pilot

### 4.4 Supported sites
| Application page | Autofill | Tested |
|---|---|---|
| Application pages with an autofill connector | ✅ | Real forms: 11 to 22 fields filled, company-specific questions highlighted |
| Sites that require signing in first | ❌ opens the page only | Sign in or create an account, then fill it yourself |
| Anything else | ❌ opens the page only | Fill it yourself |

---

## 5. Command line (optional)

The web button runs this same command. Use `--dry-run` to see what the tool would fill:

```bash
# Print the fill plan only, no browser
pnpm autofill <application URL> --dry-run

# Open Chrome and fill (still never submits)
pnpm autofill <application URL>

# Or use a job id from the database: <source>:<company>:<job id>
pnpm autofill <job id> --dry-run
```

Markers in the output: ✅ will be filled; 🟡 for you to fill (highlighted); ⬜ optional, skipped. `*` means required.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Autofill says the Chrome is in use | A Chrome window from an older version is still open. Close it and click again. Normally each job opens as a new tab in the same window. Details are in `data/autofill.log` |
| A field you expected to be filled is highlighted | Check whether that field is still `TODO(confirm)` in `data/profile.json` |
| A dropdown got the wrong option | Fix it by hand, then adjust the rule in `src/lib/autofill/rules.ts` |
| No new jobs today | `tail data/fetch.log` for errors; run `pnpm fetch-jobs` by hand |
| The web app does not load | Make sure `pnpm dev` is still running; on a port conflict use `pnpm dev -p 3100` |
| Track another company | **Sources** → **Tracked companies**, add its name and slug, then run `pnpm fetch-jobs` |
| Stop fetching a source | Turn off its switch on the **Sources** page, or remove it with × |
| A board shows too many or too few jobs | Click **Edit** and watch the preview. Keywords apply at once, except on sources searched by keyword (next fetch) |
| Changed the templates in code | Run `pnpm check-filter` until every case passes |

---

## 7. Development

```bash
pnpm test           # all 27 tests: unit, browser and i18n (browser tests need Chrome)
pnpm test:unit      # unit tests only
pnpm test:browser   # browser tests only
pnpm lint
```

| File | Purpose |
|---|---|
| `src/lib/autofill/classify.ts` | Classify an application URL: fill directly / login first / manual |
| `src/lib/autofill/rules.ts` | Rules that answer common questions |
| `src/lib/autofill/` | One planner per ATS: read its questions and build a fill plan |
| `src/lib/autofill/runner.ts` | Run the plan in the page with Playwright and highlight what is left |
| `scripts/autofill.ts` | Command-line entry point |
| `scripts/schedule/` | Daily 7:00 fetch (macOS LaunchAgent) |
| `src/i18n/dictionaries.ts` | UI text in Chinese and English (new text needs both; a missing one is a TypeScript error) |
| `src/i18n/locale.ts` | Reads the current language from the cookie (default: English) |

Design details: [README.md](../README.md).
