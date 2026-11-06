"""Three original VISIONOIR compositions, authored by deterministic synthesis.

Credits requested by Flavio Giorgio Guarini (VISIONOIR). No external samples.
RIFLESSO / Cromo: 132 BPM, F minor, syncopated dub chords and metallic groove.
IMPULSO / Acid: 136 BPM, E Phrygian, elastic 303 phrases with rests and slides.
SOTTOTRACCIA / Noir: 128 BPM, D minor, deep dub and a rotating five-step motif.

Each piece has 48 bars and its own arrangement, instrumentation and motifs.
Python + NumPy, local Clang DSP, FFmpeg. Output is mastered around -14 LUFS.
"""
from pathlib import Path
import ctypes
import json
import re
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
SR = 44100
FFMPEG = 'ffmpeg'
CREDIT = 'Flavio Giorgio Guarini (VISIONOIR)'
COPYRIGHT = '© 2026 Flavio Giorgio Guarini'
EMAIL = 'visionoir.platform@gmail.com'
TMP = Path(tempfile.mkdtemp(prefix='visionoir-modes-'))

DSP = r'''
#include <math.h>
void filter(const float *in,const float *cut,float *out,int n,float sr,float resonance) {
 double a=0,b=0,c=0,d=0;
 for(int i=0;i<n;i++) {
  double g=1.0-exp(-3.141592653589793*fmin(cut[i],8500.)/sr);
  for(int j=0;j<2;j++){
   double x=tanh(2.1*in[i]-resonance*d);
   a+=g*(x-tanh(a));b+=g*(tanh(a)-tanh(b));
   c+=g*(tanh(b)-tanh(c));d+=g*(tanh(c)-tanh(d));
  }
  out[i]=(float)(d*1.8);
 }
}
'''
(TMP/'filter.c').write_text(DSP)
subprocess.run(['clang','-O3','-shared','-fPIC',str(TMP/'filter.c'),'-o',str(TMP/'filter.dylib')],check=True)
LIB = ctypes.CDLL(str(TMP/'filter.dylib'))
P = ctypes.POINTER(ctypes.c_float)
LIB.filter.argtypes = [P,P,P,ctypes.c_int,ctypes.c_float,ctypes.c_float]

def lp(signal, cutoff, resonance=0.4):
    signal=np.asarray(signal,np.float32)
    cut=np.full(len(signal),cutoff,np.float32) if np.isscalar(cutoff) else np.asarray(cutoff,np.float32)
    result=np.zeros_like(signal)
    LIB.filter(signal.ctypes.data_as(P),cut.ctypes.data_as(P),result.ctypes.data_as(P),len(signal),SR,resonance)
    return result

def hz(midi): return 440*2**((midi-69)/12)

