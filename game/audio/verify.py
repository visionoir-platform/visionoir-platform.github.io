#!/usr/bin/env python3
"""Decode every delivered asset, compare duration/peaks/loops/identity, and audit mix properties."""
import argparse
import hashlib
import json
import math
import subprocess
import wave
from collections import Counter
from pathlib import Path
import numpy as np
from render import MASTER,WEB,gain_info
from score import CUES,ONESHOTS
from render_effects import gestures

def snd(cmd):
    return subprocess.check_output(cmd,stderr=subprocess.PIPE)
def analyze(path):
    info=json.loads(snd(['ffprobe','-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate,channels,duration','-of','json',str(path)]))['streams'][0]
    # Use 12 kHz for structural analysis only; EBU/true-peak measurement uses full sample rate and stereo.
    raw=snd(['ffmpeg','-v','error','-threads','1','-i',str(path),'-f','f32le','-ac','2','-ar','12000','-'])
    both=np.frombuffer(raw,'<f4').reshape(-1,2)
    if len(both)<8 or not np.all(np.isfinite(both)):raise ValueError('empty or nonfinite audio '+str(path))
    mono=both.mean(axis=1);rms=np.sqrt(np.mean(both**2));mono_rms=np.sqrt(np.mean(mono**2))
    clip=float(np.max(np.abs(both)))
    if rms<.006 or clip>=1.:raise ValueError(f'{path} silent or over-range: {rms}/{clip}')
    mono_ratio=20*math.log10(mono_rms/rms)
    if mono_ratio<-5:raise ValueError(f'{path} loses level in mono')
    spectral={}
    if len(mono)>24000:
        window=2048;segments=mono[:(len(mono)//window)*window].reshape(-1,window)[::8]
        total=np.mean(np.abs(np.fft.rfft(segments*np.hanning(window),axis=1))**2,axis=0)
        freq=np.fft.rfftfreq(window,1/12000)
        for name,lo,hi in [('bass',30,180),('mid',180,2200),('high',2200,5999)]:
            spectral[name]=round(100*sum(total[(freq>=lo)&(freq<hi)])/max(sum(total),1e-12),1)
    length=round(float(info['duration'])*12000)
    logical=mono[:length]
    above=np.flatnonzero(np.abs(logical)>.006)
    assert len(above),path
    timing={'attackMs':round(float(above[0])/12,2),'tailBelowThresholdMs':round((len(logical)-1-float(above[-1]))/12,2),
            'webLoopEdgeStep12k':round(float(abs(logical[0]-logical[-1])),6)}
    return info,hashlib.sha256(raw).hexdigest(),mono_ratio,spectral,timing

def pcm_edges(path):
    with wave.open(str(path),'rb') as f:
        if f.getsampwidth()!=3 or f.getframerate()!=48000 or f.getnchannels()!=2:raise ValueError('invalid master '+str(path))
        n=f.getnframes();start=f.readframes(1);f.setpos(n-1);end=f.readframes(1)
    def value(data,chan):return int.from_bytes(data[3*chan:3*chan+3],'little',signed=True)/8388608
    return n/48000,max(abs(value(start,c)-value(end,c)) for c in (0,1))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--masters',type=Path,default=MASTER);ap.add_argument('--web-only',action='store_true');ap.add_argument('--report',type=Path,default=Path(__file__).with_name('audio-qa.json'))
    args=ap.parse_args(); all_rows=[];hashes=set()
    music=json.loads((WEB/'soundtrack.json').read_text());fx=json.loads((WEB/'sound-effects.json').read_text())
    assert [e['title'] for e in music]==[c.title for c in CUES] and len(music)==39
    assert [e['id'] for e in music]==[f'{i:02}' for i in range(1,40)]
    assert [e['id'] for e in fx]==[i for _,i,_ in gestures()] and len(fx)==118
    assert list(Counter(e['category'] for e in fx).values())==[18,12,14,20,10,16,12,10,6]
    languages=set('it en es ru de zh-Hans ja pt-BR pt-PT ko pl fr uk ar sw de-CH fr-CH it-CH rm-CH'.split())
    assert set(f.stem for f in (WEB/'names').glob('*.json'))==languages
    for lang in languages:
        labels=json.loads((WEB/'names'/(lang+'.json')).read_text())
        assert set(labels)=={e['id'] for e in fx} and len(set(labels.values()))==118
    for idx,(is_music,entry) in enumerate([(True,e) for e in music]+[(False,e) for e in fx]):
        assert entry['license'] and entry['scenes'] and entry['provenance'] and entry['production']=='rendered'
        web=WEB/Path(entry['file']).name
        info,digest,mono,spectral,timing=analyze(web)
        assert digest not in hashes,'duplicate '+entry['id'];hashes.add(digest)
        assert info['codec_name']=='aac' and info['sample_rate']=='48000' and info['channels']==2
        actual=float(info['duration']);assert abs(actual-entry['duration'])<.022,(entry['id'],actual,entry['duration'])
        if is_music:assert bool(entry['loop'])==(idx+1 not in ONESHOTS)
        if entry['loop']:assert entry['loop']['start']==0 and abs(entry['loop']['end']-actual)<.022
        integrated,peak=gain_info(['-i',str(web)])
        if peak>-0.8:raise ValueError(f'{web.name} true peak {peak}')
        row={'id':entry['id'],'durationSeconds':actual,'pcmSHA256_12kStereo':digest,'webTruePeakDBTP':peak,'monoChangeDB':round(mono,2)}
        row.update(timing)
        if integrated>-65:row['webIntegratedLUFS']=integrated # EBU gating is unsuitable for very short one-shots.
        if spectral:row['bandEnergyPercent12k']=spectral
        if not args.web_only:
            if is_music:
                path=args.masters/'OST'/f"ost-{entry['id']}.wav"
                assert path.with_suffix('.mid').read_bytes()[:4]==b'MThd'
                for name in entry['stems']:
                    stem=args.masters/'Stems'/entry['id']/(name+'.flac')
                    stem_info=json.loads(snd(['ffprobe','-v','error','-show_entries','stream=codec_name,sample_rate,bits_per_raw_sample,duration','-of','json',str(stem)]))['streams'][0]
                    assert stem_info['codec_name']=='flac' and stem_info['sample_rate']=='48000' and int(stem_info['bits_per_raw_sample'])==24
                    assert abs(float(stem_info['duration'])-entry['duration'])<.001
            else:path=args.masters/'SFX'/(entry['id']+'.wav')
            length,step=pcm_edges(path)
            assert abs(length-entry['duration'])<1/48000
            if entry['loop']:
                assert step<.002
                row['pcmLoopEdgeStep']=round(step,7)
        all_rows.append(row)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps({'tracks':39,'effects':118,'mastersChecked':not args.web_only,'allDecoded':True,'method':'Full AAC decode, EBU R128 stereo true peak, mono sum, duration and downsampled PCM SHA-256; lossless loop boundary when masters present.','rows':all_rows},indent=2)+'\n')
    print('Verified 39 music cues and 118 effects. Wrote',args.report)
if __name__=='__main__':main()
