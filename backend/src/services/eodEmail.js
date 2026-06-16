const { Resend }    = require('resend')
const nodemailer    = require('nodemailer')
const { createClient } = require('@supabase/supabase-js')

// ─── Transport: Gmail SMTP preferred, Resend fallback ─────────────────────────
// Gmail SMTP sends to anyone. Resend sandbox only sends to the account owner.
// Set EMAIL_USER + EMAIL_PASS (Gmail App Password) in Railway to unlock Gmail.
function hasGmail() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS)
}

// Build a Gmail transport for a specific port, with hard timeouts so a blocked
// SMTP port fails fast (≈8s) instead of hanging the request forever.
function buildGmailTransport(port) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port,
    secure: port === 465,     // 465 = implicit SSL; 587 = STARTTLS
    requireTLS: port === 587,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  })
}

// Ports to try, configured port first (EMAIL_PORT), then the alternate.
function gmailPorts() {
  const configured = parseInt(process.env.EMAIL_PORT) || 465
  return configured === 587 ? [587, 465] : [465, 587]
}

// SendGrid over HTTPS (port 443) — works on hosts that block SMTP (like Railway).
// Verify a Single Sender (e.g. HOTWORXcheckout@gmail.com) in SendGrid, then set
// SENDGRID_API_KEY (+ optional EMAIL_FROM) in Railway.
function hasSendgrid() { return !!process.env.SENDGRID_API_KEY }
function senderAddress() { return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'HOTWORXcheckout@gmail.com' }

async function sendViaSendgrid({ to, subject, html }) {
  const fromName = process.env.STUDIO_NAME || 'HOTWORX Team Hub'
  const toList = (Array.isArray(to) ? to : [to]).filter(Boolean)
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: toList.map(email => ({ email })) }],
      from: { email: senderAddress(), name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })
  if (res.status >= 200 && res.status < 300) return
  const body = await res.text().catch(() => '')
  throw new Error(`SendGrid ${res.status}: ${body.slice(0, 300)}`)
}

