const { Resend } = require('resend')
const { createClient } = require('@supabase/supabase-js')

const THRESHOLD = parseFloat(process.env.DRAWER_VARIANCE_THRESHOLD || '5')
const ENG_GOAL = 3

function variance(row) {
  return parseFloat(row.drawer_end) - parseFloat(row.drawer_start) - parseFloat(row.cash_collected)
}

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)
}

function shiftLabel(type) {
  return { mid: 'Mid Shift', closing: 'Closing Shift' }[type] || type
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
  })
}

function check(val) { return val ? '✅' : '❌' }

function row(label, value) {
  return `<tr>
    <td style="padding:5px 0;color:#6b7280;font-size:13px;">${label}</td>
    <td style="text-align:right;font-size:13px;">${value}</td>
  </tr>`
}

function sectionHeader(title) {
  return `<tr><td colspan="2" style="font-weight:700;font-size:12px;color:#374151;padding:10px 0 4px;border-bottom:1px solid #f3f4f6;text-transform:uppercase;letter-spacing:.05em;">${title}</td></tr>`
}

function engCount(sub) {
  const keys = ['eng_testimonial','eng_google_review','eng_photos_members','eng_photos_rewards',
    'eng_ambassador','eng_app_link','eng_biz_month','eng_ig_tiktok',
    'eng_new_member','eng_follow_up','eng_thank_you_cards']
  return keys.filter(k => sub[k]).length
}

function buildShiftBlock(row_data) {
  const v = variance(row_data)
  const varAbs = Math.abs(v)
  const varColor = varAbs > THRESHOLD ? '#C8102E' : '#16a34a'
  const varText = `${v >= 0 ? '+' : ''}${fmt(v)}${varAbs > THRESHOLD ? ' ⚠️' : ''}`
  const ec = engCount(row_data)
  const engColor = ec >= ENG_GOAL ? '#16a34a' : '#9ca3af'

  return `
  <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="background:#1A1A1A;padding:12px 20px;">
      <span style="color:#fff;font-weight:700;font-size:15px;">${shiftLabel(row_data.shift_type)}</span>
      <span style="color:#9ca3af;font-size:13px;margin-left:12px;">Submitted by ${row_data.submitter_name} at ${formatTime(row_data.submitted_at)}</span>
    </div>
    <div style="padding:16px 20px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        ${sectionHeader('Drawer')}
        ${row('Starting Drawer', fmt(row_data.drawer_start))}
        ${row('Cash Collected', fmt(row_data.cash_collected))}
        ${row('Credit / Check Collected', fmt(row_data.credit_collected))}
        ${row('Ending Drawer (counted)', fmt(row_data.drawer_end))}
        <tr style="border-top:1px solid #f3f4f6;">
          <td style="padding:6px 0;font-weight:700;font-size:13px;">Variance</td>
          <td style="text-align:right;font-weight:700;font-size:13px;color:${varColor};">${varText}</td>
        </tr>

        ${sectionHeader('Lead Generation')}
        ${row('Phone Calls', row_data.phone_calls ?? 0)}
        ${row('SMS Sent', row_data.sms_sent ?? 0)}
        ${row('Red Appointments Scheduled', row_data.red_appt_scheduled ?? 0)}
        <tr><td colspan="2" style="padding:4px 0;font-size:13px;">${check(row_data.notes_added_missed)} Notes added to all missed guests</td></tr>
        <tr><td colspan="2" style="padding:4px 0;font-size:13px;">${check(row_data.followed_up_missed)} Followed up with missed guests from yesterday</td></tr>
        <tr><td colspan="2" style="padding:4px 0;font-size:13px;">${check(row_data.survey_sent_red_appts)} Survey sent to tomorrow's red appointments</td></tr>
        ${row_data.leads_notes ? `<tr><td colspan="2" style="padding:4px 0;color:#6b7280;font-size:12px;font-style:italic;">${row_data.leads_notes}</td></tr>` : ''}

        ${sectionHeader('Sales')}
        ${row('Sweat Basic Memberships', row_data.sweat_basic ?? 0)}
        ${row('Sweat Elite Memberships', row_data.sweat_elite ?? 0)}
        ${row('Cancellations', row_data.cancellations_count ?? 0)}
        ${row_data.cancellations_notes ? `<tr><td colspan="2" style="padding:4px 0;color:#6b7280;font-size:12px;font-style:italic;">↳ ${row_data.cancellations_notes}</td></tr>` : ''}
        ${row('Retail Sales', fmt(row_data.retail_amount))}
        ${row_data.sales_notes ? `<tr><td colspan="2" style="padding:4px 0;color:#6b7280;font-size:12px;font-style:italic;">${row_data.sales_notes}</td></tr>` : ''}

        ${sectionHeader('Membership Engagement')}
        <tr><td colspan="2" style="padding:5px 0;font-size:13px;color:${engColor};font-weight:600;">${ec} of 11 completed (goal: ${ENG_GOAL})</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_testimonial)} Testimonial video ask</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_google_review)} Google Review asked</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_photos_members)} Photos/videos of members</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_photos_rewards)} Photos of rewards redemption</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_ambassador)} Ambassador program mention</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_app_link)} Showed app referral link</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_biz_month)} Business of the Month mention</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_ig_tiktok)} Instagram / TikTok created</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_new_member)} Got to know a new member</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_follow_up)} Followed up with members</td></tr>
        <tr><td colspan="2" style="padding:3px 0;font-size:12px;">${check(row_data.eng_thank_you_cards)} Thank you cards written</td></tr>

        ${sectionHeader('Sales Training')}
        <tr><td colspan="2" style="padding:4px 0;font-size:13px;">${check(row_data.watched_training_video)} Watched training video</td></tr>
        <tr><td colspan="2" style="padding:4px 0;font-size:13px;">${check(row_data.role_played_script)} Role played / practiced script</td></tr>
        <tr><td colspan="2" style="padding:4px 0;font-size:13px;">${check(row_data.used_sales_gpt)} Used Sales GPT</td></tr>
      </table>

      ${row_data.orders_needed ? `
        <div style="margin-top:12px;">
          <div style="font-weight:700;font-size:12px;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Orders Needed</div>
          <div style="font-size:13px;color:#374151;background:#fef9c3;padding:8px 12px;border-radius:6px;">${row_data.orders_needed}</div>
        </div>` : ''}

      ${row_data.general_notes ? `
        <div style="margin-top:12px;">
          <div style="font-weight:700;font-size:12px;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Notes</div>
          <div style="font-size:13px;color:#374151;">${row_data.general_notes}</div>
        </div>` : ''}
    </div>
  </div>`
}

