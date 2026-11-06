"""AFTERIMAGE / 140 — original Visionoir composition, deterministic synthesis.

64 bars at 140 BPM in F minor. No external samples. NumPy + local C ladder DSP.
Run with Python + numpy, clang and ffmpeg; emits an MP3 and a private WAV master.
"""
from pathlib import Path
import ctypes, subprocess, tempfile, wave, json
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SR = 44100
BPM = 140
BEAT = 60 / BPM
BAR = 4 * BEAT
DURATION = 64 * BAR
N = round(DURATION * SR)
RNG = np.random.default_rng(140903)

DSP = r'''
#include <math.h>
void ladder(const float *in, const float *cut, float *out, int n, float sr) {
 double a=0,b=0,c=0,d=0;
 for(int i=0;i<n;i++) {
   double g=1.0-exp(-3.141592653589793 * fmin(cut[i], 11000.0)/sr);
   for(int k=0;k<2;k++) {
     double x=tanh(2.35*in[i]-3.65*d);
     a+=g*(x-tanh(a)); b+=g*(tanh(a)-tanh(b));
     c+=g*(tanh(b)-tanh(c)); d+=g*(tanh(c)-tanh(d));
   }
   out[i]=(float)(d*1.9);
 }
}
'''
tmp = Path(tempfile.mkdtemp(prefix='visionoir-audio-'))
(tmp / 'filter.c').write_text(DSP)
subprocess.run(['clang', '-O3', '-shared', '-fPIC', str(tmp/'filter.c'), '-o', str(tmp/'filter.dylib')], check=True)
lib = ctypes.CDLL(str(tmp / 'filter.dylib'))
P = ctypes.POINTER(ctypes.c_float)
lib.ladder.argtypes = [P,P,P,ctypes.c_int,ctypes.c_float]

drums = np.zeros((N,2), np.float32)
music = np.zeros((N,2), np.float32)
atmos = np.zeros((N,2), np.float32)
def add(track, signal, time, gain=1., pan=0.):
    i = round(time * SR)
    if i >= N: return
    signal = np.asarray(signal, dtype=np.float32)
    if i < 0: signal=signal[-i:]; i=0
    size = min(len(signal), N-i)
    if size <= 0: return
    if signal.ndim == 2: track[i:i+size] += signal[:size]*gain
    else:
        l = np.sqrt((1-pan)/2); r=np.sqrt((1+pan)/2)
        track[i:i+size,0] += signal[:size]*gain*l
        track[i:i+size,1] += signal[:size]*gain*r

def noise(duration, lo=0, hi=22000):
    n=round(duration*SR)
    raw=RNG.standard_normal(n)
    spec=np.fft.rfft(raw)
    f=np.fft.rfftfreq(n,1/SR)
    shape=np.ones_like(f)
    if lo: shape*=1/(1+(lo/np.maximum(1,f))**6)
    shape*=1/(1+(f/hi)**6)
    x=np.fft.irfft(spec*shape,n=n)
    return x/max(np.sqrt(np.mean(x*x)),0.001)

def kick():
    t=np.arange(round(.65*SR))/SR
    freq=48+115*np.exp(-t*34)+30*np.exp(-t*140)
    phase=2*np.pi*np.cumsum(freq)/SR
    body=np.sin(phase)*np.exp(-t*7.8)
    body+=.15*np.sin(2*phase)*np.exp(-t*25)
    click=noise(.65,2200,9500)*np.exp(-t*450)*.11
    x=np.tanh((body+click)*1.65)*.85
    x*=np.minimum(t/.0007,1)
    return x

def hat(open=False):
    length=.29 if open else .065
    t=np.arange(round(length*SR))/SR
    metal=sum(np.sign(np.sin(2*np.pi*f*t)) for f in [3287,4239,5123,5781,6307,7921])/6
    x=.62*noise(length,5500,14500)+.38*metal
    return np.tanh(x*.8)*np.exp(-t*(17 if open else 78))*np.minimum(1,t/.0005)

def clap():
    dur=.24; t=np.arange(round(dur*SR))/SR
    env=np.zeros_like(t)
    for start,amp in [(0,1),(.009,.8),(.019,.72),(.032,.68)]:
        dt=np.maximum(0,t-start); env+=np.where(t>=start,amp*np.exp(-dt*(110 if start<.032 else 27)),0)
    return noise(dur,1000,6700)*env*.36

def tom(freq=160):
    t=np.arange(round(.19*SR))/SR
    return np.sin(2*np.pi*np.cumsum(freq+50*np.exp(-t*70))/SR)*np.exp(-t*25)

