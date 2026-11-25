// Preset and instrument names are intentionally stable across live rigs.
const strings = {
  en: 'Visual scene|Visual rack|Freeze|Reduce motion|Fullscreen|Projector window|Trigger|Auto scene|Reset|Variation|Beat sync|Control|Value|Instrument routing|Scene cue|Store cue|Save visual preset|Recall preset|MIDI learn|Output window blocked|Intensity|Sensitivity|Warp|Turbulence|Dissolve|Particle density|Particle size|Rebuild speed|Refraction|Reflection|Distortion|Light|Camera|Rotation|Depth|Kick|Bass|Treble|Decay|Phase|Color|Quality|Automatic|Low|High',
  it: 'Scena visiva|Rack visuale|Congela|Riduci movimento|Schermo intero|Finestra proiettore|Impulso|Scena automatica|Ripristina|Variazione|Sincronizza BPM|Controllo|Valore|Matrice strumenti|Scena musicale|Memorizza cambio|Salva preset visivo|Richiama preset|Apprendi MIDI|Finestra di proiezione bloccata|Intensità|Sensibilità|Deformazione|Turbolenza|Dissoluzione|Densità particelle|Dimensione particelle|Velocità ricomposizione|Rifrazione|Riflessione|Distorsione|Luce|Camera|Rotazione|Profondità|Cassa|Bassi|Alti|Decadimento|Fase|Colore|Qualità|Automatica|Bassa|Alta',
  es: 'Escena visual|Rack visual|Congelar|Reducir movimiento|Pantalla completa|Ventana de proyección|Impulso|Escena automática|Restablecer|Variación|Sincronizar BPM|Control|Valor|Matriz de instrumentos|Escena musical|Guardar cambio|Guardar preset visual|Cargar preset|Aprender MIDI|Ventana de proyección bloqueada|Intensidad|Sensibilidad|Deformación|Turbulencia|Disolución|Densidad de partículas|Tamaño de partículas|Reconstrucción|Refracción|Reflexión|Distorsión|Luz|Cámara|Rotación|Profundidad|Bombo|Graves|Agudos|Decaimiento|Fase|Color|Calidad|Automática|Baja|Alta',
  fr: 'Scène visuelle|Rack visuel|Figer|Réduire les mouvements|Plein écran|Fenêtre de projection|Impulsion|Scène automatique|Réinitialiser|Variation|Synchroniser le tempo|Commande|Valeur|Routage des instruments|Scène musicale|Mémoriser le changement|Enregistrer le préréglage|Rappeler le préréglage|Apprentissage MIDI|Fenêtre de projection bloquée|Intensité|Sensibilité|Déformation|Turbulence|Dissolution|Densité des particules|Taille des particules|Reconstruction|Réfraction|Réflexion|Distorsion|Lumière|Caméra|Rotation|Profondeur|Grosse caisse|Graves|Aigus|Déclin|Phase|Couleur|Qualité|Automatique|Basse|Haute',
  de: 'Bildszene|Visual-Rack|Einfrieren|Bewegung reduzieren|Vollbild|Projektorfenster|Impuls|Automatische Szene|Zurücksetzen|Variation|Tempo-Sync|Regler|Wert|Instrumentenzuordnung|Musikszene|Wechsel speichern|Bild-Preset speichern|Preset laden|MIDI lernen|Projektorfenster blockiert|Intensität|Empfindlichkeit|Verformung|Turbulenz|Auflösung|Partikeldichte|Partikelgröße|Wiederaufbau|Brechung|Spiegelung|Verzerrung|Licht|Kamera|Drehung|Tiefe|Kick|Bass|Höhen|Abklingen|Phase|Farbe|Qualität|Automatisch|Niedrig|Hoch',
  pt: 'Cena visual|Rack visual|Congelar|Reduzir movimento|Ecrã inteiro|Janela de projeção|Impulso|Cena automática|Repor|Variação|Sincronizar BPM|Controlo|Valor|Encaminhamento de instrumentos|Cena musical|Guardar mudança|Guardar predefinição visual|Carregar predefinição|Aprendizagem MIDI|Janela de projeção bloqueada|Intensidade|Sensibilidade|Deformação|Turbulência|Dissolução|Densidade das partículas|Tamanho das partículas|Reconstrução|Refração|Reflexão|Distorção|Luz|Câmara|Rotação|Profundidade|Bombo|Graves|Agudos|Decaimento|Fase|Cor|Qualidade|Automática|Baixa|Alta',
  ru: 'Визуальная сцена|Видеорэк|Заморозить|Уменьшить движение|Полный экран|Окно проектора|Импульс|Автосцена|Сброс|Вариация|Синхронизация BPM|Регулятор|Значение|Маршрутизация инструментов|Музыкальная сцена|Записать переход|Сохранить пресет|Загрузить пресет|Обучение MIDI|Окно проектора заблокировано|Интенсивность|Чувствительность|Деформация|Турбулентность|Растворение|Плотность частиц|Размер частиц|Восстановление|Преломление|Отражение|Искажение|Свет|Камера|Вращение|Глубина|Бочка|Басы|Верхние частоты|Спад|Фаза|Цвет|Качество|Авто|Низкое|Высокое',
  uk: 'Візуальна сцена|Відеорек|Заморозити|Зменшити рух|Повний екран|Вікно проєктора|Імпульс|Автосцена|Скинути|Варіація|Синхронізація BPM|Регулятор|Значення|Маршрутизація інструментів|Музична сцена|Зберегти перехід|Зберегти пресет|Відкрити пресет|Навчання MIDI|Вікно проєктора заблоковано|Інтенсивність|Чутливість|Деформація|Турбулентність|Розчинення|Щільність частинок|Розмір частинок|Відновлення|Заломлення|Відбиття|Спотворення|Світло|Камера|Обертання|Глибина|Бочка|Бас|Високі частоти|Спад|Фаза|Колір|Якість|Авто|Низька|Висока',
  pl: 'Scena wizualna|Panel wizualny|Zamroź|Ogranicz ruch|Pełny ekran|Okno projektora|Impuls|Scena automatyczna|Przywróć|Wariant|Synchronizuj BPM|Regulator|Wartość|Mapowanie instrumentów|Scena muzyczna|Zapisz zmianę|Zapisz preset wizualny|Wczytaj preset|Nauka MIDI|Okno projektora zablokowane|Intensywność|Czułość|Odkształcenie|Turbulencja|Rozpad|Gęstość cząstek|Rozmiar cząstek|Odbudowa|Załamanie|Odbicie|Zniekształcenie|Światło|Kamera|Obrót|Głębia|Stopa|Bas|Soprany|Zanikanie|Faza|Kolor|Jakość|Automatyczna|Niska|Wysoka',
  ar: 'المشهد البصري|لوحة المؤثرات|تجميد|تقليل الحركة|ملء الشاشة|نافذة العرض|نبضة|مشهد تلقائي|إعادة ضبط|تنويع|مزامنة الإيقاع|التحكم|القيمة|ربط الآلات|المشهد الموسيقي|حفظ الانتقال|حفظ الإعداد البصري|استعادة الإعداد|تعلّم MIDI|تعذر فتح نافذة العرض|الشدة|الحساسية|الالتواء|الاضطراب|التلاشي|كثافة الجسيمات|حجم الجسيمات|سرعة التكوين|الانكسار|الانعكاس|التشويه|الإضاءة|الكاميرا|الدوران|العمق|الطبل الكبير|الترددات المنخفضة|الترددات العالية|الاضمحلال|الطور|اللون|الجودة|تلقائية|منخفضة|عالية',
  zh: '视觉场景|视觉机架|冻结|减弱动态效果|全屏|投影窗口|触发|自动场景|重置|变奏|节拍同步|控制器|数值|乐器映射|音乐场景|保存切换|保存视觉预设|载入预设|MIDI 学习|投影窗口被拦截|强度|灵敏度|扭曲|湍流|溶解|粒子密度|粒子大小|重组速度|折射|反射|失真|灯光|相机|旋转|深度|底鼓|低频|高频|衰减|相位|颜色|画质|自动|低|高',
  ja: 'ビジュアルシーン|ビジュアルラック|静止|動きを抑える|全画面|投影ウィンドウ|トリガー|自動シーン|リセット|バリエーション|テンポ同期|コントロール|値|楽器の割り当て|楽曲シーン|切替を保存|映像プリセットを保存|プリセットを呼び出す|MIDI ラーン|投影ウィンドウがブロックされました|強度|感度|変形|乱流|分解|粒子密度|粒子サイズ|再構成速度|屈折|反射|歪み|照明|カメラ|回転|奥行き|キック|低域|高域|減衰|位相|色|画質|自動|低|高',
  ko: '시각 장면|비주얼 랙|정지|동작 줄이기|전체 화면|프로젝터 창|트리거|자동 장면|초기화|변주|박자 동기화|조절 항목|값|악기 연결|음악 장면|전환 저장|시각 프리셋 저장|프리셋 불러오기|MIDI 학습|프로젝터 창이 차단됨|강도|감도|변형|난류|분해|입자 밀도|입자 크기|재구성 속도|굴절|반사|왜곡|조명|카메라|회전|깊이|킥|저음|고음|감쇠|위상|색상|품질|자동|낮음|높음',
  sw: 'Mandhari ya picha|Kidhibiti cha picha|Gandisha|Punguza mwendo|Skrini nzima|Dirisha la projekta|Msukumo|Mandhari otomatiki|Rejesha|Tofauti|Sawazisha tempo|Kidhibiti|Thamani|Uelekezaji wa ala|Mandhari ya muziki|Hifadhi badiliko|Hifadhi mipangilio ya picha|Pakia mipangilio|Jifunze MIDI|Dirisha la projekta limezuiwa|Nguvu|Unyeti|Upindaji|Msukosuko|Kutawanyika|Msongamano wa chembe|Ukubwa wa chembe|Kasi ya kuungana|Mnyumbuliko wa mwanga|Uakisi|Upotoshaji|Mwanga|Kamera|Mzunguko|Kina|Ngoma ya besi|Besi|Sauti za juu|Kufifia|Awamu|Rangi|Ubora|Otomatiki|Chini|Juu',
  rm: 'Scena visuala|Controllas visualas|Congelar|Reducir il moviment|Maletg entir|Fanestra da projecziun|Impuls|Scena automatica|Redefinir|Variaziun|Sincronisar il tempo|Controlla|Valur|Attribuziun dals instruments|Scena musicala|Memorisar la midada|Memorisar la configuraziun|Chargiar la configuraziun|Emprender MIDI|Fanestra da projecziun bloccada|Intensitad|Sensibilitad|Deformaziun|Turbulenza|Dissoluziun|Spessezza da las particlas|Grondezza da las particlas|Reconstrucziun|Refracziun|Reflexiun|Distorsiun|Glisch|Camera|Rotaziun|Profunditad|Pauca|Bass|Tuns auts|Sminuziun|Fasa|Colur|Qualitad|Automatica|Bassa|Auta',
};
const keys =
  'scene rack freeze reduced fullscreen output trigger auto reset random sync control value mapping sceneCue storeCue store recall learn blocked intensity sensitivity warp turbulence dissolve density size rebuild refraction reflection distortion light camera rotation depth kick bass treble decay phase color quality autoQuality low high'.split(
    ' ',
  );
