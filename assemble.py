import json,gzip,hashlib,shutil
from pathlib import Path
shutil.copytree('web','_site',dirs_exist_ok=True)
for item in json.loads(Path('manifest.json').read_text()):
 data=gzip.decompress(b''.join(Path(p).read_bytes() for p in item['parts']))
 assert hashlib.sha256(data).hexdigest()==item['sha256'],item['path']
 p=Path('_site')/item['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
