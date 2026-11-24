"""Produce a representative annotated listening reel and spectrogram overview in the private master archive."""
import json
import subprocess
from pathlib import Path
import tempfile
import numpy as np
from PIL import Image,ImageDraw
from render import MASTER,WEB
rows=json.loads((WEB/'soundtrack.json').read_text())
out=MASTER/'Review';out.mkdir(exist_ok=True,parents=True)
panel=Image.new('RGB',(945,13*58),(22,22,26));d=ImageDraw.Draw(panel)
with tempfile.TemporaryDirectory(dir=out) as tmp:
    clips=[]; notes=[]
    for i,r in enumerate(rows):
        f=WEB/Path(r['file']).name
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(f),'-f','f32le','-ar','12000','-ac','1','-'])
        x=np.frombuffer(raw,'<f4');hop=max(1,(len(x)-1024)//285);frames=np.lib.stride_tricks.sliding_window_view(x,1024)[::hop][:285]
        spectrum=20*np.log10(1e-5+np.abs(np.fft.rfft(frames*np.hanning(1024),axis=1)).T)
        freqs=np.geomspace(48,5400,35);indices=(freqs/(12000/1024)).astype(int)
        a=np.clip((spectrum[indices][::-1]+32)/65,0,1)
        color=tuple(int(r['color'][j:j+2],16) for j in (1,3,5))
        img=Image.fromarray(np.uint8(a[:,:,None]*color));col=i%3;row=i//3
        panel.paste(img,(col*315+7,row*58+20));d.text((col*315+7,row*58+2),r['id']+' '+r['title'],fill=color)
        begin=r['duration']*.43;length=min(4.5,r['duration']*.45);clip=Path(tmp)/(r['id']+'.wav')
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(begin),'-i',str(f),'-t',str(length),'-af',f'afade=t=in:d=0.03,afade=t=out:st={length-.09}:d=0.09','-ar','48000',str(clip)],check=True)
        clips.append("file '"+str(clip)+"'");notes.append({'id':r['id'],'title':r['title'],'sourceStartSeconds':round(begin,2),'lengthSeconds':round(length,2)})
    panel.save(out/'score-overview.png')
    entries=Path(tmp)/'list.txt';entries.write_text('\n'.join(clips))
    subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(entries),'-c:a','aac','-b:a','160k',str(out/'39-cue-audition.m4a')],check=True)
    (out/'39-cue-audition.json').write_text(json.dumps(notes,indent=2)+'\n')
