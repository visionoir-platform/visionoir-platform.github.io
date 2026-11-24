#!/usr/bin/env python3
"""Render the editable Unseen Protocol cue book. Requires Python, NumPy and FFmpeg."""
import argparse
import functools
import hashlib
import inspect
from dataclasses import asdict
import json
import math
import os
import re
import struct
import subprocess
import tempfile
from pathlib import Path
import numpy as np
from score import CUES, ONESHOTS, SCALES

RATE = 48000
WEB = Path(__file__).resolve().parents[2] / 'public/unseen/audio'
MASTER = Path.home() / 'Music/VISIONOIR/The Unseen Protocol'
ALBUM = 'VISIONOIR: THE UNSEEN PROTOCOL — ORIGINAL GAME SOUNDTRACK'
CREDIT = 'Project Creator & Creative Director: Flavio Giorgio Guarini. Original score, synthesis and mix produced with AI assistance for VISIONOIR.'
LICENSE = '© 2026 Flavio Giorgio Guarini. All rights reserved for original contributions.'
WEB.mkdir(exist_ok=True, parents=True)
KITS = {
    # Four beat grids; scaled into the cue meter when it uses 3, 5, 6 or 7 beats.
    'cinema':([0,10],[8],[2,7,12]), 'electro':([0,6,8,11],[4,12],[2,5,10,14]),
    'funk':([0,3,7,10],[4,12,15],[2,6,9,13]),'broken':([0,6,11],[5,12],[2,7,9,14]),
    'minimal':([0,8],[6,14],[2,5,10,13]),'ambient':([0],[],[10]),
    'break':([0,3,8,10],[4,9,12],[2,6,7,11,14]),'jungle':([0,6,10],[4,7,12,15],[1,3,5,9,11,14]),
    'forge':([0,4,8,12],[4,11,12],[2,6,9,14]),'four':([0,4,8,12],[4,12],[2,6,10,14]),
    'tide':([0,9],[6,13],[3,8,12]),'ritual':([0,6,12],[4,9,14],[2,7,11]),
    'waltz':([0,11],[5,10],[3,8,13]),'orbit':([0,5,9,13],[4,11],[2,7,10,15]),
}
# FM index, ratio, harmonic content, envelope shape. Source spectra have finite bandwidth.
VOICES = {
 'glass':(.9,2.01,.06,.012,1.0),'prism':(.9,2,.22,.009,.65),'pluck':(1.5,1.5,.12,.004,4.2),
 'reed':(.35,1,.4,.020,.5),'chip':(.12,2,.64,.007,1.1),'keys':(.75,2,.13,.012,2.7),
 'metal':(2.5,2.35,.12,.006,3.4),'acid':(1.6,1,.55,.004,2.4),'clav':(1.9,3,.16,.004,5),
 'brass':(.4,1,.58,.028,.7),'ice':(1.7,3.003,.05,.006,3.6),'harp':(1.3,2,.16,.004,3.3),
 'choir':(.26,1.002,.27,.065,.35),'bell':(2.1,3.5,.06,.005,3.1),
 'bass':(.48,1,.23,.008,1.9),'sub':(.15,2,.13,.012,.9),'pad':(.22,1.002,.20,.07,.4),
}
def degree(c,step):
    return c.tonic + SCALES[c.mode][step%7] + 12*(step//7)

@functools.lru_cache(maxsize=900)
def tone(voice,note,frames):
    t=np.arange(frames,dtype='f')/RATE
    freq=440*2**((note-69)/12)
    phase=(2*np.pi*freq)*t
    index,ratio,harm,atk,damp=VOICES[voice]
    env=np.minimum(1,t/atk)*np.minimum(1,(frames/RATE-t)/min(.045,frames/RATE*.3))*np.exp(-t*damp)
    base=np.sin(phase+index*np.exp(-t*4)*np.sin(phase*ratio))
    if voice in {'chip','reed','clav','bass'}:
        for h in (3,5,7):
            if freq*h<13000: base+=harm*np.sin(phase*h)/h
    else:
        for h in (2,3,4):
            if freq*h<13000: base+=harm*np.sin(phase*h+.1)/h
    if voice in {'prism','choir','pad','brass'}:
        base=base*.75+.25*np.sin(phase*1.002+np.sin(2*np.pi*4*t)*.07)
    return (base*env).astype('f')

@functools.lru_cache(maxsize=96)
def hit(kind,pitchkit):
    dur={'kick':.39,'snare':.21,'hat':.095,'ride':.36,'tom':.32,'clank':.23}[kind]
    t=np.arange(round(RATE*dur),dtype='f')/RATE
    rng=np.random.default_rng(700+pitchkit); noise=rng.uniform(-1,1,t.shape).astype('f')
    bright=np.r_[0,np.diff(noise)]*.56
    k=1+pitchkit*.014
    ph=lambda f: 2*np.pi*f*t
    if kind=='kick':
        s=np.sin(2*np.pi*((45+pitchkit)*t+3.8*(1-np.exp(-t*47))))*np.exp(-t*11)+bright*np.exp(-t*290)*.22
    elif kind=='snare':
        s=(.58*noise*np.exp(-t*19)+.45*np.sin(ph(181*k))*np.exp(-t*27)+bright*np.exp(-t*43)*.5)
    elif kind=='tom':
        s=np.sin(ph(102*k)+3*(1-np.exp(-t*19)))*np.exp(-t*13)
    elif kind=='hat':
        s=(bright*.65+np.sin(ph(5551*k))*np.sin(ph(3248*k))*.32)*np.exp(-t*57)
    elif kind=='clank':
        s=np.sin(ph(419*k)+2.7*np.sin(ph(961*k))*np.exp(-t*23))*np.exp(-t*22)
    else:
        s=(bright*.47+np.sin(ph(1053*k)+3.1*np.sin(ph(2711*k)))*.45)*np.exp(-t*11)
    return (s*np.minimum(1,t/.0018)*np.minimum(1,(dur-t)/.012)).astype('f')

def vlq(value):
    b=[value&127]; value>>=7
    while value: b.insert(0,(value&127)|128);value>>=7
    return bytes(b)
def midi_file(dest,events,c):
    def chunk(events):
        data=bytearray(); last=0
        for at,msg in sorted(events,key=lambda e:e[0]):
            data.extend(vlq(at-last));data.extend(msg);last=at
        data.extend(b'\x00\xff\x2f\x00')
        return b'MTrk'+struct.pack('>I',len(data))+data
    tracks=[chunk([(0,b'\xff\x51\x03'+round(60e6/c.bpm).to_bytes(3,'big')),(0,b'\xff\x58\x04'+bytes([c.meter,2,24,8]))])]
    for chan,prog,name in [(0,81,'Lead'),(1,38,'Bass'),(2,89,'Harmony'),(3,10,'Countermelody'),(9,0,'Percussion')]:
        start=[(0,b'\xff\x03'+bytes([len(name)])+name.encode()),(0,bytes([0xc0+chan,prog]))]
        tracks.append(chunk(start+events[chan]))
    dest.write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(tracks),480)+b''.join(tracks))

