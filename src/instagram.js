export const instagramUsername = 'visionoir_';

export async function copyInstagramUsername(field, browser = navigator) {
  try {
    await browser.clipboard.writeText(field.value);
    return 'instagramCopied';
  } catch {
    field.focus({preventScroll:true});
    field.select();
    field.setSelectionRange(0,field.value.length);
    return 'instagramManual';
  }
}
