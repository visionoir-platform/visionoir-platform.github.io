"""Render-free source/asset validation. Exits nonzero on invalid alpha, crops or sequences."""
import hashlib,json
from pathlib import Path
from PIL import Image,ImageChops
P=Path(__file__).resolve().parents[2]/'public/unseen/art'
def read(n):return json.loads((P/f'{n}.json').read_text())
def validate():
    report={};hashes=set()
    spec=read('sprites');anim=read('animations');machines=read('bosses');things=read('objects')
    assert len(spec['characters'])==10 and len(machines['machines'])==23
    assert set(read('provenance')['files'])=={f.name for f in P.glob('*.png')}
    for f in P.glob('*.png'):
        with Image.open(f) as im:im.verify()
        h=hashlib.sha256(f.read_bytes()).hexdigest()
        assert h not in hashes,f.name
        hashes.add(h)
    with Image.open(P/'portraits-motion.png') as motion:
        assert motion.size==(320,64) and motion.n_frames==8
        front=[]
        for n in range(motion.n_frames):
            motion.seek(n);front.append(hashlib.sha256(motion.convert('RGB').tobytes()).digest())
        assert len(set(front))>=5
        report['portraitFrames']=len(front)
    for group,resources,rows,count,w,h in [
      ('character',spec['characters'],anim['rows'],8,64,64),
      ('machine',machines['machines'],machines['rows'],6,112,88),
      ('director',[read('director')],read('director')['rows'],6,64,64),
      ('objects',[things],things['rows'],6,40,40)]:
        frameCount=0;static=[]
        for resource in resources:
            with Image.open(P/resource['file']) as im:
                assert im.mode=='RGBA' and im.size==(count*w,len(rows)*h)
                for y,state in enumerate(rows):
                    outputs=set()
                    for x in range(count):
                        f=im.crop((x*w,y*h,(x+1)*w,(y+1)*h)); alpha=f.getchannel('A')
                        bbox=alpha.getbbox();assert bbox is not None,(group,state)
                        assert bbox[0]>0 and bbox[1]>0 and bbox[2]<w and bbox[3]<h,(resource['file'],state,x,bbox)
                        assert alpha.getextrema()==(0,255)
                        assert sum(alpha.histogram()[1:-1])==0
                        outputs.add(hashlib.md5(f.tobytes()).digest());frameCount+=1
                    if len(outputs)==1:static.append([resource['file'],state])
                    if group=='character':assert len(outputs)>=2,(resource['file'],state)
        report[group]={'atlasCount':len(resources),'rows':len(rows),'frameCells':frameCount,'staticRows':static}
    for z in read('tilesets')['zones']:
        for name in [z['sky'],*z['parallax']]:assert Image.open(P/name).size==(480,270)
        assert Image.open(P/z['tile']).size==(32,32)
    report['zones']=len(read('tilesets')['zones']);report['pngFiles']=len(hashes)
    report['totalBytes']=sum(f.stat().st_size for f in P.iterdir() if f.is_file())
    return report
if __name__=='__main__':
    result=validate()
    (Path(__file__).parent/'proof/asset-check.json').write_text(json.dumps(result,indent=2)+'\n')
    print({k:v if not isinstance(v,dict) else {key:value for key,value in v.items() if key!='staticRows'} for k,v in result.items()})