function buildHtml(dateStr, submissions) {
  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#C8102E;border-radius:10px 10px 0 0;padding:20px 24px;">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px;">HOTWORX Pewaukee</div>
      <div style="font-size:14px;color:#fca5a5;margin-top:2px;">EOD Report — ${dateLabel}</div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:24px;">
      ${submissions.length === 0
        ? '<p style="color:#6b7280;font-size:14px;">No EOD submissions were recorded for this date.</p>'
        : submissions.map(buildShiftBlock).join('')}
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;">
        ${process.env.STUDIO_NAME} · ${process.env.STUDIO_ADDRESS} · Internal use only
      </div>
    </div>
  </div>
</body>
</html>`
}

async function fetchSubmissionsForDate(dateStr) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: submissions, error } = await db
    .from('eod_submissions')
    .select('*')
    .eq('shift_date', dateStr)
    .order('submitted_at')

  if (error) throw new Error(error.message)
  if (!submissions.length) return []

  const userIds = [...new Set(submissions.map(s => s.submitted_by))]
  const nameMap = {}
  for (const uid of userIds) {
    const { data } = await db.auth.admin.getUserById(uid)
    nameMap[uid] = data?.user?.user_metadata?.full_name || data?.user?.email?.split('@')[0] || 'Team Member'
  }

  return submissions.map(s => ({ ...s, submitter_name: nameMap[s.submitted_by] || 'Team Member' }))
}

async function sendEodEmail(dateStr) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[EOD Email] RESEND_API_KEY not set — skipping email')
    return
  }

  const submissions = await fetchSubmissionsForDate(dateStr)
  const html = buildHtml(dateStr, submissions)
  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromEmail = process.env.FROM_EMAIL || 'HOTWORX Pewaukee <onboarding@resend.dev>'
  const recipients = [process.env.OWNER_EMAIL, process.env.MANAGER_EMAIL].filter(Boolean)

  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: recipients,
    subject: `${process.env.STUDIO_NAME || 'HOTWORX Pewaukee'} — EOD Report ${dateLabel}`,
    html,
  })

  if (error) {
    console.error('[EOD Email] Send failed:', error)
  } else {
    console.log(`[EOD Email] Sent for ${dateStr} to ${recipients.join(', ')}`)
  }
}

module.exports = { sendEodEmail }
