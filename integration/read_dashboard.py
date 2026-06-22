"""
Vision reader for the two SAIL DASHBOARD screenshots that have no CSV export:
  • Sales/Member summary  (Total Sales, Rewards, New Members + breakdown, EFT inc/dec, active count)
  • Pending Tasks          (Red's Scheduled/Checked-In, Phone Calls, Texts)

These are big, clearly-labeled number tiles, which a vision model reads reliably.
Output is a JSON dict of studio_trends-shaped fields (null when a field isn't on
the image). DRY RUN — prints the extracted JSON; it does NOT write anywhere.
Feed the result into push_to_supabase together with the CSV-derived fields.

Requires:  pip install anthropic   +   ANTHROPIC_API_KEY
Optional:  ANTHROPIC_MODEL (default below; set claude-haiku-4-5 to cut cost — the
           task is simple enough that Haiku is plenty).

Run:
  ANTHROPIC_API_KEY=… python3 integration/read_dashboard.py path/to/dashboard.png
"""
import os
import sys
import json
import base64
import mimetypes

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")

# The fields we try to pull. Keys match studio_trends columns where they map 1:1.
EXTRACT_PROMPT = """You are reading a screenshot of a HOTWORX SAIL dashboard.
Extract ONLY the values that are clearly visible. Return STRICT JSON with these keys,
using null for any value not present on this image (do not guess):

{
  "total_active_members": int|null,   // "TOTAL ACTIVE MEMBER COUNT = N"
  "new_members": int|null,            // "NEW MEMBERS" number
  "new_elite": int|null,              // New Member Breakdown -> Sweat Elite
  "new_basic": int|null,              // New Member Breakdown -> Sweat Basic
  "cancellations": int|null,          // "CANCELLATION REQUEST" number
  "eft_increase": number|null,        // "EFT INCREASE $"
  "eft_decrease": number|null,        // "EFT DECREASE $"
  "membership_cash": number|null,     // "Membership Cash $X / $goal" -> the actual (X)
  "retail": number|null,              // "Retail Sales $X / $goal" -> the actual (X)
  "vending": number|null,             // "Vending Revenue $X" -> the actual
  "net_eft": number|null,             // "Net EFT $X / $goal" (the monthly EFT base, e.g. 24,671.06)
  "rewards": number|null,             // "Rewards Redeemed $"
  "red_appts_booked": int|null,       // "Red's Scheduled" (the denominator, e.g. 28/38 -> 38)
  "red_appts_held": int|null,         // "Checked In" count (e.g. 28/38 -> 28)
  "calls_made": int|null,             // Achievements TOTAL Phone Call
  "texts_made": int|null              // Achievements TOTAL Text Message
}

Return only the JSON object, no prose, no code fences."""


def read_image(path):
    with open(path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode()
    media = mimetypes.guess_type(path)[0] or "image/png"
    return media, data


def extract(path):
    import anthropic
    media, data = read_image(path)
    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}},
            {"type": "text", "text": EXTRACT_PROMPT},
        ]}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text").strip()
    if text.startswith("```"):
        text = text.strip("`").split("\n", 1)[-1].rsplit("```", 1)[0]
    return json.loads(text)


def main(paths):
    merged = {}
    for p in paths:
        print(f"\nReading {os.path.basename(p)} …")
        fields = extract(p)
        for k, v in fields.items():
            if v is not None:
                merged[k] = v
        print(json.dumps(fields, indent=2))
    # studio_trends-ready subset (only the columns that map 1:1)
    cols = ["total_active_members", "new_members", "cancellations", "eft_increase",
            "eft_decrease", "membership_cash", "retail", "vending", "net_eft", "rewards",
            "red_appts_booked", "red_appts_held", "calls_made", "texts_made"]
    print("\n=== merged studio_trends fields (DRY RUN — nothing written) ===")
    print(json.dumps({k: merged.get(k) for k in cols}, indent=2))
    if merged.get("new_members") and merged.get("new_elite") is not None:
        pct = round(merged["new_elite"] / merged["new_members"] * 100, 1)
        print(f"sweat_elite_pct (new_elite / new_members) = {pct}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: read_dashboard.py <image.png> [image2.png ...]")
        sys.exit(1)
    main(sys.argv[1:])