class Track:
    def __init__(self, mode, title, bpm, seed):
        self.mode,self.title,self.bpm=mode,title,bpm
        self.beat=60/bpm;self.bar=4*self.beat
        self.duration=48*self.bar;self.n=round(self.duration*SR)
        self.rng=np.random.default_rng(seed)
        self.drums=np.zeros((self.n,2),np.float32)
        self.music=np.zeros((self.n,2),np.float32)
        self.space=np.zeros((self.n,2),np.float32)

    def add(self, dest, sound, time, gain=1, pan=0):
        i=round(time*SR)
        if i>=self.n:return
        sound=np.asarray(sound,np.float32)
        n=min(len(sound),self.n-i)
        if n<=0:return
        if sound.ndim==2:dest[i:i+n]+=sound[:n]*gain
        else:
            dest[i:i+n,0]+=sound[:n]*gain*np.sqrt((1-pan)/2)
            dest[i:i+n,1]+=sound[:n]*gain*np.sqrt((1+pan)/2)

    def noise(self,dur,low=0,high=10000):
        n=round(dur*SR);f=np.fft.rfftfreq(n,1/SR)
        spec=np.fft.rfft(self.rng.standard_normal(n))
        mask=1/(1+(f/high)**8)
        if low:mask*=1/(1+(low/np.maximum(f,1))**8)
        x=np.fft.irfft(spec*mask,n)
        return x/max(.001,np.sqrt(np.mean(x*x)))

    def kick(self,base=49,length=.52,drive=1.3):
        t=np.arange(round(length*SR))/SR
        freq=base+92*np.exp(-t*39)+23*np.exp(-t*135)
        phase=2*np.pi*np.cumsum(freq)/SR
        body=np.sin(phase)*np.exp(-t*8.5)
        body+=.08*np.sin(phase*2)*np.exp(-t*30)
        click=self.noise(length,1800,6500)*np.exp(-t*450)*.032
        return np.tanh((body+click)*drive)*np.minimum(1,t/.0012)*.75

    def hat(self,opened=False,tone=1):
        dur=.23 if opened else .062;t=np.arange(round(dur*SR))/SR
        noise=self.noise(dur,4100,tone*10000)
        metal=(np.sin(2*np.pi*4311*t)*np.sin(2*np.pi*5933*t))*.11
        return (noise*.30+metal)*np.exp(-t*(20 if opened else 82))*np.minimum(1,t/.001)

    def rim(self, freq=480):
        t=np.arange(round(.12*SR))/SR
        tone=(np.sin(2*np.pi*freq*t)+.55*np.sin(2*np.pi*freq*1.613*t))*np.exp(-t*85)
        return tone*.3+self.noise(.12,1600,5500)*np.exp(-t*160)*.07

    def clap(self,soft=False):
        dur=.22;t=np.arange(round(dur*SR))/SR;env=np.zeros_like(t)
        for start,gain in [(0,.9),(.012,.7),(.024,.5)]:
            dt=np.maximum(0,t-start)
            env+=np.where(t>=start,gain*np.exp(-dt*(95 if start<.024 else 30)),0)
        return self.noise(dur,850,5100 if soft else 6300)*env*.22

    def bell(self,freq,decay=.12):
        dur=max(.30,decay*5);t=np.arange(round(dur*SR))/SR
        fm=1.7*np.exp(-t*30)*np.sin(2*np.pi*freq*1.41*t)
        return np.sin(2*np.pi*freq*t+fm)*np.exp(-t/decay)*np.minimum(t/.002,1)

    def echo(self,dest,sound,time,gain,pan=.35,spacing=None,repeats=4):
        delay=spacing or self.beat*.75
        self.add(dest,sound,time,gain,pan)
        for k in range(1,repeats+1):
            self.add(dest,sound,time+delay*k,gain*.24*(.48**(k-1)),(-1)**k*.64)

    def chord(self,notes,dur=.72,cut=1400,decay=6.5):
        t=np.arange(round(dur*SR))/SR
        x=np.zeros(len(t))
        for i,n in enumerate(notes):
            f=hz(n)
            for detune in [.9987,1.0013]:
                phase=2*np.pi*f*detune*t
                x+=(np.sin(phase+i*.3)+.30*np.sin(phase*2)+.12*np.sin(phase*3))/(len(notes)*2)
        env=np.minimum(t/.008,1)*np.exp(-t*decay)
        env*=np.minimum(1,(dur-t)/.03)
        return lp(x*env,cut,1.1)

    def pad(self,notes,time,dur,gain):
        t=np.arange(round(dur*SR))/SR
        env=np.minimum(t/1.2,1)*np.minimum((dur-t)/1.2,1)
        stereo=np.zeros((len(t),2),np.float32)
        for side in [0,1]:
            detune=.999 if side==0 else 1.001
            x=sum(np.sin(2*np.pi*hz(n)*detune*t+i) for i,n in enumerate(notes))/len(notes)
            stereo[:,side]=x*env
        self.add(self.space,stereo,time,gain)

    def transition(self,bar,rise_beats=2,gain=.025):
        dur=rise_beats*self.beat;t=np.arange(round(dur*SR))/SR
        rise=self.noise(dur,1200,5300)*(t/dur)**2*np.minimum(1,(dur-t)/.016)
        self.add(self.space,rise,bar*self.bar,gain)

    def finish(self, filename, description):
        # All kick and bass sources are centred. Only upper percussion/chords spread.
        t=np.arange(self.n)/SR;phase=np.mod(t,self.beat)
        duck=1-.57*np.exp(-phase/.077)
        duck[(t>=20*self.bar)&(t<24*self.bar)]=1
        mix=self.drums+self.music*duck[:,None]+self.space
        # Remove stereo difference below 160 Hz, including the acid delay return.
        # Upper harmonics retain width while the sub/kick remain mono compatible.
        mid=(mix[:,0]+mix[:,1])*.5
        side=(mix[:,0]-mix[:,1])*.5
        frequencies=np.fft.rfftfreq(self.n,1/SR)
        side_filter=1/(1+(160/np.maximum(frequencies,1))**8)
        side=np.fft.irfft(np.fft.rfft(side)*side_filter,n=self.n)
        mix[:,0]=mid+side;mix[:,1]=mid-side
        mix-=np.mean(mix,axis=0)
        mix=np.tanh(mix*1.18)
        mix*=.80/max(.001,np.max(np.abs(mix)))
        edge=round(.008*SR)
        mix[:edge]*=np.linspace(0,1,edge)[:,None]
        mix[-edge:]*=np.linspace(1,0,edge)[:,None]
        wav=TMP/(self.mode+'.wav')
        with wave.open(str(wav),'wb') as w:
            w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR)
            w.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
        # Two-pass normalization keeps mode switching at consistent perceived levels.
        analyse=subprocess.run([FFMPEG,'-hide_banner','-i',str(wav),'-af','loudnorm=I=-14:TP=-2.2:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
        measure=json.JSONDecoder().raw_decode(analyse.stderr[analyse.stderr.rfind('{'):])[0]
        normalizer='loudnorm=I=-14:TP=-2.2:LRA=9:linear=true:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}'.format(**measure)
        out=OUT/filename
        command=[FFMPEG,'-hide_banner','-loglevel','error','-y','-i',str(wav),'-af',normalizer,'-ar',str(SR),'-c:a','libmp3lame','-b:a','192k','-id3v2_version','3']
        metadata={'title':self.title,'artist':CREDIT,'album_artist':CREDIT,'composer':CREDIT,'producer':CREDIT,'copyright':COPYRIGHT,'album':'VISIONOIR — Tre materie','date':'2026','TBPM':str(self.bpm),'license':'All rights reserved. Listening within Visionoir site only. Prior written permission: '+EMAIL,'comment':'Original synthesis; no external samples. Credits and rights notice supplied by Flavio Giorgio Guarini.'}
        for key,value in metadata.items():command+=['-metadata',key+'='+value]
        subprocess.run(command+[str(out)],check=True)
        # Verify the encoded deliverable, rather than only its pre-encode master.
        measured=subprocess.run([FFMPEG,'-hide_banner','-i',str(out),'-af','loudnorm=I=-14:TP=-2.2:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
        encoded=json.JSONDecoder().raw_decode(measured.stderr[measured.stderr.rfind('{'):])[0]
        raw=subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-i',str(out),'-f','f32le','-ac','2','-ar',str(SR),'-'],capture_output=True,check=True).stdout
        audio=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
        result={'mode':self.mode,'title':self.title,'bpm':self.bpm,'duration_seconds':len(audio)/SR,'bars':48,'src':'/assets/'+filename,'filename':filename,'description':description,'artist':CREDIT,'album_artist':CREDIT,'composer':CREDIT,'producer':CREDIT,'copyright':COPYRIGHT,'permissions_contact':EMAIL,'license_url':'/assets/AUDIO-LICENSE.txt','license':'All rights reserved; listening within the Visionoir site only. Any other use requires prior written permission.','composition':'Original deterministic synthesis. No external samples.','sample_rate':SR,'channels':2,'bitrate_kbps':192,'bytes':out.stat().st_size,'measured_lufs':float(encoded['input_i']),'measured_true_peak_dbtp':float(encoded['input_tp']),'measured_lra_lu':float(encoded['input_lra']),'boundary_jump_peak':float(np.max(np.abs(audio[0]-audio[-1]))),'sample_peak_dbfs':float(20*np.log10(np.max(np.abs(audio)))),'complete_decode_verified':True}
        if result['measured_true_peak_dbtp']>-1.5:raise ValueError('True peak above target: '+json.dumps(result))
        if result['bytes']>=3_000_000:raise ValueError('Track exceeds file budget')
        print(json.dumps(result,ensure_ascii=False),flush=True)
        return result

def cromo():
    tr=Track('chrome','RIFLESSO',132,1321106)
    kick=tr.kick(49,.53,1.24);ch=tr.hat();oh=tr.hat(True,.93)
    rim=tr.rim(510);clap=tr.clap(True)
    bass_pattern=[(0,29,.62),(.75,29,.35),(1.5,36,.35),(2.25,32,.48),(3.5,29,.34)]
    for bar in range(48):
        full=8<=bar<20 or 24<=bar<40;broken=20<=bar<24
        for beat in range(4):
            tm=bar*tr.bar+beat*tr.beat
            if not broken:tr.add(tr.drums,kick,tm,.90)
            if bar>=4 and not broken:
                tr.add(tr.drums,oh,tm+tr.beat*.5,.18,.14)
            if full:
                tr.add(tr.drums,ch,tm+tr.beat*.28,.10,-.28)
                tr.add(tr.drums,ch,tm+tr.beat*.78,.075,.26)
                if beat%2:tr.add(tr.drums,clap,tm,.27)
            if beat in [0,2] and bar>=8 and bar<44:
                tr.add(tr.drums,rim,tm+tr.beat*.75,.15,-.18)
        if not broken:
            for off,note,length in bass_pattern:
                if bar>=44 and off>2:continue
                if bar%8==7 and off==3.5:note=27
                dur=length*tr.beat;t=np.arange(round(dur*SR))/SR;f=hz(note)
                x=(np.sin(2*np.pi*f*t)+.19*np.sin(4*np.pi*f*t)+.08*np.sin(6*np.pi*f*t))*np.minimum(t/.006,1)*np.exp(-t*8)
                x*=np.minimum(1,(dur-t)/.015)
                tr.add(tr.music,x,bar*tr.bar+off*tr.beat,.29)
        if bar%2==0:
            notes=[53,56,60,63] if bar%8<4 else [51,55,58,62]
            chord=tr.chord(notes,cut=1500 if full else 900,decay=7)
            for off in ([.75,2.5] if full else [2.5]):tr.echo(tr.music,chord,bar*tr.bar+off*tr.beat,.21 if not broken else .13,.22)
        if full and bar%2:
            for off,f in [(1.25,830),(2.75,622),(3.75,740)]:tr.echo(tr.music,tr.bell(f,.055),bar*tr.bar+off*tr.beat,.035,-.38,repeats=2)
        if bar%8==7:tr.transition(bar,2,.018)
    for bar in [0,16,20,32,44]:tr.pad([53,60,63],bar*tr.bar,4*tr.bar,.035 if bar==20 else .013)
    return tr.finish('visionoir-cromo.mp3','Dub techno elastica, accordi sincopati, basso rotondo e percussioni metalliche morbide.')

def acid():
    tr=Track('acid','IMPULSO',136,1361106)
    kick=tr.kick(51,.50,1.31);ch=tr.hat(False,.92);oh=tr.hat(True,.91)
    clap=tr.clap(True);rim=tr.rim(620)
    phrases=[
        [40,None,40,43,None,47,40,None,41,40,None,52,47,None,43,40],
        [40,None,47,40,41,None,43,None,40,52,None,47,None,43,41,None],
        [40,40,None,43,None,41,40,None,47,None,52,47,43,None,41,40],
    ]
    raw=np.zeros(tr.n,np.float32);cut=np.ones(tr.n,np.float32)*180
    phase=0;last=hz(40)
    for bar in range(48):
        full=8<=bar<20 or 24<=bar<40;broken=20<=bar<24
        for beat in range(4):
            tm=bar*tr.bar+beat*tr.beat
            if not broken:tr.add(tr.drums,kick,tm,.87)
            if not broken and bar>=4:
                tr.add(tr.drums,oh,tm+tr.beat*.5,.17,.11)
                if beat%2:tr.add(tr.drums,clap,tm,.20)
            if full:
                for off,gain,pan in [(.25,.073,-.24),(.75,.054,.28)]:tr.add(tr.drums,ch,tm+tr.beat*off,gain,pan)
                if beat in [1,3]:tr.add(tr.drums,rim,tm+tr.beat*.75,.095,-.25)
        pat=phrases[(bar//4)%3]
        opening=.3+.45*np.sin((bar%16)/16*np.pi)
        if broken:opening=.22
        if bar>=40:opening=.3
        for step,note in enumerate(pat):
            if note is None:continue
            start=round((bar*tr.bar+step*tr.beat/4)*SR);end=min(tr.n,round((bar*tr.bar+(step+1)*tr.beat/4)*SR))
            n=end-start;t=np.arange(n)/SR;f=hz(note)
            slide=step in [5,11,15] and not broken
            freq=f+(last-f)*np.exp(-t/.024) if slide else np.full(n,f)
            ph=phase+np.cumsum(freq)/SR
            saw=sum(np.sin(2*np.pi*ph*h)/h for h in range(1,20))*-.47
            sq=sum(np.sin(2*np.pi*ph*h)/h for h in range(1,16,2))*.13
            envelope=np.minimum(t/.003,1)*np.exp(-t*6)
            envelope*=np.clip(((.94 if slide else .73)*tr.beat/4-t)/.011,0,1)
            accent=step in [0,5,9,11]
            gain=.43 if full else (.22 if broken else .33)
            raw[start:end]=(saw+sq)*envelope*gain*(1.25 if accent else 1)
            cut[start:end]=200+opening*420+(1400+opening*2100)*(1 if accent else .60)*np.exp(-t*(24 if not slide else 13))
            phase=ph[-1]%1;last=f
        if full and bar%4==2:
            tr.echo(tr.music,tr.chord([52,55,59],cut=1000,decay=10),bar*tr.bar+tr.beat*2.5,.10,-.2,repeats=3)
        if bar in [7,19,23,39,43]:tr.transition(bar,4,.023)
        if bar in [19,23,39]:
            for off in [2.5,3,3.5,3.75]:tr.add(tr.drums,rim,bar*tr.bar+off*tr.beat,.07)
    line=lp(raw,cut,3.08)
    line=np.tanh(line*1.55)*.65
    tr.add(tr.music,line,0,.95)
    for k in range(1,4):tr.add(tr.music,line,tr.beat*.75*k,.11*.46**(k-1),(-1)**k*.5)
    for bar in [0,16,20,32,44]:tr.pad([52,59,62],bar*tr.bar,4*tr.bar,.026 if bar==20 else .009)
    return tr.finish('visionoir-acid-mode.mp3','Acid techno fluida in Mi frigio, sequenze 303 con pause e slide, filtro levigato e groove spezzato.')

def noir():
    tr=Track('noir','SOTTOTRACCIA',128,1281106)
    kick=tr.kick(47,.58,1.20);ch=tr.hat(False,.82);oh=tr.hat(True,.83)
    rim=tr.rim(360);clap=tr.clap(True)
    for bar in range(48):
        full=8<=bar<20 or 24<=bar<40;broken=20<=bar<24
        for beat in range(4):
            tm=bar*tr.bar+beat*tr.beat
            if not broken:tr.add(tr.drums,kick,tm,.90)
            if bar>=4 and not broken:tr.add(tr.drums,ch,tm+tr.beat*.5,.16,.15)
            if full:
                tr.add(tr.drums,ch,tm+tr.beat*.79,.067,-.25)
                if beat==3:tr.add(tr.drums,oh,tm+tr.beat*.5,.10,.22)
                if beat%2:tr.add(tr.drums,clap,tm,.13)
            if bar>=8 and bar<44 and beat in [0,2]:tr.add(tr.drums,rim,tm+tr.beat*.75,.11,-.19)
        if not broken:
            # The sub is mono and leaves the downbeat free for the kick.
            for off,note,durbeats in [(.5,38,.70),(1.75,38,.35),(2.5,33,.70),(3.5,36,.40)]:
                dur=durbeats*tr.beat;t=np.arange(round(dur*SR))/SR;f=hz(note)
                x=(np.sin(2*np.pi*f*t)+.14*np.sin(4*np.pi*f*t))*np.minimum(t/.009,1)*np.exp(-t*5.5)
                x*=np.minimum((dur-t)/.018,1)
                tr.add(tr.music,x,bar*tr.bar+off*tr.beat,.29)
        if bar%2==0:
            notes=[50,57,60,64] if bar%8<4 else [48,55,58,62]
            chord=tr.chord(notes,dur=1.15,cut=780 if full else 520,decay=4.5)
            tr.echo(tr.music,chord,bar*tr.bar+tr.beat*1.5,.18 if full else .13,.28,spacing=tr.beat*.75,repeats=6)
        if bar in [7,19,23,39,43]:tr.transition(bar,4,.014)
    # A five-step phrase rotates against the 4/4 bar without using a bright lead.
    notes=[62,69,65,60,64]
    for step in range(48*8):
        time=step*tr.beat/2;bar=int(time/tr.bar)
        if bar<8 or bar>=44 or 20<=bar<24 or step%5 in [1,4]:continue
        note=notes[step%5]
        bell=lp(tr.bell(hz(note),.13),1150,.5)
        tr.echo(tr.music,bell,time,.042,-.22,spacing=tr.beat*.5,repeats=3)
    for bar in range(0,48,4):tr.pad([50,57,60],bar*tr.bar,4*tr.bar,.034 if 20<=bar<24 else .016)
    return tr.finish('visionoir-noir.mp3','Techno dub profonda a 128 BPM, basso caldo mono, accordi sommersi e motivo ipnotico a cinque passi.')

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    tracks=[cromo(),acid(),noir()]
    data={'project':'VISIONOIR','collection':'Tre materie','artist':CREDIT,'copyright':COPYRIGHT,'permissions_contact':EMAIL,'license_url':'/assets/AUDIO-LICENSE.txt','tracks':tracks}
    (OUT/'mode-soundtracks.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('Completed all three original mode compositions.',flush=True)
