// POST /api/apply — receives an application submitted from /apply-form
//
// Vercel auto-deploys every file in /api as a serverless function.
// This handler VALIDATES the submission and writes it to Airtable.
//
// Setup (one-time, ~3 min) — see README.md "Applications backend":
//   1. Create an Airtable base with a table (default name "Applications")
//      containing fields: Name, Email, Year, Major, Experience, Why, Submitted At.
//   2. Create a personal access token (airtable.com/create/tokens) with
//      data.records:write scope on that base.
//   3. In Vercel → Project → Settings → Environment Variables, set:
//        AIRTABLE_TOKEN     = pat_...
//        AIRTABLE_BASE_ID   = app...   (from the base's API docs / URL)
//        AIRTABLE_TABLE     = Applications   (optional; this is the default)
//
// Handles ~500 applications comfortably — Airtable's free tier holds 1,000 rows.

const FIELDS = {
  name: { required: true, max: 120, airtable: "Name" },
  email: { required: true, max: 200, airtable: "Email" },
  year: { required: true, max: 40, airtable: "Year" },
  major: { required: true, max: 120, airtable: "Major" },
  experience: { required: false, max: 4000, airtable: "Experience" },
  why: { required: true, max: 4000, airtable: "Why" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body) {
  const errors = {};
  const clean = {};

  for (const [key, rule] of Object.entries(FIELDS)) {
    const raw = typeof body[key] === "string" ? body[key].trim() : "";
    if (rule.required && !raw) {
      errors[key] = "Required.";
      continue;
    }
    if (raw.length > rule.max) {
      errors[key] = `Must be ${rule.max} characters or fewer.`;
      continue;
    }
    clean[key] = raw;
  }

  if (clean.email && !EMAIL_RE.test(clean.email)) {
    errors.email = "Enter a valid email address.";
  }

  return { clean, errors };
}

async function saveToAirtable(clean) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE || "Applications";

  if (!token || !baseId) {
    // Not configured yet — log so nothing is lost during local dev / setup.
    console.warn(
      "[apply] Airtable env vars missing; submission NOT persisted:",
      clean
    );
    return { persisted: false };
  }

  const airtableFields = { "Submitted At": new Date().toISOString() };
  for (const [key, rule] of Object.entries(FIELDS)) {
    if (clean[key]) airtableFields[rule.airtable] = clean[key];
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [{ fields: airtableFields }],
        typecast: true, // lets Year (a single-select) accept new string values
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Airtable ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { persisted: true };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};

  const { clean, errors } = validate(body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: "Validation failed", errors });
  }

  try {
    const { persisted } = await saveToAirtable(clean);
    return res.status(200).json({ ok: true, persisted });
  } catch (err) {
    console.error("[apply] Failed to persist submission:", err);
    return res
      .status(500)
      .json({ error: "Could not save your application. Please try again." });
  }
};