async function sendViaBestAvailable({ to, subject, html }) {
  const fromName  = process.env.STUDIO_NAME || 'HOTWORX Pewaukee'

  if (hasSendgrid()) {
    await sendViaSendgrid({ to, subject, html })
    console.log('[Email] Sent via SendGrid to', Array.isArray(to) ? to.join(', ') : to)
    return
  }

  if (hasGmail()) {
    // Try each port; whichever connects first wins. Timeouts prevent hangs.
    let lastErr = null
    for (const port of gmailPorts()) {
      try {
        const transport = buildGmailTransport(port)
        await transport.sendMail({
          from: `"${fromName}" <${process.env.EMAIL_USER}>`,
          to: Array.isArray(to) ? to.join(', ') : to,
          subject,
          html,
        })
        console.log(`[Email] Sent via Gmail SMTP (port ${port}) to`, Array.isArray(to) ? to.join(', ') : to)
        return
      } catch (e) {
        lastErr = e
        console.warn(`[Email] Gmail port ${port} failed: ${e.message}`)
      }
    }
    throw new Error(`Gmail send failed on ports ${gmailPorts().join('/')}: ${lastErr?.message || 'unknown'}`)
  }

  if (process.env.RESEND_API_KEY) {
    // Resend — sandbox mode only delivers to the Resend account owner email
    const resend = new Resend(process.env.RESEND_API_KEY)
    const toList = (Array.isArray(to) ? to : [to])
    await resend.emails.send({
      from: `${fromName} <onboarding@resend.dev>`,
      to: toList,
      subject,
      html,
    })
    console.log('[Email] Sent via Resend to', toList.join(', '))
    return
  }

  console.warn('[Email] No transport configured — set EMAIL_USER+EMAIL_PASS (Gmail) or RESEND_API_KEY')
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
// tasksByUser: { cleaning: string[], operations: string[] }
function buildShiftBlock(row_data, outreachSummary, tasksByUser) {
  const cleaningItems   = tasksByUser?.cleaning   || []
  const operationsItems = tasksByUser?.operations || []
  const missionItems    = row_data.mission_titles || []
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
  const cleaningRows = cleaningItems.length
    ? cleaningItems.map(label => `<tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#374151;">✅ ${label}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:5px 0;font-size:13px;color:#9ca3af;">No cleaning tasks logged today.</td></tr>`

  // Operations section HTML
  const operationsRows = operationsItems.length
    ? operationsItems.map(label => `<tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#374151;">✅ ${label}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:5px 0;font-size:13px;color:#9ca3af;">No operations tasks logged today.</td></tr>`

  // Missions section HTML
  const missionsRows = missionItems.length
    ? missionItems.map(label => `<tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#374151;">✅ ${label}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:5px 0;font-size:13px;color:#9ca3af;">No marketing tasks completed today.</td></tr>`

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
        ${(() => {
          const done = [
            row_data.notes_added_missed    && 'Notes added to all missed guests',
            row_data.followed_up_missed    && 'Followed up with missed guests from yesterday',
            row_data.survey_sent_red_appts && 'Survey sent to tomorrow\'s red appointments',
          ].filter(Boolean)
          return done.map(label => `<tr><td colspan="2" style="padding:2px 0;font-size:13px;">✅ ${label}</td></tr>`).join('')
        })()}
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

        ${sectionHeader('Operations Completed')}
        ${operationsRows}

        ${sectionHeader('Marketing')}
        ${missionsRows}

        ${sectionHeader('Training Completed')}
        ${(() => {
          const items = row_data.completed_training || []
          return items.length
            ? items.map(label => `<tr><td colspan="2" style="padding:2px 0;font-size:13px;">✅ ${label}</td></tr>`).join('')
            : `<tr><td colspan="2" style="padding:5px 0;font-size:13px;color:#9ca3af;">None completed.</td></tr>`
        })()}
      </table>

      ${row_data.general_notes ? `
        <div style="margin-top:12px;">
          <div style="font-weight:700;font-size:12px;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">General Notes</div>
          <div style="font-size:13px;color:#374151;">${row_data.general_notes}</div>
        </div>` : ''}

      ${row_data.support_notes ? `
        <div style="margin-top:12px;">
          <div style="font-weight:700;font-size:12px;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">How can we better support you?</div>
          <div style="font-size:13px;color:#374151;background:#eff6ff;padding:8px 12px;border-radius:6px;border-left:3px solid #3b82f6;">${row_data.support_notes}</div>
        </div>` : ''}
    </div>
  </div>`
}

function opsItem(text, meta) {
  return `<tr><td style="padding:4px 0;font-size:13px;color:#374151;">${text}</td><td style="padding:4px 0;font-size:12px;color:#9ca3af;text-align:right;white-space:nowrap;">${meta || ''}</td></tr>`
}
function opsEmpty(label) {
  return `<tr><td colspan="2" style="padding:4px 0;font-size:13px;color:#9ca3af;">${label}</td></tr>`
}

// Studio-level "Operations Watch" — open maintenance, open escalations, pending
// orders. Rendered once per email (not per shift).
function buildOpsSection(ops) {
  if (!ops) return ''
  const { maintenance = [], escalations = [], orders = [] } = ops

  const maintRows = maintenance.length
    ? maintenance.map(m => opsItem(`🔧 ${m.title}`, [m.area, m.priority, m.status === 'in_progress' ? 'in progress' : 'open'].filter(Boolean).join(' · '))).join('')
    : opsEmpty('None open ✅')

  const escRows = escalations.length
    ? escalations.map(e => opsItem(`⚠️ ${e.title}`, [e.type, e.priority, e.member_name].filter(Boolean).join(' · '))).join('')
    : opsEmpty('None open ✅')

  const orderRows = orders.length
    ? orders.map(o => opsItem(`📦 ${o.item_name}`, [o.quantity ? `Qty ${o.quantity}` : null, o.vendor].filter(Boolean).join(' · '))).join('')
    : opsEmpty('None pending ✅')

  return `
  <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="background:#1A1A1A;padding:12px 16px;font-size:14px;font-weight:700;color:#fff;">Operations Watch</div>
    <div style="padding:12px 16px;">
      <table style="width:100%;border-collapse:collapse;">
        ${sectionHeader(`Open Maintenance (${maintenance.length})`)}
        ${maintRows}
        ${sectionHeader(`Open Escalations (${escalations.length})`)}
        ${escRows}
        ${sectionHeader(`Pending Orders (${orders.length})`)}
        ${orderRows}
      </table>
    </div>
  </div>`
}

function buildHtml(dateStr, submissions, outreachByUser, tasksByUser, ops) {
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
            tasksByUser[s.submitted_by]    || { cleaning: [], operations: [] }
          )).join('')}
      ${buildOpsSection(ops)}
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;">
        ${process.env.STUDIO_NAME} · ${process.env.STUDIO_ADDRESS} · Internal use only
      </div>
    </div>
  </div>
</body>
</html>`
}

async function fetchSubmissionsForDate(dateStr, studioId) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Fetch EOD submissions (scoped to the studio when provided)
  let subQuery = db
    .from('eod_submissions')
    .select('*')
    .eq('shift_date', dateStr)
    .order('submitted_at')
  if (studioId) subQuery = subQuery.eq('studio_id', studioId)
  const { data: submissions, error } = await subQuery

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

  // Cleaning tasks are shared studio-wide — fetch all completions for the date
  // regardless of who checked them off, then apply to every submission.
  const { data: cleaningCompletions } = await db
    .from('cleaning_completions')
    .select('task_id')
    .eq('completion_date', dateStr)

  const sharedTasks = { cleaning: [], operations: [] }
  if (cleaningCompletions && cleaningCompletions.length > 0) {
    const taskIds = [...new Set(cleaningCompletions.map(c => c.task_id))]
    const { data: taskRows } = await db
      .from('cleaning_tasks')
      .select('id, title, task_type')
      .in('id', taskIds)

    const taskMap = {}
    for (const t of taskRows || []) taskMap[t.id] = t

    for (const c of cleaningCompletions) {
      const t = taskMap[c.task_id]
      if (!t) continue
      if (t.task_type === 'Operations') sharedTasks.operations.push(t.title)
      else sharedTasks.cleaning.push(t.title)
    }
  }

  // Every submitter on this date sees the same shared task list
  const tasksByUser = {}
  for (const uid of userIds) {
    tasksByUser[uid] = sharedTasks
  }

  const enrichedSubmissions = submissions.map(s => ({
    ...s,
    submitter_name: nameMap[s.submitted_by] || 'Team Member',
  }))
  return { submissions: enrichedSubmissions, outreachByUser, tasksByUser }
}

// Studio-level operations snapshot for the EOD email: open maintenance,
// open escalations, and pending orders.
async function fetchOpsSummary(db, studioId) {
  if (!studioId) return { maintenance: [], escalations: [], orders: [] }
  const [maint, esc, ord] = await Promise.all([
    db.from('maintenance_logs').select('title, area, priority, status').eq('studio_id', studioId).in('status', ['open', 'in_progress']),
    db.from('escalation_logs').select('title, type, priority, member_name, status').eq('studio_id', studioId).neq('status', 'resolved'),
    db.from('orders').select('item_name, quantity, vendor, status').eq('studio_id', studioId).eq('status', 'pending'),
  ])
  return {
    maintenance: maint.data || [],
    escalations: esc.data || [],
    orders: ord.data || [],
  }
}

// Per-studio dedicated manager inbox for EOD reports. This REPLACES managers'
// personal emails — reports go to active owner-role users + this shared inbox.
const STUDIO_MANAGER_EMAIL = {
  WI0009: 'manager.wi0009@hotworx.net', // HOTWORX Pewaukee
  // WI0021: 'manager.wi0021@hotworx.net', // HOTWORX Madison — add when ready
}

// Recipients = active OWNER-role users + the studio's dedicated manager inbox.
async function getStudioRecipients(db, studioId) {
  if (!studioId) return { emails: [], studioName: null }
  const [{ data: members }, { data: inactive }, { data: studio }] = await Promise.all([
    db.from('user_studios').select('user_id, role').eq('studio_id', studioId).eq('role', 'owner'),
    db.from('user_profiles').select('id').eq('is_active', false),
    db.from('studios').select('name, code').eq('id', studioId).maybeSingle(),
  ])
  const inactiveIds = new Set((inactive || []).map(r => r.id))
  const emails = []
  for (const m of (members || [])) {
    if (inactiveIds.has(m.user_id)) continue
    const { data } = await db.auth.admin.getUserById(m.user_id)
    const email = data?.user?.email
    if (email && !emails.includes(email)) emails.push(email)
  }
  // Dedicated manager inbox (not individual managers' personal emails)
  const mgr = STUDIO_MANAGER_EMAIL[studio?.code]
  if (mgr && !emails.includes(mgr)) emails.push(mgr)
  return { emails, studioName: studio?.name || null }
}

async function sendEodEmail(dateStr, studioId) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Recipients = the studio's active owner + manager role users.
  // Falls back to OWNER_EMAIL / MANAGER_EMAIL env vars if none are found.
  const { emails, studioName } = await getStudioRecipients(db, studioId)
  const recipients = emails.length
    ? emails
    : [process.env.OWNER_EMAIL, process.env.MANAGER_EMAIL].filter(Boolean)

  if (!recipients.length) {
    console.log('[EOD Email] No recipients (no active owner/manager and no env fallback) — skipping')
    return
  }

  const { submissions, outreachByUser, tasksByUser } = await fetchSubmissionsForDate(dateStr, studioId)
  const ops = await fetchOpsSummary(db, studioId)
  const html = buildHtml(dateStr, submissions, outreachByUser, tasksByUser, ops)
  const studioLabel = studioName || process.env.STUDIO_NAME || 'HOTWORX Pewaukee'

  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  try {
    await sendViaBestAvailable({
      to: recipients,
      subject: `${studioLabel} — EOD Report ${dateLabel}`,
      html,
    })
    console.log(`[EOD Email] Sent for ${dateStr} to ${recipients.join(', ')}`)
  } catch (err) {
    console.error('[EOD Email] Send failed:', err.message)
  }
}

async function sendEmail({ to, subject, html }) {
  await sendViaBestAvailable({ to, subject, html })
}

// Diagnose the email setup and send a test message. Returns a plain-English result
// so the owner can see exactly what's wrong (no creds, bad password, no recipients…).
async function diagnoseEmail(studioId) {
  const result = {
    transport: hasSendgrid() ? 'sendgrid' : (hasGmail() ? 'gmail' : (process.env.RESEND_API_KEY ? 'resend' : 'none')),
    email_user: process.env.EMAIL_USER || null,
    sender: senderAddress(),
    has_password: !!process.env.EMAIL_PASS,
    password_length: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0,
    recipients: [],
    verified: false,
    sent: false,
    ok: false,
    working_port: null,
    message: '',
  }

  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { emails } = await getStudioRecipients(db, studioId)
    result.recipients = emails.length ? emails : [process.env.OWNER_EMAIL, process.env.MANAGER_EMAIL].filter(Boolean)
  } catch (e) { result.message = 'Could not load recipients: ' + e.message }

  // ── SendGrid (HTTPS — preferred; never hangs) ──────────────────────────────
  if (hasSendgrid()) {
    if (!result.recipients.length) {
      result.message = 'SendGrid is set, but there are no recipients to send to.'
      return result
    }
    try {
      await sendViaSendgrid({
        to: result.recipients,
        subject: 'HOTWORX Team Hub — Email test ✅',
        html: '<div style="font-family:sans-serif;font-size:15px;color:#1a1a1a"><p>🎉 <strong>Your EOD checkout email is working!</strong></p><p>Sent via SendGrid from the HOTWORX Team Hub. Mid and Closing checkout reports will now arrive here automatically.</p></div>',
      })
      result.verified = true; result.sent = true; result.ok = true
      result.message = `Test email sent via SendGrid to ${result.recipients.join(', ')}. Check inbox (and spam the first time).`
    } catch (e) {
      const m = (e.message || '').toLowerCase()
      if (m.includes('401') || m.includes('unauthorized')) result.message = 'SendGrid API key is invalid — re-copy the key into Railway as SENDGRID_API_KEY. Details: ' + e.message
      else if (m.includes('403') || m.includes('verif') || m.includes('from address') || m.includes('sender')) result.message = `SendGrid rejected the sender "${senderAddress()}" — verify it as a Single Sender in SendGrid (or set EMAIL_FROM to a verified address). Details: ` + e.message
      else result.message = 'SendGrid send failed: ' + e.message
    }
    return result
  }

  if (!hasGmail()) {
    result.message = 'No email is configured. Recommended: set SENDGRID_API_KEY (HTTPS — works on Railway). Details: SMTP (EMAIL_USER/EMAIL_PASS) is blocked on this host.'
    return result
  }

  // Try each port (with timeouts so we never hang). Report the first that connects.
  let lastErr = null
  for (const port of gmailPorts()) {
    try {
      const transport = buildGmailTransport(port)
      await transport.verify()
      result.verified = true
      result.working_port = port

      if (!result.recipients.length) {
        result.message = `Gmail login works (port ${port}) but there are no recipients to send to.`
        return result
      }
      await transport.sendMail({
        from: `"${process.env.STUDIO_NAME || 'HOTWORX Team Hub'}" <${process.env.EMAIL_USER}>`,
        to: result.recipients.join(', '),
        subject: 'HOTWORX Team Hub — Email test ✅',
        html: '<div style="font-family:sans-serif;font-size:15px;color:#1a1a1a"><p>🎉 <strong>Your EOD checkout email is working!</strong></p><p>This is a test from the HOTWORX Team Hub. If you can read this, Mid and Closing checkout reports will now arrive here automatically.</p></div>',
      })
      result.sent = true
      result.ok = true
      result.message = `Test email sent via port ${port} to ${result.recipients.join(', ')}. Check inbox (and spam the first time).`
      return result
    } catch (e) {
      lastErr = e
    }
  }

  // Both ports failed — classify the error for a clear next step.
  const msg = (lastErr?.message || '').toLowerCase()
  if (msg.includes('invalid login') || msg.includes('username and password') || msg.includes('badcredentials') || msg.includes('5.7.8')) {
    result.message = 'Gmail rejected the login — the App Password is wrong. Use the 16-char App Password (no spaces) from an account with 2-Step Verification ON. Details: ' + lastErr.message
  } else if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econn') || msg.includes('greeting')) {
    result.message = 'Could not connect to Gmail on port 465 or 587 — the host appears to be blocking outbound SMTP. We may need a different send method (e.g. an email API). Details: ' + lastErr.message
  } else {
    result.message = 'Gmail send failed on both ports. Details: ' + (lastErr?.message || 'unknown')
  }
  return result
}

module.exports = { sendEodEmail, sendEmail, diagnoseEmail }
