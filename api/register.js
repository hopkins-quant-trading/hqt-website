// POST /api/register — receives competition interest expressions from /register-form.
// This captures interest *before* real competition registration opens.
// When registration actually opens, replace this with a separate endpoint
// that writes to the "Competition Registrations" table instead.
//
// Setup — same env vars as api/apply.js:
//   AIRTABLE_TOKEN                = pat_...
//   AIRTABLE_BASE_ID              = app...
//   AIRTABLE_TABLE_COMPETITION    = Competition Interest   (optional; default)

const FIELDS = {
  name: { required: true, max: 120, airtable: "Name" },
  email: { required: true, max: 200, airtable: "Email" },
  school: { required: true, max: 160, airtable: "School" },
  year: { required: true, max: 40, airtable: "Year" },
  experience: { required: false, max: 4000, airtable: "Experience" },
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
  const table = process.env.AIRTABLE_TABLE_COMPETITION || "Competition Interest";

  if (!token || !baseId) {
    // Not configured yet — log so nothing is lost during local dev / setup.
    console.warn(
      "[register] Airtable env vars missing; registration NOT persisted:",
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
    console.error("[register] Failed to persist registration:", err);
    return res
      .status(500)
      .json({ error: "Could not save your registration. Please try again." });
  }
};