kick_sample=kick(); close=hat(); opened=hat(True); clap_sample=clap()
for bar in range(64):
    break_section=24<=bar<32
    outro=bar>=60
    full=8<=bar<24 or 32<=bar<56
    for beat in range(4):
        tm=bar*BAR+beat*BEAT
        if not break_section and not (bar==63 and beat>1):
            add(drums,kick_sample,tm,.9)
            # Low, sidechained delayed kick tail creates a controlled warehouse rumble.
            if full:
                tail=np.roll(kick_sample,round(.035*SR))*.3
                tail[:round(.035*SR)]=0
                add(music,tail,tm+BEAT*.50,.45)
        if (bar>=4 and not break_section and not outro) or 30<=bar<32:
            if beat%2: add(drums,clap_sample,tm,.28 if not break_section else .14)
        if bar>=2 and not (24<=bar<28) and not outro:
            add(drums,opened,tm+BEAT*.5,.105 if full else .064,.16)
        if full or 28<=bar<32:
            for step in [0,.25,.75]:
                add(drums,close,tm+BEAT*step+(0.005 if step==.75 else 0),.047 if step else .031,(-1 if step==.25 else 1)*.30)
        if full and beat in [1,3]:
            add(drums,tom(190 if beat==1 else 146),tm+BEAT*.75,.07,-.24)
    if bar in [15,23,39,47,55]:
        for s in range(6):
            add(drums,tom(240-s*18),bar*BAR+BEAT*(2.5+s*.25),.065,.2-s*.07)
    if 30<=bar<32:
        count=8 if bar==30 else 16
        for s in range(count): add(drums,clap_sample,bar*BAR+s*BAR/count,.05+.12*(s/count),(-1)**s*.2)

