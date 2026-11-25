// These roles address the eight original, editable patterns in each factory session.
const [intro, groove, build, drop, breakdown, lift, peak, exit] = [0, 1, 2, 3, 4, 5, 6, 7];
const part = (scene, bars, marker, ...instruments) => ({ scene, bars, marker, instruments });
const line = (instrument, steps, intervals, gate, velocity) => ({ instrument, steps, intervals, gate, velocity });
const ending = (name, bars, ...lines) => ({ name, bars, lines });

// Stripped reprises specify the instruments actually heard. The last phrase of each score
// is written in sixteenth notes; melodic intervals are relative to its own piece's root.
const forms = {
  oblique: { // Hard techno: repeat the motor figure once with only the drum machine.
    parts: [part(intro,8,'Pickup'), part(groove,16,'Press motor'), part(build,8,'Counterweight'),
      part(drop,16,'Oblique floor'), part(breakdown,8,'Air shaft'), part(groove,8,'Drum reprise','kick','schranz','closed'),
      part(lift,8,'Pressure valve'), part(peak,16,'Full stroke'), part(exit,4,'Clutch')],
    ending: ending('Three teeth',1,line('kick',[0,4,8],[0],0.8,.94),line('schranz',[2,6,9],[0,2,0],.42,.79)),
  },
  dross: { // Dark electro: the exposed sub answers each of the two different lead entries.
    parts: [part(breakdown,8,'Buried tone','sub','lead'), part(intro,8,'Wake'), part(groove,12,'Low current'),
      part(drop,16,'Lead enters'), part(breakdown,4,'Low answer','sub','atmos'), part(build,8,'Rewire'),
      part(peak,16,'Second lead'), part(lift,8,'Aftershock'), part(exit,4,'Dross')],
    ending: ending('Falling third',2,line('sub',[0,14,24],[3,1,0],4,.76),
      line('lead',[3,11,19],[27,25,24],2.5,.6),line('snare',[4,20],[0],.55,.62)),
  },
  needle: { // Schranz: interrupt the first peak with a short roll before the second drop.
    parts: [part(intro,4,'Steel pickup'), part(build,12,'Spindle'), part(groove,8,'Teeth engage'),
      part(peak,16,'Full speed'), part(lift,4,'Roll stop','schranz','snare'), part(drop,16,'Second gear'),
      part(breakdown,8,'Open belt'), part(build,8,'Rewind'), part(peak,12,'Lock')],
    ending: ending('Needle lift',1,line('kick',[0,4,8,12],[0],.55,.95),
      line('schranz',[0,3,6,9,12,13,14],[0,0,2,-1],.28,.82),line('ride',[2,6,10],[0],.8,.67)),
  },
  fog: { // Warehouse dub: an instrumental answer follows the first long break.
    parts: [part(intro,12,'Fog bank','atmos','closed'), part(groove,16,'Tunnel pulse'),
      part(breakdown,12,'First clearing'), part(drop,12,'Return to ground'), part(exit,4,'Dub cut','atmos'),
      part(groove,8,'Bass answer','industrial','rumble','closed'), part(lift,8,'Wake line'), part(peak,16,'Transit')],
    ending: ending('Last reflections',2,line('stab',[2,10,21],[19,14,12],.65,.58),
      line('atmos',[0],[7],22,.54),line('sub',[0,16],[0,-5],6,.67)),
  },
  weld: { // Industrial: two eight-bar presses share a hammer rhythm around a four-bar cut.
    parts: [part(intro,8,'Tack weld'), part(lift,8,'Ignition'), part(drop,8,'First press'),
      part(groove,4,'Hammer only','kick','schranz'), part(drop,8,'Second press'),
      part(breakdown,8,'Quench'), part(build,16,'Thermal rise'), part(peak,24,'Arc seam'), part(exit,4,'Cooling metal')],
    ending: ending('Arc extinguished',1,line('fm',[0,3,7,8],[12,19,13,12],.38,.77),
      line('kick',[0,8],[0],.8,.93),line('noise',[8],[0],3,.53)),
  },
  corona: { // Dub techno: long low-frequency plateau, two interleaved chord returns.
    parts: [part(intro,8,'Halo'), part(groove,16,'Sub foundation','kick','industrial','rumble','closed'),
      part(build,8,'Opening chords','stab','closed','industrial'), part(drop,12,'First orbit'),
      part(breakdown,8,'Shadow'), part(peak,16,'Wide orbit'), part(build,8,'Chord return','stab','open','industrial'),
      part(exit,8,'Receiver')],
    ending: ending('Chord relay',3,line('stab',[2,11,22,37],[19,12,17,12],.8,.65),
      line('rumble',[1,17],[0],3,.67),line('atmos',[0,24],[12,7],10,.49)),
  },
  delta: { // Rhythmic industrial: preview the peak as an FM solo before introducing the kick.
    parts: [part(peak,4,'Oscillator test','fm'), part(intro,8,'Chamber inlet'), part(groove,12,'Valve train'),
      part(lift,8,'Pump'), part(drop,16,'Pressure floor'), part(build,8,'Valve return','fm','schranz','closed'),
      part(breakdown,8,'Vacuum'), part(peak,16,'Chamber release'), part(groove,8,'Runout','kick','fm','closed')],
    ending: ending('Frequency descent',2,line('fm',[0,5,11,18,24],[24,19,14,7,0],1,.75),
      line('industrial',[0,12,24],[0,1,0],1.4,.78)),
  },
  spoke: { // Hardgroove: a drum circle comes back twice, thinning to percussion at the end.
    parts: [part(groove,8,'Spoke pickup','kick','schranz','closed','open'), part(build,8,'Wheel hub'),
      part(drop,16,'First circle'), part(lift,8,'Rim'), part(groove,8,'Hands only','schranz','snare','open'),
      part(breakdown,4,'Hub gap'), part(peak,16,'Second circle'), part(drop,12,'Third circle'), part(exit,4,'Freewheel')],
    ending: ending('Hands off',2,line('schranz',[0,3,6,10,14,19,22,26],[0,3,0,5],.36,.73),
      line('open',[2,10,18],[0],.78,.65),line('kick',[0,8,16],[0],.74,.88)),
  },
  alba: { // Cinematic electro: bookend the central drop with sustained, unaccompanied voices.
    parts: [part(breakdown,12,'Before the lamps','sub','atmos'), part(lift,8,'Signal appears'),
      part(groove,12,'Platform'), part(build,12,'Lead pickup'), part(drop,16,'Departure'),
      part(breakdown,8,'Window light','lead','atmos'), part(peak,12,'Last train'), part(intro,4,'Empty rail','atmos')],
    ending: ending('Daybreak',3,line('lead',[0,8,18,32],[19,24,22,24],3,.63),
      line('atmos',[0,24],[0,7],16,.57),line('sub',[0],[0],12,.7)),
  },
  clamp: { // Schranz: alternating rapid releases set up a hard, displaced last hit.
    parts: [part(intro,4,'Jaw'), part(groove,8,'Ratchet'), part(lift,4,'Wind'), part(drop,12,'Bite'),
      part(build,8,'Reset'), part(peak,12,'First clamp'), part(breakdown,4,'Jaw open','sub','lead'),
      part(lift,8,'Wind again'), part(peak,16,'Second clamp'), part(drop,8,'Shear')],
    ending: ending('Dead stop',1,line('kick',[0,4,7],[0],.5,.94),
      line('snare',[2,5,7],[0],.35,.84),line('industrial',[0,7],[0,-5],.7,.78)),
  },
  violet: { // Acid: introduce the resonant line alone, then repeat the lift with bass and hats.
    parts: [part(build,8,'Acid pickup','acid','closed'), part(intro,4,'Power on'), part(groove,12,'Bias'),
      part(drop,16,'Violet line'), part(lift,8,'Sweep'), part(breakdown,8,'Bleed'),
      part(lift,8,'Sweep return','acid','industrial','open'), part(peak,16,'Overtone'), part(exit,4,'Static')],
    ending: ending('Filter closes',2,line('acid',[0,3,6,10,15,18,22,26],[12,15,19,13,12,7,3,0],.89,.73),
      line('kick',[0,4,8,12,16],[0],.68,.9),line('closed',[2,6,10,14,18],[0],.25,.55)),
  },
  pier: { // Neo rave: feature the hook at half instrumentation before two full-band returns.
    parts: [part(intro,8,'Quay'), part(peak,8,'Hook preview','lead','stab','closed'), part(groove,12,'Mooring'),
      part(build,8,'Approach'), part(drop,16,'On the pier'), part(breakdown,8,'Waterline'),
      part(drop,8,'Hook returns','lead','stab','kick','industrial'), part(lift,8,'Last boarding'),
      part(peak,12,'Night ferry'), part(exit,4,'Wake')],
    ending: ending('Harbour lights',2,line('stab',[0,6,16],[12,19,12],2,.76),
      line('lead',[2,9,18,24],[24,26,31,24],2.8,.66),line('kick',[0,4,8,12],[0],.7,.88)),
  },
};

const drumNotes = { kick:36, snare:48, schranz:42, closed:73, open:74, ride:76 };
export function arrangeDemo(project, id, root) {
  const {parts, ending: coda} = forms[id];
  const length = coda.bars * 16;
  const codaScene = {
    id: id + '-ending',
    name: coda.name,
    patterns: project.tracks.map(track => {
      const steps = Array(length).fill(null);
      const phrase = coda.lines.find(p => p.instrument === track.instrument);
      if (phrase) {
        phrase.steps.forEach((step, index) => {
          const note = (drumNotes[track.instrument] ?? root) + phrase.intervals[index % phrase.intervals.length];
          steps[step] = {note, gate: phrase.gate, velocity: phrase.velocity, accent: index === 0};
        });
      }
      return {length, steps};
    }),
  };
  const codaIndex = project.scenes.length;
  project.scenes.push(codaScene);
  project.arrangement = parts.map(({scene,bars,marker,instruments}) => {
    const clip = {scene,bars,marker};
    if (instruments.length) {
      clip.trackScenes = project.tracks.map(track => instruments.includes(track.instrument) ? null : -1);
    }
    return clip;
  });
  project.arrangement.push({scene:codaIndex,bars:coda.bars,marker:coda.name});
}
