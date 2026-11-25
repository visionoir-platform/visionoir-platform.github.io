// Permission controls and the keyboard/touch alternative for the logo material.
const labels = {
  it: ['Attiva il movimento del dispositivo', 'Sensore non disponibile'],
  en: ['Enable device tilt', 'Sensor unavailable'],
  es: ['Activar inclinación del dispositivo', 'Sensor no disponible'],
  ru: ['Включить управление наклоном', 'Датчик недоступен'],
  de: ['Neigungssteuerung aktivieren', 'Sensor nicht verfügbar'],
  'zh-Hans': ['启用设备倾斜控制', '传感器不可用'],
  ja: ['端末の傾きで操作する', 'センサーを利用できません'],
  'pt-BR': ['Ativar controle por inclinação', 'Sensor indisponível'],
  'pt-PT': ['Ativar controlo por inclinação', 'Sensor indisponível'],
  ko: ['기기 기울기로 조작', '센서를 사용할 수 없습니다'],
  pl: ['Włącz sterowanie przechyłem', 'Czujnik niedostępny'],
  fr: ['Activer le contrôle par inclinaison', 'Capteur indisponible'],
  uk: ['Увімкнути керування нахилом', 'Датчик недоступний'],
  ar: ['تفعيل التحكم بإمالة الجهاز', 'المستشعر غير متاح'],
  sw: ['Washa udhibiti kwa kuinamisha kifaa', 'Kihisi hakipatikani'],
  'rm-CH': ['Activar il moviment cun inclinar l’apparat', 'Sensor betg disponibel'],
};
const shake = {
  it: ['Attiva lo shake', 'Scuotimento non disponibile', 'Logo in negativo'],
  en: ['Enable shake control', 'Shake control unavailable', 'Negative logo'],
  es: ['Activar el control por sacudida', 'Control por sacudida no disponible', 'Logo en negativo'],
  ru: ['Включить управление встряхиванием', 'Управление встряхиванием недоступно', 'Логотип в негативе'],
  de: ['Schüttelsteuerung aktivieren', 'Schüttelsteuerung nicht verfügbar', 'Logo im Negativ'],
  'zh-Hans': ['启用摇动控制', '摇动控制不可用', '负片标志'],
  ja: ['シェイク操作を有効にする', 'シェイク操作を利用できません', 'ロゴのネガ表示'],
  'pt-BR': ['Ativar controle por agitação', 'Controle por agitação indisponível', 'Logo em negativo'],
  'pt-PT': ['Ativar controlo por agitação', 'Controlo por agitação indisponível', 'Logótipo em negativo'],
  ko: ['흔들기 제어 켜기', '흔들기 제어를 사용할 수 없습니다', '로고 색상 반전'],
  pl: ['Włącz sterowanie potrząśnięciem', 'Sterowanie potrząśnięciem jest niedostępne', 'Logo w negatywie'],
  fr: ['Activer la commande par secousse', 'Commande par secousse indisponible', 'Logo en négatif'],
  uk: ['Увімкнути керування струшуванням', 'Керування струшуванням недоступне', 'Логотип у негативі'],
  ar: ['تفعيل التحكم بالهز', 'التحكم بالهز غير متاح', 'عكس ألوان الشعار'],
  sw: ['Washa udhibiti kwa kutikisa', 'Udhibiti kwa kutikisa haupatikani', 'Geuza rangi za nembo'],
  'rm-CH': ['Activar la controlla cun scurlattar', 'Controlla cun scurlattar betg disponibla', 'Logo en negativ'],
};
export function tiltLabels(lang) {
  const [tiltEnable, tiltUnavailable] = labels[lang] || labels[lang.split('-')[0]] || labels.it;
  const [shakeEnable, shakeUnavailable, negativeLogo] = shake[lang] || shake[lang.split('-')[0]] || shake.it;
  return { tiltEnable, tiltUnavailable, shakeEnable, shakeUnavailable, negativeLogo };
}
