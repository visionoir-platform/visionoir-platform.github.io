const base = import.meta.env?.BASE_URL || '/';
export const tracks = Object.freeze([
  ['chrome','RIFLESSO',132,'visionoir-cromo.mp3',87.272721],
  ['acid','IMPULSO',136,'visionoir-acid-mode.mp3',84.705873],
  ['noir','SOTTOTRACCIA',128,'visionoir-noir.mp3',90],
  ['afterimage','AFTERIMAGE',140,'visionoir-acid.mp3',109.714286],
  ['alloy','METALLOGRAM',130,'visionoir-metallogram.mp3',206.769229],
  ['aura','VELUM',84,'visionoir-velum.mp3',205.714286],
].map(([id,title,bpm,file,duration]) => Object.freeze({id,mode:id,title,bpm,file,src:`${base}assets/${file}`,duration})));
