/**
 * Rambitious Media — Signed Agreement Handler
 *
 * SETUP:
 * 1. Confirm FOLDER_ID below is your Drive folder ID.
 * 2. Run testSetup() once to verify Drive + Gmail permissions.
 * 3. Deploy → Manage deployments → ⚙️ → Edit → Version: NEW VERSION → Deploy.
 *    (Otherwise your code changes don't go live!)
 *
 * DEBUG: Apps Script editor → Executions (left sidebar) → click any failed run to see stage + error.
 */

const FOLDER_ID    = '1usrjHlkAmsOcuLdbKq6aSG_P95HVZ15k';
const NOTIFY_EMAIL = 'ram@rambitiousmedia.com';
const FROM_NAME    = 'Rambitious Media';

/**
 * Manual smoke-test. Run from the editor.
 */
function testSetup() {
  Logger.log('--- testSetup start ---');
  const folder = DriveApp.getFolderById(FOLDER_ID);
  Logger.log('Drive folder OK: ' + folder.getName());
  const blob = Utilities.newBlob('Rambitious test — safe to delete.', 'text/plain', 'rambitious-test.txt');
  const f = folder.createFile(blob);
  Logger.log('Test file: ' + f.getUrl());
  GmailApp.sendEmail(NOTIFY_EMAIL, 'Rambitious test OK', 'Setup works. Test file: ' + f.getUrl(), { name: FROM_NAME });
  Logger.log('Email sent to ' + NOTIFY_EMAIL);
  Logger.log('--- testSetup end OK ---');
}

/**
 * doGet — also serves the Deal Link Builder's "Mint via Whop" call (JSONP),
 * because Apps Script Web Apps can't return CORS headers.
 * Generator calls: ?action=createPlan&price=6000&label=...&callback=__planN
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'createPlan') {
    var out = createWhopPlan(p.price, p.label);
    if (p.callback) {
      return ContentService.createTextOutput(p.callback + '(' + JSON.stringify(out) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput('Rambitious Agreement Handler — POST only. If you see this, the Web App is deployed.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Create a one-time Whop plan for an arbitrary price (used by the Deal Link Builder).
 * Requires Script Properties: WHOP_API_KEY (apik_...) and WHOP_PRODUCT_ID (prod_...).
 * Set them in: Project Settings (gear) → Script Properties.
 */