def mixcue(ix,c,isolate=None):
    beat=60/c.bpm; n=round(RATE*beat*c.meter*c.bars)
    mix=np.zeros((n,2),dtype='f'); events={k:[] for k in (0,1,2,3,9)}
    kit_index=list(KITS).index(c.beat); drums=KITS[c.beat]
    def place(at,s,gain,pan,channel=9):
        if isolate is not None and channel!=isolate:return
        pos=round(at*beat*RATE); size=min(len(s),n-pos)
        if size<=0: return
        mix[pos:pos+size,0]+=s[:size]*(gain*math.sqrt(1-pan))
        mix[pos:pos+size,1]+=s[:size]*(gain*math.sqrt(pan))
    def log(chan,at,length,p,vel):
        tick=round(at*480)
        events[chan].extend(((tick,bytes([144+chan,p,max(1,min(127,round(vel)))])),
                             (min(round(c.bars*c.meter*480),tick+max(1,round(length*480))),bytes([128+chan,p,0]))))
    def note(ch,v,at,length,p,level,pan):
        if isolate is not None and ch!=isolate:return
        frames=max(32,round(length*beat*RATE));place(at,tone(v,p,frames),level,pan,ch)
        log(ch,at,length,p,level*270)
    for b in range(c.bars):
        phase=c.form[min(len(c.form)-1,b*len(c.form)//c.bars)]
        off=b*c.meter; start=b==0
        cad=b%8==7; root=c.chords[(b//2)%len(c.chords)] if c.bars>12 else c.chords[b%len(c.chords)]
        if b==c.bars-1 and ix in ONESHOTS: root=0
        # Long voicings breathe against dry, short bass; D creates a suspended bridge.
        if phase in 'ADE' or b%2==0:
            dur=c.meter*(.92 if phase in 'AD' else .62)
            voiced=[root,root+2,root+4]+([root+6] if phase in 'DE' else [])
            for j,d in enumerate(voiced):
                p=degree(c,d)+12
                note(2,'pad',off+j*.031,dur-j*.031,p,.071 if phase!='D' else .092,(.18,.79,.42,.64)[j])
        bass_grid={'A':[0,10],'B':[0,6,10,14],'C':[0,3,6,8,11,14],'D':[0],'E':[0,5,9,12,15]}[phase]
        for j,s in enumerate(bass_grid):
            d=root+(4 if j%3==2 else (7 if phase=='C' and j==3 else 0))
            dur=.37*c.meter/4 if len(bass_grid)>2 else c.meter*.32
            note(1,'sub' if phase in 'AD' else 'bass',off+s*c.meter/16,dur,degree(c,d)-12,.29,.5)
        for j,s in enumerate(c.rhythm):
            if phase=='D' and j%2: continue
            if phase=='A' and j%3==1 and b%2: continue
            idx=j+(b%4)*max(1,len(c.rhythm)-2)
            step=c.melody[idx%len(c.melody)]
            # Return and development: diatonic answer in the relative register, a cadence then a held arrival.
            if phase=='E': step=c.melody[(-idx-1)%len(c.melody)]+2
            if phase=='C' and b%4>1: step+=2
            if cad and j==len(c.rhythm)-1: step=root+4
            if b==c.bars-1 and ix in ONESHOTS and j==len(c.rhythm)-1: step=7
            s_next=c.rhythm[j+1] if j+1<len(c.rhythm) else c.meter*4
            dur=max(.13,(s_next-s)*(.215 if phase in 'BC' else .242))
            at=off+s/4
            # Harp, chips and FM bells occupy an upper register, brass and choir a lower one.
            p=degree(c,step)+(24 if c.voice in {'bell','ice','harp','chip'} else 12)
            note(0,c.voice,at,dur,p,.196 if j%2==0 else .17,.44+.09*(j%3))
        if phase in 'CE' or (phase=='B' and b%4>1):
            counter_voice='bell' if c.voice not in {'bell','ice','metal'} else 'pluck'
            for j in range(c.meter*2):
                if j%3==0:continue
                d=root+(0,4,2,6,4,7,2)[(j+b)%7]
                note(3,counter_voice,off+j*.5,.26,degree(c,d)+24,.072,.24 if j%2 else .76)
        for typ,steps in zip(('kick','snare','hat'),drums):
            if phase=='D' and typ!='hat' and b%4:continue
            if phase=='A' and typ=='snare' and not cad:continue
            for j,s in enumerate(steps):
                if phase=='D' and j%2: continue
                at=off+s*c.meter/16
                gain={'kick':.51,'snare':.31,'hat':.115}[typ]*(.72 if phase=='D' else 1)*(.77 if j%2 and typ=='hat' else 1)
                place(at,hit(typ,kit_index),gain,.5 if typ=='kick' else (.58 if typ=='snare' else .32+.24*(j%2)))
                log(9,at,.12,{'kick':36,'snare':38,'hat':42}[typ],gain*200)
        if cad or (phase=='E' and b%2):
            for j,kind in enumerate(('tom','clank','ride')):
                at=off+c.meter-.75+j*.25
                place(at,hit(kind,kit_index),.13+j*.018,.24+j*.23);log(9,at,.2,(45,56,51)[j],80)
    # Opposite-channel tempo-tapped reflections. Wrap sends around loop boundaries only for cyclic cues.
    for tap,gain in [(beat*.75,.105),(beat*1.5,.045)]:
        k=round(RATE*tap)
        for a in (0,1):
            if ix not in ONESHOTS: mix[:k,a]+=mix[-k:,1-a]*gain
            mix[k:,a]+=mix[:-k,1-a]*gain
    # Control transient sum without clipping. Tiny symmetric guards at the PCM loop boundary.
    if isolate is None:np.tanh(mix*1.17,out=mix)
    fade=round(RATE*(min(.65,beat) if ix in ONESHOTS else .004))
    mix[-fade:]*=np.linspace(1,0,fade,dtype='f')[:,None]
    mix[:144]*=np.linspace(0,1,144,dtype='f')[:,None]
    return mix,events

def ff(args):
    return subprocess.run(['ffmpeg','-nostdin','-hide_banner','-y','-threads','1',*args],check=True,stderr=subprocess.PIPE).stderr.decode()
def gain_info(input_args):
    log=ff([*input_args,'-af','ebur128=peak=true','-f','null','-']).split('Summary:')[-1]
    return float(re.search(r'I:\s*([-\d.]+) LUFS',log)[1]),float(re.search(r'Peak:\s*([-\d.]+) dBFS',log)[1])

def publish(name,data):
    target=WEB/name; temp=target.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');os.replace(temp,target)

def recipe(c):
    # A changed score, synthesis voice or arrangement invalidates the local render cache.
    inputs=[asdict(c),SCALES,KITS,VOICES,sorted(ONESHOTS),RATE,'master-ebu16.5-pk2.7-aac104-v1',
            *[inspect.getsource(f) for f in (degree,tone,hit,mixcue)]]
    return hashlib.sha256(json.dumps(inputs,sort_keys=True).encode()).hexdigest()

def render(ix,c,folder):
    ident=f'{ix:02}'; base='ost-'+ident
    web=WEB/(base+'.m4a'); master=folder/(base+'.wav'); side=folder/(base+'.json'); midi=folder/(base+'.mid')
    signature=recipe(c)
    if all(x.is_file() for x in (web,master,midi,side)):
        cached=json.loads(side.read_text())
        if cached.get('recipe')==signature:return cached
    mix,events=mixcue(ix,c)
    duration=len(mix)/RATE
    midi_file(midi,events,c)
    with tempfile.TemporaryDirectory(dir=folder) as tmp:
        raw=Path(tmp)/'mix.f32'; mix.astype('<f4',copy=False).tofile(raw);del mix
        inp=['-f','f32le','-ar',str(RATE),'-ac','2','-i',str(raw)]
        loud,pk=gain_info(inp); gain=min(-16.5-loud,-2.7-pk)
        ff([*inp,'-af',f'volume={gain:.3f}dB','-c:a','pcm_s24le',str(master)])
    ff(['-i',str(master),'-c:a','aac','-b:a','104k','-movflags','+faststart','-metadata','title='+c.title,'-metadata','album='+ALBUM,str(web)])
    key=('C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B')[c.tonic%12]+' '+c.mode
    row=dict(id=ident,title=c.title,album=ALBUM,recipe=signature,category=c.category,file='/unseen/audio/'+web.name,duration=duration,bpm=c.bpm,key=key,
             loop=None if ix in ONESHOTS else dict(start=0,end=duration),scenes=[c.scene],stems=[],
             provenance='Original editable cue book, multitrack MIDI and deterministic FM/additive synthesis. No external samples.',
             credits=CREDIT,license=LICENSE,production='rendered',verification='master measured; encoded verification in audio-qa.json',
             color=c.color,masterIntegratedLUFS=round(loud+gain,2),masterTruePeakDBTP=round(pk+gain,2),
             editableMidi=base+'.mid',meter=str(c.meter)+'/4')
    side.write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n')
    tone.cache_clear()
    print(ident,c.title,duration,flush=True)
    return row
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--masters',type=Path,default=MASTER/'OST');args=ap.parse_args()
    args.masters.mkdir(parents=True,exist_ok=True)
    publish('soundtrack.json',[render(i,c,args.masters) for i,c in enumerate(CUES,1)])