# Continuous monophonic phrase, with slides and accent-modulated resonant cutoff.
raw=np.zeros(N,np.float32); cutoff=np.ones(N,np.float32)*170
patterns=[
    [41,41,53,41,44,41,48,41,39,41,53,44,41,48,39,41],
    [41,53,41,44,41,48,41,39,41,41,53,56,48,44,39,41],
    [41,41,44,53,41,39,41,48,41,56,53,41,44,48,39,41],
    [41,53,41,41,48,44,41,39,41,53,56,53,48,44,39,41],
]
phase=0.; previous=87.31
for bar in range(64):
    pat=patterns[(bar//4)%4]
    full=8<=bar<24 or 32<=bar<56
    if bar<8: openness=.12+bar*.045
    elif bar<24: openness=.45+.32*np.sin((bar-8)/16*np.pi)
    elif bar<28: openness=.13
    elif bar<32: openness=.18+(bar-28)*.20
    elif bar<56: openness=.62+.25*np.sin((bar-32)/24*np.pi*3)
    else: openness=.48-(bar-56)*.045
    for step,note in enumerate(pat):
        start=round((bar*BAR+step*BEAT/4)*SR)
        end=min(N,round((bar*BAR+(step+1)*BEAT/4)*SR)); n=end-start
        t=np.arange(n)/SR
        frequency=440*2**((note-69)/12)
        slide=step in [2,6,10,13] and bar>=4
        frequencies=frequency+(previous-frequency)*np.exp(-t/0.028) if slide else np.full(n,frequency)
        ph=phase+np.cumsum(frequencies)/SR
        # Band-limited additive saw avoids aliasing at the strongest upper harmonics.
        saw=sum(np.sin(2*np.pi*ph*h)/h for h in range(1,28))*-.48
        square=sum(np.sin(2*np.pi*ph*h)/h for h in range(1,22,2))*.16
        gate=.87 if slide else .68
        env=np.minimum(1,t/.003)*(.65+.35*np.exp(-t*16))
        env*=np.clip((gate*(BEAT/4)-t)/.012,0,1)
        accent=step in [0,3,6,10,13]
        phrase_gain=.48 if full else .30
        if 24<=bar<28: phrase_gain=.17
        if bar==63: phrase_gain*=max(0,1-step/16)
        raw[start:end]=(saw+square)*env*phrase_gain*(1.32 if accent else 1)
        cutoff[start:end]=190+openness*800+(1300+openness*5300)*(1.25 if accent else .63)*np.exp(-t*(27 if not slide else 13))
        phase=ph[-1]%1; previous=frequency
acid=np.zeros(N,np.float32)
lib.ladder(raw.ctypes.data_as(P),cutoff.ctypes.data_as(P),acid.ctypes.data_as(P),N,SR)
acid=np.tanh(acid*2.2)*.45
add(music,acid,0,1.25)
# Dotted eighth echo with intentionally quiet stereo repeats.
for k in range(1,5): add(music,acid,BEAT*.75*k,.20*(.52**(k-1)),(-1)**k*.72)

# Fm / Db / Eb suspended haze, a spatial background instead of a second lead.
for bar in range(0,64,4):
    duration=BAR*4
    t=np.arange(round(duration*SR))/SR
    chord=[53,56,60,67] if bar%16<8 else ([49,53,56,60] if bar%16<12 else [51,55,58,65])
    stereo=np.zeros((len(t),2))
    for i,note in enumerate(chord):
        f=440*2**((note-69)/12)
        for ch in [0,1]:
            sig=(np.sin(2*np.pi*f*(1+(.0018 if ch else -.0018))*t+i)+.21*np.sin(4*np.pi*f*t+i))
            stereo[:,ch]+=sig/len(chord)
    envelope=np.minimum(1,t/.8)*np.minimum(1,(duration-t)/.8)
    stereo*=envelope[:,None]
    add(atmos,stereo,bar*BAR,.075 if 24<=bar<32 else .026)

# Short filtered synth stabs before the return of the kick.
for bar in [8,12,16,20,32,36,40,44,48,52]:
    for off in [1.5,3.25]:
        t=np.arange(round(.42*SR))/SR
        chord=sum(np.sin(2*np.pi*440*2**((n-69)/12)*t) for n in [65,68,72])/3
        stab=chord*np.exp(-t*14)*np.minimum(1,t/.003)
        add(music,stab,bar*BAR+BEAT*off,.11,.35)
        add(music,stab,bar*BAR+BEAT*(off+.75),.034,-.5)

for bar in [8,32,48]:
    t=np.arange(round(1.8*SR))/SR
    crash=noise(1.8,2800,12500)*np.exp(-t*3.3)*np.minimum(t/.001,1)
    add(atmos,crash,bar*BAR,.047,.15)
# Noise builds and reverse cymbal suck-ins.
for bar,beats in [(7,4),(23,2),(30,8),(47,2)]:
    dur=BEAT*beats; t=np.arange(round(dur*SR))/SR
    sweep=noise(dur,1800,8500)*(t/dur)**2.6*np.minimum(1,(dur-t)/.015)
    add(atmos,sweep,bar*BAR,.045)

# Pump only the musical bed, leaving transient definition intact.
times=np.arange(N)/SR
beat_phase=np.mod(times,BEAT)
duck=1-.64*np.exp(-beat_phase/0.073)
break_mask=(times>=24*BAR)&(times<32*BAR)
duck[break_mask]=1
mix=drums+music*duck[:,None]+atmos*(.84+.16*duck[:,None])
# DC rejection and restrained analogue saturation. Final peak -1.3 dBFS.
mix-=np.mean(mix,axis=0)
mix=np.tanh(mix*1.26)
mix*=10**(-1.3/20)/np.max(np.abs(mix))
fade=round(.009*SR)
mix[:fade]*=np.linspace(0,1,fade)[:,None]
mix[-fade:]*=np.linspace(1,0,fade)[:,None]
master=tmp/'visionoir-afterimage-master.wav'
with wave.open(str(master),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR)
    w.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
out=ROOT/'public/assets/visionoir-acid.mp3';out.parent.mkdir(parents=True,exist_ok=True)
credit='Flavio Giorgio Guarini (VISIONOIR)'
copyright_notice='© 2026 Flavio Giorgio Guarini'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(master),'-c:a','libmp3lame','-b:a','192k','-id3v2_version','3','-metadata','title=AFTERIMAGE / 140','-metadata',f'artist={credit}','-metadata',f'album_artist={credit}','-metadata',f'composer={credit}','-metadata',f'producer={credit}','-metadata',f'copyright={copyright_notice}','-metadata','date=2026','-metadata','album=VISIONOIR — Original Sound','-metadata','license=All rights reserved. Site listening only. Written permission required for reuse: visionoir.platform@gmail.com','-metadata','comment=Original synthesis; no external samples. Credits and rights notice supplied by Flavio Giorgio Guarini.',str(out)],check=True)
stats={'title':'AFTERIMAGE / 140','bpm':BPM,'duration_seconds':DURATION,'bars':64,'sample_rate':SR,'peak_dbfs':float(20*np.log10(np.max(np.abs(mix)))),'rms_dbfs':float(20*np.log10(np.sqrt(np.mean(mix**2)))),'mp3_bytes':out.stat().st_size,'master':str(master),'composition':'Original deterministic synthesis. No external samples.'}
stats.update({'artist':credit,'album_artist':credit,'composer':credit,'producer':credit,'copyright':copyright_notice,'rights_claimant':'Flavio Giorgio Guarini','alias':'VISIONOIR','license':'All rights reserved; listening within the Visionoir site only. Any other use requires prior written permission.','license_url':'/assets/AUDIO-LICENSE.txt','permissions_contact':'visionoir.platform@gmail.com'})
(ROOT/'public/assets/soundtrack-info.json').write_text(json.dumps({k:v for k,v in stats.items() if k!='master'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(stats,indent=2))
