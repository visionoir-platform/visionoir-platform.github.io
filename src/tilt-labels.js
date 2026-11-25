// Optional system motion permission in devices that require it.
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
export function tiltLabels(lang) {
  const [tiltEnable, tiltUnavailable] = labels[lang] || labels[lang.split('-')[0]] || labels.it;
  return { tiltEnable, tiltUnavailable };
}
