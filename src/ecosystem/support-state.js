// Amounts are represented in cents. The public build has no payment endpoint.
export const suggestedCents = Object.freeze([100,500,1000,2500,5000,10000]);
export const productionMode = 'DISABLED';
export function parseEuro(value) {
  const match=/^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(String(value).trim());
  if(!match)return null;
  const cents=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
  return cents>0?cents:null;
}
export function supportAction(mode,input,reviewThreshold=100000) {
  if(mode==='DISABLED')return {state:'disabled'};
  if(mode!=='SANDBOX')return {state:'approval-required'};
  const cents=parseEuro(input);
  if(cents===null)return {state:'invalid'};
  if(cents>=reviewThreshold)return {state:'contact'};
  return {state:'sandbox-preview',cents,currency:'EUR'};
}

// Opens a draft in the visitor's email app. Sending remains a separate action.
export function supportInquiryHref(address, subject, amountLabel, lang, cents = null) {
  const href = 'mailto:' + address + '?subject=' + encodeURIComponent(subject);
  if (!Number.isSafeInteger(cents) || cents <= 0) return href;
  const amount = new Intl.NumberFormat(lang, {style:'currency', currency:'EUR'}).format(cents / 100);
  return href + '&body=' + encodeURIComponent(amountLabel + ' · ' + amount);
}

export function parseSupportEstimate(value) {
  const digits = value.normalize('NFKC').replace(/[٠-٩۰-۹]/g, digit => String(digit.codePointAt(0) & 15));
  return parseEuro(digits.replace('٫', '.'));
}
