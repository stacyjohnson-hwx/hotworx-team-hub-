const nodemailer = require('nodemailer')
const { createClient } = require('@supabase/supabase-js')

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
}

const THRESHOLD = parseFloat(process.env.DRAWER_VARIANCE_THRESHOLD || '5')

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

// outreachSummary: { totalCalls, totalTexts, tiles: [{title, calls, texts}] }
// cleaningItems: string[] of task labels completed today by this user
function buildShiftBlock(row_data, outreachSummary, cleaningItems) {
  const v = variance(row_data)
  const varAbs = Math.abs(v)
  const varColor = varAbs > THRESHOLD ? '#C8102E' : '#16a34a'
  const varText = `${v >= 0 ? '+' : ''}${fmt(v)}${varAbs > THRESHOLD ? ' ⚠️' : ''}`

  // Outreach section HTML
  const outreachRows = (() => {
    if (!outreachSummary || (outreachSummary.totalCalls === 0 && outreachSummary.totalTexts === 0)) {
      return `<tr><td colspan="2" style="padding:5px 0;font-size:13px;color:#9ca3af;">No outreach logged today.</td></tr>`
    }
    const tilesWorked = (outreachSummary.tiles || []).filter(t => t.calls > 0 || t.texts > 0)
    return `
      <tr>
        <td style="padding:5px 0;font-size:15px;font-weight:800;color:#16a34a;">📞 ${outreachSummary.totalCalls} calls &nbsp; 💬 ${outreachSummary.totalTexts} texts</td>
        <td></td>
      </tr>
      ${tilesWorked.length > 0 ? `
      <tr><td colspan="2" style="padding:4px 0 2px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Lists targeted:</td></tr>
      ${tilesWorked.map(t => `
        <tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#374151;">
          &bull; ${t.title}
          ${t.calls > 0 ? `<span style="color:#16a34a;"> &bull; ${t.calls} call${t.calls !== 1 ? 's' : ''}</span>` : ''}
          ${t.texts > 0 ? `<span style="color:#2563eb;"> &bull; ${t.texts} text${t.texts !== 1 ? 's' : ''}</span>` : ''}
        </td></tr>`).join('')}
      ` : ''}
    `
  })()

  // Cleaning section HTML
  const cleaningRows = (() => {
    if (!cleaningItems || cleaningItems.length === 0) {
      return `<tr><td colspan="2" style="padding:5px 0;font-size:13px;color:#9ca3af;">No cleaning tasks logged today.</td></tr>`
    }
    return cleaningItems.map(label =>
      `<tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#374151;">✅ ${label}</td></tr>`
    ).join('')
  })()

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

        ${sectionHeader('Outreach')}
        ${outreachRows}

        ${sectionHeader('Cleaning Completed')}
        ${cleaningRows}

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

function buildHtml(dateStr, submissions, outreachByUser, cleaningByUser) {
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
        : submissions.map(s => buildShiftBlock(
            s,
            outreachByUser[s.submitted_by] || null,
            cleaningByUser[s.submitted_by] || []
          )).join('')}
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

  // Fetch EOD submissions
  const { data: submissions, error } = await db
    .from('eod_submissions')
    .select('*')
    .eq('shift_date', dateStr)
    .order('submitted_at')

  if (error) throw new Error(error.message)
  if (!submissions.length) return { submissions: [], outreachByUser: {}, cleaningByUser: {} }

  const userIds = [...new Set(submissions.map(s => s.submitted_by))]

  // Fetch user names
  const nameMap = {}
  for (const uid of userIds) {
    const { data } = await db.auth.admin.getUserById(uid)
    nameMap[uid] = data?.user?.user_metadata?.full_name || data?.user?.email?.split('@')[0] || 'Team Member'
  }

  // Fetch outreach logs for all submitters on this date (with tile names)
  const { data: outreachLogs } = await db
    .from('outreach_logs')
    .select('tsa_id, calls_made, texts_made, outreach_tiles(title)')
    .eq('log_date', dateStr)
    .in('tsa_id', userIds)

  // Build outreach summary keyed by user id
  const outreachByUser = {}
  for (const uid of userIds) {
    const userLogs = (outreachLogs || []).filter(l => l.tsa_id === uid)
    const totalCalls = userLogs.reduce((s, l) => s + (l.calls_made || 0), 0)
    const totalTexts = userLogs.reduce((s, l) => s + (l.texts_made || 0), 0)
    const tiles = userLogs
      .filter(l => (l.calls_made || 0) > 0 || (l.texts_made || 0) > 0)
      .map(l => ({ title: l.outreach_tiles?.title || 'Unknown', calls: l.calls_made || 0, texts: l.texts_made || 0 }))
    outreachByUser[uid] = { totalCalls, totalTexts, tiles }
  }

  // Fetch cleaning completions for all submitters on this date
  const { data: cleaningCompletions } = await db
    .from('cleaning_completions')
    .select('completed_by, cleaning_tasks(task_name)')
    .eq('completion_date', dateStr)
    .in('completed_by', userIds)

  // Build cleaning list keyed by user id
  const cleaningByUser = {}
  for (const uid of userIds) {
    cleaningByUser[uid] = (cleaningCompletions || [])
      .filter(c => c.completed_by === uid)
      .map(c => c.cleaning_tasks?.task_name || 'Task')
  }

  const enrichedSubmissions = submissions.map(s => ({ ...s, submitter_name: nameMap[s.submitted_by] || 'Team Member' }))
  return { submissions: enrichedSubmissions, outreachByUser, cleaningByUser }
}

async function sendEodEmail(dateStr) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('[EOD Email] EMAIL_USER/EMAIL_PASS not set — skipping email')
    return
  }

  const { submissions, outreachByUser, cleaningByUser } = await fetchSubmissionsForDate(dateStr)
  const html = buildHtml(dateStr, submissions, outreachByUser, cleaningByUser)
  const recipients = [process.env.OWNER_EMAIL, process.env.MANAGER_EMAIL].filter(Boolean)

  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  try {
    const transporter = createTransport()
    await transporter.sendMail({
      from: `HOTWORX Pewaukee <${process.env.EMAIL_USER}>`,
      to: recipients.join(', '),
      subject: `${process.env.STUDIO_NAME || 'HOTWORX Pewaukee'} — EOD Report ${dateLabel}`,
      html,
    })
    console.log(`[EOD Email] Sent for ${dateStr} to ${recipients.join(', ')}`)
  } catch (err) {
    console.error('[EOD Email] Send failed:', err.message)
  }
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('[Email] EMAIL_USER/EMAIL_PASS not set — skipping')
    return
  }
  const transporter = createTransport()
  await transporter.sendMail({
    from: `HOTWORX Pewaukee <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  })
}

module.exports = { sendEodEmail, sendEmail }