// First column names the destination selector. The next sixteen follow model.routes.
const responseNames = {
  en: 'Visual response|Impact|Melt|Acid ripple|Fracture|Mass|Sparks|Glint|Trail|Shockwave|Rain|Burst|Twist|Haze|Noise|FM ripples|Scatter',
  it: 'Risposta visiva|Impatto|Fusione|Onda acida|Frattura|Massa|Scintille|Riflesso|Scia|Onda d’urto|Pioggia|Esplosione|Torsione|Foschia|Rumore|Onde FM|Dispersione',
  de: 'Bildreaktion|Aufprall|Schmelze|Säurewelle|Bruch|Masse|Funken|Glanz|Spur|Schockwelle|Regen|Ausbruch|Verdrehung|Dunst|Rauschen|FM-Wellen|Streuung',
  es: 'Respuesta visual|Impacto|Fusión|Onda ácida|Fractura|Masa|Chispas|Destello|Estela|Onda de choque|Lluvia|Estallido|Torsión|Bruma|Ruido|Ondas FM|Dispersión',
  fr: 'Réponse visuelle|Impact|Fusion|Onde acide|Fracture|Masse|Étincelles|Reflet|Traînée|Onde de choc|Pluie|Éclatement|Torsion|Brume|Bruit|Ondes FM|Dispersion',
  pt: 'Resposta visual|Impacto|Fusão|Onda ácida|Fratura|Massa|Faíscas|Reflexo|Rasto|Onda de choque|Chuva|Explosão|Torção|Névoa|Ruído|Ondas FM|Dispersão',
  ru: 'Визуальный отклик|Удар|Плавление|Кислотная волна|Разлом|Масса|Искры|Блик|След|Ударная волна|Дождь|Всплеск|Скручивание|Дымка|Шум|ЧМ-волны|Рассеивание',
  uk: 'Візуальна реакція|Удар|Плавлення|Кислотна хвиля|Розлом|Маса|Іскри|Полиск|Слід|Ударна хвиля|Дощ|Сплеск|Скручування|Серпанок|Шум|ЧМ-хвилі|Розсіювання',
  zh: '视觉响应|冲击|熔化|酸性波纹|碎裂|质量|火花|闪光|拖尾|冲击波|雨滴|爆发|扭转|薄雾|噪声|调频波纹|散射',
  ja: '視覚効果|衝撃|融解|アシッド波形|破砕|質量|火花|反射光|軌跡|衝撃波|雨|放出|ねじれ|霧|ノイズ|FM波紋|拡散',
  ko: '시각 반응|충격|융해|애시드 파동|균열|질량|불꽃|반짝임|잔상|충격파|빗줄기|폭발|비틀기|안개|잡음|FM 파동|분산',
  pl: 'Reakcja wizualna|Uderzenie|Topnienie|Kwasowa fala|Pęknięcie|Masa|Iskry|Połysk|Smuga|Fala uderzeniowa|Deszcz|Rozbłysk|Skręcenie|Mgła|Szum|Fale FM|Rozproszenie',
  ar: 'الاستجابة البصرية|ارتطام|انصهار|موجة حمضية|تصدع|كتلة|شرر|بريق|أثر|موجة صدمية|مطر|اندفاع|التواء|ضباب|ضجيج|تموّج FM|تشتت',
  sw: 'Mwitikio wa picha|Mgongano|Kuyeyuka|Wimbi la asidi|Mpasuko|Masi|Cheche|Mng’ao|Kifuatio|Wimbi la mshtuko|Mvua|Mlipuko|Msokoto|Ukungu|Kelele|Mawimbi ya FM|Mtawanyiko',
  rm: 'Reacziun visuala|Collisiun|Luentada|Unda acida|Fractura|Massa|Sbrinzlas|Sbrinzlida|Fastiz|Unda da schoc|Plievgia|Explosiun|Torsiun|Brentina|Canera|Undas FM|Dispersiun',
};
export function labels(locale = 'en') {
  const tag = String(locale).toLowerCase();
  let raw = strings[tag.split('-')[0]] || strings.en;
  if (tag === 'pt-br')
    raw = raw
      .replace('Ecrã inteiro', 'Tela cheia')
      .replace('Repor', 'Redefinir')
      .replace('Controlo', 'Controle')
      .replaceAll('Guardar', 'Salvar')
      .replaceAll('predefinição', 'preset')
      .replace('Câmara', 'Câmera')
      .replace('Bombo', 'Bumbo');
  if (tag === 'de-ch') raw = raw.replaceAll('ß', 'ss');
  const vals = raw.split('|');
  const [response, ...routeLabels] = (responseNames[tag.split('-')[0]] || responseNames.en)
    .replace('Rasto', tag === 'pt-br' ? 'Rastro' : 'Rasto')
    .split('|');
  return { ...Object.fromEntries(keys.map((k, i) => [k, vals[i]])), response, routeLabels };
}
