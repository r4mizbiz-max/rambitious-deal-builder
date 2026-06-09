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

    // deal fields (token flow). Legacy posts omit these → fall back to old $997/PPSA copy.
    var dealType  = String(data.dealType  || 'legacy').trim();
    var upfront   = String(data.upfront   || '997').trim();
    var perAppt   = String(data.perAppt   || rate || '').trim();
    var estimates = String(data.estimates || '').trim();
    var minDaily  = String(data.minDaily  || '').trim();
    var days      = String(data.days      || '').trim();
    var isPif = (dealType === 'pif');
    var upfrontLabel = isPif ? ('$' + upfront + ' paid in full') : ('$' + upfront + ' one-time at signing');
    var rateLabel = isPif
      ? (estimates + ' qualified estimates in ' + days + ' days &middot; client-funded ad spend (min $' + minDaily + '/day)')
      : ('$' + perAppt + ' per showed appointment' + (dealType === 'payg' ? ' &middot; client-funded ad spend' : ''));

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

    // 8. Send admin email
    stage = 'send-admin-email';
    var dealLabel = isPif ? 'Pay in Full' : (dealType === 'payg' ? 'Pay as you go' : 'Legacy');
    var subject = 'New Signed Agreement — ' + businessName + ' (' + dealLabel + ')';
    var plainBody =
        'New Signed Agreement — ' + businessName + '\n\n' +
        'Business:    ' + businessName + '\n' +
        'Signer:      ' + fullName + '\n' +
        'Email:       ' + email + '\n' +
        'Niche:       ' + niche + '\n' +
        'Deal:        ' + dealLabel + '\n' +
        'Upfront:     ' + upfrontLabel.replace(/&middot;/g, '·') + '\n' +
        'Terms:       ' + rateLabel.replace(/&middot;/g, '·') + '\n' +
        'Signed:      ' + signedAtPretty + '\n\n' +
        'PDF: ' + fileUrl;
    var htmlBody = buildAdminHtml(businessName, fullName, email, niche, upfrontLabel, rateLabel, signedAtPretty, fileUrl);

    GmailApp.sendEmail(NOTIFY_EMAIL, subject, plainBody, {
      name: FROM_NAME,
      htmlBody: htmlBody,
      attachments: [pdfBlob],
      replyTo: email
    });
    Logger.log('Admin email sent.');

    // 9. Send customer email (their copy of the signed agreement)
    stage = 'send-customer-email';
    var custSubject = 'Welcome to Rambitious Media — Your Signed Agreement';
    var custPlain =
        'Hi ' + (fullName.split(' ')[0] || 'there') + ',\n\n' +
        'Welcome to Rambitious Media. Your fully-executed Client Services Agreement is attached for your records.\n\n' +
        'Business:               ' + businessName + '\n' +
        'Niche:                  ' + niche + '\n' +
        'Upfront:                ' + upfrontLabel.replace(/&middot;/g, '·') + '\n' +
        'Terms:                  ' + rateLabel.replace(/&middot;/g, '·') + '\n' +
        'Signed:                 ' + signedAtPretty + '\n\n' +
        'WHAT HAPPENS NEXT\n' +
        '1. Your account manager will reach out within 24 hours.\n' +
        '2. We will set up your campaign, ad creative, and calendar integration.\n' +
        '3. Your first showed appointments will start hitting your calendar within 5–10 business days.\n\n' +
        'Questions? Just reply to this email — it goes straight to Ramiz.\n\n' +
        '— The Rambitious Media Team';
    var custHtml = buildCustomerHtml(businessName, fullName, email, niche, upfrontLabel, rateLabel, signedAtPretty);

    GmailApp.sendEmail(email, custSubject, custPlain, {
      name: FROM_NAME,
      htmlBody: custHtml,
      attachments: [pdfBlob],
      replyTo: NOTIFY_EMAIL
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

function buildAdminHtml(businessName, fullName, email, niche, upfrontLabel, rateLabel, signedAtPretty, fileUrl) {
  var bn = esc(businessName);
  var fn = esc(fullName);
  var em = esc(email);
  var ni = esc(niche);
  var sa = esc(signedAtPretty);
  var fu = esc(fileUrl);

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#1a1d26;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7B5BFF 0%,#B57BFF 35%,#F580B8 70%,#FF9A6B 100%);padding:28px 32px;">
          <div style="font-size:11px;letter-spacing:0.16em;color:rgba(255,255,255,0.82);text-transform:uppercase;font-weight:600;margin-bottom:6px;">Rambitious Media</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;line-height:1.2;">New Signed Agreement</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-size:14px;color:#5a6172;line-height:1.55;margin:0 0 22px;">A new client just signed the Rambitious Media Client Services Agreement. The fully-executed PDF is attached and saved to your Drive folder.</div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
            ${row('Business', '<strong>' + bn + '</strong>', true)}
            ${row('Signer', fn)}
            ${row('Email', '<a href="mailto:' + em + '" style="color:#7B5BFF;text-decoration:none;">' + em + '</a>')}
            ${row('Niche', ni)}
            ${row('Upfront', '<strong>' + upfrontLabel + '</strong>')}
            ${row('Terms', rateLabel)}
            ${row('Signed', sa, false, true)}
          </table>

          <div style="margin:24px 0 8px;">
            <a href="${fu}" style="display:inline-block;background:linear-gradient(135deg,#7B5BFF 0%,#B57BFF 60%,#F580B8 100%);color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">View signed PDF in Drive →</a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 32px 28px;border-top:1px solid #ececea;font-size:12px;color:#8b8f9b;line-height:1.55;">PDF is attached to this email and stored in your Drive folder.</td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildCustomerHtml(businessName, fullName, email, niche, upfrontLabel, rateLabel, signedAtPretty) {
  var firstName = (String(fullName).split(' ')[0] || 'there');
  var bn = esc(businessName);
  var fn = esc(firstName);
  var ni = esc(niche);
  var sa = esc(signedAtPretty);

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0b10;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#1a1d26;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b10;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.45);">

        <!-- Gradient header -->
        <tr><td style="background:linear-gradient(135deg,#7B5BFF 0%,#B57BFF 35%,#F580B8 70%,#FF9A6B 100%);padding:44px 40px 36px;text-align:center;">
          <div style="font-size:11px;letter-spacing:0.22em;color:rgba(255,255,255,0.85);text-transform:uppercase;font-weight:600;margin-bottom:14px;">Rambitious Media</div>
          <div style="font-size:32px;color:#ffffff;font-weight:700;line-height:1.1;letter-spacing:-0.01em;margin-bottom:10px;">Welcome to the team, ${fn}.</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.85);line-height:1.5;max-width:460px;margin:0 auto;">Your agreement is signed. Time to start filling that calendar.</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 40px 8px;">

          <div style="font-size:15px;color:#3b3f4a;line-height:1.65;margin:0 0 24px;">A copy of your fully-executed <strong>Rambitious Media Client Services Agreement</strong> is attached to this email — keep it safe for your records. We have a copy on our end too.</div>

          <!-- Agreement summary card -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#faf9f7;border-radius:12px;padding:0;margin:0 0 28px;">
            <tr><td style="padding:20px 22px 8px;">
              <div style="font-size:10px;color:#7B5BFF;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;margin-bottom:8px;">Agreement Summary</div>
            </td></tr>
            <tr><td style="padding:0 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                ${custRow('Business', '<strong style="color:#1a1d26;">' + bn + '</strong>')}
                ${custRow('Niche', ni)}
                ${custRow('Upfront', '<strong>' + upfrontLabel + '</strong>')}
                ${custRow('Terms', rateLabel)}
                ${custRow('Signed', sa, true)}
              </table>
            </td></tr>
            <tr><td style="padding:8px 22px 20px;">
              <div style="font-size:11px;color:#8b8f9b;line-height:1.5;">The upfront fee covers campaign setup, ad creative, and onboarding and is non-refundable. Advertising spend is funded directly by you and managed on your behalf. Full terms are in your attached agreement.</div>
            </td></tr>
          </table>

          <!-- What happens next -->
          <div style="font-size:18px;font-weight:700;color:#1a1d26;letter-spacing:-0.005em;margin:0 0 14px;">What happens next</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:#3b3f4a;line-height:1.65;">
            ${stepRow('1', 'Your dedicated account manager will reach out within <strong>24 hours</strong> to kick things off.')}
            ${stepRow('2', 'We&rsquo;ll set up your ad campaign, creative, calendar, and lead-routing — fully done-for-you.')}
            ${stepRow('3', 'Your first <strong>showed appointments</strong> start hitting your calendar within <strong>5–10 business days</strong>.')}
          </table>

          <!-- Reply-to-Ramiz callout -->
          <div style="margin:32px 0 8px;padding:20px 22px;background:#f4f1ec;border-radius:12px;border-left:3px solid #7B5BFF;">
            <div style="font-size:14px;color:#1a1d26;line-height:1.6;font-weight:600;margin-bottom:4px;">Questions? Just reply to this email.</div>
            <div style="font-size:13px;color:#5a6172;line-height:1.6;">It goes straight to Ramiz. We are real humans and we reply fast.</div>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:28px 40px 36px;border-top:1px solid #ececea;text-align:center;">
          <div style="font-size:12px;color:#8b8f9b;line-height:1.6;margin-bottom:6px;"><strong style="color:#3b3f4a;">Rambitious Media</strong> &middot; a Rambitious LLC brand</div>
          <div style="font-size:11px;color:#aab0bd;line-height:1.6;">This email contains your signed Client Services Agreement. Please keep it for your records.</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function custRow(label, value, isLast) {
  var border = isLast ? '' : 'border-bottom:1px solid #e8e6e1;';
  return ''
    + '<tr>'
    +   '<td style="padding:11px 0;' + border + 'color:#7a808f;width:170px;font-size:13px;">' + label + '</td>'
    +   '<td style="padding:11px 0;' + border + 'color:#1a1d26;font-size:13px;">' + value + '</td>'
    + '</tr>';
}

function stepRow(num, text) {
  return ''
    + '<tr>'
    +   '<td style="padding:8px 0;vertical-align:top;width:32px;">'
    +     '<div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#7B5BFF 0%,#F580B8 100%);color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:24px;">' + num + '</div>'
    +   '</td>'
    +   '<td style="padding:10px 0 8px 12px;color:#3b3f4a;line-height:1.6;">' + text + '</td>'
    + '</tr>';
}

function row(label, value, isFirst, isLast) {
  var topBorder    = 'border-top:1px solid #ececea;';
  var bottomBorder = isLast ? 'border-bottom:1px solid #ececea;' : '';
  return ''
    + '<tr>'
    +   '<td style="padding:10px 0;' + topBorder + bottomBorder + 'color:#8b8f9b;width:120px;">' + label + '</td>'
    +   '<td style="padding:10px 0;' + topBorder + bottomBorder + 'color:#1a1d26;">' + value + '</td>'
    + '</tr>';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
