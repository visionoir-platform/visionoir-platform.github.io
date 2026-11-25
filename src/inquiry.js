import { contact, money, servicePrices } from './site.js';

export const privacyVersion = '2026-11-25';
export function inquiryReceipt(value, id) {
  return value?.ok === true && value.status === 'accepted' && value.requestId === id;
}
function makeRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
    '-',
  );
}
function configuredEndpoint(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw, location.origin);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function bindInquiry({ endpoint: rawEndpoint, getLocale, t, base }) {
  const endpoint = configuredEndpoint(rawEndpoint),
    form = document.querySelector('#brief-form');
  const dialog = document.querySelector('#brief-dialog'),
    review = document.querySelector('#brief-text');
  const send = document.querySelector('#send-brief'),
    status = document.querySelector('#brief-status');
  const delivery = document.querySelector('#inquiry-mode'),
    notice = document.querySelector('#request-privacy');
  const moneyInfo = document.querySelector('#brief-price'),
    manual = document.querySelector('#mail-brief');
  let draft,
    snapshot,
    requestId,
    phase = 'review',
    submittedLocale;
  const unpack = () => ({
    ...Object.fromEntries(
      ['name', 'email', 'service', 'message', 'organization', 'companyUrl'].map((k) => [
        k,
        form.elements[k].value.trim(),
      ]),
    ),
    researchAllowed: form.elements.researchAllowed.checked,
  });
  const nameOf = (service) => t(service ? service + 'Name' : 'undecided');
  const priceOf = (service) => {
    if (!service) return t('undecided');
    if (servicePrices[service] == null) return t('packXPrice');
    return (
      money(getLocale(), servicePrices[service]) + (service === 'retainer' ? ' · ' + t('month') : '')
    );
  };
  function summary() {
    if (!draft) return '';
    return [
      t('inquiryReview'),
      '',
      t('name') + ' · ' + draft.name,
      t('email') + ' · ' + draft.email,
      t('service') + ' · ' + nameOf(draft.service),
      t('inquiryPrice') + ' · ' + priceOf(draft.service),
      ...(draft.organization ? [t('inquiryOrg') + ' · ' + draft.organization] : []),
      ...(draft.companyUrl ? [t('inquiryCompanyUrl') + ' · ' + draft.companyUrl] : []),
      t(draft.researchAllowed ? 'inquiryResearch' : 'inquiryResearchOff'),
      '',
      t('message'),
      draft.message,
    ].join('\n');
  }
  function refresh() {
    delivery.textContent = t(endpoint ? 'inquiryDirect' : 'inquiryManual');
    notice.href = base + 'legal/' + getLocale().toLowerCase() + '/#requests';
    moneyInfo.textContent = t('inquiryPrice') + ' · ' + priceOf(form.elements.service.value);
    if (!draft) return;
    review.textContent = summary();
    send.hidden = !endpoint || phase === 'accepted';
    send.disabled = phase === 'sending';
    send.textContent = t(phase === 'error' ? 'inquiryRetry' : 'inquirySend');
    manual.hidden = !!endpoint && phase !== 'error';
    manual.href = 'mailto:' + contact;
    status.textContent = t(
      { sending: 'inquirySending', accepted: 'inquiryReceived', error: 'inquiryFailed' }[phase] ||
        (!endpoint ? 'inquiryManual' : 'inquiryDirect'),
    );
    dialog.setAttribute('aria-busy', String(phase === 'sending'));
  }
  function validate(field, key) {
    const output = document.querySelector('#error-' + field);
    output.textContent = key ? t(key) : '';
    if (key) output.dataset.error = key;
    else delete output.dataset.error;
    form.elements[field].setAttribute('aria-invalid', String(Boolean(key)));
  }
  for (const field of ['name', 'email', 'message', 'organization', 'companyUrl'])
    form.elements[field].addEventListener('input', () => validate(field));
  form.elements.service.addEventListener('change', refresh);
  document.querySelectorAll('[data-service]').forEach((link) =>
    link.addEventListener('click', () => {
      form.elements.service.value = link.dataset.service;
      refresh();
    }),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = unpack();
    const errors = {
      name: next.name ? '' : 'invalidName',
      email: next.email && form.elements.email.validity.valid ? '' : 'invalidEmail',
      message: next.message.length >= 10 ? '' : 'invalidMessage',
    };
    const officialSite = /^https:\/\/(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?:\/[A-Za-z0-9._~%/-]*)?\/?$/i;
    if(next.companyUrl&&!officialSite.test(next.companyUrl))errors.companyUrl='inquiryBadUrl';
    if(next.researchAllowed){
      if(!next.organization)errors.organization='inquiryMissingBusiness';
      if(!next.companyUrl)errors.companyUrl='inquiryMissingBusiness';
    }
    for (const [field, key] of Object.entries(errors)) validate(field, key);
    const first = Object.keys(errors).find((k) => errors[k]);
    if (first) {
      form.elements[first].focus();
      return;
    }
    const signature = JSON.stringify(next);
    if (signature !== snapshot) {
      draft = next;
      snapshot = signature;
      requestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : makeRequestId();
      phase = 'review';
      submittedLocale = null;
    }
    refresh();
    dialog.showModal();
  });
  send.addEventListener('click', async () => {
    if (!draft || !endpoint || phase === 'sending' || phase === 'accepted') return;
    const id = requestId;
    submittedLocale ??= getLocale();
    phase = 'sending';
    refresh();
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const result = await fetch(endpoint, {
        method: 'POST',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'application/json' },
        body: JSON.stringify({
          ...draft,
          service: draft.service || 'undecided',
          locale: submittedLocale,
          requestId: id,
          privacyVersion,
        }),
      });
      let receipt = null;
      if (result.ok && result.headers.get('content-type')?.includes('application/json'))
        receipt = await result.json();
      if (id === requestId) phase = inquiryReceipt(receipt, id) ? 'accepted' : 'error';
    } catch {
      if (id === requestId) phase = 'error';
    } finally {
      clearTimeout(timeout);
      if (id === requestId) refresh();
    }
  });
  document.querySelector('#close-brief').addEventListener('click', () => dialog.close());
  document.querySelector('#copy-brief').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(summary());
      document.querySelector('#brief-copy-status').textContent = t('copied');
    } catch {
      document.querySelector('#brief-copy-status').textContent = t('copyError');
    }
  });
  document.querySelector('#download-brief').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([summary()], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'VISIONOIR-brief.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  dialog.addEventListener('close', () => {
    document.querySelector('#brief-copy-status').textContent = '';
  });
  refresh();
  return { refresh };
}
