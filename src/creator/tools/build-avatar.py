"""Build static web LODs from a creator-supplied GLB. Requires Pillow and Blender."""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import tempfile

from PIL import Image

def read_glb(path):
    data = path.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', data)
    if (magic, version, size) != (b'glTF', 2, len(data)):
        raise ValueError('Expected a complete glTF 2 binary')
    json_size, tag = struct.unpack_from('<I4s', data, 12)
    if tag != b'JSON':
        raise ValueError('Expected glTF JSON chunk')
    scene = json.loads(data[20:20+json_size])
    bin_size, tag = struct.unpack_from('<I4s', data, 20+json_size)
    if tag != b'BIN\0':
        raise ValueError('Expected GLB binary buffer')
    return scene, memoryview(data)[28+json_size:28+json_size+bin_size]

def pack_static(source, binary, file, texture_size):
    output = {'asset':{'version':'2.0','generator':'VISIONOIR static sculpture pipeline'},
              'scene':0, 'scenes':[{'nodes':[0]}], 'nodes':[{'name':'Flavio Giorgio Guarini','mesh':0}],
              'meshes':[{'primitives':[]}], 'accessors':[], 'bufferViews':[],
              'images':[], 'textures':source['textures'], 'materials':copy.deepcopy(source['materials'])}
    for key in ('extensionsUsed','extensionsRequired','samplers'):
        if key in source: output[key] = source[key]
    buffers = bytearray()
    cache = {}
    def append(data, target=None, stride=None):
        while len(buffers)%4: buffers.append(0)
        view = {'buffer':0,'byteOffset':len(buffers),'byteLength':len(data)}
        if target: view['target'] = target
        if stride: view['byteStride'] = stride
        output['bufferViews'].append(view)
        buffers.extend(data)
        return len(output['bufferViews'])-1
    def bytes_for(idx):
        v = source['bufferViews'][idx]
        offset = v.get('byteOffset',0)
        return binary[offset:offset+v['byteLength']]
    def accessor(idx):
        if idx in cache: return cache[idx]
        a = dict(source['accessors'][idx])
        v = source['bufferViews'][a['bufferView']]
        a['bufferView'] = append(bytes_for(a['bufferView']), v.get('target'), v.get('byteStride'))
        cache[idx] = len(output['accessors'])
        output['accessors'].append(a)
        return cache[idx]
    if len(source['meshes']) != 1: raise ValueError('Expected the original single-mesh creator model')
    for p in source['meshes'][0]['primitives']:
        q = {'attributes':{k:accessor(p['attributes'][k]) for k in ('POSITION','NORMAL','TEXCOORD_0')},'material':p['material'],'indices':accessor(p['indices'])}
        output['meshes'][0]['primitives'].append(q)
    for img in source['images']:
        im=Image.open(io.BytesIO(bytes_for(img['bufferView']))).convert('RGB')
        im.thumbnail((texture_size,texture_size),Image.Resampling.LANCZOS)
        compressed=io.BytesIO()
        im.save(compressed,format='JPEG',quality=88,subsampling=0,optimize=True)
        output['images'].append({'bufferView':append(compressed.getvalue()),'mimeType':'image/jpeg','name':img['name']})
    while len(buffers)%4: buffers.append(0)
    output['buffers']=[{'byteLength':len(buffers)}]
    meta=json.dumps(output,separators=(',',':'),ensure_ascii=False).encode()
    meta+=b' '*((-len(meta))%4)
    file.write_bytes(struct.pack('<4sIII4s',b'glTF',2,28+len(meta)+len(buffers),len(meta),b'JSON')+meta+struct.pack('<I4s',len(buffers),b'BIN\0')+buffers)

def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('source',type=Path)
    cli.add_argument('destination',type=Path)
    cli.add_argument('--blender',default='blender')
    args=cli.parse_args()
    args.destination.mkdir(parents=True,exist_ok=True)
    d,b=read_glb(args.source)
    with tempfile.TemporaryDirectory() as temp:
        full=Path(temp)/'sculpture.glb'; pack_static(d,b,full,1536)
        desktop=args.destination/'creator-desktop.glb'
        desktop.write_bytes(full.read_bytes())
        mobile=Path(temp)/'device.glb'; pack_static(d,b,mobile,768)
        subprocess.run([args.blender,'--background','--factory-startup','--threads','2','--python-exit-code','1','--python',str(Path(__file__).with_name('simplify.py')),'--',str(mobile),str(args.destination/'creator-mobile.glb')],check=True)
    for file in sorted(args.destination.glob('creator-*.glb')):
        out,_=read_glb(file)
        assert not out.get('skins') and not out.get('animations')
        counts=[out['accessors'][p['indices']]['count']//3 for m in out['meshes'] for p in m['primitives']]
        print(file.name,file.stat().st_size,sum(counts),'triangles',hashlib.sha256(file.read_bytes()).hexdigest())

if __name__=='__main__': main()
