#!/usr/bin/env python3
"""Generate independently editable pre-master stereo stems, kept exclusively in the local session archive."""
import argparse
import json
import tempfile
from pathlib import Path
import numpy as np
from render import CUES, MASTER, RATE, WEB, ff, mixcue, publish, tone

BUSES={0:'lead',1:'bass',2:'harmony',3:'countermelody',9:'percussion'}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--masters',type=Path,default=MASTER);args=ap.parse_args()
    rows=json.loads((WEB/'soundtrack.json').read_text())
    for ix,(row,c) in enumerate(zip(rows,CUES),1):
        dest=args.masters/'Stems'/row['id'];dest.mkdir(exist_ok=True,parents=True)
        stamp=dest/'recipe.txt'
        regenerate=not stamp.is_file() or stamp.read_text().strip()!=row['recipe']
        stems=[]
        for channel,label in BUSES.items():
            path=dest/(label+'.flac')
            if regenerate or not path.is_file():
                mix,_=mixcue(ix,c,channel);peak=float(np.max(np.abs(mix)));tone.cache_clear()
                if not peak:continue
                if peak>=1:raise ValueError(f'Clipping in unmastered stem {ix}/{label}')
                with tempfile.TemporaryDirectory(dir=dest) as tmp:
                    raw=Path(tmp)/'stem.f32';mix.astype('<f4',copy=False).tofile(raw);del mix
                    ff(['-f','f32le','-ar',str(RATE),'-ac','2','-i',str(raw),'-c:a','flac','-sample_fmt','s32','-compression_level','3',str(path)])
            stems.append(label)
        stamp.write_text(row['recipe']+'\n')
        row['stems']=stems
        side=args.masters/'OST'/f"ost-{row['id']}.json"
        side.write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n')
    publish('soundtrack.json',rows)
    print('Local lossless stem files:',sum(len(r['stems']) for r in rows))
if __name__=='__main__':main()
