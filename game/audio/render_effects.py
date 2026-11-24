#!/usr/bin/env python3
"""Render authored, multilayer event cues; no third-party samples."""
import argparse
import hashlib
import json
import inspect
import tempfile
from pathlib import Path
import numpy as np
from render import CREDIT, LICENSE, MASTER, RATE, WEB, ff, publish

def gestures():
    category=None
    for l in Path(__file__).with_name('effects.score').read_text().splitlines():
        if not l or l.startswith('#'):continue
        if l.startswith('['):category=l.strip('[]');continue
        ident,score=l.split('|')
        notes=[]
        for event in score.split():
            voice,start,duration,p,q=event.split(':')
            notes.append((voice,int(start),int(duration),float(p),float(q)))
        yield category,ident,notes

def sound(voice,ms,p,q,seed):
    n=round(ms*RATE/1000);t=np.arange(n,dtype='f')/RATE;x=t/(ms/1000)
    freq=p*np.power(q/p,x);phase=2*np.pi*np.cumsum(freq,dtype='d')/RATE
    rng=np.random.default_rng(seed);noise=rng.uniform(-1,1,n)
    bright=.5*np.r_[0,np.diff(noise)]
    attack=.004;decay=1.5
    if voice in ('bell','clink','clank','glass','ping','fm'):
        idx,ratio,decay={'bell':(1.7,2.48,2.8),'clink':(3.9,2.83,5),'clank':(4.4,1.43,3.2),
                         'glass':(.79,3.01,2),'ping':(.35,2,3.5),'fm':(3,1.51,2.2)}[voice]
        out=np.sin(phase+idx*np.exp(-x*4)*np.sin(phase*ratio))
        out+=.16*np.sin(phase*min(4.9,ratio+1.2))*np.exp(-5*x)
    elif voice in ('reed','brass','pulse','buzz','motor','zip'):
        ratios={'reed':(1,3,5),'brass':(1,2,3,4),'pulse':(1,3,5,7),'buzz':(1,2,4,7),
                'motor':(1,2,3,6),'zip':(1,2,5)}[voice]
        out=sum(np.sin(phase*h)/h for h in ratios)
        if voice in ('buzz','motor'):out*=.65+.35*np.sin(phase*(.08 if voice=='motor' else .19))
        if voice=='brass': attack=.019
        if voice=='motor':attack=.018;decay=.55
    elif voice in ('air','grit','snap','scrape','reverse'):
        # Resonant noise carrier with independent chirping resonances.
        grain=np.convolve(noise,np.ones(9)/9,mode='same')
        out=grain*(.6+np.sin(phase*1.01)*.8)+bright*.28
        out+=.23*np.sin(phase+.62*np.sin(phase*1.75))
        if voice=='scrape':out*=.6+.4*np.sin(phase*.068)**2
        attack=.012 if voice=='air' else .002
        decay=4.2 if voice=='snap' else 1.2
        if voice=='reverse':out*=np.minimum(x/.82,1)**1.4;decay=.3
    elif voice in ('thud','sub','tom','drop','boing','bubble'):
        extra={'thud':1.4,'sub':.35,'tom':1.8,'drop':1.4,'boing':3.5,'bubble':2}[voice]
        out=np.sin(phase+extra*np.exp(-x*4)*np.sin(phase*(1.37 if voice in ('bubble','boing') else 1)))
        if voice=='boing':out+=np.sin(phase*(1+.012*np.sin(19*x)))*.33
        if voice=='thud':out+=bright*np.exp(-x*22)*.25
        decay=3.2
    elif voice=='chord':
        out=sum(np.sin(phase*f+.32*np.sin(phase*2*f)) for f in (1,1.2599,1.4983))/2.3
        attack=.012;decay=.9
    elif voice=='tap':
        out=(np.sin(phase)+.4*np.sin(phase*2.3)+bright*.28);decay=5.4;attack=.0015
    else:raise ValueError(voice)
    env=np.minimum(t/attack,1)*np.exp(-x*decay)*np.minimum((1-x)/.15,1)
    return np.asarray(out*env,dtype='f')

def render_effect(category,ident,notes,folder):
    web=WEB/('fx-'+ident+'.m4a');wav=folder/(ident+'.wav')
    n=round(max(start+duration for _,start,duration,_,_ in notes)*RATE/1000)
    signature=hashlib.sha256((str(notes)+category+inspect.getsource(sound)+'-levels20261124').encode()).hexdigest()
    stamp=folder/(ident+'.recipe')
    if not (web.exists() and wav.exists() and stamp.is_file() and stamp.read_text()==signature):
        mix=np.zeros((n,2),dtype='f')
        for j,(voice,start,duration,p,q) in enumerate(notes):
            seed=int.from_bytes(hashlib.sha256(f'{ident}/{j}'.encode()).digest()[:4],'little')
            s=sound(voice,duration,p,q,seed)
            pos=round(start*RATE/1000);pan=.5 if j==0 else [.36,.62,.46][(j-1)%3]
            gain=.84 if j==0 else .64
            mix[pos:pos+len(s),0]+=s*np.sqrt(1-pan)*gain
            mix[pos:pos+len(s),1]+=s*np.sqrt(pan)*gain
        # Transient effects have different target levels by use. Preserve dynamic hierarchy.
        ceiling={'interface':.24,'collect':.35,'movement':.31,'combat':.49,'energy':.45,
                 'ability':.40,'machine':.46,'world':.37,'narrative':.43}[category]
        mix=np.tanh(mix*.93);mix*=ceiling/max(.001,np.max(abs(mix)))
        with tempfile.TemporaryDirectory(dir=folder) as tmp:
            f=Path(tmp)/'fx.f32';mix.astype('<f4').tofile(f)
            ff(['-f','f32le','-ar',str(RATE),'-ac','2','-i',str(f),'-c:a','pcm_s24le',str(wav)])
        ff(['-i',str(wav),'-c:a','aac','-b:a','88k','-movflags','+faststart',str(web)])
        stamp.write_text(signature)
    return dict(id=ident,recipe=signature,title=ident.replace('-',' ').title(),category=category,file='/unseen/audio/'+web.name,
                duration=n/RATE,bpm=None,key=None,loop=None,scenes=[ident],stems=[],
                provenance='Authored event score and deterministic synthesized transients. No external samples.',
                credits=CREDIT,license=LICENSE,production='rendered',verification='encoded QA in audio-qa.json')
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--masters',type=Path,default=MASTER/'SFX');args=ap.parse_args()
    args.masters.mkdir(exist_ok=True,parents=True)
    entries=[render_effect(*row,args.masters) for row in gestures()]
    assert len(entries)==118 and len({e['id'] for e in entries})==118
    publish('sound-effects.json',entries)
    print('Saved',len(entries),'effect cues.')