function createWhopPlan(price, label) {
  try {
    var props   = PropertiesService.getScriptProperties();
    var key     = props.getProperty('WHOP_API_KEY');
    var product = props.getProperty('WHOP_PRODUCT_ID');
    if (!key)     return { ok: false, error: 'WHOP_API_KEY not set in Script Properties' };
    if (!product) return { ok: false, error: 'WHOP_PRODUCT_ID not set in Script Properties' };
    if (!price)   return { ok: false, error: 'missing price' };

    var payload = {
      product_id: product,
      plan_type: 'one_time',
      release_method: 'buy_now',
      initial_price: Number(price),
      base_currency: 'usd',
      visibility: 'quick_link',
      internal_notes: label ? decodeURIComponent(label) : 'Rambitious deal link'
    };
    var res = UrlFetchApp.fetch('https://api.whop.com/v2/plans', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var data = JSON.parse(res.getContentText());
    if (data && data.id) {
      return { ok: true, plan_id: data.id, link: (data.direct_link || ('https://whop.com/checkout/' + data.id)) };
    }
    return { ok: false, error: (data && data.error && data.error.message) || res.getContentText().slice(0, 200) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function doPost(e) {
  var stage = 'init';
  try {
    Logger.log('=== POST received ===');

    // 1. Validate request
    stage = 'validate-request';
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No POST body');
    }

    // 2. Parse JSON
    stage = 'parse-json';
    var data = JSON.parse(e.postData.contents);

    // 3. Extract & validate fields
    stage = 'extract-fields';
    var businessName   = String(data.businessName   || '').trim();
    var fullName       = String(data.fullName       || '').trim();
    var email          = String(data.email          || '').trim();
    var niche          = String(data.niche          || '').trim();
    var rate           = String(data.rate           || '').trim();
    var signedAtPretty = String(data.signedAtPretty || new Date().toString()).trim();
    var pdfBase64      = String(data.pdfBase64      || '').trim();

    // deal fields (token flow). Legacy posts omit these.
    var dealType  = String(data.dealType  || 'legacy').trim();
    var upfront   = String(data.upfront   || '997').trim();
    var perAppt   = String(data.perAppt   || rate || '').trim();
    var estimates = String(data.estimates || '').trim();
    var minDaily  = String(data.minDaily  || '').trim();
    var days      = String(data.days      || '').trim();
    var phone     = String(data.phone     || '').trim();
    var address   = String(data.address   || '').trim();
    var signers   = String(data.signers   || '1').trim();
    var isProgram = (estimates !== '' && estimates !== '0');

    // Executed terms (rendered as a formal table in the emails).
    var terms = isProgram ? [
      ['Appointment Package Fee', '$' + upfront + ' USD — one-time, paid in full on signing'],
      ['Appointments Guaranteed', estimates + ' Verified Seated Appointments'],
      ['Guarantee Period', days + ' calendar days from Campaign Launch Date'],
      ['Advertising Spend', '$' + minDaily + ' USD per day — funded by Customer, invoiced weekly'],
      ['Per-Appointment Valuation', '$' + perAppt + ' USD (shortfall refund basis)']
    ] : [
      ['Upfront Service Fee', '$' + upfront + ' USD — one-time at signing'],
      ['Per-Appointment Fee', '$' + perAppt + ' USD per showed appointment'],
      ['Advertising Spend', '$' + minDaily + ' USD per day — funded by Customer']
    ];

    if (!businessName) throw new Error('Missing businessName');
    if (!fullName)     throw new Error('Missing fullName');
    if (!email)        throw new Error('Missing email');
    if (!pdfBase64)    throw new Error('Missing pdfBase64');

    Logger.log('Payload OK — ' + businessName + ' / ' + fullName + ' / ' + email + ' / ' + niche);

    // 4. Decode PDF
    stage = 'decode-pdf';
    var pdfBytes = Utilities.base64Decode(pdfBase64);
    Logger.log('Decoded PDF bytes: ' + pdfBytes.length);

    // 5. Build filename
    stage = 'build-filename';
    var tz = Session.getScriptTimeZone();
    if (!tz) tz = 'America/Los_Angeles';
    var dateStr = Utilities.formatDate(new Date(), tz, 'MMMM d yyyy');
    var safeBiz = businessName.replace(/[\\\/:*?"<>|]/g, '').trim();
    var fileName = safeBiz + ' - Rambitious Media Service Agreement - ' + dateStr + '.pdf';
    Logger.log('Filename: ' + fileName);

    // 6. Create blob
    stage = 'create-blob';
    var pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', fileName);

    // 7. Save to Drive
    stage = 'save-to-drive';
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var file = folder.createFile(pdfBlob);
    var fileUrl = file.getUrl();
    Logger.log('Saved to Drive: ' + fileUrl);

    var termsPlain = terms.map(function (t) { return '  ' + t[0] + ': ' + t[1]; }).join('\n');

    // 8. Send admin email
    stage = 'send-admin-email';
    var subject = 'Executed Service Agreement — ' + businessName;
    var plainBody =
        'EXECUTED SERVICE AGREEMENT\n\n' +
        'Business:   ' + businessName + '\n' +
        'Signer:     ' + fullName + '\n' +
        'Email:      ' + email + '\n' +
        (phone ? 'Phone:      ' + phone + '\n' : '') +
        (address ? 'Address:    ' + address + '\n' : '') +
        'Executed:   ' + signedAtPretty + '\n\n' +
        'EXECUTED TERMS\n' + termsPlain + '\n\n' +
        'Fully-executed PDF: ' + fileUrl;
    var htmlBody = buildAdminHtml(businessName, fullName, email, phone, address, terms, signedAtPretty, fileUrl);

    GmailApp.sendEmail(NOTIFY_EMAIL, subject, plainBody, {
      name: FROM_NAME, htmlBody: htmlBody, attachments: [pdfBlob], replyTo: email
    });
    Logger.log('Admin email sent.');

    // 9. Send customer email (their executed counterpart)
    stage = 'send-customer-email';
    var custSubject = 'Your Executed Service Agreement — Rambitious LLC';
    var custPlain =
        'Dear ' + (fullName.split(' ')[0] || 'Sir or Madam') + ',\n\n' +
        'Attached is a fully-executed copy of the Service Agreement (Guaranteed Appointment Delivery Program) entered into between RAMBITIOUS LLC, doing business as Rambitious Media, and ' + businessName + ', executed on ' + signedAtPretty + '. Please retain it for your records.\n\n' +
        'EXECUTED TERMS\n' + termsPlain + '\n\n' +
        'This email and the attached PDF together constitute the parties’ executed agreement. Should you have any questions, please reply to this email.\n\n' +
        'RAMBITIOUS LLC\nDoing Business As Rambitious Media\n41690 Enterprise Cir N, Temecula, CA 92592, United States';
    var custHtml = buildCustomerHtml(businessName, fullName, email, phone, address, terms, signedAtPretty);

    GmailApp.sendEmail(email, custSubject, custPlain, {
      name: FROM_NAME, htmlBody: custHtml, attachments: [pdfBlob], replyTo: NOTIFY_EMAIL
    });
    Logger.log('Customer email sent to ' + email);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, url: fileUrl }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var msg = '[stage: ' + stage + '] ' + (err && err.message ? err.message : err);
    Logger.log('ERROR: ' + msg);
    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: 'Rambitious Agreement — submission FAILED',
        body: 'A signing attempt failed.\n\n' + msg + '\n\nCheck Apps Script Executions log.'
      });
    } catch (_) {}
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err), stage: stage }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* legal-style email helpers */
function trow(label, value, last) {
  var b = last ? '' : 'border-bottom:1px solid #e3e6ec;';
  return '<tr><td style="padding:10px 0;' + b + 'color:#5a6373;width:200px;font-size:13px;">' + label + '</td>'
       + '<td style="padding:10px 0;' + b + 'color:#1a1f2e;font-size:13px;">' + value + '</td></tr>';
}
function letterhead() {
  return '<tr><td style="padding:30px 40px 18px;border-bottom:2px solid #1f3a5f;">'
    + '<div style="font-size:20px;font-weight:bold;color:#1f3a5f;letter-spacing:.02em;">RAMBITIOUS LLC</div>'
    + '<div style="font-size:12px;color:#6b7280;margin-top:3px;">Doing Business As Rambitious Media &middot; 41690 Enterprise Cir N, Temecula, CA 92592, United States</div>'
    + '</td></tr>';
}
function termsTable(terms) {
  var rows = terms.map(function (t, i) { return trow(t[0], t[1], i === terms.length - 1); }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + rows + '</table>';
}

function buildAdminHtml(businessName, fullName, email, phone, address, terms, signedAtPretty, fileUrl) {
  var bn=esc(businessName), fn=esc(fullName), em=esc(email), ph=esc(phone||'—'), ad=esc(address||'—'), sa=esc(signedAtPretty), fu=esc(fileUrl);
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef0f4;font-family:Georgia,'Times New Roman',serif;color:#1a1f2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:30px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #d7dbe3;">
      ${letterhead()}
      <tr><td style="padding:26px 40px 8px;">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#1f3a5f;font-weight:bold;">Counterpart Notice</div>
        <div style="font-size:21px;font-weight:bold;color:#1f3a5f;margin:6px 0 14px;">Executed Service Agreement</div>
        <div style="font-size:13.5px;color:#3b4252;line-height:1.6;margin-bottom:20px;">A counterpart of the Service Agreement (Guaranteed Appointment Delivery Program) has been executed by the Customer identified below. The fully-executed PDF is attached and stored in the Drive folder.</div>
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#1f3a5f;font-weight:bold;margin-bottom:4px;">Customer</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
          ${trow('Business Name','<strong>'+bn+'</strong>')}
          ${trow('Signatory',fn)}
          ${trow('Email','<a href="mailto:'+em+'" style="color:#1f3a5f;">'+em+'</a>')}
          ${trow('Phone',ph)}
          ${trow('Address',ad)}
          ${trow('Executed',sa,true)}
        </table>
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#1f3a5f;font-weight:bold;margin-bottom:4px;">Executed Terms</div>
        ${termsTable(terms)}
        <div style="margin:22px 0 6px;"><a href="${fu}" style="display:inline-block;background:#1f3a5f;color:#fff;text-decoration:none;padding:11px 20px;font-size:13px;">View fully-executed PDF →</a></div>
      </td></tr>
      <tr><td style="padding:16px 40px 26px;border-top:1px solid #e3e6ec;font-size:11px;color:#8b909c;line-height:1.55;">Confidential. The attached PDF is the parties&rsquo; executed agreement and is stored in the Drive folder.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function buildCustomerHtml(businessName, fullName, email, phone, address, terms, signedAtPretty) {
  var first=(String(fullName).split(' ')[0]||'Sir or Madam');
  var bn=esc(businessName), fn=esc(fullName), fi=esc(first), em=esc(email), ph=esc(phone||'—'), ad=esc(address||'—'), sa=esc(signedAtPretty);
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef0f4;font-family:Georgia,'Times New Roman',serif;color:#1a1f2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:30px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #d7dbe3;">
      ${letterhead()}
      <tr><td style="padding:30px 44px 8px;">
        <div style="font-size:22px;font-weight:bold;color:#1f3a5f;margin-bottom:16px;">Executed Service Agreement</div>
        <div style="font-size:14px;color:#2b3242;line-height:1.7;margin-bottom:8px;">Dear ${fi},</div>
        <div style="font-size:14px;color:#2b3242;line-height:1.7;margin-bottom:18px;">Attached is a fully-executed copy of the <strong>Service Agreement (Guaranteed Appointment Delivery Program)</strong> entered into between <strong>RAMBITIOUS LLC</strong>, doing business as Rambitious Media, and <strong>${bn}</strong>, executed on ${sa}. Please retain this copy for your records.</div>
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#1f3a5f;font-weight:bold;margin-bottom:4px;">Parties &amp; Execution</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
          ${trow('Customer','<strong>'+bn+'</strong>')}
          ${trow('Signatory',fn)}
          ${trow('Email',em)}
          ${trow('Phone',ph)}
          ${trow('Address',ad)}
          ${trow('Date Executed',sa,true)}
        </table>
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#1f3a5f;font-weight:bold;margin-bottom:4px;">Executed Terms</div>
        ${termsTable(terms)}
        <div style="font-size:13px;color:#3b4252;line-height:1.7;margin:20px 0 6px;">This email and the attached PDF together constitute the parties&rsquo; executed agreement. Should you have any questions, please reply to this email.</div>
      </td></tr>
      <tr><td style="padding:20px 44px 30px;border-top:1px solid #e3e6ec;font-size:11px;color:#8b909c;line-height:1.6;">
        <strong style="color:#3b4252;">RAMBITIOUS LLC</strong> &middot; Doing Business As Rambitious Media<br>41690 Enterprise Cir N, Temecula, CA 92592, United States<br>Confidential — please retain for your records.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
